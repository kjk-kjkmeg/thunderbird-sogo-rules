(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SogoClientApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function base64Encode(value) {
    if (typeof btoa === 'function') return btoa(value);
    return Buffer.from(value, 'utf8').toString('base64');
  }

  function buildBasicAuthHeader(username, password) {
    return `Basic ${base64Encode(`${username}:${password}`)}`;
  }

  function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function detectProvider(baseUrl) {
    let host = '';
    try {
      host = new URL(normalizeBaseUrl(baseUrl)).hostname.toLowerCase();
    } catch (err) {
      return 'sogo';
    }
    if (host === 'webmail.all-inkl.com' || host.endsWith('.all-inkl.com')) return 'allinkl';
    return 'sogo';
  }

  function defaultFetch(...args) {
    if (!root || typeof root.fetch !== 'function') {
      throw new Error('fetch API ist in diesem Thunderbird-Kontext nicht verfügbar.');
    }
    return root.fetch(...args);
  }

  class SogoClient {
    constructor({ baseUrl, username, password, fetchImpl } = {}) {
      this.baseUrl = normalizeBaseUrl(baseUrl);
      this.username = String(username || '').trim();
      this.password = String(password || '');
      this.fetchImpl = fetchImpl || defaultFetch;
      if (!this.baseUrl) throw new Error('SOGo Basis-URL fehlt.');
      if (!this.username) throw new Error('SOGo Benutzername fehlt.');
    }

    preferencesUrl() {
      return `${this.baseUrl}/so/${encodeURIComponent(this.username)}/Preferences/active.json`;
    }

    headers(extra = {}) {
      const headers = {
        Accept: 'application/json',
        ...extra,
      };
      if (this.password) headers.Authorization = buildBasicAuthHeader(this.username, this.password);
      return headers;
    }

    async requestJson(url, options = {}) {
      const response = await this.fetchImpl(url, {
        credentials: 'include',
        ...options,
        headers: this.headers(options.headers || {}),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`SOGo HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`SOGo lieferte kein JSON: ${err.message}`);
      }
    }

    async readPreferences() {
      return await this.requestJson(this.preferencesUrl());
    }

    async readFilters() {
      const prefs = await this.readPreferences();
      return Array.isArray(prefs && prefs.SOGoSieveFilters) ? prefs.SOGoSieveFilters : [];
    }

    async testConnection() {
      const filters = await this.readFilters();
      return { ok: true, filterCount: filters.length };
    }

    async writeFilters(filters, fingerprint) {
      const payload = { SOGoSieveFilters: filters };
      if (fingerprint) payload.SOGoSieveFiltersFingerprint = fingerprint;
      await this.requestJson(this.preferencesUrl(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { ok: true };
    }
  }

  class AllInklClient {
    constructor({ baseUrl, username, password, fetchImpl } = {}) {
      this.baseUrl = normalizeBaseUrl(baseUrl || 'https://webmail.all-inkl.com');
      this.username = String(username || '').trim();
      this.password = String(password || '');
      this.fetchImpl = fetchImpl || defaultFetch;
      if (!this.baseUrl) throw new Error('All-Inkl WebMail Basis-URL fehlt.');
      if (!this.username) throw new Error('All-Inkl Benutzername fehlt.');
    }

    async testConnection() {
      const response = await this.fetchImpl(`${this.baseUrl}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`All-Inkl WebMail HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
      const loginPageDetected = /ALL-INKL|WebMail|webmail/i.test(text);
      return {
        ok: true,
        provider: 'allinkl',
        status: response.status,
        loginPageDetected,
        message: loginPageDetected
          ? 'All-Inkl WebMail ist erreichbar. Der SOGo-Endpunkt wird nicht verwendet.'
          : 'Basis-URL erreichbar, aber All-Inkl WebMail wurde nicht eindeutig erkannt.',
      };
    }

    async readFilters() {
      throw new Error('All-Inkl WebMail Filter-Lesen ist in diesem Add-on noch nicht implementiert.');
    }

    async writeFilters() {
      throw new Error('All-Inkl WebMail Filter-Schreiben ist in diesem Add-on noch nicht implementiert.');
    }
  }

  function createClient({ provider, baseUrl, username, password, fetchImpl } = {}) {
    const resolvedProvider = provider || detectProvider(baseUrl);
    if (resolvedProvider === 'allinkl') return new AllInklClient({ baseUrl, username, password, fetchImpl });
    return new SogoClient({ baseUrl, username, password, fetchImpl });
  }

  return { SogoClient, AllInklClient, createClient, detectProvider, buildBasicAuthHeader, normalizeBaseUrl };
});
