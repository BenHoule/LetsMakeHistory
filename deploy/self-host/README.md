# Self-Hosted Internet Setup (Caddy)

This folder contains a one-command Windows helper to publish your game on the internet.

## Why this is safer than port-forwarding 3000

- Players connect over HTTPS on port 443.
- TLS certificates are automatic.
- Your app stays private on localhost:3000.
- Basic hardening headers and request size limits are enabled in the reverse proxy.

## Quick Start (Windows, one command)

Run this script in an elevated PowerShell terminal from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\self-host\setup-caddy-windows.ps1
```

The script will:

1. Install Caddy (via winget, if missing).
2. Install NSSM (via winget, if missing) to run Caddy as a Windows service.
3. Prompt for setup mode:
  - Domain mode (recommended, trusted HTTPS)
  - Public IP mode (free, HTTP only)
3. In public IP mode, choose the external port to publish (for example `8025`).
4. Write a domain/IP specific Caddyfile.
5. Install and start Caddy as a Windows service.
6. Write the app invite settings into the Windows user-data folder automatically.
7. Show the exact app invite settings and file paths for verification.

## Known-Good Public IP Setup (no domain)

Use this when you want the simplest internet share path and accept HTTP (no TLS).

1. Run the helper in elevated PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\self-host\setup-caddy-windows.ps1
```

2. Choose `Public IP mode`.
3. Enter your public IP and choose an external listening port (example `8025`).
4. Confirm generated proxy mapping is:
   - Caddy listens on `PUBLIC_IP:8025`
   - Caddy proxies to local app `127.0.0.1:3000`
5. Forward router TCP `8025` -> host machine TCP `8025`.
6. Allow inbound firewall TCP `8025` (Private profile at minimum).
7. Confirm invite settings include the same base URL/port:

```json
{
  "publicBaseUrl": "http://YOUR_PUBLIC_IP:8025",
  "autoDetectPublicIp": false,
  "publicPort": 8025
}
```

8. Restart the app and copy `Player Link (Internet)`.

Expected link format:

`http://YOUR_PUBLIC_IP:8025/lobby?session=...`

## Prerequisites

1. Let's Make History desktop app installed and running locally.
2. Router access for port forwarding.
3. Windows firewall access.

### Do I need a domain?

No, but there is a tradeoff:

- Domain mode: trusted HTTPS (best security, still can be free if you use a free DDNS hostname).
- Public IP mode: no domain needed, but HTTP only (not encrypted, weaker security). You must forward the same external port you choose in the helper.

If your goal is fully free and still secure, use a free DDNS hostname (for example DuckDNS, No-IP free tier), then run domain mode.

## Manual Setup (optional)

If you do not want to use the helper script, follow these steps.

## Step 1: DNS (domain mode only)

Create an `A` record:

- Host: `game` (or your chosen subdomain)
- Value: your public IPv4 address

Example public URL: `https://game.example.com`

## Step 2: Install Caddy (Windows)

Install with winget:

```powershell
winget install --id CaddyServer.Caddy -e --accept-package-agreements --accept-source-agreements
```

## Step 3: Configure Caddy

1. Copy `deploy/self-host/Caddyfile` to a stable location (or use it in-place).
2. Edit the domain line:
   - Replace `game.example.com` with your real hostname.
3. (Optional) Update `email` in the global block.

## Step 4: Start Caddy

Run in a terminal (for testing):

```powershell
caddy run --config "C:\path\to\Caddyfile"
```

If successful, Caddy will obtain TLS certificates automatically.

## Step 5: Router + firewall

1. Port-forward TCP `80` -> your host machine.
2. Port-forward TCP `443` -> your host machine.
3. Ensure no direct public forwarding for port `3000`.

For public IP mode, forward only your chosen HTTP port (for example `3000`) and use `http://PUBLIC_IP:PORT`.
If you chose `8025` in the helper, forward TCP `8025` to the host and share `http://PUBLIC_IP:8025/lobby`.

Important: many routers do not support NAT loopback (hairpin NAT). If you test from the same home network using your own public IP, it may fail even when internet access works for external players. Validate from an external network (for example phone cellular).

## Step 6: App invite settings

In the app tray menu:

1. Open `invite-settings.json`.
2. Set:

```json
{
  "publicBaseUrl": "https://game.example.com",
  "autoDetectPublicIp": false,
  "publicPort": 443
}
```

For public IP mode with a custom port, use the same port in `publicPort` and include it in `publicBaseUrl`, for example `"http://98.110.150.109:8025"` with `"publicPort": 8025`.

3. Save and restart the app.
4. Use `Copy Player Link (Internet)`.

## Ongoing security checklist

- Keep Windows and Caddy updated.
- Keep your domain DNS record current if your public IP changes.
- Do not expose port `3000` publicly.
- Use strong admin credentials on your router.

## Troubleshooting Checklist

If public IP still fails, verify in this order:

1. App is listening locally:

```powershell
Test-NetConnection 127.0.0.1 -Port 3000
```

2. Caddy is listening on your external port (example `8025`):

```powershell
Test-NetConnection 127.0.0.1 -Port 8025
```

3. Caddyfile has the correct direction:
  - `http://YOUR_PUBLIC_IP:8025 { ... reverse_proxy 127.0.0.1:3000 }`
  - Not reversed.

4. Service is active:

```powershell
Get-Service caddy
```

5. Firewall rule exists for the external port.
6. Router forwards WAN `8025` -> LAN host `8025`.
7. Test externally (not from same LAN).

## Multiplayer Join Integrity

If multiple players appear to control the same senator, this is most often caused by concurrent seat claims.

Server-side protections now include:

1. Immediate transaction for seat selection + claim + player insert.
2. Unique DB index on `players(senator_id)` so one seat cannot map to multiple players.

Operational advice:

- Keep server binaries and DB migrations up to date after pulling changes.
- If you already had a corrupted old DB with duplicate seat mappings, start a fresh session database.

## Files

- `deploy/self-host/setup-caddy-windows.ps1` — one-command setup helper
- `deploy/self-host/Caddyfile` — manual template config
