#!/usr/bin/env python3
"""JSON utility tool — validate, format, query, diff, stats."""

import json
import sys


def validate(data_str):
    try:
        json.loads(data_str)
        print(json.dumps({"valid": True, "message": "Valid JSON"}))
    except json.JSONDecodeError as e:
        print(json.dumps({"valid": False, "message": str(e), "position": e.pos}))


def format_json(data_str):
    try:
        obj = json.loads(data_str)
        print(json.dumps(obj, indent=2, ensure_ascii=False))
    except json.JSONDecodeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def query(data_str, path):
    try:
        obj = json.loads(data_str)
        parts = path.split(".")
        current = obj
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            elif isinstance(current, list) and part.isdigit():
                current = current[int(part)]
            else:
                print(json.dumps({"error": f"Path '{path}' not found at '{part}'"}))
                return
        print(json.dumps({"path": path, "value": current}, ensure_ascii=False))
    except json.JSONDecodeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def diff(a_str, b_str):
    try:
        a = json.loads(a_str)
        b = json.loads(b_str)
    except json.JSONDecodeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    result = {"added": {}, "removed": {}, "changed": {}, "unchanged": []}

    all_keys = set()
    if isinstance(a, dict):
        all_keys.update(a.keys())
    if isinstance(b, dict):
        all_keys.update(b.keys())

    for key in sorted(all_keys):
        in_a = key in a if isinstance(a, dict) else False
        in_b = key in b if isinstance(b, dict) else False
        if in_a and not in_b:
            result["removed"][key] = a[key]
        elif not in_a and in_b:
            result["added"][key] = b[key]
        elif a[key] != b[key]:
            result["changed"][key] = {"from": a[key], "to": b[key]}
        else:
            result["unchanged"].append(key)

    print(json.dumps(result, indent=2, ensure_ascii=False))


def stats(data_str):
    try:
        obj = json.loads(data_str)
    except json.JSONDecodeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    def measure(o, depth=0):
        if isinstance(o, dict):
            d = depth + 1
            for v in o.values():
                d = max(d, measure(v, depth + 1))
            return d
        elif isinstance(o, list):
            d = depth + 1
            for v in o:
                d = max(d, measure(v, depth + 1))
            return d
        return depth

    def count_types(o):
        types = {}
        if isinstance(o, dict):
            for v in o.values():
                t = type(v).__name__
                types[t] = types.get(t, 0) + 1
                for k2, v2 in count_types(v).items():
                    types[k2] = types.get(k2, 0) + v2
        elif isinstance(o, list):
            for v in o:
                t = type(v).__name__
                types[t] = types.get(t, 0) + 1
                for k2, v2 in count_types(v).items():
                    types[k2] = types.get(k2, 0) + v2
        return types

    key_count = len(obj) if isinstance(obj, (dict, list)) else 1
    depth = measure(obj)
    types = count_types(obj)
    size = len(data_str)

    print(json.dumps({
        "keys": key_count,
        "maxDepth": depth,
        "types": types,
        "sizeBytes": size,
    }, indent=2))


COMMANDS = {
    "validate": lambda args: validate(args[0]),
    "format": lambda args: format_json(args[0]),
    "query": lambda args: query(args[0], args[1]),
    "diff": lambda args: diff(args[0], args[1]),
    "stats": lambda args: stats(args[0]),
}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: json_tool.py <command> <args...>", file=sys.stderr)
        print(f"Commands: {', '.join(COMMANDS.keys())}", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)

    COMMANDS[cmd](sys.argv[2:])
