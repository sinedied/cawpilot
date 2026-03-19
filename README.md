<div align="center">

# 🐦 CawPilot

**Your autonomous developer assistant, powered by GitHub Copilot SDK**

[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Copilot SDK](https://img.shields.io/badge/Copilot_SDK-Technical_Preview-8957E5?style=flat-square&logo=github&logoColor=white)](https://github.com/github/copilot-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Features](#features) · [Getting Started](#getting-started) · [Usage](#usage) · [Architecture](#architecture) · [Skills](#skills) · [Configuration](#configuration)

</div>

---

CawPilot is an always-on agent assistant that lives in your terminal and talks to you through Telegram, HTTP webhooks, or the CLI. It manages code, branches, todo lists, and everyday developer workflows through natural conversation — backed by GitHub Copilot's agentic runtime.

CawPilot operates in a dedicated sandboxed workspace, cloning your connected repositories and working exclusively in safe `cp-*` branches. It never touches your main branches directly.

## Features

- 🤖 **Copilot-powered agent runtime** — leverages the full Copilot SDK with planning, tool invocation, and code editing
- 💬 **Multi-channel** — Telegram, HTTP REST API, and CLI with a unified interface
- 🔀 **Parallel task processing** — groups related messages into tasks, processes up to 5 concurrently
- 🔒 **Branch safety** — only works in `cp-*` branches to protect your main codebase
- 🧩 **Modular skills** — extend capabilities with pluggable skills (following the Copilot SDK skill format)
- ⏰ **Scheduled tasks** — configure recurring tasks like daily standups, weekly code cleanups, and more
- 📋 **Todo tracking** — maintains a `TODO.md` with task status visible in your workspace
- 🔗 **GitHub-native** — creates pull requests, manages repos, and optionally persists config in a private repo
- 🌐 **Tunnel support** — expose local ports publicly for demos via the built-in local tunnel skill

## Getting Started

### Prerequisites

- [Node.js 24+](https://nodejs.org/)
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed and authenticated
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- A [GitHub Copilot subscription](https://github.com/features/copilot#pricing) (free tier available, or use BYOK mode)

### Installation

```bash
npm install -g cawpilot
```

Or clone and run locally:

```bash
git clone https://github.com/<your-user>/cawpilot.git
cd cawpilot
npm install
npm run build
```

### Setup

Run the interactive setup wizard:

```bash
cawpilot setup
```

This walks you through:

1. **Channel selection** — choose Telegram, HTTP API, or both (CLI is always available)
2. **GitHub authentication** — verify `gh` auth and select repositories to connect
3. **Persistence** — optionally store config in a private GitHub repo (default: `<user>/my-cawpilot`)
4. **Skills** — pick which skills to enable from the available set

### Start

```bash
cawpilot start
```

The bot starts and displays a minimal dashboard with uptime, active tasks, recent activity, and message count.

## Usage

### CLI Commands

| Command | Description |
|---------|-------------|
| `cawpilot setup` | Interactive onboarding and configuration |
| `cawpilot start` | Start the bot server with live dashboard |
| `cawpilot doctor` | Run diagnostics to verify configuration and connectivity |
| `cawpilot send <msg>` | Send a message to the bot from the CLI channel |

### Talking to CawPilot

Once started, send messages through any connected channel:

```
You: Create a new utility function to format dates in the api-server repo
CawPilot: I'll work on that. Creating branch cp-add-date-formatter...
         Done! I've created a PR with the changes: https://github.com/...
```

CawPilot will ask follow-up questions if it needs clarification.

### Telegram Setup

During `cawpilot setup`, if you select Telegram:
1. You'll need a [Telegram Bot Token](https://core.telegram.org/bots#botfather) from BotFather
2. A pairing code is generated — send it to your bot in Telegram to link your account

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      CawPilot Server                     │
│                                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │Telegram │  │HTTP API │  │  CLI    │   Channels        │
│  └────┬────┘  └────┬────┘  └────┬────┘                   │
│       └─────────────┼───────────┘                        │
│                     ▼                                    │
│              ┌──────────────┐                             │
│              │   SQLite DB  │  Message & task storage     │
│              └──────┬───────┘                             │
│                     ▼                                    │
│           ┌──────────────────┐                            │
│           │   Orchestrator   │  Triage & task creation    │
│           └────────┬─────────┘                            │
│          ┌─────────┼─────────┐                           │
│          ▼         ▼         ▼                           │
│    ┌──────────┐┌──────────┐┌──────────┐                  │
│    │ Task     ││ Task     ││ Task     │  Copilot SDK     │
│    │ Session  ││ Session  ││ Session  │  sessions        │
│    └──────────┘└──────────┘└──────────┘  (up to 5)       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Sandboxed Workspace                    │ │
│  │  repos/  .cawpilot/  TODO.md  skills/               │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Core flow:**
1. Messages arrive from channels → stored in SQLite
2. Orchestrator pulls unprocessed messages, groups them into tasks via the LLM
3. Each task gets its own Copilot SDK session with relevant context and skills
4. Sessions process tasks in parallel (up to 5 concurrent), report results back through channels
5. Task status is tracked in `TODO.md` and the database

## Skills

Skills are modular capabilities loaded at runtime. They follow the [Copilot SDK skill format](https://github.com/github/copilot-sdk/blob/main/docs/features/skills.md) (a directory with a `SKILL.md` file).

### Built-in Skills

| Skill | Description |
|-------|-------------|
| **local-tunnel** | Create temporary public tunnels to expose local ports for demos |

### Adding Custom Skills

1. Create a directory under `skills/` with a `SKILL.md` file
2. Run `cawpilot setup` to enable it
3. The skill is copied to the workspace and loaded by the agent at runtime

See `.agents/skills/skill-creator/SKILL.md` for the full skill authoring guide.

## Configuration

Configuration is stored in `<workspace>/.cawpilot/config.json` and includes:

- Connected channels and their credentials
- Selected repositories
- Enabled skills
- Scheduling rules
- Max task concurrency (default: 3, max: 5)

### Persistence

Optionally sync your configuration to a private GitHub repository (default: `<user>/my-cawpilot`). This allows you to:
- Restore configuration on a fresh install
- Share config across machines
- Version-control your setup

### BYOK (Bring Your Own Key)

CawPilot supports using your own API keys instead of a Copilot subscription. Configure a custom provider in the config file:

```json
{
  "provider": {
    "type": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-..."
  }
}
```

> [!NOTE]
> CawPilot is built on the GitHub Copilot SDK which is currently in **Technical Preview**. APIs may change.

## Docker

Running CawPilot in Docker provides isolation — the agent can only access the mounted workspace, not your system.

### Quick Start with Docker

```bash
# Build the image
npm run docker:build

# Run setup interactively
npm run docker:setup

# Start the bot
npm run docker:start
```

### Manual Docker Usage

```bash
# Build
docker build -t cawpilot .

# Setup (interactive, with workspace bind mount)
docker run -it --rm -v ./workspace:/workspace cawpilot setup

# Start (with workspace persistence and port for HTTP API)
docker run -it --rm \
  -v ./workspace:/workspace \
  -p 2243:2243 \
  cawpilot start
```

> [!TIP]
> The workspace is mounted as a bind volume so your configuration, database, and TODO list persist across container restarts.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CAWPILOT_WORKSPACE` | Workspace path inside container (default: `/workspace`) |
| `GH_TOKEN` | GitHub token for authentication (alternative to `gh auth login`) |

### GitHub Authentication in Docker

Since `gh auth login` is interactive, you can pass a token instead:

```bash
docker run -it --rm \
  -v ./workspace:/workspace \
  -e GH_TOKEN=ghp_your_token_here \
  cawpilot start
```

## Post-MVP Roadmap

- 🖥️ Web UI dashboard for configuration and interaction
-  More channels: Slack, Discord, email
- 🔍 More skills: code review, PR management, CI/CD monitoring
