# CawPilot

Autonomous developer assistant built on GitHub Copilot SDK. Multi-channel (Telegram, HTTP, CLI) agent that manages code, branches, todo lists, and developer workflows through natural conversation.

## Overview

- **Purpose**: Always-on agent assistant accessible via Telegram, HTTP API, and CLI
- **Audience**: Developers who want an AI assistant that operates on their GitHub repos
- **Core pattern**: Messages arrive from channels → stored in SQLite → orchestrator groups into tasks → parallel Copilot SDK sessions process tasks → results reported back
- **Workspace model**: Dedicated sandboxed directory with cloned repos; never touches user's main environment

### Project Structure

```
src/
├── index.ts              # CLI entry point (Commander)
├── cli/                  # CLI commands (setup, start, doctor, send, dashboard)
├── agent/                # Copilot SDK runtime, orchestrator, task runner, custom tools
├── channels/             # Channel interface + implementations (Telegram, HTTP, CLI)
├── workspace/            # Repo management, config, persistence
├── db/                   # SQLite layer (messages, tasks, schedules)
└── utils/                # Logger
skills/                   # CawPilot runtime skills (user-selectable)
.agents/                  # Coding agent skills (for development, not runtime)
```

## Key Technologies and Frameworks

- **Runtime**: Node.js 24+, ESM only, TypeScript strict mode
- **Agent engine**: `@github/copilot-sdk` (Technical Preview) — sessions, custom tools, skills, streaming events
- **CLI**: Commander for commands, `@inquirer/prompts` for interactive setup, chalk for colors, ora for spinners
- **Channels**: grammy (Telegram), Express 5 (HTTP API), stdin/stdout (CLI)
- **Database**: better-sqlite3 for message/task persistence
- **Workspace**: GitHub CLI (`gh`) for auth and repo operations, git for branch management
- **Other**: zod for schema validation, localtunnel for tunnel skill

## Constraints and Requirements

- **ESM only** — no CommonJS. Use `.js` extensions in all local imports.
- **TypeScript strict mode** — `strict: true` in tsconfig.json
- **Node.js 24+** required
- **Copilot CLI must be installed** — the SDK communicates with it via JSON-RPC
- **Branch safety** — all git write operations must use `caw-*` prefix branches only. The workspace manager enforces this before any write operation.
- **Sandboxed workspace** — repos are cloned into the workspace directory. Never modify files outside the workspace.
- **`index.ts` is reserved for barrel exports** — no logic in index.ts files (except the root entry point)

## Development Workflow

### Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx (development)
npm start            # Run compiled output
npm run clean        # Remove dist/
```

### Running locally

```bash
# First time setup
npm install
npx tsx src/index.ts setup

# Start the bot
npx tsx src/index.ts start

# Send a test message
npx tsx src/index.ts send "hello"

# Check diagnostics
npx tsx src/index.ts doctor
```

### Key paths

- Config: `<workspace>/.cawpilot/config.json`
- Database: `<workspace>/.cawpilot/db.sqlite`
- Active skills: `<workspace>/.cawpilot/skills/`
- Task status: `<workspace>/TODO.md`

## Coding Guidelines

- **One component per file**, organized by domain (`channels/`, `agent/`, `db/`, etc.)
- **Use `.js` extensions** in all local imports (required for ESM): `import { foo } from './bar.js'`
- **Named exports** preferred over default exports
- **Interfaces over classes** where possible; use functions and closures
- **Error handling**: Validate at system boundaries (channel input, config loading, external APIs). Trust internal code.
- **No over-engineering**: Don't add abstractions, helpers, or error handling for scenarios that can't occur
- **Logging**: Use the shared logger from `utils/logger.ts`
- **Config types**: All configuration shapes defined in `workspace/config.ts`
- **Database**: All SQL in the `db/` module; other modules use the typed functions exported from there
- **Channel interface**: All channels implement the `Channel` interface from `channels/types.ts`

## Security Considerations

- **No secrets in code** — all credentials via environment variables or config file (gitignored)
- **Branch safety enforcement** — workspace manager rejects any git write operation not targeting a `caw-*` branch
- **Pairing codes** — channels use unique pairing codes for authentication; codes are single-use
- **Sandboxed operations** — the agent operates only within the workspace directory
- **Permission handling** — Copilot SDK tool executions are auto-approved since we control the environment
- **Input validation** — validate all channel input with zod before processing

## Pull Request Guidelines

- PRs created by CawPilot target `caw-*` branches
- Title format: `[CawPilot] <description>`
- Include a summary of changes and the originating user message
- All code changes should pass `npm run build` (TypeScript compilation)

## Debugging and Troubleshooting

- Run `cawpilot doctor` to verify: Copilot CLI installed, GitHub auth, repos accessible, channels configured, SQLite writable
- Set `LOG_LEVEL=debug` environment variable for verbose output
- SQLite database can be inspected directly at `<workspace>/.cawpilot/db.sqlite`
- Copilot SDK supports `logLevel: "debug"` for SDK-level debugging

## Workflow

When building new features or refactoring:

1. Identify the domain (`agent/`, `channels/`, `db/`, `cli/`, `workspace/`)
2. Create or modify files within that domain
3. Ensure all imports use `.js` extensions
4. Run `npm run build` to verify compilation
5. Test locally with `npx tsx src/index.ts <command>`
6. Update AGENTS.md and README.md if the change affects architecture, commands, or configuration
