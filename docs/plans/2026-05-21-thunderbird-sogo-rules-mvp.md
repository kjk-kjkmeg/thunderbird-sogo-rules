# Thunderbird SOGo Rules Add-on MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a Thunderbird MailExtension plus a local helper service so Klaus can inspect selected messages and create/edit SOGo-visible mail rules safely.

**Architecture:** Keep the Thunderbird add-on thin: it extracts message metadata and calls a localhost helper. The helper owns credentials, SOGoSieveFilters read/write, dry-run previews, backups, and verification. Sensitive mail content stays local; no LLM processing of raw mail content.

**Tech Stack:** Thunderbird MailExtension Manifest V2/V3-compatible APIs, JavaScript, local Python helper service using stdlib `http.server` for MVP, JSON rule model compatible with `SOGoSieveFilters`, stdlib `unittest` tests.

---

## MVP Scope

### In scope
- Thunderbird add-on action for selected message.
- Extract safe headers: From, To, Cc, Subject, message id, folder/account metadata if available.
- Show a preview UI for creating a SOGo rule from sender or recipient.
- Local helper with dry-run endpoints first.
- SOGoSieveFilters JSON generation for simple rules:
  - `from contains/is VALUE` -> `fileinto INBOX/...` -> `stop`
  - optional archive-copy candidate: redirect/copy to `archiv@kjkratz.de` plus keep/sort locally, behind an explicit feature flag until verified on live SOGo.
- Backup-before-write design.
- Tests for parser, redaction, request validation, and no-write dry-run behavior.

### Deferred
- Direct live import until helper has verified SOGo access and backups.
- Raw Sieve parsing in the add-on.
- LLM categorization unless pseudonymization/anonymization is implemented first.
- Sent-mail automatic archival; this needs SMTP/BCC/Sent-sync design, not normal incoming Sieve.

### Non-negotiable safety rules
- Add-on never stores SOGo/Mail passwords or API keys.
- Helper must redact secrets and mailbox credentials in all HTTP responses/logs.
- All write/apply routes are disabled by default and require explicit local config plus confirmation token.
- Dry-run returns exact planned rule changes and backup path requirement.
- Rule targets must preserve `INBOX/...`; never strip `INBOX/`.

---

## Project Structure

```text
/home/morpheus/projects/thunderbird-sogo-rules/
  addon/
    manifest.json
    background.js
    popup.html
    popup.js
    styles.css
  helper/
    sogo_rules_helper.py
    rule_model.py
    redaction.py
  tests/
    test_rule_model.py
    test_redaction.py
    test_helper_api.py
  examples/
    private-sogo-filters.example.json
  docs/
    plans/2026-05-21-thunderbird-sogo-rules-mvp.md
    architecture.md
  README.md
```

---

## Task 1: Create project scaffold

**Objective:** Establish a minimal repo layout with docs and placeholder files.

**Files:**
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `addon/manifest.json`
- Create: `helper/rule_model.py`
- Create: `tests/test_rule_model.py`

**Step 1: Write failing test**

Create `tests/test_rule_model.py`:

```python
import unittest

from helper.rule_model import build_fileinto_filter


class RuleModelTests(unittest.TestCase):
    def test_builds_sogo_filter_with_inbox_target(self):
        rule = build_fileinto_filter(
            name="Private 01 - Momsen",
            field="from",
            operator="is",
            value="ekratz42@gmail.com",
            folder="INBOX/Momsen",
        )

        self.assertEqual(rule["name"], "Private 01 - Momsen")
        self.assertEqual(rule["active"], 1)
        self.assertEqual(rule["match"], "all")
        self.assertEqual(rule["rules"], [{"field": "from", "operator": "is", "value": "ekratz42@gmail.com"}])
        self.assertEqual(rule["actions"], [
            {"method": "fileinto", "argument": "INBOX/Momsen"},
            {"method": "stop", "argument": ""},
        ])


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify failure**

Run: `python3 -m unittest tests.test_rule_model -v`
Expected: FAIL because `helper.rule_model` does not exist yet.

**Step 3: Minimal implementation**

Create `helper/rule_model.py`:

```python
ALLOWED_FIELDS = {"from", "to", "cc", "header"}
ALLOWED_OPERATORS = {"is", "contains"}


def build_fileinto_filter(*, name, field, operator, value, folder):
    if field not in ALLOWED_FIELDS:
        raise ValueError("unsupported field")
    if operator not in ALLOWED_OPERATORS:
        raise ValueError("unsupported operator")
    if not folder.startswith("INBOX/"):
        raise ValueError("folder must start with INBOX/")
    return {
        "active": 1,
        "name": name,
        "match": "all",
        "rules": [{"field": field, "operator": operator, "value": value}],
        "actions": [
            {"method": "fileinto", "argument": folder},
            {"method": "stop", "argument": ""},
        ],
    }
```

**Step 4: Run test to verify pass**

Run: `python3 -m unittest tests.test_rule_model -v`
Expected: PASS.

---

## Task 2: Enforce INBOX target safety

**Objective:** Prevent recurrence of the Collector bug by rejecting top-level folders.

**Files:**
- Modify: `tests/test_rule_model.py`
- Modify: `helper/rule_model.py`

**Step 1: Add failing test**

```python
    def test_rejects_folder_without_inbox_prefix(self):
        with self.assertRaisesRegex(ValueError, "INBOX"):
            build_fileinto_filter(
                name="Bad Rule",
                field="from",
                operator="contains",
                value="example.com",
                folder="Trading/Example",
            )
```

**Step 2:** Run: `python3 -m unittest tests.test_rule_model -v`
Expected: PASS if Task 1 already implemented the guard; if it passes immediately, keep it as regression coverage and continue.

---

## Task 3: Add archive-copy candidate model behind explicit flag

**Objective:** Model the Krohn archive-copy rule without enabling destructive behavior blindly.

**Files:**
- Modify: `tests/test_rule_model.py`
- Modify: `helper/rule_model.py`

**Step 1: Add failing test**

```python
from helper.rule_model import build_archive_copy_candidate

    def test_archive_copy_candidate_marks_verification_required(self):
        rule = build_archive_copy_candidate(
            name="Private Archivkopie - Krohn",
            field="from",
            operator="contains",
            value="torben.krohn",
            archive_address="archiv@kjkratz.de",
            local_folder="INBOX/Krohn",
        )

        self.assertEqual(rule["_verification_required"], True)
        self.assertIn({"method": "redirect", "argument": "archiv@kjkratz.de"}, rule["actions"])
        self.assertIn({"method": "fileinto", "argument": "INBOX/Krohn"}, rule["actions"])
```

**Step 2:** Run and verify failure.

**Step 3:** Implement `build_archive_copy_candidate` with the same INBOX guard and `_verification_required: True`.

---

## Task 4: Add redaction helper

**Objective:** Ensure logs/API responses never leak secrets.

**Files:**
- Create: `helper/redaction.py`
- Create: `tests/test_redaction.py`

**Step 1: Write failing tests**

```python
import unittest
from helper.redaction import redact_text


class RedactionTests(unittest.TestCase):
    def test_redacts_password_token_and_key_values(self):
        text = "password=secret token=abc api_key=def"
        out = redact_text(text)
        self.assertNotIn("secret", out)
        self.assertNotIn("abc", out)
        self.assertNotIn("def", out)
        self.assertIn("[REDACTED]", out)
```

**Step 2:** Run and verify failure.

**Step 3:** Implement conservative regex redaction.

---

## Task 5: Add local helper dry-run API

**Objective:** Provide a localhost-only API that builds rule previews but performs no writes.

**Files:**
- Create: `helper/sogo_rules_helper.py`
- Create: `tests/test_helper_api.py`

**API:**
- `GET /health` -> `{"ok": true}`
- `POST /sogo/preview-rule` -> validates JSON and returns planned SOGo filter JSON.
- No apply route in MVP unless disabled with `501 Not Implemented`.

**Test cases:**
- health contains no config/secrets.
- preview rejects folders without `INBOX/`.
- preview produces a rule JSON for `from contains torben.krohn`.
- `POST /sogo/apply-rule` returns 501 and performs zero writes.

---

## Task 6: Add Thunderbird manifest and minimal popup

**Objective:** Package a basic Thunderbird add-on UI that can be loaded temporarily.

**Files:**
- Create: `addon/manifest.json`
- Create: `addon/background.js`
- Create: `addon/popup.html`
- Create: `addon/popup.js`
- Create: `addon/styles.css`

**Manifest requirements:**
- permissions: `messagesRead`, `accountsRead`, `activeTab`, `storage`, `http://127.0.0.1/*`
- browser action / message display action depending on supported Thunderbird version.

**Behavior:**
- Popup button: “Preview rule from selected message”.
- Extract selected message headers if available.
- POST dry-run payload to `http://127.0.0.1:8765/sogo/preview-rule`.
- Display returned JSON preview.
- No apply button in MVP.

---

## Task 7: Document local installation and smoke test

**Objective:** Make the MVP runnable without guessing.

**Files:**
- Modify: `README.md`

**Include:**
- Start helper: `python3 helper/sogo_rules_helper.py --host 127.0.0.1 --port 8765`
- Run tests: `python3 -m unittest discover -s tests -v`
- Load add-on temporarily in Thunderbird Add-ons Debugging.
- Confirm no credentials are stored in the add-on.
- Confirm apply/write is disabled in MVP.

---

## Acceptance Criteria

- Tests pass with `python3 -m unittest discover -s tests -v`.
- Helper binds to `127.0.0.1` by default.
- No code prints raw passwords/tokens/API keys.
- Rule model rejects non-`INBOX/...` folders.
- Archive-copy rule is generated only as a candidate with verification marker.
- Thunderbird add-on can show a dry-run preview for a selected message.
- No live SOGo write happens in MVP.
