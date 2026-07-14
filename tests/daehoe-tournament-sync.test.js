import test from "node:test";
import assert from "node:assert/strict";

import {
  isTournamentInRefreshScope,
  resolveTennisTownRefreshPlan
} from "../PagesDaehoeIssum/src/tournament-sync.js";
import {
  divisionGroupValues,
  extractTitleTags,
  normalizeRegistrationStatusCode,
  organizerGroup,
  parseFeeText,
  parseRegistrationCount
} from "../PagesDaehoeIssum/src/tournament-utils.js";

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

test("TennisTown registration count keeps raw value and separates numbers", () => {
  assert.deepEqual(parseRegistrationCount("3/28"), {
    raw: "3/28",
    current: 3,
    capacity: 28
  });
  assert.deepEqual(parseRegistrationCount(""), {
    raw: "",
    current: null,
    capacity: null
  });
});

test("TennisTown fee parser only classifies clear person/team units", () => {
  assert.deepEqual(parseFeeText("대회 78,000원"), {
    raw: "대회 78,000원",
    amount: 78000,
    unit: "team"
  });
  assert.deepEqual(parseFeeText("1인 25,000원"), {
    raw: "1인 25,000원",
    amount: 25000,
    unit: "person"
  });
  assert.equal(parseFeeText("78,000원").unit, "unknown");
});

test("TennisTown status and event tags are normalized conservatively", () => {
  assert.equal(normalizeRegistrationStatusCode("접수중"), "OPEN");
  assert.equal(normalizeRegistrationStatusCode("모집예정"), "UPCOMING");
  assert.equal(normalizeRegistrationStatusCode("접수마감"), "CLOSED");
  assert.deepEqual(extractTitleTags("(대회공지) ACECUP X MEGA TENNIS"), ["대회공지"]);
});

test("organizer filter groups related institutions", () => {
  assert.equal(organizerGroup({ sourceType: "TENNISTOWN_APP" }), "테니스타운");
  assert.equal(organizerGroup({ sourceType: "KTA", organizer: "대한테니스협회" }), "전국 협회 · KTA");
  assert.equal(organizerGroup({ sourceType: "KATO" }), "전국 협회 · KATO");
  assert.equal(organizerGroup({ sourceType: "KATA" }), "전국 협회 · KATA");
  assert.equal(organizerGroup({ sourceType: "LOCAL_ASSOC", organizer: "성남시테니스협회", regionSigungu: "성남시" }), "성남시");
  assert.equal(organizerGroup({ sourceType: "FACILITY_NOTICE", sourceName: "성남 시설공지" }), "");
});

test("division filter groups noisy source divisions", () => {
  assert.deepEqual(divisionGroupValues("남자단식 아이언"), ["남자단식", "레벨/등급전"]);
  assert.deepEqual(divisionGroupValues("개나리부"), ["여성부"]);
  assert.deepEqual(divisionGroupValues("혼합복식 실버"), ["혼합복식", "레벨/등급전"]);
  assert.deepEqual(divisionGroupValues("단체전"), ["단체전"]);
});
