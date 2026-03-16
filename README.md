<div align="center">

# 🐦 CawPilot

**Your on-call coding copilot, right in your messaging app.**

[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Copilot SDK](https://img.shields.io/badge/Copilot_SDK-v0.1.x-000?style=flat-square&logo=github&logoColor=white)](https://github.com/github/copilot-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

CawPilot connects GitHub Copilot's agentic engine to your messaging apps — talk to your code from Signal, WhatsApp, or Telegram.

[Getting Started](#getting-started) · [Features](#features) · [Architecture](#architecture) · [Skills](#skills) · [Docker](#docker) · [Configuration](#configuration)

</div>

---

## Overview

CawPilot is an on-call coding assistant that bridges GitHub Copilot's agent runtime with messaging platforms. Send a message from Signal and CawPilot will read your repos, write code, create branches, manage your todo list, and even spin up a temporary public URL to share your work — all through natural conversation.

Built on the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) for Node.js, CawPilot wraps Copilot's production-tested planning, tool invocation, and file editing into a bot you can reach from your phone.

## Features

- **💬 Messaging integration** — Chat with your copilot from Signal (MVP), with WhatsApp and Telegram planned
- **🤖 Copilot-powered agent** — Full access to Copilot's agentic workflows: planning, code edits, tool calling, and more
- **🔧 Interactive onboarding CLI** — Guided setup to connect messaging platforms, link GitHub repos, and choose skills
- **📂 Dedicated workspace** — Clone and manage connected repositories in an isolated workspace
- **🌿 Safe branching** — Only works in `ocp-*` branches (customizable prefix), never commits to main
- **📋 Todo management** — Personal task tracking via `todo.md` in a private GitHub repo
- **🔌 Skill system** — Extensible skills loaded from `.cawpilot/skills/`, with built-in templates
- **🌐 Local tunnel** — Expose any local port (>4096) to a temporary public URL for demos and sharing
- **🐳 Docker-ready** — Run locally or in the cloud with Docker Compose

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or later
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed and in your PATH
- A [GitHub Copilot subscription](https://github.com/features/copilot#pricing) (free tier available)
- Java 25+ (macOS/Windows only — Linux uses native signal-cli binary)

### Installation

```bash
npm install -g cawpilot
```

### Quick Start

1. **Run the setup wizard:**

   ```bash
   cawpilot setup
   ```

   The interactive CLI will guide you through:
   - Connecting a messaging platform (Signal for MVP)
   - Authenticating with GitHub and selecting repositories
   - Choosing which skills to enable

2. **Start the bot:**

   ```bash
   cawpilot start
   ```

3. **Send a message** from Signal to your linked number — CawPilot takes it from there.

### Docker Quick Start

```bash
# Clone the repo
git clone https://github.com/sinedied/cawpilot.git
cd cawpilot

# Run with Docker Compose
docker compose up -d

# Then run setup inside the container
docker compose exec cawpilot cawpilot setup
```

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Signal /   │────▶│    CawPilot      │────▶│  Copilot CLI    │
│  WhatsApp /  │◀────│   (Node.js)      │◀────│  (JSON-RPC)     │
│  Telegram    │     │                  │     └─────────────────┘
└─────────────┘     │  ┌────────────┐  │     ┌─────────────────┐
                    │  │  Skills    │  │────▶│  GitHub API      │
                    │  │  Registry  │  │     │  (Octokit)       │
                    │  └────────────┘  │     └─────────────────┘
                    │  ┌────────────┐  │     ┌─────────────────┐
                    │  │ Workspace  │  │────▶│  Git Repos       │
                    │  │ Manager    │  │     │  (ocp-* branches)│
                    │  └────────────┘  │     └─────────────────┘
                    └──────────────────┘
```

**Core components:**

| Component | Description |
|---|---|
| **Messaging Adapters** | Pluggable adapters for Signal (via built-in signal-cli) and WhatsApp (via Baileys), with Telegram planned |
| **Agent Core** | Wraps the Copilot SDK — manages sessions, tools, hooks, and system prompts |
| **Skill Registry** | Loads and manages skills from `.cawpilot/skills/` |
| **Workspace Manager** | Clones repos, manages branches with safe prefix enforcement |
| **Onboarding CLI** | Interactive setup wizard for first-time configuration |

### Signal Integration

CawPilot uses [signal-sdk](https://github.com/benoitpetit/signal-sdk) which embeds signal-cli directly — no separate Docker container or external service needed. On install, the correct signal-cli binary is downloaded automatically. The setup wizard links CawPilot as a secondary Signal device via QR code — no new phone number required.

### WhatsApp Integration

CawPilot uses [Baileys](https://github.com/WhiskeySockets/Baileys) — a pure Node.js/TypeScript library that communicates with WhatsApp Web via WebSocket. No browser, no Puppeteer, no external binaries. On first start, a QR code appears in the terminal to link as a secondary device.

## Skills

Skills extend CawPilot's capabilities beyond basic code assistance. They are loaded from `.cawpilot/skills/` in the workspace.

### Built-in Skills

| Skill | Description |
|---|---|
| **tunnel** | Create a temporary public URL for any local port (>4096) using localtunnel |
| **todo** | Manage a personal todo list in `todo.md` on a private GitHub repo |
| **review** | Review code changes and provide feedback |
| **git** | Git operations with branch prefix enforcement |

### Custom Skills

Create your own skills by adding a directory under `.cawpilot/skills/`:

```
.cawpilot/skills/
└── my-skill/
    └── skill.md    # Skill definition and instructions
```

Skills are separate from the coding agent's `.agents/skills/` — they are specifically for CawPilot's messaging-driven workflows.

## Configuration

Configuration is stored in `.cawpilot/config.json`:

```jsonc
{
  "messaging": {
    "platform": "signal",
    "signalPhoneNumber": "+1234567890"
  },
  "github": {
    "repos": ["owner/repo-1", "owner/repo-2"],
    "todoRepo": "owner/todo"
  },
  "workspace": {
    "path": "./workspace"
  },
  "branching": {
    "prefix": "ocp-"
  },
  "skills": ["tunnel", "todo", "review", "git"]
}
```

### Environment Variables

| Variable | Description |
|---|---|
| `SIGNAL_PHONE_NUMBER` | Your Signal phone number (international format) |
| `CAWPILOT_BRANCH_PREFIX` | Branch prefix override (default: `ocp-`) |

## Docker

The `docker-compose.yml` runs CawPilot as a self-contained service (signal-cli is embedded):

```yaml
services:
  cawpilot:
    build: .
    volumes:
      - ./workspace:/app/workspace
      - ./.cawpilot:/app/.cawpilot
      - signal-data:/root/.local/share/signal-cli
    environment:
      - GITHUB_TOKEN
      - SIGNAL_PHONE_NUMBER

volumes:
  signal-data:
```

## Project Structure

```
cawpilot/
├── src/
│   ├── index.ts              # Main entry point
│   ├── cli/                  # Onboarding CLI tool
│   ├── core/                 # Copilot SDK agent, sessions, config
│   ├── messaging/            # Messaging platform adapters
│   ├── skills/               # Skill registry and built-in skills
│   ├── workspace/            # Repo and Git workspace management
│   └── types/                # Shared TypeScript types
├── skills/                   # Built-in skill templates
├── docker/                   # Docker and Compose files
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Roadmap

- [x] Project architecture and planning
- [ ] Core agent with Copilot SDK integration
- [ ] Signal messaging adapter
- [ ] Onboarding CLI wizard
- [ ] Workspace and Git management
- [ ] Skill system with registry
- [ ] Built-in skills (tunnel, todo, review, git)
- [ ] Docker Compose deployment
- [ ] WhatsApp adapter
- [ ] Telegram adapter
- [ ] Cloud deployment guide

## License

[MIT](LICENSE)
