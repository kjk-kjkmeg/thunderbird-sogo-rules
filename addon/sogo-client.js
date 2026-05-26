(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SogoClientApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function base64Encode(value) {
    if (typeof btoa === 'function') return btoa(value);
    return Buffer.from(value, 'utf8').toString('base64');
  }

  function base64EncodeUtf8(value) {
    const text = String(value || '');
    if (typeof TextEncoder === 'function' && typeof btoa === 'function') {
      let binary = '';
      for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
      return btoa(binary);
    }
    return Buffer.from(text, 'utf8').toString('base64');
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      this.wid = null;
      this.rt = null;
      if (!this.baseUrl) throw new Error('All-Inkl WebMail Basis-URL fehlt.');
      if (!this.username) throw new Error('All-Inkl Benutzername fehlt.');
    }

    async login() {
      await this.fetchImpl(`${this.baseUrl}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      const body = new URLSearchParams();
      body.set('login_target', 'desktop');
      body.set('language', 'de_DE');
      body.set('login_name', this.username);
      body.set('login_password', this.password);
      const response = await this.fetchImpl(`${this.baseUrl}/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: body.toString(),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`All-Inkl WebMail Login HTTP ${response.status}: ${text.slice(0, 300)}`);
      const match = text.match(/INDEX_GLOBAL_WID\s*=\s*"([^"]+)";var\s+INDEX_GLOBAL_RT\s*=\s*"([^"]+)"/);
      if (!match) throw new Error('All-Inkl WebMail Login fehlgeschlagen: WID/RT nicht gefunden.');
      this.wid = match[1];
      this.rt = match[2];
      return { ok: true, provider: 'allinkl' };
    }

    async ensureLoggedIn() {
      if (this.wid && this.rt) return;
      await this.login();
    }

    async ajax(action, extra = []) {
      await this.ensureLoggedIn();
      const body = new URLSearchParams();
      body.append('a', action);
      body.append('WID', this.wid);
      body.append('RT', this.rt);
      const pairs = Array.isArray(extra) ? extra : Object.entries(extra);
      for (const [key, value] of pairs) body.append(key, value == null ? '' : String(value));
      const response = await this.fetchImpl(`${this.baseUrl}/ajax.php`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`All-Inkl WebMail AJAX ${action} HTTP ${response.status}: ${text.slice(0, 300)}`);
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`All-Inkl WebMail AJAX ${action} lieferte kein JSON: ${err.message}`);
      }
    }

    async testConnection() {
      await this.login();
      return {
        ok: true,
        provider: 'allinkl',
        loginPageDetected: true,
        loggedIn: true,
        message: 'All-Inkl WebMail Login erfolgreich. Der SOGo-Endpunkt wird nicht verwendet.',
      };
    }

    async readFilters() {
      const overview = await this.ajax('data-pref-spamfilter-overview');
      const filters = Array.isArray(overview && overview.filter) ? overview.filter : [];
      return filters.map(item => ({
        id: item.id,
        name: item.title || item.name || '',
        title: item.title || item.name || '',
        active: item.active,
        type: item.type,
        raw: item,
      }));
    }

    conditionToAllInkl(condition) {
      const fieldMap = {
        from: 'from',
        fromDomain: 'from',
        to: 'to',
        cc: 'cc',
        subject: 'subject',
      };
      const opMap = {
        contains: 'contains',
        is: 'equals',
        beginsWith: 'regex',
        endsWith: 'regex',
      };
      let value = String(condition.value || '');
      if (condition.field === 'fromDomain' && !value.startsWith('@')) value = `@${value}`;
      if (condition.operator === 'beginsWith') value = `^${escapeRegex(value)}`;
      if (condition.operator === 'endsWith') value = `${escapeRegex(value)}$`;
      return {
        target: fieldMap[condition.field] || 'other_header',
        condition: opMap[condition.operator] || 'contains',
        value,
      };
    }

    ruleToPostData(rule) {
      const move = (rule.actions || []).find(action => action && action.method === 'fileinto');
      if (!move || !move.argument) throw new Error('All-Inkl Regel ohne Zielordner kann nicht gespeichert werden.');
      const pairs = [];
      pairs.push(['postData[pref-spam-userfilter-name]', rule.name]);
      pairs.push(['postData[pref-spam-userfilter-zuerstanwenden]', '1']);
      if ((rule.match || 'all') === 'all') pairs.push(['postData[andlink]', '1']);
      (rule.conditions || []).forEach((condition, index) => {
        const c = this.conditionToAllInkl(condition);
        pairs.push([`postData[pref-spam-userfilter-cond][target][${index}]`, c.target]);
        pairs.push([`postData[pref-spam-userfilter-cond][condition][${index}]`, c.condition]);
        pairs.push([`postData[pref-spam-userfilter-cond][value][${index}]`, c.value]);
      });
      pairs.push(['postData[pref-spam-userfilter-action][action][0]', 'move']);
      pairs.push(['postData[pref-spam-userfilter-action][target][0]', base64EncodeUtf8(move.argument)]);
      return pairs;
    }

    async deleteFiltersByName(name) {
      const filters = await this.readFilters();
      const ids = filters.filter(item => item.name === name && item.id != null).map(item => item.id);
      if (!ids.length) return { deleted: 0, response: null };
      const pairs = ids.map(id => ['postData[pref-spam-filter][]', id]);
      const response = await this.ajax('exec-pref-spam-delete', pairs);
      if (!response || !response.result) throw new Error(`All-Inkl konnte vorhandene gleichnamige Regel nicht löschen: ${JSON.stringify(response).slice(0, 300)}`);
      return { deleted: ids.length, response };
    }

    async deleteRule(rule) {
      await this.ensureLoggedIn();
      const ids = [];
      if (rule && rule.id != null && rule.id !== '') ids.push(rule.id);
      else throw new Error('All-Inkl-Regeln können nur mit eindeutiger ID gelöscht werden; Löschen per Name ist wegen Duplikaten gesperrt.');
      if (!ids.length) return { ok: true, deleted: 0, response: null };
      const pairs = ids.map(id => ['postData[pref-spam-filter][]', id]);
      const response = await this.ajax('exec-pref-spam-delete', pairs);
      if (!response || !response.result) throw new Error(`All-Inkl konnte Regel nicht löschen: ${JSON.stringify(response).slice(0, 300)}`);
      return { ok: true, deleted: ids.length, response };
    }

    async updateRule(originalRule, updatedRule) {
      await this.ensureLoggedIn();
      if (!originalRule || originalRule.id == null || originalRule.id === '') {
        throw new Error('All-Inkl-Regeln können nur mit eindeutiger ID aktualisiert werden; Aktualisieren per Name ist gesperrt.');
      }
      const hasEditableDetails = Boolean(
        Array.isArray(originalRule.conditions) &&
        originalRule.conditions.length &&
        Array.isArray(originalRule.actions) &&
        originalRule.actions.some(action => action && (action.method === 'fileinto' || action.action === 'move') && (action.argument || action.target))
      );
      if (!hasEditableDetails) {
        throw new Error('All-Inkl-Regel enthält nur Übersichts-Daten ohne editierbare Kriterien/Aktionen; Aktualisierung wäre destruktiv und ist gesperrt.');
      }
      if (originalRule.active != null && updatedRule && updatedRule.active != null && Boolean(originalRule.active) !== Boolean(updatedRule.active)) {
        throw new Error('All-Inkl-Aktivstatus kann über diese Schnittstelle nicht sicher aktualisiert werden.');
      }
      const originalName = originalRule.name || originalRule.title || '';
      if ((updatedRule && updatedRule.name) === originalName) {
        throw new Error('All-Inkl-Regeln können nicht sicher unter demselben Namen aktualisiert werden; bitte einen neuen eindeutigen Regelnamen wählen.');
      }
      const before = await this.readFilters();
      const collidesWithOther = before.some(item =>
        item &&
        String(item.id) !== String(originalRule.id) &&
        (item.name || item.title) === updatedRule.name
      );
      if (collidesWithOther) {
        throw new Error('All-Inkl-Zielname existiert bereits bei einer anderen Regel; Aktualisierung wäre mehrdeutig und ist gesperrt.');
      }
      const response = await this.ajax('exec-pref-userfilter-save', this.ruleToPostData(updatedRule));
      if (!response || !response.result) throw new Error(`All-Inkl konnte Regel nicht speichern: ${JSON.stringify(response).slice(0, 300)}`);
      const afterSave = await this.readFilters();
      const found = afterSave.find(item => item.name === updatedRule.name);
      if (!found) throw new Error('All-Inkl-Readback konnte die aktualisierte Regel nicht finden.');
      let deleted;
      try {
        deleted = await this.deleteRule(originalRule);
      } catch (err) {
        return {
          ok: false,
          cleanupNeeded: true,
          ruleName: updatedRule.name,
          previousCount: before.length,
          newCount: afterSave.length,
          response,
          found,
          error: err && err.message ? err.message : String(err),
        };
      }
      const after = await this.readFilters();
      return { ok: true, ruleName: updatedRule.name, previousCount: before.length, newCount: after.length, response, found, deleted };
    }

    async writeRule(rule) {
      await this.ensureLoggedIn();
      const before = await this.readFilters();
      const deleted = await this.deleteFiltersByName(rule.name);
      const response = await this.ajax('exec-pref-userfilter-save', this.ruleToPostData(rule));
      if (!response || !response.result) throw new Error(`All-Inkl konnte Regel nicht speichern: ${JSON.stringify(response).slice(0, 300)}`);
      const after = await this.readFilters();
      const found = after.find(item => item.name === rule.name);
      if (!found) throw new Error('All-Inkl-Readback konnte die geschriebene Regel nicht finden.');
      return { ok: true, ruleName: rule.name, previousCount: before.length, newCount: after.length, deleted: deleted.deleted, response, found };
    }

    async writeFilters(filters) {
      const last = Array.isArray(filters) ? filters[filters.length - 1] : null;
      if (!last) throw new Error('All-Inkl Filter-Schreiben ohne Regel aufgerufen.');
      return await this.writeRule(last);
    }
  }

  function createClient({ provider, baseUrl, username, password, fetchImpl } = {}) {
    const resolvedProvider = provider || detectProvider(baseUrl);
    if (resolvedProvider === 'allinkl') return new AllInklClient({ baseUrl, username, password, fetchImpl });
    return new SogoClient({ baseUrl, username, password, fetchImpl });
  }

  return { SogoClient, AllInklClient, createClient, detectProvider, buildBasicAuthHeader, normalizeBaseUrl, base64EncodeUtf8 };
});
