---
name: code-reviewer
description: Review code for bugs, security issues, performance problems, and best practices
metadata:
  category: development
  tags: [code-review, security, performance, best-practices, 代码, 审查, 漏洞, 安全]
---

# Code Reviewer

Perform thorough code reviews focusing on correctness, security, performance, and maintainability.

## Review Checklist

1. **Bugs**: Logic errors, off-by-one, null/undefined handling, race conditions
2. **Security**: Injection vulnerabilities, auth/authz issues, sensitive data exposure
3. **Performance**: N+1 queries, unnecessary allocations, missing indexes, blocking operations
4. **Maintainability**: Naming, complexity, duplication, missing error handling
5. **Best Practices**: Framework conventions, idiomatic patterns, type safety

## Output Format

For each finding:
- **Severity**: Critical / Warning / Info
- **Location**: File and line reference
- **Issue**: Clear description
- **Fix**: Suggested improvement with code example
