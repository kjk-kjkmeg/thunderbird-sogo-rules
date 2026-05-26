# Thunderbird SOGo / All-Inkl Rules Add-on

Scope: Thunderbird MailExtension in this repository.

Purpose:
- Create mail filter rules from selected Thunderbird messages.
- Current target is All-Inkl/WebMail behavior, not only legacy SOGo.

Safety rules:
- Dry-run is default; writes require explicit user intent.
- No automatic processing of Spam/Junk/Trash/Drafts/Archiv.
- Rule targets must stay under `INBOX/...` unless Klaus explicitly approves otherwise.
- Back up existing filters before writes and verify by readback.
- Optional INBOX backfill only when explicitly enabled/approved.
- Never commit or print mailbox credentials.

Key paths:
- Add-on code: `addon/`
- Tests: `tests/`
- Release output: `dist/`
- Public update metadata: `public/`

Checks:
```bash
node --check addon/rule-model.js
node --check addon/folder-predictor.js
node --check addon/sogo-client.js
node --check addon/popup.js
node --check addon/options.js
node tests/test_rule_model_js.cjs
node tests/test_folder_predictor_js.cjs
node tests/test_sogo_client_js.cjs
python3 -m unittest discover -s tests -v
```
