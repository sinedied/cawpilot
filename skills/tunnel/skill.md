---
name: tunnel
description: Create temporary public URLs for local ports (>4096) to share work in progress or demos using localtunnel. Use when the user wants to expose a local service, share a dev server, or create a temporary URL for a demo.
---

# Tunnel Skill

Create temporary public URLs for local ports to share work in progress or demos.

## Usage

Ask CawPilot to expose a local port:
- "Create a tunnel to port 3000"
- "Share my dev server on port 8080"
- "Stop the tunnel"

## Rules

- Only expose ports > 4096 (to protect system services)
- Tunnels are temporary and will be closed when CawPilot stops
- Share the tunnel URL with caution — it provides public access to the local port
- Only one tunnel per port at a time
