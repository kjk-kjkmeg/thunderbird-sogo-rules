#!/usr/bin/env python3
"""Local dry-run helper for the Thunderbird SOGo Rules Assistant.

MVP safety: this helper only previews SOGoSieveFilters JSON. It performs no
live SOGo writes and exposes no credentials.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from helper.rule_model import build_fileinto_filter


class HelperApp:
    def handle_json_request(self, method: str, path: str, payload: dict[str, Any] | None) -> tuple[int, dict[str, str], dict[str, Any]]:
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        }
        if method == "OPTIONS":
            return 204, headers, {}
        if method == "GET" and path == "/health":
            return 200, headers, {"ok": True, "service": "sogo-rules-helper", "writes_enabled": False}
        if method == "POST" and path == "/sogo/apply-rule":
            return 501, headers, {"error": "apply is disabled in MVP", "wrote": False}
        if method == "POST" and path == "/sogo/preview-rule":
            try:
                payload = payload or {}
                rule = build_fileinto_filter(
                    name=str(payload.get("name") or "Thunderbird Preview Rule"),
                    field=str(payload.get("field") or "from"),
                    operator=str(payload.get("operator") or "contains"),
                    value=str(payload.get("value") or ""),
                    folder=str(payload.get("folder") or ""),
                )
            except Exception as exc:  # Return redacted category only; no tracebacks.
                return 400, headers, {"error": str(exc), "dry_run": True, "wrote": False}
            return 200, headers, {"dry_run": True, "wrote": False, "filter": rule}
        return 404, headers, {"error": "not found", "wrote": False}


def make_app() -> HelperApp:
    return HelperApp()


class RequestHandler(BaseHTTPRequestHandler):
    app = make_app()

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if not length:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def _send(self, status: int, headers: dict[str, str], body: dict[str, Any]) -> None:
        encoded = json.dumps(body, ensure_ascii=False, indent=2).encode("utf-8") if body else b""
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        if encoded:
            self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        status, headers, body = self.app.handle_json_request("OPTIONS", self.path, {})
        self._send(status, headers, body)

    def do_GET(self) -> None:  # noqa: N802
        status, headers, body = self.app.handle_json_request("GET", self.path, {})
        self._send(status, headers, body)

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = self._read_json()
            status, headers, body = self.app.handle_json_request("POST", self.path, payload)
        except json.JSONDecodeError:
            status, headers, body = self.app.handle_json_request("POST", self.path, {})
            status, body = 400, {"error": "invalid json", "wrote": False}
        self._send(status, headers, body)

    def log_message(self, format: str, *args: Any) -> None:
        # Keep MVP quiet; no request payloads or headers in logs.
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), RequestHandler)
    print(f"SOGo Rules Helper listening on http://{args.host}:{args.port} (dry-run only)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
