---
name: local-tunnel
description: Create temporary public tunnels to expose local application ports for demos or sharing work in progress. Use when the user asks to share a local app, create a public URL for a port, set up a tunnel, or make a local server temporarily accessible from the internet.
---

# Local Tunnel

Create temporary public URLs that forward to local application ports, similar to ngrok. Useful for demos, sharing work in progress, or testing webhooks.

## Usage

When a user asks to expose a local port or create a public URL for a running application:

1. Confirm the local port number (must be > 4096 for security)
2. Start a tunnel using the localtunnel library
3. Report the public URL back to the user
4. Keep the tunnel open until the user asks to close it

## Important Rules

- **Port restriction**: Only expose ports > 4096. Refuse to tunnel system ports (0-4096) to prevent exposing sensitive services.
- **Temporary only**: Tunnels are meant as short-lived. Remind the user the URL will stop working when CawPilot stops.
- **Single tunnel per port**: Don't create duplicate tunnels for the same port.

## Example

User: "Create a tunnel for my app on port 5173"

Response: Start tunnel → Report URL like `https://xyz.loca.lt` → Confirm it's working

## Implementation Notes

Uses the `localtunnel` npm package. The tunnel runs in the CawPilot process and is automatically closed on shutdown.

```javascript
import localtunnel from 'localtunnel';
const tunnel = await localtunnel({ port: 5173 });
console.log(`Tunnel URL: ${tunnel.url}`);
// tunnel.close() when done
```
