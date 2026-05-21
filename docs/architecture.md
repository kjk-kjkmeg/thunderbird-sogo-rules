# Architecture

```text
Thunderbird MailExtension
  - reads selected message headers
  - asks local helper for dry-run preview
  - renders preview to Klaus

Local helper on 127.0.0.1
  - validates payloads
  - builds SOGoSieveFilters-compatible JSON
  - redacts secrets in responses/logs
  - later: backs up and writes SOGo preferences with explicit confirmation
```

## Why helper-first

Thunderbird extensions should not hold SOGo passwords, mail passwords, or admin API keys. The helper is easier to test and can reuse the existing SOGoSieveFilters rule model from the mail migration work.

## MVP writes

No apply/write endpoints in MVP. Dry-run only.
