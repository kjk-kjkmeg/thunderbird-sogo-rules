# Thunderbird SOGo Rules

MVP for a Thunderbird add-on plus local helper service to create SOGo-visible mail filter rules safely.

## Status

Dry-run preview MVP. No live SOGo writes are implemented yet.

## Safety model

- Thunderbird add-on is thin and stores no mail/SOGo credentials.
- Local helper owns credentials and write/apply gates in later phases.
- MVP supports dry-run previews only.
- Rule targets must stay under `INBOX/...`.
- Archive-copy behavior is generated as a candidate and must be verified on the target SOGo instance before production use.

## Run tests

```bash
cd /home/morpheus/projects/thunderbird-sogo-rules
python3 -m unittest discover -s tests -v
```

## Start the local helper

```bash
cd /home/morpheus/projects/thunderbird-sogo-rules
python3 -m helper.sogo_rules_helper --host 127.0.0.1 --port 8765
```

Health check from another terminal:

```bash
curl http://127.0.0.1:8765/health
```

Expected: JSON with `"ok": true` and `"writes_enabled": false`.

Manual preview test:

```bash
curl -sS -X POST http://127.0.0.1:8765/sogo/preview-rule \
  -H 'Content-Type: application/json' \
  -d '{"name":"Private Preview - Krohn","field":"from","operator":"contains","value":"torben.krohn","folder":"INBOX/Krohn"}'
```

Expected: JSON with `dry_run: true`, `wrote: false`, and a `SOGoSieveFilters`-compatible rule object.

## Install as Thunderbird extension

A packaged `.xpi` extension is built at:

`/home/morpheus/projects/thunderbird-sogo-rules/dist/sogo-rules-assistant-0.1.0.xpi`

Install it in Thunderbird:

1. Open Thunderbird.
2. Open Add-ons Manager.
3. Click the gear icon.
4. Choose **Install Add-on From File...**.
5. Select this file:

   `/home/morpheus/projects/thunderbird-sogo-rules/dist/sogo-rules-assistant-0.1.0.xpi`

6. Confirm the install prompt.
7. Keep the helper running on `127.0.0.1:8765`.
8. Select a message in Thunderbird.
9. Click the **SOGo Rules Assistant** toolbar button.
10. Keep or change the target folder, e.g. `INBOX/Krohn`.
11. Click **Preview rule from selected message**.

Package/rebuild command, if files change:

```bash
cd /home/morpheus/projects/thunderbird-sogo-rules
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path('addon')
out = Path('dist/sogo-rules-assistant-0.1.0.xpi')
out.parent.mkdir(exist_ok=True)
files = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'styles.css']
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    for name in files:
        z.write(root / name, name)
print(out)
PY
```

## Install temporarily in Thunderbird for debugging

1. Open Thunderbird.
2. Open Add-ons Manager.
3. Click the gear icon.
4. Choose **Debug Add-ons** or **Load Temporary Add-on** depending on Thunderbird version.
5. Select this file:

   `/home/morpheus/projects/thunderbird-sogo-rules/addon/manifest.json`

6. Keep the helper running on `127.0.0.1:8765`.

## Current limitation

The add-on only previews rules. It does not write to SOGo and does not persist credentials.

## Plan

See `docs/plans/2026-05-21-thunderbird-sogo-rules-mvp.md`.
