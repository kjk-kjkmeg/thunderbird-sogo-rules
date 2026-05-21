# GitHub Pages Update Hosting

Thunderbird self-updates require the first installed XPI to contain a stable HTTPS `update_url` in `manifest.json`.

Chosen target: public GitHub repository + GitHub Pages.

## Expected public layout

```text
https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/updates.json
https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/releases/sogo-rules-assistant-<version>.xpi
```

## Release flow

1. Bump `addon/manifest.json` `version`.
2. Build the XPI and update manifest:

   ```bash
   python3 scripts/build_release.py \
     --base-url https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/releases
   ```

3. Copy release files for GitHub Pages:

   ```bash
   mkdir -p public/releases
   cp dist/sogo-rules-assistant-*.xpi public/releases/
   cp dist/updates.json public/updates.json
   ```

4. Commit source + `public/` release artifacts.
5. Push to GitHub.
6. The `.github/workflows/pages.yml` workflow deploys `public/` to GitHub Pages.

## Manifest requirement

The installable manifest contains this stable update URL under `applications.gecko`:

```json
"update_url": "https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/updates.json"
```

Any XPI installed without this field cannot self-update. Install one fixed XPI manually first; future versions can then update through Thunderbird's add-on updater.
