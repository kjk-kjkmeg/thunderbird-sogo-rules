# Thunderbird SOGo Rules

Thunderbird MailExtension for creating SOGo-visible mail filter rules from the currently selected message.

## Status

Version `0.2.0` is a direct-add-on build:

- stores SOGo connection settings in the Thunderbird add-on settings page
- analyzes the currently selected message
- predicts likely `INBOX/...` target folders from Thunderbird folders and message sender/subject
- lets the user select criteria: sender, sender domain, recipient, CC, subject
- builds a SOGo filter preview locally
- can read/write SOGo filter preferences directly over HTTPS when dry-run-only is disabled
- stores a local backup of the previous filter list before writing
- verifies writes with a readback check
- self-update metadata is hosted via GitHub Pages

## Safety model

- Dry-run-only is enabled by default.
- Rule targets must stay under `INBOX/...`.
- At least one explicit criterion is required.
- Existing filters are backed up to Thunderbird local extension storage before a write.
- Writes are followed by a SOGo readback check.
- Spam/Junk/Trash/Drafts/Archiv processing remains out of scope for automatic rule generation.

## Run tests

```bash
cd /home/morpheus/projects/thunderbird-sogo-rules
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

## Build release

```bash
cd /home/morpheus/projects/thunderbird-sogo-rules
python3 scripts/build_release.py \
  --base-url https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/releases
mkdir -p public/releases
cp dist/sogo-rules-assistant-*.xpi public/releases/
cp dist/updates.json public/updates.json
```

## Install as Thunderbird extension

The packaged extension is published at:

```text
https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/releases/sogo-rules-assistant-0.2.0.xpi
```

Local build path:

```text
/home/morpheus/projects/thunderbird-sogo-rules/dist/sogo-rules-assistant-0.2.0.xpi
```

Install it in Thunderbird:

1. Open Thunderbird.
2. Open Add-ons Manager.
3. Click the gear icon.
4. Choose **Install Add-on From File...**.
5. Select the `.xpi` file.
6. Open the add-on settings.
7. Enter SOGo base URL, username, password/app-password, and default target folder.
8. Keep dry-run-only enabled until the read-only connection test succeeds.
9. Select a message and open the **SOGo Rules Assistant** toolbar button.
10. Review predicted folder, criteria, and preview before enabling writes.

## Auto updates

The installed XPI contains:

```text
https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/updates.json
```

Thunderbird checks that update manifest for newer versions.

## Direct SOGo endpoint

The add-on currently uses this SOGo preferences URL shape:

```text
<SOGo base URL>/so/<encoded username>/Preferences/active.json
```

Example:

```text
https://sogo.example.org/SOGo/so/collector%40example.org/Preferences/active.json
```

If a target SOGo instance uses a different preferences endpoint or write method, adjust `addon/sogo-client.js` and rerun the tests before releasing.

## Temporary debugging install

1. Open Thunderbird.
2. Open Add-ons Manager.
3. Click the gear icon.
4. Choose **Debug Add-ons** or **Load Temporary Add-on** depending on Thunderbird version.
5. Select:

   `/home/morpheus/projects/thunderbird-sogo-rules/addon/manifest.json`

## Legacy helper

The old Python helper is still present for dry-run comparison tests but is no longer the primary architecture.
