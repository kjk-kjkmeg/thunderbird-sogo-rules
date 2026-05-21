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

  $("status").textContent = "Teste SOGo-Lesezugriff…";
  const client = new SogoClientApi.SogoClient({ baseUrl, username, password });
  const result = await client.testConnection();
  $("status").textContent = JSON.stringify({
    ok: true,
    message: "SOGo-Lesezugriff erfolgreich.",
    filterCount: result.filterCount,
    baseUrl,
    username,
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
