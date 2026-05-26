# Nächste Spezifikation: All-Inkl-Regelworkflow absichern

Ziel: Regelanlage für All-Inkl sauber testbar, trocken prüfbar und rücklesbar halten.

Akzeptanzkriterien:
- Read-only Verbindungstest vor Writes.
- Backup vor jeder Regeländerung.
- Readback nach Write.
- Tests decken Modell, Folder-Prediction und Clientadapter ab.
