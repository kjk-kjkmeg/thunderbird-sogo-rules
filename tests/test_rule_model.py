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
