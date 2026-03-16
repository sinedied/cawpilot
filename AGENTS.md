# CawPilot

On-call coding copilot that bridges GitHub Copilot's agent runtime with messaging platforms (Signal, WhatsApp, Telegram). Users interact via messaging apps; CawPilot manages code, branches, todo lists, and developer workflows through natural conversation.

## Overview

- **Purpose**: Allow developers to interact with Copilot's agentic workflows from their phone via messaging apps
- **Audience**: Developers who want remote access to an AI coding assistant via Signal/WhatsApp/Telegram
- **Architecture**: Node.js service → Copilot SDK (JSON-RPC to Copilot CLI) → messaging adapters → skill system
- **Monorepo**: No — single package

### Project Structure

```
src/
├── index.ts              # Main entry, initializes agent and messaging
├── cli/                  # Onboarding CLI (bin entry point)
│   ├── index.ts          # CLI commands (setup, start, config)
│   ├── setup.ts          # Interactive setup wizard
│   └── config.ts         # Config read/write helpers
├── core/
│   ├── agent.ts          # CopilotClient wrapper, session lifecycle
│   ├── session.ts        # Per-user session management
│   └── config.ts         # Config types and defaults
├── messaging/
│   ├── adapter.ts        # Abstract MessagingAdapter interface
│   ├── signal.ts         # Signal adapter (signal-sdk, built-in signal-cli)
│   ├── telegram.ts       # Telegram adapter (future)
│   └── whatsapp.ts       # WhatsApp adapter (Baileys, pure Node.js)
├── skills/
│   ├── registry.ts       # Loads skills from .cawpilot/skills/
│   ├── tunnel.ts         # Local tunnel skill (localtunnel)
│   ├── todo.ts           # Todo management (GitHub private repo)
│   ├── git.ts            # Git operations with branch safety
│   └── review.ts         # Code review skill
├── workspace/
│   ├── manager.ts        # Clone repos, manage workspace dirs
│   └── git.ts            # Git helpers (branch prefix, safe ops)
└── types/
    └── index.ts          # Shared types
skills/                   # Built-in skill templates (.md files)
docker/                   # Dockerfile and docker-compose.yml
```

## Key Technologies and Frameworks

- **Runtime**: Node.js 24+ with ESM modules
- **Language**: TypeScript 5.x (strict mode)
- **Agent engine**: `@github/copilot-sdk` — wraps Copilot CLI via JSON-RPC
- **Signal backend**: `signal-sdk` npm package — embeds signal-cli, auto-downloads binary on install
- **WhatsApp backend**: `@whiskeysockets/baileys` — pure Node.js/TypeScript WebSocket client for WhatsApp Web
- **GitHub auth**: GitHub CLI (`gh`) for authentication
- **GitHub API**: `octokit` / `@octokit/rest`
- **Git operations**: `simple-git`
- **CLI framework**: `commander` for CLI commands
- **Interactive prompts**: `inquirer` or `@inquirer/prompts`
- **Schema validation**: `zod` (also used for Copilot SDK tool definitions)
- **Local tunnel**: `localtunnel` npm package
- **Build**: `tsc` with ESM output
- **Testing**: `vitest`
- **Linting**: `eslint` with flat config

## Constraints and Requirements

- **ESM only**: All imports must use ESM syntax. No CommonJS `require()`. Use `.js` extensions in relative imports.
- **Branch safety**: The agent must NEVER commit or push to `main` (or any protected branch). All work happens on branches matching the configured prefix (default: `ocp-*`). Enforce this in `workspace/git.ts`.
- **Port restrictions**: The tunnel skill only allows exposing ports > 4096 to avoid accidentally exposing system services.
- **Messaging adapter interface**: All messaging platforms implement the same `MessagingAdapter` interface from `messaging/adapter.ts`. This enables swapping platforms without changing core logic.
- **Skill isolation**: CawPilot skills (in `.cawpilot/skills/`) are separate from coding agent skills (in `.agents/skills/`). Do not mix them.
- **Config location**: User config lives in `.cawpilot/config.json` in the project root or `~/.cawpilot/config.json` globally.

## Challenges and Mitigation Strategies

- **Copilot CLI dependency**: The SDK requires `copilot` CLI in PATH. Docker image must include it. For local dev, document installation steps clearly.
- **Signal linking**: signal-sdk uses signal-cli's built-in device linking which displays a QR code in the terminal. The onboarding CLI triggers this via `signal.deviceLink()`. On macOS/Windows, Java 25+ is required; on Linux the native binary is used.
- **Long-running sessions**: Copilot sessions can be long-lived. Use infinite sessions with auto-compaction. Handle reconnection gracefully.
- **Message size limits**: Signal has message size limits. Long agent responses must be chunked into multiple messages.

## Development Workflow

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (with watch)
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Run the CLI
npm run cli -- setup    # Interactive setup
npm run cli -- start    # Start the bot

# Docker (full stack)
docker compose up -d
docker compose exec cawpilot cawpilot setup
```

## Coding Guidelines

- Use **ESM** imports everywhere (no CommonJS)
- Use `async/await` consistently, never raw `.then()` chains
- Use `zod` for all external input validation (config files, API responses, user input)
- Define Copilot SDK tools with `defineTool()` and Zod schemas
- Error handling: throw typed errors, catch at boundaries (messaging adapter, CLI)
- Prefer `interface` over `type` for object shapes that may be extended
- Use `readonly` for properties that shouldn't be mutated
- File naming: `kebab-case.ts` for all source files
- Functions: use descriptive names, keep functions small and focused
- No `any` — use `unknown` and narrow types explicitly
- Git commits: conventional commits format (`feat:`, `fix:`, `docs:`, etc.)

## Security Considerations

- **Never store secrets in config files** — use environment variables for GitHub tokens and API keys
- **Branch protection enforcement** is done in code, not just by convention — `workspace/git.ts` must reject operations on protected branches
- **Signal phone numbers** are sensitive — do not log them, store them encrypted if persisted
- **Tunnel URLs** are temporary and should be torn down when no longer needed. Log tunnel creation/destruction events.
- **GitHub token scope**: Request minimum necessary permissions (repo, gist for todo)

## Pull Request Guidelines

- Title format: `type(scope): description` (e.g., `feat(signal): add message chunking`)
- All PRs must pass CI (lint + test)
- PRs should target `main` branch
- Include tests for new features
- Update AGENTS.md and README.md if architecture or workflow changes

## Debugging and Troubleshooting

- Set `LOG_LEVEL=debug` environment variable for verbose logging
- Copilot SDK telemetry: configure `otlpEndpoint` in agent config for distributed tracing
- Signal API: check `http://localhost:8080/v1/about` for signal-cli-rest-api health
- Common issue: Copilot CLI not in PATH → run `which copilot` to verify
- Common issue: Signal device unlinked → re-run `cawpilot setup` and re-scan QR code

## Workflow

A typical development workflow:

1. Pick a feature or issue to work on
2. Create a branch: `git checkout -b feat/description`
3. Implement the change with tests
4. Run `npm test && npm run lint` to verify
5. Update AGENTS.md and README.md if the change affects architecture, commands, or project structure
6. Commit with conventional commit message
7. Open a PR targeting `main`

When the agent works on code (through messaging), it follows this workflow:
1. Receive a user message from Signal
2. Route to the correct skill or general Copilot session
3. Execute in a `ocp-*` branch in the workspace
4. Report results back via messaging
5. Optionally create a PR if explicitly asked
