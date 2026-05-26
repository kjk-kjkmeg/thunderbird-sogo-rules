const assert = require('assert');
const {
  extractEmailAddress,
  normalizeRuleValue,
  buildCondition,
  validateTargetFolder,
  buildSogoFilterRule,
  mergeRuleIntoExistingFilters,
  findRuleIndex,
  replaceExistingRule,
  deleteExistingRule,
  summarizeRule,
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

const editedRule = { ...rule, name: 'Rule Klaus edited', actions: [{ method: 'fileinto', argument: 'INBOX/Neu' }] };
const updatedByOriginalName = replaceExistingRule(merged, rule, editedRule);
assert.strictEqual(updatedByOriginalName.length, 2);
assert.strictEqual(updatedByOriginalName[1].name, 'Rule Klaus edited');
assert.strictEqual(updatedByOriginalName[0].name, 'Other');

const deleted = deleteExistingRule(updatedByOriginalName, editedRule);
assert.deepStrictEqual(deleted, [{ name: 'Other' }]);

const withIds = [{ id: '1', name: 'Keep' }, { id: '2', name: 'Old' }];
const updatedById = replaceExistingRule(withIds, { id: '2', name: 'Old' }, { id: '2', name: 'New' });
assert.deepStrictEqual(updatedById, [{ id: '1', name: 'Keep' }, { id: '2', name: 'New' }]);
assert.strictEqual(findRuleIndex(withIds, { id: '3', name: 'Old', __selectionIndex: 1 }), -1);
assert.throws(() => replaceExistingRule(withIds, { id: '3', name: 'Old', __selectionIndex: 1 }, { id: '3', name: 'New' }), /nicht gefunden/);

const duplicateNames = [{ name: 'Dup' }, { name: 'Dup' }];
assert.throws(() => replaceExistingRule(duplicateNames, { name: 'Dup' }, { name: 'Changed' }), /mehrfach|nicht eindeutig/);
const updatedBySelectionIndex = replaceExistingRule(duplicateNames, { name: 'Dup', __selectionIndex: 1 }, { name: 'Changed' });
assert.deepStrictEqual(updatedBySelectionIndex, [{ name: 'Dup' }, { name: 'Changed' }]);
assert.strictEqual(findRuleIndex(duplicateNames, { name: 'Dup', __selectionIndex: 0 }), 0);
assert.throws(() => findRuleIndex([{ name: 'Other' }, { name: 'Dup' }], { name: 'Dup', __selectionIndex: 0 }), /neu laden|stimmt nicht/);

const summary = summarizeRule(rule);
assert.strictEqual(summary.name, 'Rule Klaus');
assert.strictEqual(summary.enabled, true);
assert.strictEqual(summary.target, 'INBOX/Klaus');
assert(summary.criteria.includes('Von enthält klaus@example.org'));

console.log('rule-model tests passed');
