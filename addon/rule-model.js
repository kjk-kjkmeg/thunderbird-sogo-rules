(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SogoRuleModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ALLOWED_FIELDS = new Set(['from', 'fromDomain', 'to', 'cc', 'subject']);
  const ALLOWED_OPERATORS = new Set(['contains', 'is', 'beginsWith', 'endsWith']);

  function extractEmailAddress(value) {
    const text = String(value || '').trim();
    const match = text.match(/<([^<>@\s]+@[^<>@\s]+)>/);
    if (match) return match[1].toLowerCase();
    const bare = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return bare ? bare[0].toLowerCase() : text.toLowerCase();
  }

  function normalizeRuleValue(field, value) {
    const text = String(value || '').trim();
    if (field === 'from' || field === 'to' || field === 'cc') return extractEmailAddress(text);
    if (field === 'fromDomain') {
      const email = extractEmailAddress(text);
      return email.includes('@') ? email.split('@').pop() : email.replace(/^@/, '');
    }
    return text.replace(/\s+/g, ' ');
  }

  function validateTargetFolder(folder) {
    const value = String(folder || '').trim().replace(/^\/+/, '');
    if (!value || value === 'INBOX') return 'INBOX';
    if (!value.startsWith('INBOX/')) {
      throw new Error('Zielordner muss unter INBOX/... liegen.');
    }
    if (value.includes('..') || value.includes('//')) {
      throw new Error('Zielordner enthält ungültige Pfadbestandteile.');
    }
    return value;
  }

  function buildCondition(field, operator, value) {
    if (!ALLOWED_FIELDS.has(field)) throw new Error(`Nicht unterstütztes Kriterium: ${field}`);
    if (!ALLOWED_OPERATORS.has(operator)) throw new Error(`Nicht unterstützter Operator: ${operator}`);
    const normalized = normalizeRuleValue(field, value);
    if (!normalized) throw new Error('Kriterium darf nicht leer sein.');
    return { field, operator, value: normalized };
  }

  function conditionToSieve(condition) {
    const fieldMap = {
      from: 'from',
      fromDomain: 'from',
      to: 'to',
      cc: 'cc',
      subject: 'subject',
    };
    const operatorMap = {
      contains: 'contains',
      is: 'is',
      beginsWith: 'matches',
      endsWith: 'matches',
    };
    let value = condition.value;
    if (condition.operator === 'beginsWith') value = `${value}*`;
    if (condition.operator === 'endsWith') value = `*${value}`;
    if (condition.field === 'fromDomain' && !String(value).startsWith('@')) value = `@${value}`;
    return {
      kind: 'header',
      header: fieldMap[condition.field],
      matchType: operatorMap[condition.operator],
      value,
    };
  }

  function buildSogoFilterRule({ name, criteria, folder, enabled = true }) {
    const safeName = String(name || 'Thunderbird SOGo Rule').trim();
    const conditions = (criteria || []).map(c => buildCondition(c.field, c.operator, c.value));
    if (!conditions.length) throw new Error('Mindestens ein Kriterium ist erforderlich.');
    return {
      name: safeName,
      active: Boolean(enabled),
      match: conditions.length > 1 ? 'all' : 'any',
      conditions,
      sieveConditions: conditions.map(conditionToSieve),
      actions: [
        { method: 'fileinto', argument: validateTargetFolder(folder) },
        { method: 'stop' },
      ],
      source: 'thunderbird-sogo-rules',
      updatedAt: new Date().toISOString(),
    };
  }

  function mergeRuleIntoExistingFilters(existingFilters, rule) {
    const filters = Array.isArray(existingFilters) ? existingFilters.slice() : [];
    const index = filters.findIndex(item => item && item.name === rule.name);
    if (index >= 0) filters[index] = rule;
    else filters.push(rule);
    return filters;
  }

  return {
    extractEmailAddress,
    normalizeRuleValue,
    validateTargetFolder,
    buildCondition,
    conditionToSieve,
    buildSogoFilterRule,
    mergeRuleIntoExistingFilters,
  };
});
