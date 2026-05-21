const assert = require('assert');
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('addon/manifest.json', 'utf8'));

assert.strictEqual(manifest.manifest_version, 2);
assert(manifest.browser_specific_settings, 'browser_specific_settings must be present for Thunderbird/Gecko');
assert(manifest.browser_specific_settings.gecko.id, 'Gecko id must be present');
assert.strictEqual(manifest.browser_specific_settings.gecko.id, 'sogo-rules-assistant@kjkratz.de');
assert(!('update_url' in manifest.browser_specific_settings.gecko), 'self-hosted update_url should not be present in installable Thunderbird build');
assert(!manifest.applications, 'legacy applications key should not be used');
for (const permission of manifest.permissions) {
  if (permission.startsWith('http')) {
    assert.match(permission, /^https?:\/\/\*\/\*$/, `host permission must be valid match pattern: ${permission}`);
  }
}
console.log('manifest installability tests passed');
