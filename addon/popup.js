async function getSelectedMessage() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !browser.mailTabs) {
    return null;
  }
  const selected = await browser.mailTabs.getSelectedMessages(tabs[0].id);
  if (!selected || !selected.messages || !selected.messages.length) {
    return null;
  }
  const msg = selected.messages[0];
  const full = await browser.messages.getFull(msg.id);
  return { msg, full };
}

function headerValue(headers, name) {
  const value = headers && headers[name];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function previewRule() {
  const output = document.getElementById("output");
  const folder = document.getElementById("folder").value.trim();
  output.textContent = "Lese ausgewählte Mail…";
  const selected = await getSelectedMessage();
  if (!selected) {
    output.textContent = "Keine ausgewählte Mail gefunden.";
    return;
  }
  const headers = selected.full.headers || {};
  const from = headerValue(headers, "from") || selected.msg.author || "";
  const payload = {
    name: "Thunderbird Preview Rule",
    field: "from",
    operator: "contains",
    value: from,
    folder,
    dry_run: true
  };
  const response = await fetch("http://127.0.0.1:8765/sogo/preview-rule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  output.textContent = JSON.stringify(data, null, 2);
}

document.getElementById("preview").addEventListener("click", () => {
  previewRule().catch(err => {
    document.getElementById("output").textContent = String(err);
  });
});
