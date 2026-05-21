const assert = require('assert');
const {
  extractEmailAddress,
  normalizeRuleValue,
  buildCondition,
  validateTargetFolder,
  buildSogoFilterRule,
  mergeRuleIntoExistingFilters,
} = require('../addon/rule-model.js');

assert.strictEqual(extractEmailAddress('Klaus Example <klaus@example.org>'), 'klaus@example.org');
assert.strictEqual(normalizeRuleValue('from', 'Klaus Example <klaus@example.org>'), 'klaus@example.org');
assert.strictEqual(normalizeRuleValue('subject', '  Rechnung 123  '), 'Rechnung 123');

assert.deepStrictEqual(buildCondition('from', 'contains', 'klaus@example.org'), {
  field: 'from',
  operator: 'contains',
  value: 'klaus@example.org',
});

assert.throws(() => validateTargetFolder('Archive/Klaus'), /INBOX/);
assert.strictEqual(validateTargetFolder('INBOX/Klaus'), 'INBOX/Klaus');

const rule = buildSogoFilterRule({
  name: 'Rule Klaus',
  criteria: [
    { field: 'from', operator: 'contains', value: 'klaus@example.org' },
    { field: 'subject', operator: 'contains', value: 'Invoice' },
  ],
  folder: 'INBOX/Klaus',
  enabled: true,
});
assert.strictEqual(rule.name, 'Rule Klaus');
assert.strictEqual(rule.active, true);
assert.strictEqual(rule.actions[0].method, 'fileinto');
assert.strictEqual(rule.actions[0].argument, 'INBOX/Klaus');
assert.strictEqual(rule.match, 'all');
assert.strictEqual(rule.conditions.length, 2);

const merged = mergeRuleIntoExistingFilters([{ name: 'Other' }], rule);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[1].name, 'Rule Klaus');
const replaced = mergeRuleIntoExistingFilters(merged, { ...rule, conditions: [] });
assert.strictEqual(replaced.length, 2);
assert.strictEqual(replaced[1].conditions.length, 0);

console.log('rule-model tests passed');
