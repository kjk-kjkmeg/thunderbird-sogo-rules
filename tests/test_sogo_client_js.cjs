const assert = require('assert');
const { SogoClient, AllInklClient, createClient, detectProvider, buildBasicAuthHeader } = require('../addon/sogo-client.js');

assert.strictEqual(buildBasicAuthHeader('user', 'pass'), 'Basic dXNlcjpwYXNz');
assert.strictEqual(detectProvider('https://webmail.all-inkl.com'), 'allinkl');
assert.strictEqual(detectProvider('https://sogo.example.org/SOGo'), 'sogo');

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

  const originalFetch = globalThis.fetch;
  try {
    const defaultFetchCalls = [];
    globalThis.fetch = async function (url, options = {}) {
      assert.strictEqual(this, globalThis);
      defaultFetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ SOGoSieveFilters: [] }),
      };
    };
    const defaultFetchClient = new SogoClient({
      baseUrl: 'https://sogo.example.org/SOGo',
      username: 'private@example.org',
      password: 'secret',
    });
    const defaultFetchResult = await defaultFetchClient.testConnection();
    assert.deepStrictEqual(defaultFetchResult, { ok: true, filterCount: 0 });
    assert.strictEqual(defaultFetchCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const allInklCalls = [];
  let allInklFilters = [];
  const allInklClient = createClient({
    baseUrl: 'https://webmail.all-inkl.com',
    username: 'm0526a94',
    password: 'secret',
    fetchImpl: async (url, options = {}) => {
      allInklCalls.push({ url, options });
      if (options.method === 'POST' && url.endsWith('/')) {
        assert(String(options.body).includes('login_name=m0526a94'));
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          text: async () => 'INDEX_GLOBAL_WID = "wid-1";var INDEX_GLOBAL_RT = "rt-1"',
        };
      }
      if (url.endsWith('/ajax.php')) {
        const body = new URLSearchParams(options.body);
        const action = body.get('a');
        assert.strictEqual(body.get('WID'), 'wid-1');
        assert.strictEqual(body.get('RT'), 'rt-1');
        if (action === 'data-pref-spamfilter-overview') {
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ filter: allInklFilters }) };
        }
        if (action === 'exec-pref-userfilter-save') {
          const savedName = body.get('postData[pref-spam-userfilter-name]');
          assert(['Rule 1', 'Rule 2'].includes(savedName));
          assert.strictEqual(body.get('postData[pref-spam-userfilter-cond][target][0]'), 'from');
          assert.strictEqual(body.get('postData[pref-spam-userfilter-cond][condition][0]'), 'contains');
          assert.strictEqual(body.get('postData[pref-spam-userfilter-action][action][0]'), 'move');
          assert.strictEqual(body.get('postData[pref-spam-userfilter-action][target][0]'), 'SU5CT1gvTcO8bGxlcg==');
          allInklFilters.push({ id: savedName === 'Rule 1' ? '42' : '43', title: savedName, active: true });
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ result: true }) };
        }
        if (action === 'exec-pref-spam-delete') {
          const deleteIds = body.getAll('postData[pref-spam-filter][]');
          allInklFilters = allInklFilters.filter(item => !deleteIds.includes(item.id));
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ result: true }) };
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<!doctype html><title>ALL-INKL WebMail</title>',
      };
    },
  });
  assert(allInklClient instanceof AllInklClient);
  const allInklResult = await allInklClient.testConnection();
  assert.strictEqual(allInklResult.provider, 'allinkl');
  assert.strictEqual(allInklResult.loggedIn, true);
  assert.strictEqual(allInklCalls[0].url, 'https://webmail.all-inkl.com/');
  assert.strictEqual(allInklCalls[0].options.credentials, 'include');
  const writeResult = await allInklClient.writeRule({
    name: 'Rule 1',
    match: 'all',
    conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
    actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
  });
  assert.strictEqual(writeResult.ok, true);
  assert.strictEqual(writeResult.newCount, 1);

  await assert.rejects(
    () => allInklClient.deleteRule({ name: 'Rule 1' }),
    /eindeutiger ID|Name/
  );
  await assert.rejects(
    () => allInklClient.updateRule({ id: '42', name: 'Rule 1' }, {
      name: 'Rule 2',
      match: 'all',
      conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
      actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
    }),
    /Übersichts-Daten|destruktiv/
  );
  await assert.rejects(
    () => allInklClient.updateRule({ name: 'Rule 1', conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }], actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }] }, {
      name: 'Rule 2',
      match: 'all',
      conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
      actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
    }),
    /eindeutiger ID|Name/
  );
  await assert.rejects(
    () => allInklClient.updateRule({ id: '42', name: 'Rule 1', active: true, conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }], actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }] }, {
      name: 'Rule 2',
      active: false,
      match: 'all',
      conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
      actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
    }),
    /Aktivstatus/
  );
  await assert.rejects(
    () => allInklClient.updateRule({ id: '42', name: 'Rule 1', conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }], actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }] }, {
      name: 'Rule 1',
      match: 'all',
      conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
      actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
    }),
    /demselben Namen|eindeutigen Regelnamen/
  );

  const collisionClient = new AllInklClient({ baseUrl: 'https://webmail.all-inkl.com', username: 'u', password: 'p', fetchImpl: async () => { throw new Error('unexpected fetch'); } });
  collisionClient.ensureLoggedIn = async () => {};
  collisionClient.readFilters = async () => [{ id: '42', name: 'Rule 1' }, { id: '99', name: 'Rule 2' }];
  collisionClient.ajax = async () => { throw new Error('save must not be called when target name collides'); };
  await assert.rejects(
    () => collisionClient.updateRule({ id: '42', name: 'Rule 1', conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }], actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }] }, {
      name: 'Rule 2',
      match: 'all',
      conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
      actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
    }),
    /existiert bereits|mehrdeutig/
  );

  const updateResult = await allInklClient.updateRule({
    id: '42',
    name: 'Rule 1',
    conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
    actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
  }, {
    name: 'Rule 2',
    match: 'all',
    conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
    actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
  });
  assert.strictEqual(updateResult.ok, true);
  assert.strictEqual(updateResult.found.name, 'Rule 2');
  assert.deepStrictEqual(allInklFilters.map(item => item.id), ['43']);

  let saveFailureDeleted = false;
  const saveFailureClient = new AllInklClient({ baseUrl: 'https://webmail.all-inkl.com', username: 'u', password: 'p', fetchImpl: async () => { throw new Error('unexpected fetch'); } });
  saveFailureClient.ensureLoggedIn = async () => {};
  saveFailureClient.readFilters = async () => [{ id: 'old-1', title: 'Old' }];
  saveFailureClient.deleteRule = async () => { saveFailureDeleted = true; };
  saveFailureClient.ajax = async (action) => {
    assert.strictEqual(action, 'exec-pref-userfilter-save');
    return { result: false };
  };
  await assert.rejects(
    () => saveFailureClient.updateRule({ id: 'old-1', name: 'Old', conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }], actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }] }, {
      name: 'Rule 2',
      match: 'all',
      conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
      actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
    }),
    /konnte Regel nicht speichern/
  );
  assert.strictEqual(saveFailureDeleted, false);

  const deleteFailureClient = new AllInklClient({ baseUrl: 'https://webmail.all-inkl.com', username: 'u', password: 'p', fetchImpl: async () => { throw new Error('unexpected fetch'); } });
  deleteFailureClient.ensureLoggedIn = async () => {};
  let deleteFailureReadCount = 0;
  deleteFailureClient.readFilters = async () => {
    deleteFailureReadCount += 1;
    return deleteFailureReadCount === 1 ? [{ id: 'old-1', name: 'Old' }] : [{ id: 'old-1', name: 'Old' }, { id: 'new-1', name: 'Rule 2' }];
  };
  deleteFailureClient.deleteRule = async () => { throw new Error('delete failed'); };
  deleteFailureClient.ajax = async () => ({ result: true });
  const deleteFailureResult = await deleteFailureClient.updateRule({ id: 'old-1', name: 'Old', conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }], actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }] }, {
    name: 'Rule 2',
    match: 'all',
    conditions: [{ field: 'from', operator: 'contains', value: 'person@example.org' }],
    actions: [{ method: 'fileinto', argument: 'INBOX/Müller' }],
  });
  assert.strictEqual(deleteFailureResult.ok, false);
  assert.strictEqual(deleteFailureResult.cleanupNeeded, true);
  assert.match(deleteFailureResult.error, /delete failed/);

  const deleteResult = await allInklClient.deleteRule({ id: '43', name: 'Rule 2' });
  assert.strictEqual(deleteResult.ok, true);
  assert.strictEqual(deleteResult.deleted, 1);
  assert.deepStrictEqual(allInklFilters, []);

  console.log('sogo-client tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
