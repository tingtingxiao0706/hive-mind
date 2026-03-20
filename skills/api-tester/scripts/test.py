#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.31.0",
# ]
# ///

"""Simple HTTP API tester - tests endpoints and reports results."""

import argparse
import json
import sys
import time

import requests


def main():
    parser = argparse.ArgumentParser(description="Test HTTP API endpoints")
    parser.add_argument("--url", required=True, help="URL to test")
    parser.add_argument("--method", default="GET", choices=["GET", "POST", "PUT", "DELETE", "PATCH"])
    parser.add_argument("--body", default=None, help="Request body (JSON string)")
    parser.add_argument("--header", action="append", default=[], help="Headers in 'Key: Value' format")
    parser.add_argument("--timeout", type=int, default=10, help="Request timeout in seconds")
    args = parser.parse_args()

    headers = {}
    for h in args.header:
        key, _, value = h.partition(":")
        headers[key.strip()] = value.strip()

    body = None
    if args.body:
        try:
            body = json.loads(args.body)
            headers.setdefault("Content-Type", "application/json")
        except json.JSONDecodeError:
            body = args.body

    start = time.time()
    try:
        resp = requests.request(
            method=args.method,
            url=args.url,
            headers=headers,
            json=body if isinstance(body, dict) else None,
            data=body if isinstance(body, str) else None,
            timeout=args.timeout,
        )
        elapsed = time.time() - start

        print(f"Status: {resp.status_code} {resp.reason}")
        print(f"Time: {elapsed:.3f}s")
        print(f"\n--- Response Headers ---")
        for k, v in resp.headers.items():
            print(f"  {k}: {v}")

        print(f"\n--- Response Body ---")
        try:
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        except (json.JSONDecodeError, ValueError):
            print(resp.text[:5000])

    except requests.exceptions.RequestException as e:
        elapsed = time.time() - start
        print(f"Error: {e}", file=sys.stderr)
        print(f"Time: {elapsed:.3f}s")
        sys.exit(2)


if __name__ == "__main__":
    main()
