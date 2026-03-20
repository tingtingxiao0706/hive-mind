---
name: git-commit
description: Analyze staged changes and generate meaningful git commit messages
compatibility: Requires git
allowed-tools: Bash(scripts/analyze.sh)
metadata:
  category: development
  tags: [git, commit, version-control]

x-hive:
  scripts:
    approval: false
    timeout: 30000
    runtimes: [bash]
---

# Git Commit Helper

Analyze staged git changes and suggest a well-structured commit message following conventional commit format.

## Available Scripts

- **`scripts/analyze.sh`** — Show staged diff summary for commit message generation

## Workflow

1. Run `scripts/analyze.sh` to get the staged diff
2. Analyze the changes: what files changed, what was added/removed/modified
3. Generate a commit message following Conventional Commits:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `refactor:` for code restructuring
   - `docs:` for documentation changes
   - `test:` for test changes
   - `chore:` for maintenance tasks

## Output Format

Provide:
1. A one-line summary (max 72 chars)
2. An optional body with details (wrapped at 72 chars)
3. Optional footer with references (e.g., "Closes #123")
