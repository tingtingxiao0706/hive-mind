---
name: json-tools
description: Validate, format, compare, and query JSON data using Python scripts
allowed-tools: Bash(scripts/json_tool.py)
metadata:
  category: development
  tags: [json, validate, format, query, 格式化, 校验, 数据, python]
x-hive:
  scripts:
    approval: false
    timeout: 10000
    runtimes: [python]
---

# JSON Tools

Process JSON data using `scripts/json_tool.py`. Always use `run_script` — do NOT process JSON manually.

## Commands

Call `run_script` with `script: "scripts/json_tool.py"` and pass command as the first arg:

### validate — Check if JSON is valid
```
args: ["validate", "{\"name\": \"test\"}"]
```

### format — Pretty-print JSON
```
args: ["format", "{\"a\":1,\"b\":[2,3]}"]
```

### query — Extract value by dot-path (e.g. `user.name`)
```
args: ["query", "{\"user\":{\"name\":\"Alice\"}}", "user.name"]
```

### diff — Compare two JSON objects
```
args: ["diff", "{\"a\":1,\"b\":2}", "{\"a\":1,\"b\":3,\"c\":4}"]
```

### stats — Report key count, depth, types
```
args: ["stats", "{\"a\":1,\"b\":[1,2],\"c\":{\"d\":true}}"]
```
