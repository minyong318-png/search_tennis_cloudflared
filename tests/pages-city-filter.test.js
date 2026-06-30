const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function loadCityOfFacilityId(pagePath) {
  const html = fs.readFileSync(pagePath, "utf8");
  const match = html.match(/function cityOfFacilityId\(fid\)\{[\s\S]*?\n\}/);
  assert(match, `cityOfFacilityId not found in ${pagePath}`);

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${match[0]}; this.cityOfFacilityId = cityOfFacilityId;`, context);
  return context.cityOfFacilityId;
}

const cityOfFacilityId = loadCityOfFacilityId("Pages/index.html");

assert.strictEqual(cityOfFacilityId("yongin:123"), "yongin");
assert.strictEqual(cityOfFacilityId("goyang:1"), "goyang");
assert.strictEqual(cityOfFacilityId("suwon:1"), "suwon");
assert.strictEqual(cityOfFacilityId("seongnam:1"), "seongnam");
assert.strictEqual(cityOfFacilityId("anyang:1"), "anyang");
assert.strictEqual(cityOfFacilityId("paju:1"), "paju");
assert.strictEqual(cityOfFacilityId("123"), "yongin");

console.log("pages city filter test passed");
