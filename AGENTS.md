# cawpilot

Autonomous developer assistant built on GitHub Copilot SDK. Multi-channel (Telegram, HTTP, CLI) agent that manages code, branches, todo lists, and developer workflows through natural conversation.

## Overview

- **Purpose**: Always-on agent assistant accessible via Telegram, HTTP API, and CLI
- **Audience**: Developers who want an AI assistant that operates on their GitHub repos
- **Core pattern**: Messages arrive from channels → stored in SQLite → orchestrator groups into tasks → parallel Copilot SDK sessions process tasks → results reported back
- **Workspace model**: Dedicated sandboxed directory with cloned repos; never touches user's main environment
- **Channel security**: Telegram requires pairing via `/pair` command; HTTP requires API key in `X-Api-Key` header; CLI is always trusted
- **Cross-channel messaging**: Agent tools can send messages to any connected channel, not just the originating one

### Project Structure

```
src/
├── index.ts              # CLI entry point (Commander)
├── cli/                  # CLI commands (setup, start, doctor, send, dashboard)
│   ├── setup.ts          # Interactive onboarding (channels, repos, skills, model)
│   ├── start.ts          # Server startup, channel wiring, pairing system, dashboard
│   ├── doctor.ts         # Diagnostics (Copilot CLI, GitHub auth, config, DB)
│   ├── send.ts           # Queue a message from another terminal
│   └── dashboard.ts      # In-place refreshing dashboard with notification line
├── agent/                # Copilot SDK runtime, orchestrator, task runner, custom tools
│   ├── runtime.ts        # CopilotClient lifecycle, session factory, model listing
│   ├── orchestrator.ts   # Message polling, LLM-based task triage, parallel dispatch
│   ├── task-runner.ts    # Per-task Copilot session with tools and skills
│   └── tools.ts          # Custom tools: send_message, list_channels, update_task_status, create_branch, create_pull_request
├── channels/             # Channel interface + implementations
│   ├── types.ts          # Channel, ChannelMessage, PairCommandHandler interfaces
│   ├── cli.ts            # Readline-based CLI channel (always on, handles /pair)
│   ├── telegram.ts       # grammy bot with allow-list gating and /pair support
│   └── http.ts           # Express 5 API with API key auth (timing-safe comparison)
├── setup/                # Web-based setup wizard (for cloud/container deployment)
│   ├── server.ts         # Express server for setup mode (port 2243, serves web UI)
│   ├── routes.ts         # Setup API endpoints (auth, channels, models, skills, complete)
│   ├── copilot-auth.ts   # Copilot CLI device code relay via SSE
│   └── env-config.ts     # Env var resolution and step-skip detection
├── workspace/            # Repo management, config, persistence
│   ├── config.ts         # Config types (ChannelConfig, CawpilotConfig, WebConfig), load/save
│   ├── manager.ts        # Repo clone/pull, cp-* branch safety, GitHub CLI helpers
│   └── persistence.ts    # Optional GitHub repo sync for config backup
├── db/                   # SQLite layer (better-sqlite3, WAL mode)
│   ├── client.ts         # DB singleton, schema init
│   ├── messages.ts       # Message CRUD (create, unprocessed, mark processing/processed)
│   ├── tasks.ts          # Task CRUD (create, status updates, counts, active/all)
│   └── scheduled.ts      # Scheduled task CRUD (due detection, toggle, run tracking)
└── utils/
    └── logger.ts         # Leveled logger with enable/disable (suppressed in dashboard mode)
web/                      # Lit web components for setup wizard UI (Vite build)
├── index.html            # Entry HTML
├── package.json          # lit, vite, typescript
├── vite.config.ts        # Base /setup/, outputs to dist/web/
└── src/
    ├── main.ts           # Component registration
    ├── setup-app.ts      # Wizard stepper container
    ├── steps/            # Individual wizard step components
    │   ├── auth-step.ts       # GitHub + Copilot auth (SSE device code)
    │   ├── channels-step.ts   # Telegram/HTTP channel config
    │   ├── model-step.ts      # Model selection dropdown
    │   ├── skills-step.ts     # Skill checkboxes
    │   └── complete-step.ts   # Review + save + restart
    └── lib/
        ├── api.ts         # Fetch wrapper (auto-attaches X-Setup-Key)
        └── styles.ts      # Shared Lit CSS
skills/                   # cawpilot runtime skills (user-selectable)
cloud/                    # Cloud deployment configurations
└── azure/                # Azure Container Apps deployment (azd CLI)
    ├── azure.yaml        # azd service definition
    └── infra/
        ├── main.bicep            # AVM Bicep: ACA, ACR, storage, identity, secrets
        └── main.parameters.json  # Parameters (env name, tokens, image)
tests/                    # Vitest tests mirroring src/ structure
├── db/                   # messages, tasks, scheduled unit tests
├── workspace/            # config, manager unit tests
├── channels/             # telegram (allow-list), http (API key auth) tests
├── agent/                # tools (cross-channel send, list_channels, task status)
└── integration/          # Message→task pipeline, config round-trip, scheduled lifecycle
.agents/                  # Coding agent skills (for development, not runtime)
```

## Key Technologies and Frameworks

- **Runtime**: Node.js 24+, ESM only, TypeScript strict mode
- **Agent engine**: `@github/copilot-sdk` (Technical Preview) — sessions, custom tools, skills, streaming events, model listing
- **CLI**: Commander for commands, `@inquirer/prompts` for interactive setup (including model selection), chalk for colors, ora for spinners
- **Channels**: grammy (Telegram), Express 5 (HTTP API), readline (CLI)
- **Database**: better-sqlite3 for message/task persistence (WAL mode, in-memory for tests)
- **Testing**: vitest for unit and integration tests
- **Workspace**: GitHub CLI (`gh`) for auth and repo operations, git for branch management
- **Other**: zod for schema validation, localtunnel for tunnel skill
- **Web setup UI**: Lit web components, Vite for production build, served by Express in setup mode
- **Cloud deployment**: Azure Container Apps via azd CLI, Bicep with Azure Verified Modules (AVM)

## Constraints and Requirements

- **ESM only** — no CommonJS. Use `.js` extensions in all local imports.
- **TypeScript strict mode** — `strict: true` in tsconfig.json
- **Node.js 24+** required
- **Copilot CLI must be installed** — the SDK communicates with it via JSON-RPC. Setup verifies this.
- **Branch safety** — all git write operations must use `cp-*` prefix branches only. The workspace manager enforces this before any write operation.
- **Sandboxed workspace** — repos are cloned into the workspace directory. Never modify files outside the workspace.
- **`index.ts` is reserved for barrel exports** — no logic in index.ts files (except the root entry point)
- **Channel security** — Telegram messages from unlinked senders are silently dropped. HTTP requires API key. CLI is always trusted.

## Development Workflow

### Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/ and web UI to dist/web/
npm run build:web    # Build web setup UI only (Vite)
npm run dev          # Run with tsx (development)
npm start            # Run compiled output
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run clean        # Remove dist/
npm run lint         # Lint source files (xo)
```

### Running locally

```bash
# First time setup
npm install
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

### Key paths

- Config: `<workspace>/.cawpilot/config.json`
- Database: `<workspace>/.cawpilot/db/data.sqlite`
- Active skills: `<workspace>/.cawpilot/skills/`
- Task status: tracked in database, visible via `/status` command and dashboard

## Coding Guidelines

- **One component per file**, organized by domain (`channels/`, `agent/`, `db/`, etc.)
- **Use `.js` extensions** in all local imports (required for ESM): `import { foo } from './bar.js'`
- **Named exports** preferred over default exports
- **Interfaces over classes** where possible; use functions and closures
- **Error handling**: Validate at system boundaries (channel input, config loading, external APIs). Trust internal code.
- **No over-engineering**: Don't add abstractions, helpers, or error handling for scenarios that can't occur
- **Logging**: Use the shared logger from `utils/logger.ts`. Logger is **disabled by default** and only enabled when the `--debug` global flag is passed to any command. Never call `console.log` for debug output — always use `logger`.
- **Config types**: All configuration shapes defined in `workspace/config.ts`
- **Database**: All SQL in the `db/` module; other modules use the typed functions exported from there
- **Channel interface**: All channels implement the `Channel` interface from `channels/types.ts`. Channels support cross-channel messaging via the `send_message` tool.
- **Linting**: xo (ESLint + Prettier) via `npm run lint`. All code changes must pass lint before committing.
- **Testing**: Tests in `tests/` mirror `src/` structure. Use in-memory SQLite for DB tests. Use vitest.
- **No hardcoded branding in bot responses** — The agent's identity comes from `SOUL.md`, not from hardcoded "cawpilot" strings. Never include "cawpilot", product names, or branded prefixes/headers (e.g. `🤖 **cawpilot Status**`) in messages sent to users, task results, archive files, or prompts. The only places where "cawpilot" may appear are: CLI setup/onboarding, the dashboard UI, and doctor diagnostics. Internal type names (e.g. `CawpilotConfig`) and `.cawpilot/` paths are fine.
- **Terminal input sanitization** — The `updateValue()` function in `src/ui/input-line.tsx` is the **single chokepoint** for all value mutations in the dashboard input line. It filters out all non-printable characters (code point < 32 or = 127/DEL). This is critical because Ink's raw-mode stdin can leak invisible bytes (e.g. `\x7f` from macOS Backspace) into the value string, causing corrupted commands like `"toto\x7f\x7f\x7f\x7f/help"` → sent as `"toto/help"` instead of `"/help"`. **Never bypass this sanitization** by writing directly to `valueRef.current`. Always go through `updateValue()`. See regression tests in `tests/ui/input-line.test.ts`.

## Security Considerations

- **No secrets in code** — all credentials via environment variables or config file (gitignored)
- **No secrets in output** — never print tokens, API keys, or other secrets to the console during setup or at runtime. Use masked placeholders (e.g. `<see .cawpilot/config.json>`) instead.
- **Branch safety enforcement** — workspace manager rejects any git write operation not targeting a `cp-*` branch
- **Pairing system** — `/pair` generates 8-char codes (XXXX-XXXX) valid for 5 minutes. Only linked channels or CLI can generate codes. `/pair <code>` from an unlinked channel completes linking. Allow lists persisted to config.
- **HTTP API key** — generated during setup, required in `X-Api-Key` header, validated with timing-safe comparison
- **Web setup key** — generated in Bicep infra (`uniqueString`), passed as `SETUP_KEY` env var, required in `X-Setup-Key` header for all `/api/setup/*` routes, validated with timing-safe comparison
- **Web setup deactivation** — `web.setupEnabled` config flag set to `false` after setup completes; can be re-enabled manually in config.json
- **Unlinked message dropping** — Telegram messages from senders not in the allow list are silently dropped (never stored)
- **Sandboxed operations** — the agent operates only within the workspace directory
- **Permission handling** — Copilot SDK tool executions are auto-approved since we control the environment
- **Input validation** — validate all channel input with zod before processing

## Pull Request Guidelines

- PRs target `cp-*` branches
- Title format: `<description>`
- Include a summary of changes and the originating user message
- All code changes should pass `npm run build` and `npm test`

## Debugging and Troubleshooting

- Run `cawpilot doctor` to verify: Copilot CLI installed, GitHub auth, repos accessible, channels configured, SQLite writable
- Use `cawpilot start --debug` for verbose logging (dashboard mode suppresses logs by default)
- SQLite database can be inspected directly at `<workspace>/.cawpilot/db/data.sqlite`
- Copilot SDK supports `logLevel: "debug"` for SDK-level debugging
- Dashboard notification line shows pairing events, errors, and channel status

### Azure Deployment

```bash
# Deploy to Azure Container Apps (one command)
cd cloud/azure
azd up

# After deployment, azd outputs SETUP_URL — open it to complete setup
# Optionally pre-configure secrets:
azd env set GH_TOKEN ghp_...
azd env set TELEGRAM_TOKEN 123:ABC...
azd up
```

**Setup flow**: `azd up` → container starts in setup mode → open SETUP_URL → complete wizard (GitHub auth, Copilot auth via device code, channels, model, skills) → container restarts into normal mode.

**Environment variables** (optional, pre-fill/skip setup steps):
- `SETUP_KEY` — one-time setup wizard key (generated by Bicep)
- `GH_TOKEN` — GitHub personal access token (skips GH auth step if valid)
- `TELEGRAM_TOKEN` — Telegram bot token (pre-fills channel config)
- `COPILOT_MODEL` — default model ID override

### Web Setup Mode

When `SETUP_KEY` env var is present and either no config exists or `web.setupEnabled` is `true`, the `start` command enters **setup mode** instead of normal operation:
- Serves Lit web UI at `/setup/` on port 2243
- Exposes `/api/setup/*` routes (protected by setup key)
- After setup completes, sets `web.setupEnabled: false` and exits
- Container auto-restarts into normal mode

## Workflow

When building new features or refactoring:

1. Identify the domain (`agent/`, `channels/`, `db/`, `cli/`, `workspace/`)
2. Create or modify files within that domain
3. Ensure all imports use `.js` extensions
4. Run `npm run lint` to check for lint errors and fix any issues
5. Run `npm run build` to verify compilation
6. Test locally with `npx tsx src/index.ts <command>`
7. Update AGENTS.md and README.md if the change affects architecture, commands, or configuration
