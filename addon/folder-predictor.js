(function (root, factory) {
  const api = factory(root.SogoRuleModel || (typeof require === 'function' ? require('./rule-model.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SogoFolderPredictor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ruleModel) {
  function stripDiacritics(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  }

  function tokenize(value) {
    return stripDiacritics(value)
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/i)
      .map(x => x.trim())
      .filter(x => x.length >= 3);
  }

  function tokenizeFolderName(pathOrName) {
    const last = String(pathOrName || '').split('/').pop() || '';
    return tokenize(last);
  }

  function messageText(message) {
    return [message.from, message.subject, message.author, message.recipients]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function scoreFolderForMessage(folder, message) {
    const path = folder.path || folder.name || '';
    const tokens = tokenizeFolderName(path);
    const text = stripDiacritics(messageText(message));
    let score = 0;
    for (const token of tokens) {
      const variants = [token, token.replace(/(en|n|e|s)$/i, '')].filter(Boolean);
      if (variants.some(variant => variant.length >= 3 && text.includes(variant))) score += token.length + 5;
    }
    const email = ruleModel ? ruleModel.extractEmailAddress(message.from || message.author || '') : '';
    const local = email.includes('@') ? email.split('@')[0] : '';
    const domain = email.includes('@') ? email.split('@')[1].split('.')[0] : '';
    for (const token of tokens) {
      if (local && local.includes(token)) score += 8;
      if (domain && domain.includes(token)) score += 4;
    }
    return score;
  }

  function suggestFoldersForMessage(folders, message, limit = 5) {
    return (folders || [])
      .filter(folder => String(folder.path || '').startsWith('INBOX/'))
      .map(folder => ({ ...folder, score: scoreFolderForMessage(folder, message) }))
      .filter(folder => folder.score > 0)
      .sort((a, b) => b.score - a.score || String(a.path).localeCompare(String(b.path)))
      .slice(0, limit);
  }

  function subjectKeywords(subject) {
    const stop = new Set(['und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'mit', 'for', 'the', 'and', 're', 'fw', 'fwd']);
    return tokenize(subject).filter(token => !stop.has(token)).slice(0, 3);
  }

  function inferCriteriaFromMessage(message) {
    const criteria = [];
    const from = message.from || message.author || '';
    if (from && ruleModel) {
      const email = ruleModel.extractEmailAddress(from);
      if (email) criteria.push({ field: 'from', operator: 'contains', value: email, label: `Absender ist/enthält ${email}` });
      if (email.includes('@')) {
        const domain = email.split('@').pop();
        criteria.push({ field: 'fromDomain', operator: 'contains', value: domain, label: `Absender-Domain enthält ${domain}` });
      }
    }
    for (const keyword of subjectKeywords(message.subject || '')) {
      criteria.push({ field: 'subject', operator: 'contains', value: keyword, label: `Betreff enthält ${keyword}` });
    }
    return criteria;
  }

  return { tokenizeFolderName, scoreFolderForMessage, suggestFoldersForMessage, inferCriteriaFromMessage };
});
