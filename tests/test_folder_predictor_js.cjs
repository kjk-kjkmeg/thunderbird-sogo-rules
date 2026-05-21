const assert = require('assert');
const {
  tokenizeFolderName,
  scoreFolderForMessage,
  suggestFoldersForMessage,
  inferCriteriaFromMessage,
} = require('../addon/folder-predictor.js');

const message = {
  from: 'Torben Krohn <torben.krohn@example.org>',
  subject: 'Projekt Krohn: Rechnung Mai',
};
const folders = [
  { path: 'INBOX/Krohn', name: 'Krohn' },
  { path: 'INBOX/Rechnungen', name: 'Rechnungen' },
  { path: 'INBOX/Newsletter', name: 'Newsletter' },
];

assert.deepStrictEqual(tokenizeFolderName('INBOX/ADT Rocco Gräfe'), ['adt', 'rocco', 'grafe']);
assert(scoreFolderForMessage(folders[0], message) > scoreFolderForMessage(folders[2], message));

const suggestions = suggestFoldersForMessage(folders, message, 2);
assert.strictEqual(suggestions[0].path, 'INBOX/Krohn');
assert(suggestions[0].score > 0);
assert.strictEqual(suggestions.length, 2);

const criteria = inferCriteriaFromMessage(message);
assert(criteria.some(c => c.field === 'from' && c.value === 'torben.krohn@example.org'));
assert(criteria.some(c => c.field === 'fromDomain' && c.value === 'example.org'));
assert(criteria.some(c => c.field === 'subject' && c.value === 'krohn'));

console.log('folder-predictor tests passed');
