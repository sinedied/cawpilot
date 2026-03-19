---
name: local-tunnel
description: Create temporary public tunnels to expose local application ports for demos or sharing work in progress. Use when the user asks to share a local app, create a public URL for a port, set up a tunnel, or make a local server temporarily accessible from the internet.
---

# Local Tunnel

Create temporary public URLs that forward to local application ports, similar to ngrok. Useful for demos, sharing work in progress, or testing webhooks.

## Usage

When a user asks to expose a local port or create a public URL for a running application:

1. Confirm the local port number (must be > 1024 for security)
2. Start a tunnel using `npx localtunnel` as a background process
3. Report the public URL **and the password** back to the user (see Password section)
4. Create a scheduled task to stop the tunnel after 15 minutes (unless the user specifies a different duration)

## Important Rules

- **Port restriction**: Only expose ports > 1024. Refuse to tunnel privileged ports (0-1024) to prevent exposing sensitive services.
- **Temporary only**: Tunnels are short-lived. Default duration is **15 minutes**. Always create a scheduled task to stop the tunnel after the specified duration. If the user requests a different duration, use that instead.
- **Single tunnel per port**: Don't create duplicate tunnels for the same port.
- **Always communicate the password**: A password is required to access the tunneled port. You **must** always include the password when sending the public URL to the user (see Password section below).

## Password

Localtunnel requires visitors to enter a password before accessing the tunnel. The password is the **public IP address** of the host. You can retrieve it with:

```bash
curl -s https://loca.lt/mytunnelpassword
```

When reporting the tunnel URL, always include the password. Example message:

> Your app is now publicly accessible at: `https://xyz.loca.lt`
> Password to access: `203.0.113.42`
> The tunnel will automatically close in 15 minutes.

## Auto-Close via Scheduled Task

After starting a tunnel, create a scheduled task that will stop it after the configured duration (default: 15 minutes). Use a one-shot scheduled task with the appropriate `next_run` time. The task prompt should instruct to close the tunnel for the specific port.

## Example

User: "Create a tunnel for my app on port 5173"

1. Start the tunnel
2. Fetch the tunnel password (public IP)
3. Send the user the URL + password
4. Schedule a task to close the tunnel in 15 minutes

Response example:
> Your app is now publicly accessible at: `https://xyz.loca.lt`
> Password: `203.0.113.42`
> The tunnel will automatically close in 15 minutes.

## Implementation Notes

Run localtunnel via `npx` as a background shell process. To stop the tunnel, kill the process.

```bash
# Start tunnel (run as background process)
npx -y localtunnel --port 5173

# Fetch the password (public IP)
curl -s https://loca.lt/mytunnelpassword
```

To close the tunnel, kill the background `npx localtunnel` process for the corresponding port.
