# Architektur

## Bausteine
- `addon/`: Thunderbird MailExtension UI und Clientlogik.
- `helper/`: ältere Python-Hilfen und Modell-/Vergleichslogik.
- `tests/`: JS- und Python-Tests.
- `scripts/`: Build-/Release-Hilfen.
- `dist/`, `public/`: gebaute XPI- und Update-Artefakte.

## Sicherheitsmodell
Dry-run zuerst, explizite Kriterien, Zielordner unter `INBOX/...`, Backup vor Writes, Readback-Verifikation nach Writes.
