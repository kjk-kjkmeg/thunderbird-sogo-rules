import json
import unittest
from urllib import request, error

from helper.sogo_rules_helper import make_app


class HelperApiTests(unittest.TestCase):
    def test_preview_rule_rejects_non_inbox_folder_without_write(self):
        status, headers, body = make_app().handle_json_request(
            "POST",
            "/sogo/preview-rule",
            {
                "name": "Bad",
                "field": "from",
                "operator": "contains",
                "value": "example.com",
                "folder": "Trading/Example",
            },
        )

        self.assertEqual(status, 400)
        self.assertIn("INBOX", body["error"])
        self.assertEqual(body["wrote"], False)

    def test_preview_rule_returns_sogo_filter(self):
        status, headers, body = make_app().handle_json_request(
            "POST",
            "/sogo/preview-rule",
            {
                "name": "Private Preview - Krohn",
                "field": "from",
                "operator": "contains",
                "value": "torben.krohn",
                "folder": "INBOX/Krohn",
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(body["dry_run"], True)
        self.assertEqual(body["wrote"], False)
        self.assertEqual(body["filter"]["actions"][0], {"method": "fileinto", "argument": "INBOX/Krohn"})

    def test_apply_route_is_disabled(self):
        status, headers, body = make_app().handle_json_request("POST", "/sogo/apply-rule", {})

        self.assertEqual(status, 501)
        self.assertEqual(body["wrote"], False)


if __name__ == "__main__":
    unittest.main()
