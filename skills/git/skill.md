---
name: git
description: Perform safe Git operations with branch prefix enforcement. Use when the user wants to create branches, commit changes, push, or create pull requests. Ensures all work stays on prefixed branches.
---

# Git Skill

Safe Git operations with branch prefix enforcement.

## Usage

Ask CawPilot to perform Git operations:
- "Create a new branch for the auth feature"
- "Show the status of repo-name"
- "Commit the current changes"
- "Push the branch"
- "Create a PR"

## Rules

- All branches MUST start with the configured prefix (default: `ocp-`)
- NEVER commit or push to `main`, `master`, or any branch without the prefix
- Always verify the current branch before committing
- Use conventional commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
