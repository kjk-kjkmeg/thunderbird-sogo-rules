let selectedMessageCache = null;
let latestPreview = null;

const SETTINGS_KEYS = ['sogoBaseUrl', 'sogoUsername', 'sogoPassword', 'defaultFolder', 'dryRunOnly'];

function $(id) { return document.getElementById(id); }

async function getSettings() {
  const settings = await browser.storage.local.get(SETTINGS_KEYS);
  return {
    sogoBaseUrl: settings.sogoBaseUrl || '',
    sogoUsername: settings.sogoUsername || '',
    sogoPassword: settings.sogoPassword || '',
    defaultFolder: settings.defaultFolder || 'INBOX/',
    dryRunOnly: settings.dryRunOnly !== false,
  };
}

async function getSelectedMessage() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !browser.mailTabs) return null;
  const selected = await browser.mailTabs.getSelectedMessages(tabs[0].id);
  if (!selected || !selected.messages || !selected.messages.length) return null;
  const msg = selected.messages[0];
  const full = await browser.messages.getFull(msg.id);
  return { msg, full };
}

function headerValue(headers, name) {
  const value = headers && (headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]);
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function messageSummary(selected) {
  const headers = selected.full.headers || {};
  return {
    from: headerValue(headers, 'from') || selected.msg.author || '',
    to: headerValue(headers, 'to') || (selected.msg.recipients || []).join(', '),
    cc: headerValue(headers, 'cc') || '',
    subject: selected.msg.subject || headerValue(headers, 'subject') || '',
    author: selected.msg.author || '',
    recipients: (selected.msg.recipients || []).join(', '),
  };
}

function flattenFolders(folder, prefix = '') {
  if (!folder) return [];
  const name = folder.name || folder.path || '';
  const path = folder.path || (prefix ? `${prefix}/${name}` : name);
  const rows = path ? [{ name, path }] : [];
  for (const child of folder.subFolders || folder.folders || []) rows.push(...flattenFolders(child, path));
  return rows;
}

async function listMailFolders() {
  if (!browser.accounts || !browser.accounts.list) return [];
  const accounts = await browser.accounts.list();
  const folders = [];
  for (const account of accounts || []) {
    for (const folder of account.folders || []) folders.push(...flattenFolders(folder));
  }
  return folders;
}

function criterionRow(criterion = { field: 'from', operator: 'contains', value: '' }, checked = true) {
  const row = document.createElement('div');
  row.className = 'criteria-grid criterion-row';
  row.innerHTML = `
    <input class="criterion-enabled" type="checkbox" ${checked ? 'checked' : ''}>
    <select class="criterion-field">
      <option value="from">Absender</option>
      <option value="fromDomain">Absender-Domain</option>
      <option value="to">Empfänger</option>
      <option value="cc">CC</option>
      <option value="subject">Betreff</option>
    </select>
    <select class="criterion-operator">
      <option value="contains">enthält</option>
      <option value="is">ist exakt</option>
      <option value="beginsWith">beginnt mit</option>
      <option value="endsWith">endet mit</option>
    </select>
    <input class="criterion-value" type="text">
  `;
  row.querySelector('.criterion-field').value = criterion.field || 'from';
  row.querySelector('.criterion-operator').value = criterion.operator || 'contains';
  row.querySelector('.criterion-value').value = criterion.value || '';
  return row;
}

function setCriteria(criteria) {
  const container = $('criteria');
  container.textContent = '';
  for (const [index, criterion] of criteria.entries()) {
    container.appendChild(criterionRow(criterion, index === 0));
  }
  if (!criteria.length) container.appendChild(criterionRow());
}

function readCriteria() {
  return [...document.querySelectorAll('.criterion-row')]
    .filter(row => row.querySelector('.criterion-enabled').checked)
    .map(row => ({
      field: row.querySelector('.criterion-field').value,
      operator: row.querySelector('.criterion-operator').value,
      value: row.querySelector('.criterion-value').value,
    }));
}

function renderSuggestions(suggestions) {
  const container = $('suggestions');
  container.textContent = '';
  if (!suggestions.length) {
    container.textContent = 'Keine sichere Prognose gefunden — bitte Zielordner manuell wählen.';
    return;
  }
  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.textContent = `${suggestion.path} (${suggestion.score})`;
    button.addEventListener('click', () => { $('folder').value = suggestion.path; });
    container.appendChild(button);
  }
  $('folder').value = suggestions[0].path;
}

async function analyzeSelectedMail() {
  $('output').textContent = 'Analysiere ausgewählte Mail…';
  const selected = await getSelectedMessage();
  if (!selected) {
    $('output').textContent = 'Keine ausgewählte Mail gefunden.';
    return;
  }
  selectedMessageCache = messageSummary(selected);
  const folders = await listMailFolders();
  const suggestions = SogoFolderPredictor.suggestFoldersForMessage(folders, selectedMessageCache, 5);
  const criteria = SogoFolderPredictor.inferCriteriaFromMessage(selectedMessageCache);
  renderSuggestions(suggestions);
  setCriteria(criteria);
  const sender = SogoRuleModel.extractEmailAddress(selectedMessageCache.from);
  $('ruleName').value = sender ? `SOGo: ${sender}` : 'Thunderbird SOGo Rule';
  $('output').textContent = JSON.stringify({ message: selectedMessageCache, folderSuggestions: suggestions, criteria }, null, 2);
}

function buildPreview() {
  const rule = SogoRuleModel.buildSogoFilterRule({
    name: $('ruleName').value,
    criteria: readCriteria(),
    folder: $('folder').value,
    enabled: true,
  });
  latestPreview = rule;
  $('output').textContent = JSON.stringify({ dry_run: true, rule }, null, 2);
  return rule;
}

function clientFromSettings(settings) {
  return new SogoClientApi.SogoClient({
    baseUrl: settings.sogoBaseUrl,
    username: settings.sogoUsername,
    password: settings.sogoPassword,
  });
}

async function applyRule() {
  const settings = await getSettings();
  if (settings.dryRunOnly) throw new Error('Dry-run-only ist aktiv. Bitte in den Add-on-Einstellungen deaktivieren.');
  const rule = latestPreview || buildPreview();
  const client = clientFromSettings(settings);
  const existing = await client.readFilters();
  const updated = SogoRuleModel.mergeRuleIntoExistingFilters(existing, rule);
  await browser.storage.local.set({ lastSogoSieveFiltersBackup: { at: new Date().toISOString(), filters: existing } });
  await client.writeFilters(updated);
  const readback = await client.readFilters();
  const found = readback.some(item => item && item.name === rule.name);
  if (!found) throw new Error('SOGo-Readback konnte die geschriebene Regel nicht finden.');
  $('output').textContent = JSON.stringify({ wrote: true, ruleName: rule.name, previousCount: existing.length, newCount: readback.length }, null, 2);
}

async function initialize() {
  const settings = await getSettings();
  $('folder').value = settings.defaultFolder || 'INBOX/';
  $('mode').textContent = settings.dryRunOnly ? 'Dry-run aktiv. Schreiben ist gesperrt.' : 'Schreiben nach SOGo ist nach Preview möglich.';
  $('apply').disabled = settings.dryRunOnly;
  await analyzeSelectedMail();
}

$('analyze').addEventListener('click', () => analyzeSelectedMail().catch(err => { $('output').textContent = String(err); }));
$('preview').addEventListener('click', () => { try { buildPreview(); } catch (err) { $('output').textContent = String(err); } });
$('apply').addEventListener('click', () => applyRule().catch(err => { $('output').textContent = String(err); }));
$('addCriterion').addEventListener('click', () => $('criteria').appendChild(criterionRow()));

initialize().catch(err => { $('output').textContent = String(err); });
