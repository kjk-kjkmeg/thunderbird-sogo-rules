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
6. GitHub Pages serves `public/` from `main`.

## Manifest requirement

Before the first install, add this to `addon/manifest.json` under `applications.gecko`:

```json
"update_url": "https://kjk-kjkmeg.github.io/thunderbird-sogo-rules/updates.json"
```

Do not install the first production XPI until this URL is final, otherwise Thunderbird will not know where to check for future updates.
