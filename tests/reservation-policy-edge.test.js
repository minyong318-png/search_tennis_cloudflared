const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

(async () => {
  const courts = await import(pathToFileURL('PagesCourtIssum/src/lib/courts.js').href);
  const nowMs = Date.parse('2026-09-07T01:00:00Z');
  const date = '20260908';
  const checkedAt = new Date(nowMs).toISOString();
  const slot = { timeContent: '18:00 ~ 20:00' };
  const currentMeta = { query_status: 'success', availability_status: 'available', checked_at: checkedAt };
  const unknown = { title: '가상테니스장(1코트)', reservation_type: 'unknown', application_status: 'unknown' };
  const known = { ...unknown, reservation_type: 'city_priority', application_status: 'open', metadata_checked_at: checkedAt };
  const options = { nowMs };
  const data = { availability_meta: { '12345': { [date]: currentMeta }, 'yongin:12345': { [date]: currentMeta }, 'suwon:1': { [date]: currentMeta } } };
  assert.equal(courts.cityOfFacilityId('12345'), 'yongin');
  assert.equal(courts.slotIsAvailable(data, '12345', date, unknown, slot, options), false, 'legacy numeric Yongin IDs must require verified product metadata too');
  assert.equal(courts.slotIsAvailable(data, '12345', date, known, slot, options), true);
  assert.equal(courts.slotIsAvailable(data, '12345', date, { ...known, metadata_checked_at: '2026-09-05T01:00:00Z' }, slot, options), false);
  assert.equal(courts.slotIsAvailable(data, 'suwon:1', date, unknown, slot, options), true, 'non-Yongin sources can publish verified slots without unsupported product metadata');
  assert.equal(courts.slotIsAvailable(data, 'suwon:1', date, unknown, { timeContent: '18:00 (1회차)' }, options), true, 'Suwon calendar publishes valid start-only time labels');
  assert.equal(courts.slotIsAvailable(data, 'suwon:1', date, unknown, { timeContent: '25:00 (1회차)' }, options), false, 'start-only compatibility must not accept invalid times');
  const failed = { availability_meta: { 'yongin:12345': { [date]: { ...currentMeta, query_status: 'failed', updated_at: checkedAt } } } };
  assert.equal(courts.slotIsAvailable(failed, 'yongin:12345', date, known, slot, options), false, 'recent failed attempt must not resurrect last successful slots');
  const stale = { availability_meta: { 'yongin:12345': { [date]: { ...currentMeta, checked_at: '2026-09-05T01:00:00Z', updated_at: checkedAt } } } };
  assert.equal(courts.slotIsAvailable(stale, 'yongin:12345', date, known, slot, options), false, 'fresh updated_at cannot replace stale successful checked_at');
  console.log('Reservation policy edge tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
