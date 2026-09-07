(function (root) {
  'use strict';
  const RESERVATION_TYPE_LABELS = Object.freeze({ district_priority: '구민우선', city_priority: '시민우선', general: '일반예약', unknown: '예약 구분 미제공' });
  const TYPE_ALIASES = { RESIDENTRESVE: 'district_priority', CITIZENRESVE: 'city_priority', GNRLRESVE: 'general', 구민우선: 'district_priority', 구민예약: 'district_priority', 시민우선: 'city_priority', 시민예약: 'city_priority', 일반예약: 'general' };
  const DEFAULT_AVAILABILITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const compact = value => String(value || '').replace(/[-./]/g, '').slice(0, 8);
  const nowMs = options => options?.nowMs ?? Date.now();
  function kstClock(options) {
    const iso = new Date(nowMs(options) + 9 * 60 * 60 * 1000).toISOString();
    return { date: compact(iso.slice(0, 10)), minutes: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) };
  }
  function reservationTypeOfFacility(fac = {}) {
    for (const raw of [fac.reservation_type, fac.reservationType, fac.reservation_type_label, fac.reservationTypeLabel]) {
      const text = String(raw || '').replace(/\s/g, '');
      const value = TYPE_ALIASES[text] || text;
      if (value !== 'unknown' && RESERVATION_TYPE_LABELS[value]) return value;
      if (text.includes('구민')) return 'district_priority';
      if (text.includes('시민')) return 'city_priority';
      if (text.includes('일반예약')) return 'general';
    }
    return 'unknown';
  }
  function reservationTypeLabel(fac = {}) {
    const type = reservationTypeOfFacility(fac);
    return type === 'unknown' ? '' : RESERVATION_TYPE_LABELS[type];
  }
  function reservationTypeMatches(fac, filter = '') { return !filter || reservationTypeOfFacility(fac) === filter; }
  function normalizedApplicationStatus(fac = {}) {
    const value = String(fac.application_status || fac.applicationStatus || '').trim().toLowerCase();
    const label = String(fac.application_status_label || fac.applicationStatusLabel || '').replace(/\s/g, '').toLowerCase();
    if (value === 'closed' || /마감|closed|full/.test(label)) return 'closed';
    if (['not_open', 'notopen'].includes(value) || /예정|접수전|접수대기|not.?open/.test(label)) return 'not_open';
    if (value === 'open' || /접수중|예약가능|예약중/.test(label)) return 'open';
    return 'unknown';
  }
  function applicationStatusLabel(fac = {}) { return { open: '접수중', closed: '접수마감', not_open: '접수 시작 전', unknown: '' }[normalizedApplicationStatus(fac)]; }
  function availabilityMeta(data, cid, date) {
    const key = compact(date);
    return data?.availability_meta?.[cid]?.[key] || data?.availability_meta?.[cid]?.[`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`] || null;
  }
  function isFresh(value, options = {}) {
    const time = Date.parse(value || '');
    const age = nowMs(options) - time;
    return Number.isFinite(time) && age >= -5 * 60 * 1000 && age <= (options.freshnessMaxAgeMs ?? DEFAULT_AVAILABILITY_MAX_AGE_MS);
  }
  function availabilityIsFresh(data, cid, date, maxAgeMs = DEFAULT_AVAILABILITY_MAX_AGE_MS) {
    const meta = availabilityMeta(data, cid, date);
    return isFresh(meta?.checked_at, { freshnessMaxAgeMs: maxAgeMs });
  }
  function slotIsExplicitlyUnavailable(slot = {}) {
    if (slot.available === false || slot.available === 0 || ['false', 'no', 'n', '0'].includes(String(slot.available ?? '').trim().toLowerCase())) return true;
    for (const key of ['remaining', 'remainingCount', 'remain', 'remainCount', 'availableCount']) {
      if (slot[key] === undefined) continue;
      if (slot[key] === null || String(slot[key]).trim() === '' || typeof slot[key] === 'boolean' || !Number.isFinite(Number(slot[key])) || Number(slot[key]) <= 0) return true;
    }
    return /예약불가|예약마감|접수마감|unavailable|closed|full|reserved/.test(String(slot.status || slot.statusText || slot.state || '').replace(/\s/g, '').toLowerCase());
  }
  function slotRange(slot) {
    const matches = [...String(slot?.timeContent || '').matchAll(/(\d{1,2}):(\d{2})/g)];
    if (!matches.length) return null;
    const values = matches.slice(0, 2).map(m => Number(m[1]) * 60 + Number(m[2]));
    if (matches.slice(0, 2).some(m => Number(m[1]) > 24 || Number(m[2]) > 59) || values[0] >= 1440 || values[1] > 1440 || (values.length > 1 && values[0] >= values[1])) return null;
    return { start: values[0], end: values[1] ?? null };
  }
  function availabilityState(data, cid, date, fac = {}, options = {}) {
    const today = kstClock(options).date;
    const day = compact(date);
    if (!/^\d{8}$/.test(day)) return 'unverified';
    if (day < today) return 'past';
    const status = normalizedApplicationStatus(fac);
    if (status === 'closed' || status === 'not_open') return status;
    if (String(cid).startsWith('yongin:') || /^\d+$/.test(String(cid))) {
      if (status !== 'open' || reservationTypeOfFacility(fac) === 'unknown') return 'unverified';
      const checked = fac.metadata_checked_at || fac.metadataCheckedAt;
      if (!checked) return 'unverified';
      if (!isFresh(checked, options)) return 'stale';
    }
    const start = compact(fac.application_start_date || fac.applicationStartDate);
    const end = compact(fac.application_end_date || fac.applicationEndDate);
    if (start && today < start) return 'not_open';
    if (end && today > end) return 'closed';
    const useStart = compact(fac.use_start_date || fac.useStartDate);
    const useEnd = compact(fac.use_end_date || fac.useEndDate);
    if ((useStart && day < useStart) || (useEnd && day > useEnd)) return 'outside_period';
    const meta = availabilityMeta(data, cid, day);
    if (!meta) return 'unverified';
    if (meta.query_status === 'failed') return 'failed';
    if (meta.query_status !== 'success') return 'unverified';
    if (!isFresh(meta.checked_at, options)) return 'stale';
    return ['available', 'confirmed_empty', 'closed', 'not_open'].includes(meta.availability_status) ? meta.availability_status : 'unverified';
  }
  function availabilityMessage(data, cid, date, fac = {}, options = {}) {
    return { available: '', confirmed_empty: '잔여 시간 없음', closed: '접수마감', not_open: '접수 시작 전', outside_period: '이용기간 밖', past: '지난 날짜', unverified: '예약 정보 갱신 대기', failed: '조회 지연 · 공식 예약처 확인', stale: '갱신 지연 · 공식 예약처 확인' }[availabilityState(data, cid, date, fac, options)];
  }
  function slotIsAvailable(data, cid, date, fac, slot, options = {}) {
    if (availabilityState(data, cid, date, fac, options) !== 'available' || !slot || slotIsExplicitlyUnavailable(slot)) return false;
    const range = slotRange(slot);
    if (!range) return false;
    const clock = kstClock(options);
    return compact(date) !== clock.date || range.start > clock.minutes;
  }
  root.ReservationPolicy = Object.freeze({ RESERVATION_TYPE_LABELS, RESERVATION_TYPE_KEYS: Object.keys(RESERVATION_TYPE_LABELS), DEFAULT_AVAILABILITY_MAX_AGE_MS, reservationTypeOfFacility, reservationTypeLabel, reservationTypeMatches, normalizedApplicationStatus, applicationStatusLabel, availabilityMeta, availabilityIsFresh, availabilityState, availabilityMessage, slotIsExplicitlyUnavailable, slotIsAvailable });
})(globalThis);
