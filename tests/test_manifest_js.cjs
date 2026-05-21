const assert = require('assert');
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('addon/manifest.json', 'utf8'));

assert.strictEqual(manifest.manifest_version, 2);
assert(manifest.applications, 'legacy applications key is required for Klaus\' Thunderbird 140 install path');
assert(manifest.applications.gecko.id, 'Gecko id must be present');
assert.strictEqual(manifest.applications.gecko.id, 'sogo-rules-assistant@kjkratz.local');
assert(!('update_url' in manifest.applications.gecko), 'self-hosted update_url should not be present in installable Thunderbird build');
assert(!manifest.browser_specific_settings, 'browser_specific_settings caused corrupt-XPI failures in Klaus\' Thunderbird 140 install path');
for (const permission of manifest.permissions) {
  if (permission.startsWith('http')) {
    assert.match(permission, /^https?:\/\/\*\/\*$/, `host permission must be valid match pattern: ${permission}`);
  }
}
console.log('manifest installability tests passed');
