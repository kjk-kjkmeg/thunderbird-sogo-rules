const assert = require('assert');
const { SogoClient, buildBasicAuthHeader } = require('../addon/sogo-client.js');

assert.strictEqual(buildBasicAuthHeader('user', 'pass'), 'Basic dXNlcjpwYXNz');

const calls = [];
const fakeFetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/active.json')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ SOGoSieveFilters: [{ name: 'Existing' }] }),
      text: async () => JSON.stringify({ SOGoSieveFilters: [{ name: 'Existing' }] }),
    };
  }
  return { ok: true, status: 204, headers: { get: () => '' }, text: async () => '' };
};

const client = new SogoClient({
  baseUrl: 'https://sogo.example.org/SOGo',
  username: 'collector@example.org',
  password: 'secret',
  fetchImpl: fakeFetch,
});

(async () => {
  const filters = await client.readFilters();
  assert.deepStrictEqual(filters, [{ name: 'Existing' }]);
  assert(calls[0].url.includes('/so/collector%40example.org/Preferences/active.json'));
  assert.strictEqual(calls[0].options.headers.Authorization, buildBasicAuthHeader('collector@example.org', 'secret'));

  await client.writeFilters([{ name: 'New' }], 'fingerprint-1');
  assert.strictEqual(calls[1].options.method, 'PUT');
  const body = JSON.parse(calls[1].options.body);
  assert.deepStrictEqual(body.SOGoSieveFilters, [{ name: 'New' }]);
  assert.strictEqual(body.SOGoSieveFiltersFingerprint, 'fingerprint-1');

  console.log('sogo-client tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
