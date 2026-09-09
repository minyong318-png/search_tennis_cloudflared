const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.value = ''; this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  get childNodes() { return this.children; }
  get options() { return descendants(this).filter(element => element.tagName === 'OPTION'); }
  get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  set textContent(text) { this.children = [String(text)]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  focus() {}
}
function descendants(element) { return [element, ...element.children.filter(child => child instanceof Element).flatMap(descendants)]; }
const root = path.resolve(__dirname, '..');
function load(directory, existingStorage) {
  const html = fs.readFileSync(path.join(root, directory, 'index.html'), 'utf8');
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc=|application\/ld\+json/i.test(attributes)).map(([, , code]) => code).join('\n');
  new Function(script);
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const storage = new Map(Object.entries(existingStorage));
  const context = {
    ...elements, console, URL, URLSearchParams, Date, setTimeout() {}, clearTimeout() {}, setInterval() {}, navigator: {},
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
    innerWidth: 390, matchMedia() { return { matches: false }; }, addEventListener() {},
    location: { href: 'https://example.com/?type=district_priority', search: '?type=district_priority' },
    history: { replaceState() {} },
    document: {
      getElementById(id) { return elements[id] ||= new Element(); }, createElement(tag) { return new Element(tag); },
      createDocumentFragment() { return new Element(); }, createTextNode(text) { return String(text); },
      querySelector() { const element = new Element(); element.value = 'contains'; element.checked = true; return element; }, querySelectorAll() { return []; },
      addEventListener() {}, body: new Element(), documentElement: new Element()
    }, supabase: { createClient() { return {}; } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'Pages/shared/reservation-policy.js'), 'utf8'), context);
  vm.runInContext(script, context);
  return { elements, storage, context, run(code) { return vm.runInContext(code, context); } };
}
const checkedAt = new Date().toISOString();
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const date = tomorrow.replaceAll('-', '');
const data = { facilities: {}, availability: {}, availability_meta: {}, updated_at: checkedAt };
for (const [id, title, slots] of [
  ['goyang:open', '공원A 1코트', [{ timeContent: '18:00 ~ 20:00', reserveUrl: 'https://example.com/a' }]],
  ['goyang:empty', '공원B 1코트', []]
]) {
  data.facilities[id] = { title, reservation_type: 'district_priority', application_status: 'closed', application_start_date: '20990101', use_end_date: '20200101' };
  data.availability[id] = { [date]: slots };
  data.availability_meta[id] = { [date]: { query_status: 'success', availability_status: slots.length ? 'available' : 'confirmed_empty', checked_at: checkedAt } };
}
for (const directory of ['Pages', 'PagesCourtIssum']) {
  const legacy = directory === 'Pages';
  const key = legacy ? 'tennis_favorite_courts_v1' : 'courtissum.favoriteCourts.v1';
  const previous = legacy ? [{ city: 'yongin', group: '기존저장' }] : ['yongin|기존저장'];
  const page = load(directory, { [key]: JSON.stringify(previous) });
  if (!legacy) page.run('loadData = async () => {}; init()');
  page.context.fixture = JSON.parse(JSON.stringify(data));
  page.run(legacy ? 'DATA = fixture; CURRENT_CITY = "goyang"' : 'DATA = fixture; currentCity = "goyang"; searchScope = "all"');
  page.elements[legacy ? 'filterDate' : 'dateFilter'].value = tomorrow;
  const typeFilter = legacy ? (page.elements.filterReservationType || { value: '' }) : page.elements.reservationTypeFilter;
  typeFilter.value = 'city_priority';
  page.run(legacy ? 'renderCourts(); renderFavoriteCourts()' : 'render()');
  if (!legacy) {
    assert.equal(page.elements.reservationTypeWrap.hidden, true, `${directory}: other cities hide the type filter`);
    assert.equal(typeFilter.value, '', `${directory}: stale type selection must be cleared`);
  }
  const output = legacy ? page.elements.courts : page.elements.mobileCards;
  assert(!/구민우선|시민우선|일반예약|접수마감/.test(output.textContent), `${directory}: Yongin product badges must not appear for other cities`);
  const count = legacy ? descendants(output).filter(element => element.className === 'slot').length : page.run('collectRows().reduce((sum,row) => sum + row.count, 0)');
  assert.equal(count, 1, `${directory}: Yongin product state/period must not block verified Goyang time`);

  const emptyGroup = page.run('getCourtGroup(DATA.facilities["goyang:empty"].title)');
  if (legacy) {
    page.context.emptyGroup = emptyGroup;
    page.run('toggleFavoriteCourt("goyang", emptyGroup)');
    page.run('toggleFavoriteCourt("goyang", emptyGroup)');
    assert.deepEqual(JSON.parse(page.storage.get(key)), previous, 'Toggling the star off preserves other saved courts');
    page.run('toggleFavoriteCourt("goyang", emptyGroup)');
  } else {
    const picker = page.elements.favoriteCourtSelect;
    assert(picker.options.some(option => option.value === emptyGroup), `${directory}: empty court must be selectable for favorites`);
    picker.value = emptyGroup;
    page.run('renderFavoritesPanel()');
    const add = page.elements.favoriteAddButton;
    assert.equal(add.disabled, false, `${directory}: favorite add button enabled without availability`);
    add.listeners.click[0]();
    page.run('addSelectedFavoriteCourt()');
  }
  const saved = JSON.parse(page.storage.get(key));
  assert.equal(saved.length, 2, `${directory}: repeated add must preserve previous favorites without duplicate`);
  assert.deepEqual(saved.find(item => legacy ? item.city === 'yongin' : item.startsWith('yongin|')), previous[0]);
  assert(legacy ? saved.some(item => item.city === 'goyang' && item.group === emptyGroup) : saved.includes(`goyang|${emptyGroup}`));

  if (legacy) page.elements.favoriteOnlyBtn.onclick(); else page.elements.favoritesOnlyButton.listeners.click[0]();
  if (!legacy) {
    const rows = page.run('collectRows()');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].courtGroup, emptyGroup);
  } else assert.equal(descendants(page.elements.courts).filter(element => element.className === 'slot').length, 0);
  if (legacy) page.run('removeFavoriteCourt("goyang", emptyGroup)');
  else {
    const list = page.elements.savedFavorites;
    const remove = descendants(list).find(element => element.attributes['aria-label']?.includes(`${emptyGroup} 즐겨찾기 삭제`));
    assert(remove, `${directory}: saved list must provide a named remove button`);
    remove.onclick();
  }
  assert.deepEqual(JSON.parse(page.storage.get(key)), previous, `${directory}: delete only selected favorite and preserve old format`);
  const restoredCount = legacy ? descendants(page.elements.courts).filter(element => element.className === 'slot').length : page.run('collectRows().reduce((sum,row) => sum + row.count, 0)');
  assert.equal(restoredCount, 1, `${directory}: removing last favorite restores normal results immediately`);

  page.run(legacy ? 'CURRENT_CITY = "yongin"; renderCourts()' : 'currentCity = "yongin"; render()');
  if (!legacy) assert.equal(page.elements.reservationTypeWrap.hidden, false, `${directory}: Yongin restores type filter`);
}
console.log('Both static clients passed city-scoped reservation rules and favorites add/list/delete/filter/storage regressions.');
