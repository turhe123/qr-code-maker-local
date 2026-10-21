// Generates the small fictional fixtures used by smoke.spec.js and window.__demo. Run: node tests/make-fixtures.js
const fs = require('fs');
const path = require('path');

const demo = {
  url: 'https://example.org/lantern-bean/menu',
  wifi: { ssid: 'LanternGuest', password: 'cocoa-moth-42', security: 'WPA' },
  contact: { first: 'Ada', last: 'Brook', phone: '+1 555 0142', email: 'ada@example.org', org: 'Lantern Bean Cafe' },
};
fs.writeFileSync(path.join(__dirname, 'fixtures', 'lantern-bean.json'), `${JSON.stringify(demo, null, 2)}\n`);
