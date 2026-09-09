const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.value = '';
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  get childNodes() { return this.children; }
  get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  set textContent(text) { this.children = [String(text)]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
}
function descendants(element) {
  return [element, ...element.children.filter(child => child instanceof Element).flatMap(descendants)];
}
function loadPage(directory) {
  const html = fs.readFileSync(path.join(root, directory, 'index.html'), 'utf8');
  const sharedTag = '<script src="./shared/reservation-policy.js"></script>';
  assert(html.includes(sharedTag), `${directory} must load the shared policy`);
  assert(html.indexOf(sharedTag) < html.lastIndexOf('<script>'), 'policy must execute before app code');
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc=|application\/ld\+json/i.test(attributes)).map(([, , code]) => code).join('\n');
  new Function(script);
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const context = {
    ...elements, console, URL, Date, setTimeout() {}, clearTimeout() {}, setInterval() {}, requestAnimationFrame() { return 1; },
    navigator: {}, localStorage: { getItem() { return null; }, setItem() {} },
    innerWidth: 390, matchMedia() { return { matches: false }; }, addEventListener() {},
    location: { href: 'https://example.com/', search: '' },
    document: {
      getElementById(id) { return elements[id] ||= new Element(); },
      createElement(tag) { return new Element(tag); },
      createDocumentFragment() { return new Element(); },
      querySelector() { return { value: 'contains', checked: true }; },
      querySelectorAll() { return []; }, addEventListener() {}, body: new Element(), documentElement: new Element()
    },
    supabase: { createClient() { return {}; } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'Pages/shared/reservation-policy.js'), 'utf8'), context);
  vm.runInContext(script, context);
  return { context, elements, evaluate(code) { return vm.runInContext(code, context); } };
}

const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const day = tomorrow.replaceAll('-', '');
const checked = new Date().toISOString();
function fixture() {
  const result = { facilities: {}, availability: {}, availability_meta: {}, updated_at: checked };
  for (const [id, type] of [['resident', 'district_priority'], ['citizen', 'city_priority']]) {
    const cid = `yongin:${id}`;
    result.facilities[cid] = { title: '가상테니스장(1코트)', reservation_type: type, application_status: 'open', metadata_checked_at: checked, source_url: `https://example.com/${id}` };
    result.availability[cid] = { [day]: [{ timeContent: '18:00 ~ 20:00', resveId: id }] };
    result.availability_meta[cid] = { [day]: { query_status: 'success', availability_status: 'available', checked_at: checked } };
  }
  return result;
}
for (const directory of ['Pages', 'PagesCourtIssum']) {
  const page = loadPage(directory);
  const legacy = directory === 'Pages';
  const filter = legacy ? (page.elements.filterReservationType || { value: '' }) : page.elements.reservationTypeFilter;
  page.elements[legacy ? 'filterDate' : 'dateFilter'].value = tomorrow;
  page.context.fixture = fixture();
  page.evaluate('DATA = fixture');
  // Reservation-policy assertions exercise an explicitly requested city-wide query.
  // First-visit scope=none is covered separately by the browser UX scenarios.
  if (!legacy) page.evaluate('searchScope = "all"');
  const render = () => legacy ? page.evaluate('renderCourts()') : page.evaluate('collectRows()');
  const availableCount = () => legacy
    ? descendants(page.elements.courts).filter(element => element.className === 'slot').length
    : render().reduce((sum, row) => sum + row.count, 0);

  if (legacy) {
    filter.value = 'district_priority';
    render();
    assert.equal(availableCount(), 2, 'Standalone shows both reservation products without a category filter');
    assert(page.elements.courts.textContent.includes('구민우선'));
    assert(page.elements.courts.textContent.includes('시민우선'));
  } else {
    filter.value = 'district_priority';
    render();
    assert.equal(availableCount(), 1, `${directory}: district priority filter`);
    filter.value = 'city_priority';
    render();
    assert.equal(availableCount(), 1, `${directory}: citizen filter`);
    filter.value = 'general';
    render();
    assert.equal(availableCount(), 0, `${directory}: unknown/type mismatch cannot become general`);
  }

  filter.value = '';
  if (!legacy) {
    const rows = render();
    assert.equal(rows[0].count, 1, 'same physical court/time must count once');
    assert.equal(rows[0].slots[0]._alternatives.length, 2, 'both reservation links must remain accessible');
    page.context.rows = rows;
    page.evaluate('renderMatrix(rows); renderMobileCards(rows); openSlotPicker(rows[0], 18, rows[0].slots)');
    assert.equal(page.elements.slotPickerChoices.children.length, 2);
    assert(page.elements.slotPickerChoices.textContent.includes('구민우선'));
    assert(page.elements.slotPickerChoices.textContent.includes('시민우선'));
  }

  page.context.fixture.facilities['yongin:resident'].application_status = 'closed';
  page.context.fixture.availability_meta['yongin:citizen'][day].query_status = 'failed';
  render();
  assert.equal(availableCount(), 0, `${directory}: closed and failed data must never show availability`);
  if (legacy) {
    assert(page.elements.courts.textContent.includes('조회 지연'));
    assert(page.elements.courts.textContent.includes('공식 예약처 확인'));
  } else {
    page.context.rows = render();
    page.evaluate('renderMobileCards(rows)');
    assert(page.elements.mobileCards.textContent.includes('조회 지연'));
    assert(page.elements.mobileCards.textContent.includes('공식 예약처 확인'));
  }

  page.context.fixture = fixture();
  delete page.context.fixture.facilities['yongin:citizen'];
  delete page.context.fixture.availability['yongin:citizen'];
  delete page.context.fixture.availability_meta['yongin:citizen'];
  delete page.context.fixture.facilities['yongin:resident'].reservation_type;
  delete page.context.fixture.facilities['yongin:resident'].application_status;
  page.evaluate('DATA = fixture');
  filter.value = 'unknown';
  render();
  assert.equal(availableCount(), 0, `${directory}: legacy metadata must not be guessed available`);
  const output = legacy ? page.elements.courts.textContent : (page.context.rows = render(), page.evaluate('renderMobileCards(rows)'), page.elements.mobileCards.textContent);
  assert(!/유형\s*확인\s*필요|상태\s*확인\s*필요/.test(output), `${directory}: unknown badges must not repeat`);
  assert(output.includes('예약 정보 갱신 대기'));

  page.context.fixture = fixture();
  for (const cid of Object.keys(page.context.fixture.facilities)) {
    page.context.fixture.availability_meta[cid][day].checked_at = '2020-01-01T00:00:00Z';
  }
  page.evaluate('DATA = fixture');
  filter.value = '';
  render();
  assert.equal(availableCount(), 0, `${directory}: stale cached time is unavailable`);
  page.context.fixture = fixture();
  for (const cid of Object.keys(page.context.fixture.facilities)) {
    page.context.fixture.availability[cid][day][0].remainingCount = 0;
  }
  page.evaluate('DATA = fixture');
  render();
  assert.equal(availableCount(), 0, `${directory}: explicit zero cannot appear available`);

  if (!legacy) {
    page.context.fixture = fixture();
    for (const cid of Object.keys(page.context.fixture.facilities)) {
      page.context.fixture.availability[cid][day] = [];
      page.context.fixture.availability_meta[cid][day].availability_status = 'confirmed_empty';
    }
    page.evaluate('DATA = fixture');
    const health = page.evaluate('cityCrawlHealth("yongin", Object.entries(DATA.facilities), DATA.availability, Date.now(), 0)');
    assert.equal(health.state, 'ok', 'confirmed empty is a successful lookup, not crawler failure');
    assert.equal(health.slotCount, 0);
    page.context.fixture = fixture();
    for (const fac of Object.values(page.context.fixture.facilities)) fac.title = '코트번호 없는 시설';
    page.evaluate('DATA = fixture');
    const unknownCourtRows = render();
    assert.deepEqual(Array.from(unknownCourtRows[0].courtLabelList), ['예약 항목'], 'unknown physical mapping must not invent court numbers');
    assert.equal(unknownCourtRows[0].count, 2, 'unknown physical mapping retains separate reservation entries');
    page.context.fixture = fixture();
    const staleFirst = page.context.fixture.facilities['yongin:citizen'];
    staleFirst.reservation_type = 'unknown';
    staleFirst.metadata_checked_at = '2020-01-01T00:00:00Z';
    page.context.fixture.availability_meta['yongin:citizen'][day].checked_at = '2020-01-01T00:00:00Z';
    page.context.fixture.facilities['yongin:resident'].reservation_type = 'general';
    page.evaluate('DATA = fixture');
    page.context.rows = render();
    assert.equal(page.context.rows[0].cid, 'yongin:citizen', 'regression fixture must put stale product first');
    assert.equal(page.context.rows[0].count, 1);
    page.evaluate('renderMatrix(rows); renderMobileCards(rows)');
    const expectedChecked = new Date(checked).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    for (const element of [page.elements.matrix, page.elements.mobileCards]) {
      assert(element.textContent.includes(`선택 날짜 확인 ${expectedChecked}`), 'displayed availability must use its own checked timestamp');
      assert(!element.textContent.includes('선택 날짜 확인 01. 01.'), 'stale grouped product timestamp must not label current available slots');
    }
  }
}
console.log('Both static HTML clients: reservation filters, freshness gates, pending states, deduplication and links passed.');
