# Development

Guide for setting up a local development environment and contributing to cawpilot.

## Prerequisites

- [Node.js 24+](https://nodejs.org/)
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed and authenticated
- A [GitHub Copilot subscription](https://github.com/features/copilot#pricing) (free tier available)

## Setup

```bash
git clone https://github.com/sinedied/cawpilot.git
cd cawpilot
npm install
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` and web UI to `dist/web/` |
| `npm run build:web` | Build web setup UI only (Vite) |
| `npm run dev` | Run with tsx (development) |
| `npm start` | Run compiled output |
| `npm test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Remove `dist/` |
| `npm run lint` | Lint source files (xo) |
| `npm run lint:fix` | Lint and auto-fix |

## Running Locally

```bash
# First time setup
npx tsx src/index.ts setup

# Start the bot (dashboard mode)
npx tsx src/index.ts start

# Start with debug logging
npx tsx src/index.ts start --debug

# Send a test message (from another terminal)
npx tsx src/index.ts send "hello"

# Check diagnostics
npx tsx src/index.ts doctor
```

## Project Structure

```
src/
├── index.ts              # CLI entry point (Commander)
├── agent/                # Copilot SDK runtime, orchestrator, task runner, tools
├── channels/             # Channel interface + implementations (Telegram, HTTP, CLI)
├── cli/                  # CLI commands (setup, start, doctor, send, dashboard)
├── commands/             # Slash commands (cancel, help, pair, status)
├── db/                   # SQLite layer (better-sqlite3, WAL mode)
├── providers/            # LLM providers (Copilot SDK, BYOK)
├── setup/                # Web-based setup wizard (for cloud/container deployment)
├── ui/                   # Ink (React) dashboard components
├── utils/                # Logger, signals, Docker helpers
└── workspace/            # Repo management, config, persistence, safety
web/                      # Lit web components for setup wizard UI (Vite build)
skills/                   # Runtime skills (user-selectable)
templates/                # Default config templates (SOUL.md, BOOTSTRAP.md, etc.)
tests/                    # Vitest tests mirroring src/ structure
cloud/azure/              # Azure Container Apps deployment (azd CLI)
```

## Coding Guidelines

- **ESM only** — no CommonJS. Use `.js` extensions in all local imports.
- **TypeScript strict mode** — `strict: true` in tsconfig.json
- **Named exports** preferred over default exports
- **Interfaces over classes** where possible; use functions and closures
- **One component per file**, organized by domain
- **Logging** — use the shared logger from `utils/logger.ts`, never `console.log`
- **Testing** — tests in `tests/` mirror `src/` structure; use in-memory SQLite for DB tests

## Debugging

- Run `cawpilot doctor` to verify: Copilot CLI installed, GitHub auth, repos accessible, channels configured, SQLite writable
- Use `cawpilot start --debug` for verbose logging
- SQLite database can be inspected directly at `<workspace>/.cawpilot/db/data.sqlite`
- Copilot SDK supports `logLevel: "debug"` for SDK-level debugging

## Pull Requests

- All code changes should pass `npm run build` and `npm test`
- Run `npm run lint` before committing
