const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Pages/shared/reservation-policy.js'));
const targets = ['PagesCourtIssum/shared/reservation-policy.js', 'PagesCourtIssum/static/shared/reservation-policy.js'];
for (const target of targets) {
  const destination = path.join(root, target);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(source)) {
      throw new Error(`${target} differs from the shared reservation policy; run node scripts/sync-reservation-policy.js`);
    }
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
  }
}
console.log('Reservation policy copies are synchronized');
