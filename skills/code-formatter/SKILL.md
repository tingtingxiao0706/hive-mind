---
name: code-formatter
description: Format and lint code using Prettier, supporting multiple languages
compatibility: Requires Node.js 18+ with npx available
allowed-tools: Bash(scripts/format.sh)
metadata:
  category: development
  tags: [formatting, prettier, lint, code-style]

x-hive:
  scripts:
    approval: false
    timeout: 60000
    runtimes: [bash]
---

# Code Formatter

Format source code using Prettier. Supports JavaScript, TypeScript, CSS, HTML, JSON, Markdown, and more.

## Available Scripts

- **`scripts/format.sh`** — Run Prettier to format files

## Usage

### Check formatting (dry run)
```bash
scripts/format.sh --check src/
```

### Fix formatting
```bash
scripts/format.sh --write src/
```

### Format specific file types
```bash
scripts/format.sh --write "src/**/*.ts"
```

## Workflow

1. First check which files need formatting: `scripts/format.sh --check .`
2. Review the list of files that would change
3. Apply formatting: `scripts/format.sh --write .`
