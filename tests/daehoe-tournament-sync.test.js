import test from "node:test";
import assert from "node:assert/strict";

import {
  isTournamentInRefreshScope,
  resolveTennisTownRefreshPlan
} from "../PagesDaehoeIssum/src/tournament-sync.js";

test("first refresh covers every month in the current year", () => {
  const plan = resolveTennisTownRefreshPlan({
    now: new Date("2026-07-10T00:00:00+09:00"),
    initialized: false
  });

  assert.equal(plan.mode, "full");
  assert.equal(plan.targets.length, 12);
  assert.deepEqual(plan.targets.at(0), { year: 2026, month: 1, key: "2026-01" });
  assert.deepEqual(plan.targets.at(-1), { year: 2026, month: 12, key: "2026-12" });
});

test("later refresh covers current and next month across a year boundary", () => {
  const plan = resolveTennisTownRefreshPlan({
    now: new Date("2026-12-15T10:00:00+09:00"),
    initialized: true
  });

  assert.equal(plan.mode, "incremental");
  assert.deepEqual(plan.targets, [
    { year: 2026, month: 12, key: "2026-12" },
    { year: 2027, month: 1, key: "2027-01" }
  ]);
});

test("missing detection only applies to TennisTown rows in refreshed months", () => {
  const scope = new Set(["2026-07", "2026-08"]);

  assert.equal(isTournamentInRefreshScope({ sourceType: "TENNISTOWN_APP", startDate: "2026-07-20" }, scope), true);
  assert.equal(isTournamentInRefreshScope({ sourceType: "TENNISTOWN", startDate: "2026-08-02" }, scope), true);
  assert.equal(isTournamentInRefreshScope({ sourceType: "TENNISTOWN_APP", startDate: "2026-09-01" }, scope), false);
  assert.equal(isTournamentInRefreshScope({ sourceType: "KATO", startDate: "2026-07-20" }, scope), false);
});
