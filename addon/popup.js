let selectedMessageCache = null;
let latestPreview = null;
let existingRuleCache = [];
let selectedExistingRule = null;

const SETTINGS_KEYS = ['accountProfiles', 'sogoBaseUrl', 'sogoUsername', 'sogoPassword', 'defaultFolder', 'dryRunOnly'];

function $(id) { return document.getElementById(id); }

async function getSettings(accountId) {
  const settings = await browser.storage.local.get(SETTINGS_KEYS);
  const profiles = settings.accountProfiles || {};
  const profile = accountId ? profiles[accountId] : null;
  if (accountId && !profile) {
    return {
      sogoBaseUrl: '',
      sogoUsername: '',
      sogoPassword: '',
      defaultFolder: settings.defaultFolder || 'INBOX/',
      dryRunOnly: settings.dryRunOnly !== false,
      accountId,
      accountProfileConfigured: false,
    };
  }
  const source = profile || {};
  return {
    sogoBaseUrl: source.sogoBaseUrl || '',
    sogoUsername: source.sogoUsername || '',
    sogoPassword: source.sogoPassword || '',
    defaultFolder: settings.defaultFolder || 'INBOX/',
    dryRunOnly: settings.dryRunOnly !== false,
    accountId: accountId || null,
    accountProfileConfigured: Boolean(profile),
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
    id: selected.msg.id,
    folder: selected.msg.folder || null,
    accountId: selected.msg.folder && selected.msg.folder.accountId,
    from: headerValue(headers, 'from') || selected.msg.author || '',
    to: headerValue(headers, 'to') || (selected.msg.recipients || []).join(', '),
    cc: headerValue(headers, 'cc') || '',
    subject: selected.msg.subject || headerValue(headers, 'subject') || '',
    author: selected.msg.author || '',
    recipients: (selected.msg.recipients || []).join(', '),
  };
}

function folderPath(folder) {
  return String((folder && (folder.path || folder.name)) || '').replace(/^\/+/, '');
}

function sameFolderPath(folder, path) {
  return folderPath(folder).toLowerCase() === String(path || '').replace(/^\/+/, '').toLowerCase();
}

function flattenFolderObjects(folder) {
  if (!folder) return [];
  const rows = [folder];
  for (const child of folder.subFolders || folder.folders || []) rows.push(...flattenFolderObjects(child));
  return rows;
}

async function listAccounts() {
  if (!browser.accounts || !browser.accounts.list) return [];
  return await browser.accounts.list();
}

function findAccountById(accounts, accountId) {
  return (accounts || []).find(account => String(account.id) === String(accountId));
}

function findFolderInAccount(account, path) {
  for (const root of account && account.folders || []) {
    const found = flattenFolderObjects(root).find(folder => sameFolderPath(folder, path));
    if (found) return found;
  }
  return null;
}

function findInboxFolder(account) {
  for (const root of account && account.folders || []) {
    const found = flattenFolderObjects(root).find(folder => {
      const type = String(folder.type || '').toLowerCase();
      return type === 'inbox' || sameFolderPath(folder, 'INBOX');
    });
    if (found) return found;
  }
  return null;
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
  const accounts = await listAccounts();
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

function setRuleListButtons(settings) {
  const hasSelection = Boolean(selectedExistingRule);
  const provider = settings ? SogoClientApi.detectProvider(settings.sogoBaseUrl) : 'sogo';
  const canUpdate = hasSelection && SogoRuleModel.isEditableRule(selectedExistingRule) && !(provider === 'allinkl' && (selectedExistingRule.id == null || selectedExistingRule.id === ''));
  $('saveExisting').disabled = !canUpdate || (settings && settings.dryRunOnly);
  $('deleteExisting').disabled = !hasSelection || (settings && settings.dryRunOnly);
}

function setEditorEnabled(enabled) {
  for (const selector of ['#ruleName', '#folder', '#ruleEnabled', '.criterion-enabled', '.criterion-field', '.criterion-operator', '.criterion-value']) {
    for (const element of document.querySelectorAll(selector)) element.disabled = !enabled;
  }
}

function populateEditorFromRule(rule) {
  $('ruleName').value = rule.name || rule.title || 'Thunderbird SOGo Rule';
  $('ruleEnabled').checked = !(rule.active === false || rule.enabled === false);
  const target = SogoRuleModel.getRuleTargetFolder(rule);
  if (target) $('folder').value = target;
  if (SogoRuleModel.isEditableRule(rule)) {
    setCriteria(rule.conditions);
    setEditorEnabled(true);
    $('output').textContent = JSON.stringify({ selectedRule: SogoRuleModel.summarizeRule(rule), editable: true }, null, 2);
  } else {
    setCriteria([]);
    setEditorEnabled(false);
    $('output').textContent = JSON.stringify({
      selectedRule: SogoRuleModel.summarizeRule(rule),
      editable: false,
      note: 'Diese Regel enthält nur Übersichts-Daten ohne lokal editierbare Kriterien/Aktionen. Aktualisieren ist gesperrt; Name/Ziel/Aktivstatus werden nicht aus der aktuellen Mail übernommen.',
    }, null, 2);
  }
}

async function selectExistingRule(index) {
  selectedExistingRule = existingRuleCache[index] ? { ...existingRuleCache[index], __selectionIndex: index } : null;
  for (const row of document.querySelectorAll('.rule-row')) row.classList.toggle('selected', row.dataset.index === String(index));
  if (selectedExistingRule) populateEditorFromRule(selectedExistingRule);
  const settings = await getSettings(selectedMessageCache && selectedMessageCache.accountId);
  if (selectedExistingRule && SogoClientApi.detectProvider(settings.sogoBaseUrl) === 'allinkl') $('ruleEnabled').disabled = true;
  setRuleListButtons(settings);
}

function renderExistingRules(rules) {
  const container = $('rulesList');
  container.textContent = '';
  if (!rules.length) {
    container.textContent = 'Keine Regeln gefunden.';
    return;
  }
  rules.forEach((rule, index) => {
    const summary = SogoRuleModel.summarizeRule(rule);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rule-row';
    button.dataset.index = String(index);
    const title = document.createElement('strong');
    title.textContent = `${summary.enabled ? '✓' : '○'} ${summary.name}`;
    const criteria = document.createElement('span');
    criteria.className = 'meta';
    criteria.textContent = `Kriterien: ${summary.criteria}`;
    const target = document.createElement('span');
    target.className = 'meta';
    target.textContent = `Ziel/Aktion: ${summary.target}${summary.editable ? '' : ' · nur eingeschränkt editierbar'}`;
    button.append(title, criteria, target);
    button.addEventListener('click', () => selectExistingRule(index).catch(err => { $('output').textContent = String(err); }));
    container.appendChild(button);
  });
}

async function loadExistingRules() {
  $('rulesList').textContent = 'Lade Regeln…';
  const settings = await getSettings(selectedMessageCache && selectedMessageCache.accountId);
  const client = clientFromSettings(settings);
  existingRuleCache = await client.readFilters();
  selectedExistingRule = null;
  renderExistingRules(existingRuleCache);
  setRuleListButtons(settings);
  $('output').textContent = JSON.stringify({ loadedRules: existingRuleCache.map(rule => SogoRuleModel.summarizeRule(rule)) }, null, 2);
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
  setEditorEnabled(true);
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
    enabled: $('ruleEnabled').checked,
  });
  latestPreview = rule;
  $('output').textContent = JSON.stringify({ dry_run: true, rule }, null, 2);
  return rule;
}

async function saveSelectedExistingRule() {
  if (!selectedExistingRule) throw new Error('Keine bestehende Regel ausgewählt.');
  const settings = await getSettings(selectedMessageCache && selectedMessageCache.accountId);
  if (settings.dryRunOnly) throw new Error('Dry-run-only ist aktiv. Aktualisieren ist gesperrt.');
  const provider = SogoClientApi.detectProvider(settings.sogoBaseUrl);
  const client = clientFromSettings(settings);
  const updatedRule = buildPreview();
  let result;
  if (provider === 'allinkl' && typeof client.updateRule === 'function') {
    if (!SogoRuleModel.isEditableRule(selectedExistingRule)) throw new Error('All-Inkl-Regel ist nur eingeschränkt editierbar; Aktualisieren ist gesperrt.');
    if (selectedExistingRule.id == null || selectedExistingRule.id === '') throw new Error('All-Inkl-Regel hat keine eindeutige ID; Aktualisieren ist gesperrt.');
    const existing = await client.readFilters();
    await browser.storage.local.set({ lastAllInklFiltersBackup: { at: new Date().toISOString(), filters: existing } });
    result = await client.updateRule(selectedExistingRule, updatedRule);
  } else {
    const existing = await client.readFilters();
    const updated = SogoRuleModel.replaceExistingRule(existing, selectedExistingRule, updatedRule);
    await browser.storage.local.set({ lastSogoSieveFiltersBackup: { at: new Date().toISOString(), filters: existing } });
    await client.writeFilters(updated);
    const readback = await client.readFilters();
    if (SogoRuleModel.findRuleIndex(readback, updatedRule) < 0) throw new Error('SOGo-Readback konnte die aktualisierte Regel nicht finden.');
    result = { ok: true, previousCount: existing.length, newCount: readback.length };
  }
  await loadExistingRules();
  $('output').textContent = JSON.stringify({ updated: true, ruleName: updatedRule.name, provider, result }, null, 2);
}

async function deleteSelectedExistingRule() {
  if (!selectedExistingRule) throw new Error('Keine bestehende Regel ausgewählt.');
  const ruleName = selectedExistingRule.name || selectedExistingRule.title || '(ohne Name)';
  if (!window.confirm(`Regel wirklich löschen?\n\n${ruleName}`)) return;
  const settings = await getSettings(selectedMessageCache && selectedMessageCache.accountId);
  if (settings.dryRunOnly) throw new Error('Dry-run-only ist aktiv. Löschen ist gesperrt.');
  const provider = SogoClientApi.detectProvider(settings.sogoBaseUrl);
  const client = clientFromSettings(settings);
  let result;
  if (provider === 'allinkl' && typeof client.deleteRule === 'function') {
    const existing = await client.readFilters();
    await browser.storage.local.set({ lastSogoSieveFiltersBackup: { at: new Date().toISOString(), filters: existing } });
    result = await client.deleteRule(selectedExistingRule);
  } else {
    const existing = await client.readFilters();
    const updated = SogoRuleModel.deleteExistingRule(existing, selectedExistingRule);
    await browser.storage.local.set({ lastSogoSieveFiltersBackup: { at: new Date().toISOString(), filters: existing } });
    await client.writeFilters(updated);
    const readback = await client.readFilters();
    if (SogoRuleModel.findRuleIndex(readback, selectedExistingRule) >= 0) throw new Error('SOGo-Readback zeigt die gelöschte Regel weiterhin an.');
    result = { ok: true, previousCount: existing.length, newCount: readback.length };
  }
  await loadExistingRules();
  $('output').textContent = JSON.stringify({ deleted: true, ruleName, provider, result }, null, 2);
}

function clientFromSettings(settings) {
  if (!settings.accountProfileConfigured && settings.accountId) {
    throw new Error(`Für das Thunderbird-Konto ${settings.accountId} ist noch kein WebMail-Kontoprofil gespeichert. Bitte in den Add-on-Einstellungen dieses Konto auswählen und die passenden All-Inkl/SOGo-Zugangsdaten speichern.`);
  }
  if (!settings.sogoBaseUrl || !settings.sogoUsername) {
    throw new Error('WebMail/SOGo Basis-URL und Login fehlen für das aktuelle Thunderbird-Konto.');
  }
  const provider = SogoClientApi.detectProvider(settings.sogoBaseUrl);
  return SogoClientApi.createClient({
    provider,
    baseUrl: settings.sogoBaseUrl,
    username: settings.sogoUsername,
    password: settings.sogoPassword,
  });
}

function messageHeaderValue(message, field) {
  if (field === 'from') return message.author || '';
  if (field === 'fromDomain') return SogoRuleModel.extractEmailAddress(message.author || '').split('@').pop() || '';
  if (field === 'to') return (message.recipients || []).join(', ');
  if (field === 'cc') return (message.ccList || message.cc || []).join ? (message.ccList || message.cc || []).join(', ') : String(message.ccList || message.cc || '');
  if (field === 'subject') return message.subject || '';
  return '';
}

function criterionMatchesMessage(message, criterion) {
  const actual = String(messageHeaderValue(message, criterion.field)).casefold ? String(messageHeaderValue(message, criterion.field)).casefold() : String(messageHeaderValue(message, criterion.field)).toLowerCase();
  const expected = String(criterion.value || '').toLowerCase();
  if (criterion.operator === 'contains') return actual.includes(expected);
  if (criterion.operator === 'is') return actual === expected;
  if (criterion.operator === 'beginsWith') return actual.startsWith(expected);
  if (criterion.operator === 'endsWith') return actual.endsWith(expected);
  return false;
}

function ruleMatchesMessage(message, rule) {
  const results = (rule.conditions || []).map(criterion => criterionMatchesMessage(message, criterion));
  return rule.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

async function queryAllMessages(folder) {
  if (!browser.messages || !browser.messages.query) throw new Error('Thunderbird messages.query API ist nicht verfügbar.');
  const result = [];
  let page = await browser.messages.query({ folder });
  result.push(...(page.messages || []));
  while (page.id && browser.messages.continueList) {
    page = await browser.messages.continueList(page.id);
    result.push(...(page.messages || []));
  }
  return result;
}

async function ensureTargetFolder(accountId, targetPath) {
  if (!browser.folders || !browser.folders.create) {
    throw new Error('Thunderbird folders.create API ist nicht verfügbar — Zielordner kann nicht automatisch angelegt werden.');
  }
  let accounts = await listAccounts();
  let account = findAccountById(accounts, accountId);
  if (!account) throw new Error(`Thunderbird-Konto nicht gefunden: ${accountId}`);
  let existing = findFolderInAccount(account, targetPath);
  if (existing) return { folder: existing, created: [] };

  const inbox = findInboxFolder(account);
  if (!inbox) throw new Error('INBOX des aktuellen Kontos wurde nicht gefunden.');
  const parts = SogoRuleModel.validateTargetFolder(targetPath).split('/').slice(1);
  let parent = inbox;
  const created = [];
  for (const part of parts) {
    const partialPath = `${folderPath(parent)}/${part}`.replace(/^\/+/, '');
    existing = findFolderInAccount(account, partialPath);
    if (existing) {
      parent = existing;
      continue;
    }
    const made = await browser.folders.create(parent, part);
    created.push(partialPath);
    accounts = await listAccounts();
    account = findAccountById(accounts, accountId);
    parent = (made && made.path) ? made : findFolderInAccount(account, partialPath);
    if (!parent) throw new Error(`Ordner wurde angelegt, konnte aber nicht wiedergefunden werden: ${partialPath}`);
  }
  return { folder: parent, created };
}

async function applyRuleToInbox(rule) {
  if (!selectedMessageCache || !selectedMessageCache.accountId) {
    throw new Error('Kein aktuelles Thunderbird-Konto aus der ausgewählten Mail ermittelbar.');
  }
  if (!browser.messages || !browser.messages.move) throw new Error('Thunderbird messages.move API ist nicht verfügbar.');
  const target = rule.actions.find(action => action.method === 'fileinto');
  const targetPath = target && target.argument;
  if (!targetPath || targetPath === 'INBOX') throw new Error('Kein gültiger Zielordner für Inbox-Anwendung.');

  const accounts = await listAccounts();
  const account = findAccountById(accounts, selectedMessageCache.accountId);
  if (!account) throw new Error(`Thunderbird-Konto nicht gefunden: ${selectedMessageCache.accountId}`);
  const inbox = findInboxFolder(account);
  if (!inbox) throw new Error('INBOX des aktuellen Kontos wurde nicht gefunden.');
  const { folder: targetFolder, created } = await ensureTargetFolder(selectedMessageCache.accountId, targetPath);
  const messages = await queryAllMessages(inbox);
  const matches = messages.filter(message => ruleMatchesMessage(message, rule) && !sameFolderPath(message.folder, targetPath));
  if (matches.length) {
    for (let i = 0; i < matches.length; i += 100) {
      await browser.messages.move(matches.slice(i, i + 100).map(message => message.id), targetFolder);
    }
  }
  return {
    inboxChecked: messages.length,
    moved: matches.length,
    targetFolder: targetPath,
    foldersCreated: created,
  };
}

async function applyRule() {
  if (!selectedMessageCache) await analyzeSelectedMail();
  const settings = await getSettings(selectedMessageCache && selectedMessageCache.accountId);
  const provider = SogoClientApi.detectProvider(settings.sogoBaseUrl);
  if (settings.dryRunOnly) throw new Error('Dry-run-only ist aktiv. Bitte in den Add-on-Einstellungen deaktivieren.');
  const rule = latestPreview || buildPreview();
  const target = rule.actions.find(action => action.method === 'fileinto');
  const targetPath = target && target.argument;
  let folderEnsure = null;
  if (targetPath && targetPath !== 'INBOX' && selectedMessageCache && selectedMessageCache.accountId) {
    folderEnsure = await ensureTargetFolder(selectedMessageCache.accountId, targetPath);
  }
  const client = clientFromSettings(settings);
  let writeResult;
  let previousCount;
  let newCount;
  if (provider === 'allinkl' && typeof client.writeRule === 'function') {
    writeResult = await client.writeRule(rule);
    previousCount = writeResult.previousCount;
    newCount = writeResult.newCount;
  } else {
    const existing = await client.readFilters();
    const updated = SogoRuleModel.mergeRuleIntoExistingFilters(existing, rule);
    await browser.storage.local.set({ lastSogoSieveFiltersBackup: { at: new Date().toISOString(), filters: existing } });
    await client.writeFilters(updated);
    const readback = await client.readFilters();
    const found = readback.some(item => item && item.name === rule.name);
    if (!found) throw new Error('SOGo-Readback konnte die geschriebene Regel nicht finden.');
    previousCount = existing.length;
    newCount = readback.length;
    writeResult = { ok: true };
  }
  let inboxApply = null;
  if ($('applyToInbox').checked) inboxApply = await applyRuleToInbox(rule);
  $('output').textContent = JSON.stringify({
    wrote: true,
    ruleName: rule.name,
    previousCount,
    newCount,
    provider,
    writeResult,
    targetFolder: targetPath,
    foldersCreated: folderEnsure ? folderEnsure.created : [],
    appliedToInbox: Boolean(inboxApply),
    inboxApply,
  }, null, 2);
}

async function initialize() {
  await analyzeSelectedMail();
  const settings = await getSettings(selectedMessageCache && selectedMessageCache.accountId);
  const provider = SogoClientApi.detectProvider(settings.sogoBaseUrl);
  $('folder').value = settings.defaultFolder || 'INBOX/';
  if (selectedMessageCache && selectedMessageCache.accountId && !settings.accountProfileConfigured) {
    $('mode').textContent = `Für dieses Thunderbird-Konto (${selectedMessageCache.accountId}) ist noch kein WebMail-Kontoprofil gespeichert. Bitte in den Einstellungen ein Profil für genau dieses Konto anlegen.`;
    $('apply').disabled = true;
    return;
  }
  $('mode').textContent = provider === 'allinkl'
    ? (settings.dryRunOnly ? 'All-Inkl-Modus: Dry-run aktiv. Schreiben ist gesperrt.' : `All-Inkl-Modus: Schreiben nach WebMail ist aktiv für Thunderbird-Konto ${settings.accountId || 'unbekannt'}.`)
    : (settings.dryRunOnly ? 'Dry-run aktiv. Schreiben ist gesperrt.' : `Schreiben nach SOGo ist aktiv für Thunderbird-Konto ${settings.accountId || 'unbekannt'}.`);
  $('apply').disabled = settings.dryRunOnly;
}

$('analyze').addEventListener('click', () => analyzeSelectedMail().catch(err => { $('output').textContent = String(err); }));
$('preview').addEventListener('click', () => { try { buildPreview(); } catch (err) { $('output').textContent = String(err); } });
$('apply').addEventListener('click', () => applyRule().catch(err => { $('output').textContent = String(err); }));
$('addCriterion').addEventListener('click', () => $('criteria').appendChild(criterionRow()));
$('loadRules').addEventListener('click', () => loadExistingRules().catch(err => { $('output').textContent = String(err); $('rulesList').textContent = 'Laden fehlgeschlagen.'; }));
$('saveExisting').addEventListener('click', () => saveSelectedExistingRule().catch(err => { $('output').textContent = String(err); }));
$('deleteExisting').addEventListener('click', () => deleteSelectedExistingRule().catch(err => { $('output').textContent = String(err); }));

initialize().catch(err => { $('output').textContent = String(err); });
