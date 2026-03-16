---
name: review
description: Assist with code review by analyzing diffs, suggesting improvements, and checking for common issues. Use when the user asks to review changes, check a branch, or get feedback on code.
---

# Review Skill

Assist with code review by analyzing diffs, suggesting improvements, and checking for common issues.

## Usage

Ask CawPilot to review code:
- "Review the latest changes in repo-name"
- "What's changed on branch ocp-feature-x?"
- "Review this diff for security issues"

## Approach

1. Check out the relevant branch
2. Analyze the diff against main
3. Look for: bugs, security issues, performance concerns, style problems
4. Provide concise, actionable feedback
5. Suggest specific improvements with code snippets when helpful
