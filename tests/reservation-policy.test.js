const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

(async () => {
  const courts = await import(pathToFileURL('PagesCourtIssum/src/lib/courts.js').href);
  const unknown = { reservation_type: 'unknown', reservation_type_label: '유형 확인 필요', application_status: 'unknown', application_status_label: '상태 확인 필요' };
  assert.equal(courts.reservationTypeLabel(unknown), '', 'migration defaults must not appear as product badges');
  assert.equal(courts.applicationStatusLabel(unknown), '', 'unsupported source status must not appear as a badge');
  const source = fs.readFileSync('Pages/shared/reservation-policy.js', 'utf8');
  const browser = {};
  vm.runInNewContext(source, browser);
  const policy = browser.ReservationPolicy;
  const date = courts.todayKst(1).replaceAll('-', '');
  const now = new Date().toISOString();
  const fac = { title: '[유료]가상테니스장(1코트)', reservation_type: 'general', application_status: 'open', metadata_checked_at: now };
  const slot = { timeContent: '18:00 ~ 20:00' };
  const data = { facilities: { 'yongin:1': fac }, availability: { 'yongin:1': { [date]: [slot] } }, availability_meta: { 'yongin:1': { [date]: { query_status: 'success', availability_status: 'available', checked_at: now } } } };
  for (const api of [courts, policy]) {
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, fac, slot), true);
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, { ...fac, application_status: 'not_open' }, slot), false);
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, { ...fac, metadata_checked_at: null }, slot), false, 'fresh slot cannot validate unverified product');
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, { ...fac, reservation_type: 'unknown' }, slot), false);
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, fac, { ...slot, remaining: 0 }), false);
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, fac, { ...slot, available: false }), false);
    assert.equal(api.slotIsAvailable(data, 'yongin:1', date, fac, { ...slot, timeContent: '조회 오류' }), false);
    assert.equal(api.slotIsAvailable({ ...data, availability_meta: {} }, 'yongin:1', date, fac, slot), false);
  }
  assert.match(policy.availabilityMessage(data, 'yongin:1', date, unknown), /갱신 대기/);
  assert.equal(policy.reservationTypeLabel({ reservation_type: 'city_priority' }), '시민우선');
  const variants = structuredClone(data);
  variants.facilities['yongin:2'] = { ...fac, reservation_type: 'district_priority' };
  variants.availability['yongin:2'] = { [date]: [slot] };
  variants.availability_meta['yongin:2'] = variants.availability_meta['yongin:1'];
  const row = courts.collectCourtRows(variants, { city: 'yongin', date })[0];
  assert.equal(row.count, 1);
  assert.deepEqual(row.slots[0]._variants.map(s => s._cid).sort(), ['yongin:1', 'yongin:2'], 'dedup must preserve BOTH reservation links');
  console.log('Shared reservation policy tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
