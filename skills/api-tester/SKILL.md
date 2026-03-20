---
name: api-tester
description: Test HTTP API endpoints with detailed request/response analysis
compatibility: Requires Python 3.10+, recommends uv for dependency management
allowed-tools: Bash(scripts/test.py)
metadata:
  category: development
  tags: [api, http, testing, rest]

x-hive:
  scripts:
    approval: false
    timeout: 30000
    runtimes: [python]
---

# API Tester

Test HTTP API endpoints and analyze responses. Supports GET, POST, PUT, DELETE with headers and body.

## Available Scripts

- **`scripts/test.py`** — Execute HTTP requests with detailed output

## Usage

### Simple GET request
```bash
python scripts/test.py --url https://api.example.com/health
```

### POST with JSON body
```bash
python scripts/test.py --url https://api.example.com/users --method POST --body '{"name": "test"}'
```

### With custom headers
```bash
python scripts/test.py --url https://api.example.com/data --header "Authorization: Bearer token123"
```

## Output

The script outputs:
- HTTP status code and reason
- Response headers
- Response body (formatted JSON if applicable)
- Request timing
