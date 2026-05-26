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

  function selectionIndex(rule) {
    if (!rule) return null;
    const value = rule.__selectionIndex != null ? rule.__selectionIndex : rule.selectionIndex;
    if (value == null || value === '') return null;
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }

  function ruleIdentity(rule) {
    if (!rule) return '';
    if (rule.id != null && rule.id !== '') return `id:${rule.id}`;
    return '';
  }

  function ruleDisplayName(rule) {
    return rule && (rule.name || rule.title) || '';
  }

  function isEditableRule(rule) {
    return Boolean(
      rule &&
      Array.isArray(rule.conditions) &&
      rule.conditions.length &&
      Array.isArray(rule.actions) &&
      rule.actions.some(action => action && (action.method === 'fileinto' || action.action === 'move') && (action.argument || action.target))
    );
  }

  function findRuleIndex(filters, selectedRule) {
    const rows = Array.isArray(filters) ? filters : [];
    const identity = ruleIdentity(selectedRule);
    if (identity) {
      const matches = rows.map((item, index) => ({ item, index })).filter(row => ruleIdentity(row.item) === identity);
      if (matches.length === 1) return matches[0].index;
      if (matches.length > 1) throw new Error('Ausgewählte Regel ist wegen mehrfacher ID nicht eindeutig.');
      return -1;
    }
    const index = selectionIndex(selectedRule);
    if (index != null) {
      if (index >= rows.length) return -1;
      const selectedName = ruleDisplayName(selectedRule);
      const currentName = ruleDisplayName(rows[index]);
      if (!selectedName || selectedName === currentName) return index;
      throw new Error('Ausgewählte Regel stimmt nicht mehr mit der aktuellen Liste überein. Bitte neu laden.');
    }
    const name = ruleDisplayName(selectedRule);
    if (name) {
      const matches = rows.map((item, index) => ({ item, index })).filter(row => ruleDisplayName(row.item) === name);
      if (matches.length === 1) return matches[0].index;
      if (matches.length > 1) throw new Error('Regelname ist mehrfach vorhanden; Aktualisieren/Löschen wäre nicht eindeutig. Bitte neu laden und über die Listenauswahl arbeiten.');
    }
    return -1;
  }

  function replaceExistingRule(filters, selectedRule, updatedRule) {
    const rows = Array.isArray(filters) ? filters.slice() : [];
    const index = findRuleIndex(rows, selectedRule);
    if (index < 0) throw new Error('Ausgewählte Regel wurde in der aktuellen Liste nicht gefunden.');
    rows[index] = updatedRule;
    return rows;
  }

  function deleteExistingRule(filters, selectedRule) {
    const rows = Array.isArray(filters) ? filters.slice() : [];
    const index = findRuleIndex(rows, selectedRule);
    if (index < 0) throw new Error('Ausgewählte Regel wurde in der aktuellen Liste nicht gefunden.');
    rows.splice(index, 1);
    return rows;
  }

  function getRuleTargetFolder(rule) {
    const action = (rule && rule.actions || []).find(item => item && (item.method === 'fileinto' || item.action === 'move'));
    return action ? (action.argument || action.target || '') : '';
  }

  function summarizeCondition(condition) {
    if (!condition) return '';
    const fieldLabels = { from: 'Von', fromDomain: 'Von-Domain', to: 'An', cc: 'CC', subject: 'Betreff' };
    const opLabels = { contains: 'enthält', is: 'ist', beginsWith: 'beginnt mit', endsWith: 'endet mit' };
    if (condition.field) return `${fieldLabels[condition.field] || condition.field} ${opLabels[condition.operator] || condition.operator || 'enthält'} ${condition.value || ''}`.trim();
    if (condition.header) return `${condition.header} ${condition.matchType || ''} ${condition.value || ''}`.trim();
    return String(condition.value || condition.name || '').trim();
  }

  function summarizeRule(rule) {
    const conditions = rule && (rule.conditions || rule.sieveConditions) || [];
    const criterionSummary = conditions.length ? conditions.map(summarizeCondition).filter(Boolean).join((rule.match || 'all') === 'all' ? ' UND ' : ' ODER ') : 'Keine editierbaren Kriterien erkannt';
    return {
      id: ruleIdentity(rule) || (selectionIndex(rule) != null ? `index:${selectionIndex(rule)}` : ''),
      name: (rule && (rule.name || rule.title)) || '(ohne Name)',
      enabled: !(rule && (rule.active === false || rule.enabled === false)),
      criteria: criterionSummary,
      target: getRuleTargetFolder(rule) || '—',
      editable: isEditableRule(rule),
    };
  }

  return {
    extractEmailAddress,
    normalizeRuleValue,
    validateTargetFolder,
    buildCondition,
    conditionToSieve,
    buildSogoFilterRule,
    mergeRuleIntoExistingFilters,
    selectionIndex,
    ruleIdentity,
    ruleDisplayName,
    isEditableRule,
    findRuleIndex,
    replaceExistingRule,
    deleteExistingRule,
    getRuleTargetFolder,
    summarizeCondition,
    summarizeRule,
  };
});
