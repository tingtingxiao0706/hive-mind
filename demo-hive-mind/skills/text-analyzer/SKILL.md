---
name: text-analyzer
description: Analyze text for word count, character count, sentence count, keyword frequency, and readability
allowed-tools: Bash(scripts/analyze.js)
metadata:
  category: writing
  tags: [analyze, 分析, 统计, word-count, 字数, 词频, text]
x-hive:
  scripts:
    approval: false
    timeout: 10000
    runtimes: [node]
---

# Text Analyzer

Analyze text using the `scripts/analyze.js` script. Always use `run_script` to perform the analysis — do NOT count manually.

## Usage

Call `run_script` with:
- `script`: `"scripts/analyze.js"`
- `args`: pass the text to analyze as the first argument

## Output

The script returns a JSON report with:
- `characters` — total character count
- `words` — word count (supports CJK)
- `sentences` — sentence count
- `paragraphs` — paragraph count
- `topWords` — top 10 most frequent words
- `readingTimeMinutes` — estimated reading time
