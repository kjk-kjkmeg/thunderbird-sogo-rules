const SETTINGS_KEYS = [
  "accountProfiles",
  "sogoBaseUrl",
  "sogoUsername",
  "sogoPassword",
  "defaultFolder",
  "dryRunOnly"
];

let accountsCache = [];

function $(id) {
  return document.getElementById(id);
}

function renderVersion() {
  const target = $("addonVersion");
  if (!target || !browser.runtime || !browser.runtime.getManifest) return;
  const manifest = browser.runtime.getManifest();
  target.textContent = manifest && manifest.version ? `v${manifest.version}` : "";
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function accountLabel(account) {
  const parts = [account && account.name, account && account.id].filter(Boolean);
  return parts.length ? parts.join(" — ") : "Unbekanntes Konto";
}

async function listAccounts() {
  if (!browser.accounts || !browser.accounts.list) return [];
  return await browser.accounts.list();
}

function selectedAccountId() {
  return $("accountSelect").value;
}

async function loadAccounts() {
  accountsCache = await listAccounts();
  const select = $("accountSelect");
  select.textContent = "";

  if (!accountsCache.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Thunderbird-Konten gefunden";
    select.appendChild(option);
    return;
  }

  for (const account of accountsCache) {
    const option = document.createElement("option");
    option.value = String(account.id || "");
    option.textContent = accountLabel(account);
    select.appendChild(option);
  }
}

async function loadSettingsForSelectedAccount() {
  const stored = await browser.storage.local.get(SETTINGS_KEYS);
  const accountId = selectedAccountId();
  const profiles = stored.accountProfiles || {};
  const profile = accountId ? profiles[accountId] || {} : {};

  $("sogoBaseUrl").value = profile.sogoBaseUrl || "";
  $("sogoUsername").value = profile.sogoUsername || "";
  $("sogoPassword").value = profile.sogoPassword || "";
  $("defaultFolder").value = stored.defaultFolder || "INBOX/";
  $("dryRunOnly").checked = stored.dryRunOnly !== false;

  const hasLegacyGlobal = Boolean(stored.sogoBaseUrl || stored.sogoUsername || stored.sogoPassword);
  const hasProfile = Boolean(profile.sogoBaseUrl || profile.sogoUsername || profile.sogoPassword);
  $("status").textContent = JSON.stringify({
    selectedAccountId: accountId || null,
    selectedAccount: (accountsCache.find(account => String(account.id) === String(accountId)) || {}).name || null,
    accountProfileConfigured: hasProfile,
    legacyGlobalCredentialsPresent: hasLegacyGlobal,
    note: hasProfile
      ? "Kontoprofil geladen. Regeln aus diesem Thunderbird-Konto verwenden diese WebMail-Zugangsdaten."
      : "Für dieses Konto ist noch kein WebMail-Profil gespeichert. Globale alte Credentials werden nicht automatisch verwendet."
  }, null, 2);
}

async function saveSettings() {
  const accountId = selectedAccountId();
  if (!accountId) throw new Error("Bitte ein Thunderbird-Konto auswählen.");

  const stored = await browser.storage.local.get(SETTINGS_KEYS);
  const profiles = stored.accountProfiles || {};
  profiles[accountId] = {
    sogoBaseUrl: normalizeBaseUrl($("sogoBaseUrl").value),
    sogoUsername: $("sogoUsername").value.trim(),
    sogoPassword: $("sogoPassword").value,
    updatedAt: new Date().toISOString()
  };

  await browser.storage.local.set({
    accountProfiles: profiles,
    defaultFolder: $("defaultFolder").value.trim() || "INBOX/",
    dryRunOnly: $("dryRunOnly").checked
  });
  $("status").textContent = `Gespeichert für Thunderbird-Konto ${accountId}.`;
}

async function deleteSelectedAccountProfile() {
  const accountId = selectedAccountId();
  if (!accountId) throw new Error("Bitte ein Thunderbird-Konto auswählen.");
  const stored = await browser.storage.local.get(SETTINGS_KEYS);
  const profiles = stored.accountProfiles || {};
  delete profiles[accountId];
  await browser.storage.local.set({ accountProfiles: profiles });
  await loadSettingsForSelectedAccount();
}

async function testConnection() {
  await saveSettings();
  const baseUrl = normalizeBaseUrl($("sogoBaseUrl").value);
  const username = $("sogoUsername").value.trim();
  const password = $("sogoPassword").value;
  if (!baseUrl || !username) {
    $("status").textContent = "Bitte Basis-URL und WebMail-Login für das ausgewählte Konto eintragen.";
    return;
  }

  const provider = SogoClientApi.detectProvider(baseUrl);
  if (provider === "sogo" && !password) {
    $("status").textContent = "Bitte für SOGo URL, Benutzername und Passwort eintragen.";
    return;
  }

  $("status").textContent = provider === "allinkl" ? "Teste All-Inkl WebMail-Login…" : "Teste SOGo-Lesezugriff…";
  const client = SogoClientApi.createClient({ provider, baseUrl, username, password });
  const result = await client.testConnection();
  $("status").textContent = JSON.stringify({
    ok: true,
    provider,
    message: result.message || (provider === "allinkl" ? "All-Inkl WebMail Login erfolgreich." : "SOGo-Lesezugriff erfolgreich."),
    filterCount: typeof result.filterCount === "number" ? result.filterCount : undefined,
    httpStatus: result.status,
    loginPageDetected: result.loginPageDetected,
    accountId: selectedAccountId(),
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

$("accountSelect").addEventListener("change", () => {
  loadSettingsForSelectedAccount().catch(err => {
    $("status").textContent = String(err);
  });
});

$("testConnection").addEventListener("click", () => {
  testConnection().catch(err => {
    $("status").textContent = String(err);
  });
});

$("deleteAccountProfile").addEventListener("click", () => {
  deleteSelectedAccountProfile().catch(err => {
    $("status").textContent = String(err);
  });
});

renderVersion();

loadAccounts()
  .then(loadSettingsForSelectedAccount)
  .catch(err => {
    $("status").textContent = String(err);
  });
