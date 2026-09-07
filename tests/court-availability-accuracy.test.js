const assert = require("assert");
const { pathToFileURL } = require("url");

(async () => {
  const courts = await import(pathToFileURL("PagesCourtIssum/src/lib/courts.js").href);
  const date = courts.todayKst(1);
  const checkedAt = new Date().toISOString();
  const data = {
    facilities: {
      "yongin:resident": {
        title: "[유료]가상테니스장(1코트)_09월",
        location: "수지구",
        reservation_type: "district_priority",
        reservation_type_label: "구민우선",
        application_status: "closed",
        application_status_label: "접수마감"
      },
      "yongin:general": {
        title: "[유료]가상테니스장(1코트)_09월",
        location: "수지구",
        reservation_type: "general",
        reservation_type_label: "일반예약",
        application_status: "open",
        application_status_label: "접수중"
      },
      "yongin:stale": {
        title: "[유료]오래된테니스장(1코트)_09월",
        location: "수지구",
        reservation_type: "general",
        reservation_type_label: "일반예약",
        application_status: "open",
        application_status_label: "접수중"
      }
    },
    availability: {
      "yongin:resident": { [date.replaceAll("-", "")]: [{ timeContent: "18:00 ~ 20:00", resveId: "resident" }] },
      "yongin:general": { [date.replaceAll("-", "")]: [{ timeContent: "18:00~20:00", resveId: "general" }] },
      "yongin:stale": { [date.replaceAll("-", "")]: [{ timeContent: "18:00 ~ 20:00", resveId: "stale" }] }
    },
    availability_meta: {
      "yongin:resident": { [date.replaceAll("-", "")]: { query_status: "success", availability_status: "available", checked_at: checkedAt } },
      "yongin:general": { [date.replaceAll("-", "")]: { query_status: "success", availability_status: "available", checked_at: checkedAt } },
      "yongin:stale": { [date.replaceAll("-", "")]: { query_status: "success", availability_status: "available", checked_at: "2026-01-01T00:00:00Z" } }
    }
  };

  const rows = courts.collectCourtRows(data, { city: "yongin", date });
  assert.strictEqual(rows.length, 2, "closed product is excluded while stale row remains visible for its own status");
  const current = rows.find((row) => row.fac?.reservation_type === "general");
  assert.ok(current);
  assert.strictEqual(current.count, 1, "same physical court/time is deduplicated across products");
  assert.strictEqual(current.slots[0].reservationTypeLabel, "일반예약");
  assert.strictEqual(current.unitLabel, "면");

  const staleRows = courts.collectCourtRows(data, { city: "yongin", date, freshnessMaxAgeMs: 60_000 });
  const stale = staleRows.find((row) => row.fac?.title.includes("오래된테니스장"));
  assert.ok(!stale || stale.count === 0, "stale availability is excluded from available rows");

  const unknownPhysicalData = {
    facilities: {
      "yongin:unknown-a": { title: "[유료]번호없는장소_09월", reservation_type: "district_priority", reservation_type_label: "구민우선", application_status: "open" },
      "yongin:unknown-b": { title: "[유료]번호없는장소_09월", reservation_type: "city_priority", reservation_type_label: "시민우선", application_status: "open" }
    },
    availability: {
      "yongin:unknown-a": { [date.replaceAll("-", "")]: [{ timeContent: "18:00 ~ 20:00", resveId: "unknown-a" }] },
      "yongin:unknown-b": { [date.replaceAll("-", "")]: [{ timeContent: "18:00 ~ 20:00", resveId: "unknown-b" }] }
    },
    availability_meta: {
      "yongin:unknown-a": { [date.replaceAll("-", "")]: { query_status: "success", availability_status: "available", checked_at: checkedAt } },
      "yongin:unknown-b": { [date.replaceAll("-", "")]: { query_status: "success", availability_status: "available", checked_at: checkedAt } }
    }
  };
  const unknownRows = courts.collectCourtRows(unknownPhysicalData, { city: "yongin", date });
  assert.strictEqual(unknownRows[0].count, 2, "unverified court mapping keeps reservation products separate");
  assert.strictEqual(unknownRows[0].unitLabel, "예약 항목");
  assert.strictEqual(courts.buildCourtOptions(unknownPhysicalData, "yongin")[0].unknownPhysicalCourt, true);

  console.log("Court availability accuracy test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
