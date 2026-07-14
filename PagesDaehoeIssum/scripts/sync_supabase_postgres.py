import argparse
import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "tournaments.json"
DEFAULT_SCHEMA = ROOT / "docs" / "daehoe-sync-schema.sql"
MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
TENNISTOWN_TYPES = {"TENNISTOWN", "TENNISTOWN_APP"}


def valid_date(value):
    try:
        return date.fromisoformat(str(value)).isoformat()
    except (TypeError, ValueError):
        return None


def build_row(item):
    now = datetime.now(tz=ZoneInfo("Asia/Seoul")).isoformat()
    return (
        item["id"],
        item.get("sourceType") or "UNKNOWN",
        item.get("sourceId"),
        valid_date(item.get("startDate")),
        valid_date(item.get("endDate")),
        item.get("syncStatus") != "missing_from_latest_crawl",
        item.get("syncStatus") or "seen",
        item,
        item.get("crawledAt") or now,
        item.get("updatedAt") or now,
    )


def normalize_months(values):
    return list(dict.fromkeys(value for value in values if MONTH_PATTERN.fullmatch(value)))


def default_months(mode):
    now = datetime.now(tz=ZoneInfo("Asia/Seoul"))
    if mode == "full":
        return [f"{now.year}-{month:02d}" for month in range(1, 13)]
    next_year = now.year + (1 if now.month == 12 else 0)
    next_month = 1 if now.month == 12 else now.month + 1
    return [f"{now.year}-{now.month:02d}", f"{next_year}-{next_month:02d}"]


def sync(database_url, data_path, schema_path, mode, months, inactive_retention_days=180):
    import psycopg
    from psycopg.types.json import Jsonb

    tournaments = json.loads(Path(data_path).read_text(encoding="utf-8"))
    raw_rows = [build_row(item) for item in tournaments if item.get("id")]
    rows = [(*row[:7], Jsonb(row[7]), *row[8:]) for row in raw_rows]
    active_ids = [
        row[0]
        for row in raw_rows
        if row[1] in TENNISTOWN_TYPES and row[3] and row[3][:7] in months and row[5]
    ]

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(Path(schema_path).read_text(encoding="utf-8"))
            cursor.executemany(
                """
                insert into public.daehoe_tournaments (
                  id, source_type, source_id, start_date, end_date, active,
                  sync_status, payload, crawled_at, updated_at
                ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (id) do update set
                  source_type = excluded.source_type,
                  source_id = excluded.source_id,
                  start_date = excluded.start_date,
                  end_date = excluded.end_date,
                  active = excluded.active,
                  sync_status = excluded.sync_status,
                  payload = excluded.payload,
                  crawled_at = excluded.crawled_at,
                  updated_at = excluded.updated_at
                """,
                rows,
            )
            cursor.execute(
                """
                update public.daehoe_tournaments
                   set active = false,
                       sync_status = 'missing_from_latest_crawl',
                       updated_at = now()
                 where source_type = any(%s)
                   and to_char(start_date, 'YYYY-MM') = any(%s)
                   and not (id = any(%s))
                """,
                (list(TENNISTOWN_TYPES), months, active_ids),
            )
            if mode == "full":
                cursor.execute(
                    """
                    insert into public.daehoe_sync_state (key, value, updated_at)
                    values ('tennistown_initial_refresh', %s, now())
                    on conflict (key) do update set value = excluded.value, updated_at = now()
                    """,
                    (Jsonb({"completedAt": datetime.now(tz=ZoneInfo("Asia/Seoul")).isoformat(), "months": months}),),
                )
            if inactive_retention_days and inactive_retention_days > 0:
                cutoff = datetime.now(tz=ZoneInfo("Asia/Seoul")) - timedelta(days=inactive_retention_days)
                cursor.execute(
                    """
                    delete from public.daehoe_tournaments
                     where active = false
                       and updated_at < %s
                    """,
                    (cutoff,),
                )
            cursor.execute("select count(*) from public.daehoe_tournaments where active")
            active_count = cursor.fetchone()[0]
        connection.commit()
    return {"upserted": len(rows), "active": active_count, "months": months, "mode": mode}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(DEFAULT_DATA))
    parser.add_argument("--schema", default=str(DEFAULT_SCHEMA))
    parser.add_argument("--mode", choices=("full", "incremental"), default=os.getenv("DAEHOE_SYNC_MODE", "incremental"))
    parser.add_argument("--months", default=os.getenv("DAEHOE_REFRESH_MONTHS", ""))
    parser.add_argument("--inactive-retention-days", type=int, default=int(os.getenv("DAEHOE_INACTIVE_RETENTION_DAYS", "180")))
    args = parser.parse_args()
    months = normalize_months(args.months.split(",")) or default_months(args.mode)
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    result = sync(database_url, args.data, args.schema, args.mode, months, args.inactive_retention_days)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
