const SETTINGS_KEYS = [
  "sogoBaseUrl",
  "sogoUsername",
  "sogoPassword",
  "defaultFolder",
  "dryRunOnly"
];

function $(id) {
  return document.getElementById(id);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function loadSettings() {
  const stored = await browser.storage.local.get(SETTINGS_KEYS);
  $("sogoBaseUrl").value = stored.sogoBaseUrl || "";
  $("sogoUsername").value = stored.sogoUsername || "";
  $("sogoPassword").value = stored.sogoPassword || "";
  $("defaultFolder").value = stored.defaultFolder || "INBOX/";
  $("dryRunOnly").checked = stored.dryRunOnly !== false;
}

async function saveSettings() {
  const settings = {
    sogoBaseUrl: normalizeBaseUrl($("sogoBaseUrl").value),
    sogoUsername: $("sogoUsername").value.trim(),
    sogoPassword: $("sogoPassword").value,
    defaultFolder: $("defaultFolder").value.trim() || "INBOX/",
    dryRunOnly: $("dryRunOnly").checked
  };
  await browser.storage.local.set(settings);
  $("status").textContent = "Gespeichert.";
}

async function testConnection() {
  await saveSettings();
  const baseUrl = normalizeBaseUrl($("sogoBaseUrl").value);
  const username = $("sogoUsername").value.trim();
  const password = $("sogoPassword").value;
  if (!baseUrl || !username || !password) {
    $("status").textContent = "Bitte SOGo URL, Benutzername und Passwort eintragen.";
    return;
  }

  // Placeholder until the direct SOGo client is implemented. We intentionally do
  // not perform a write here. The next implementation step will replace this
  // with a read-only SOGo preferences probe.
  $("status").textContent = JSON.stringify({
    ok: true,
    mode: "settings-only",
    message: "Einstellungen vorhanden. Direkter SOGo-Lesetest folgt im nächsten Schritt.",
    baseUrl,
    username
  }, null, 2);
}

$("settings-form").addEventListener("submit", event => {
  event.preventDefault();
  saveSettings().catch(err => {
    $("status").textContent = String(err);
  });
});

$("testConnection").addEventListener("click", () => {
  testConnection().catch(err => {
    $("status").textContent = String(err);
  });
});

loadSettings().catch(err => {
  $("status").textContent = String(err);
});
