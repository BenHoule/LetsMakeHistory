# Let's Make History

A multiplayer political senator tabletop-RPG companion app set in alternate 1901 America.  
One player is the **Game Master (GM)**; everyone else plays a **US Senator**.  
The GM runs the companion on their own computer; all other players connect through a web browser — no installation required on their end.

---

## Table of Contents

1. [Playing the Game (no installation needed)](#playing-the-game)
2. [Hosting — Running the App](#hosting--running-the-app)
3. [Developer Setup](#developer-setup)
4. [Building a Distributable Installer](#building-a-distributable-installer)
5. [Contributing](#contributing)
6. [License](#license)

---

## Playing the Game

**Players:** You do not need to install anything.  
Your GM will send you a link that looks like `http://192.168.x.x:3000/lobby`.  
Open it in any modern web browser (Chrome, Firefox, Safari, Edge).

**GM:** Follow the [Hosting](#hosting--running-the-app) section below.

---

## Hosting — Running the App

> These instructions are for the GM who will run the server.  
> Players only need a browser link — see above.

### Option A — Download the Installer (Recommended)

1. Go to the **Releases** page on GitHub and download the installer for your operating system:
   - **Windows:** `LetsM akeHistory-Setup-x.x.x.exe`
   - **macOS:** `LMHistory-x.x.x.dmg`
   - **Linux:** `LMHistory-x.x.x.AppImage`

2. Run the installer and follow the on-screen prompts.

3. Launch **Let's Make History** from your desktop or Start Menu.

4. A browser window will open automatically showing the GM dashboard.  
   A **system tray icon** (bottom-right on Windows, top-right on macOS) appears.

5. Right-click the tray icon and choose **"Copy Player Link (LAN)"**.  
   Send that link to your players — they open it in their browsers.

> **Troubleshooting:** If players can't connect, make sure your computer's firewall  
> allows connections on port **3000** from your local network.  
> On Windows: Start → "Windows Defender Firewall" → "Allow an app through firewall" → add "Let's Make History".

---

## Developer Setup

### Quick Setup (Automated)

We provide an automated setup script that installs all dependencies for your OS:

```bash
bash setup.sh
```

This script will:
- Detect your operating system
- Install Node.js 20 LTS (if needed)
- Install pnpm globally (if needed)
- Install build tools (Visual Studio Build Tools on Windows, Xcode on macOS, build-essential on Linux)

> **macOS users:** You need Homebrew first. Install from https://brew.sh  
> **Windows users:** You need Node.js pre-installed. Download from https://nodejs.org (LTS version)

After the script completes, you're ready to develop. Skip to [Step 4 (Clone the Repository)](#step-4--clone-the-repository).

---

### Manual Setup (If Preferred)

If you prefer to install dependencies manually, follow these steps exactly, in order. Each step has an explanation of what it does.

### Prerequisites

You need two free tools installed on your computer before you begin.

#### Step 1 — Install Node.js

Node.js is the engine that runs the server code.

1. Go to **https://nodejs.org** and download the **"LTS"** version (the green button).
2. Run the installer. Accept all defaults. Click "Next" until it finishes.
3. Verify it worked: open a terminal (see below) and type:
   ```
   node --version
   ```
   You should see something like `v20.x.x`. If you see an error, restart your computer and try again.

> **Opening a terminal:**  
> - **Windows:** Press `Win + R`, type `cmd`, press Enter. Or search "Command Prompt" in Start.  
> - **macOS:** Press `Cmd + Space`, type "Terminal", press Enter.  
> - **Linux:** Press `Ctrl + Alt + T`.

#### Step 2 — Install pnpm

pnpm is the package manager used by this project (similar to npm but faster).

In your terminal, type exactly:
```
npm install -g pnpm
```
Press Enter and wait for it to finish. Verify:
```
pnpm --version
```
You should see `9.x.x` or higher.

#### Step 3 — Clone the Repository

"Cloning" means downloading the project code to your computer.

If you have **Git** installed:
```bash
git clone https://github.com/YOUR_USERNAME/lmhistory.git
cd lmhistory/root
```

If you don't have Git, click the green **"Code"** button on the GitHub page, choose **"Download ZIP"**, extract it, then open a terminal and navigate into the `root/` folder inside.

#### Step 4 — Install Project Dependencies

This downloads all the libraries the project needs. Run this once:
```bash
pnpm install
```
This may take a few minutes on the first run. You will see a lot of text — this is normal.

#### Step 5 — Configure Environment Variables

The client needs to know where to find the server.

1. In the `packages/client/` folder, you will find a file called `.env`.  
   It should already contain:
   ```
   PUBLIC_WS_URL=http://localhost:3001
   PUBLIC_API_URL=http://localhost:3001
   ```
   If the file does not exist, create it with exactly that content.

#### Step 6 — Run the Development Servers

You need two terminal windows open at the same time.

**Terminal 1 — Start the server:**
```bash
cd packages/server
pnpm run dev
```
You should see: `Server is running on port 3001`

**Terminal 2 — Start the client:**
```bash
cd packages/client
pnpm run dev
```
You should see a URL like `http://localhost:5173` — open that in your browser.

> Both terminals must stay open while you work. Closing either one stops that part of the app.

#### Step 7 — Verify Everything Works

1. Open `http://localhost:5173` in your browser.
2. You should see the **Let's Make History** lobby page.
3. Create a session and check the GM dashboard loads.

---

## Building a Distributable Installer

These instructions let you create an `.exe` (Windows), `.dmg` (macOS), or `.AppImage` (Linux)  
that anyone can run without installing Node.js or any other tools.

### Additional Prerequisites for Building

In addition to the [Developer Setup](#developer-setup) prerequisites above, you need:

**On Windows:**
1. Install **Visual Studio Build Tools** (free):  
   https://visualstudio.microsoft.com/visual-cpp-build-tools/  
   During installation, check **"Desktop development with C++"** and click Install.  
   This is needed to compile the SQLite native module for Electron.  
   *This download is about 6 GB and may take 20–30 minutes.*

**On macOS:**
1. Open Terminal and run:
   ```
   xcode-select --install
   ```
   A dialog will appear — click "Install". This takes about 5 minutes.

**On Linux:**
1. Run:
   ```bash
   sudo apt-get install -y python3 make g++ libx11-dev libxkbfile-dev
   ```
   (Adjust for your distro if not Debian/Ubuntu.)

### Add Your App Icon (Optional but Recommended)

1. Design or find a 1024×1024 PNG image for your icon.
2. Convert it to the required formats using a free online tool:
   - https://cloudconvert.com/png-to-ico  → save as `icon.ico`  
   - https://cloudconvert.com/png-to-icns → save as `icon.icns`
3. Place all three files in `packages/electron/icons/`:
   - `icon.png` (original)
   - `icon.ico` (Windows)
   - `icon.icns` (macOS)

### Run the Build Script

Open a terminal, navigate to the `root/` folder of the project, and run:

```bash
# Build for your current operating system:
bash build-dist.sh

# Or target a specific platform:
bash build-dist.sh --linux          # Linux AppImage
bash build-dist.sh --win            # Windows NSIS installer
bash build-dist.sh --win-dir        # Windows unpacked dir (no installer, for testing)
bash build-dist.sh --mac            # macOS DMG (must run on macOS for notarization)
```

#### Platform-Specific Notes

**Windows via WSL2 or Git Bash:**
```bash
bash build-dist.sh --win
```
- If running in **WSL2**, the script automatically detects it and outputs an unpacked Windows app directory (skips the NSIS installer to avoid Wine issues).
- To create the final `.exe` installer, copy the app from `dist/win-unpacked/` to a Windows machine with `electron-builder` installed, or download a pre-built installer from the releases page.
- Alternatively, run the build **natively on Windows** with Node.js installed.

**Windows via native Linux (non-WSL2):**
Requires wine32 multiarch (one-time setup):
```bash
# One-time setup:
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y wine32:i386
WINEPREFIX=~/.wine32 WINEARCH=win32 wineboot --init

# Then build (always include WINEPREFIX=):
WINEPREFIX=~/.wine32 WINEARCH=win32 bash build-dist.sh --win
```

The script will:
1. Install all dependencies  
2. Build the SvelteKit web client into static files  
3. Compile the TypeScript server to JavaScript  
4. Recompile native modules (SQLite) for Electron  
5. Package everything into a platform installer  

**Output:** The installer files will appear in the `dist/` folder.

> **How long does it take?**  
> First run: 10–20 minutes (downloads Electron and build tools).  
> Subsequent runs: 2–5 minutes.

#### Important: Build on the Target Platform

The build process compiles `better-sqlite3` (a native SQLite module) for the platform where you run the build.  
**This means:**
- Build on **Windows** (or WSL2) to create Windows installers
- Build on **macOS** to create macOS installers  
- Build on **Linux** to create Linux installers

**If you build for Windows on Linux**, the compiled native module will be a Linux binary, and the Windows installer will fail to start on Windows.

**Workaround:** If you're on Linux but need a Windows installer:
1. Use **WSL2 on Windows** and run the build there, or
2. Use **GitHub Actions** (create a workflow file that builds on Windows), or
3. Ask a Windows user to run the build and share the installer with you

### Distributing to Players

1. Find your installer in the `dist/` folder.
2. Share it via Google Drive, Dropbox, a USB drive, or any file-sharing method.
3. Instruct the recipient to:
   - **Windows:** Double-click the `.exe`, allow the installer to run (click "Yes" on the security prompt), follow the prompts.
   - **macOS:** Open the `.dmg`, drag the app to Applications, then double-click it. If macOS blocks it: System Preferences → Security & Privacy → "Open Anyway".
   - **Linux:** Make the `.AppImage` executable (`chmod +x LMHistory.AppImage`) then double-click it.

---

## Contributing

Pull requests are welcome! Please:

1. Fork the repository and create a branch for your feature: `git checkout -b my-feature`
2. Follow the existing code style (TypeScript, Svelte 5 runes mode)
3. Run `pnpm exec svelte-check --tsconfig tsconfig.json` in `packages/client/` to check for errors
4. Submit a pull request describing what you changed and why

### Project Structure

```
root/
├── packages/
│   ├── types/          # Shared TypeScript types (WS events, session state, etc.)
│   ├── rules/          # Game rules engine (elections, triggers, stat rolls)
│   ├── server/         # Express + Socket.io backend, SQLite via better-sqlite3
│   ├── client/         # SvelteKit frontend (Svelte 5 runes, Tailwind v4)
│   └── electron/       # Electron wrapper for distribution
├── build-dist.sh       # One-command distribution build
└── README.md
```

### Tech Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Frontend | SvelteKit 2, Svelte 5 (runes mode), Tailwind v4 |
| Backend  | Node.js, Express 5, Socket.io 4                 |
| Database | SQLite via better-sqlite3 (synchronous, no ORM) |
| Types    | TypeScript 7, shared via pnpm workspace         |
| Desktop  | Electron 33, electron-builder                   |

---

## License

This project is licensed under the **GNU General Public License v3.0**.  
See the [LICENSE](LICENSE) file for the full text.

In plain language: you are free to use, modify, and distribute this software,  
but any modified versions you distribute must also be released under the GPL.
