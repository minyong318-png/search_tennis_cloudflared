import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).parents[1] / "PagesDaehoeIssum" / "scripts" / "sync_supabase_postgres.py"
SPEC = importlib.util.spec_from_file_location("daehoe_sync", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DaehoeSupabaseSyncTests(unittest.TestCase):
    def test_build_row_preserves_full_payload_and_active_state(self):
        item = {
            "id": "tennistown-app-123",
            "sourceType": "TENNISTOWN_APP",
            "sourceId": "123",
            "startDate": "2026-07-20",
            "endDate": "2026-07-20",
            "syncStatus": "seen",
        }

        row = MODULE.build_row(item)

        self.assertEqual(row[0], "tennistown-app-123")
        self.assertTrue(row[5])
        self.assertEqual(row[7], item)

    def test_refresh_scope_uses_only_valid_year_month_keys(self):
        self.assertEqual(
            MODULE.normalize_months(["2026-07", "2026-08", "bad", "2026-13"]),
            ["2026-07", "2026-08"],
        )


if __name__ == "__main__":
    unittest.main()
