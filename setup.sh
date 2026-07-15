#!/usr/bin/env bash
# =============================================================================
#  setup.sh — Install all dependencies for Let's Make History development
# =============================================================================
# This script detects your operating system and installs the required tools:
#   - Node.js 20 LTS
#   - pnpm 9+
#   - Build tools (Visual Studio Build Tools on Windows, Xcode on macOS, etc.)
#
# Usage:
#   bash setup.sh
#
# Requirements:
#   - macOS: Homebrew (https://brew.sh)
#   - Windows: Administrator privileges (or run with sudo)
#   - Linux: sudo access (for apt/pacman/dnf)
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
  echo -e "${GREEN}✓ ${NC}$1"
}

log_warn() {
  echo -e "${YELLOW}⚠ ${NC}$1"
}

log_error() {
  echo -e "${RED}✗ ${NC}$1"
}

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
  if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    OS="wsl2"
  fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macos"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  OS="windows"
else
  OS="unknown"
fi

echo ""
echo "=========================================="
echo "  Let's Make History — Dependency Setup"
echo "=========================================="
echo ""
log_info "Detected OS: $OS"
echo ""

# ─── macOS Setup ─────────────────────────────────────────────────────────────
if [ "$OS" = "macos" ]; then
  log_info "Setting up macOS…"
  echo ""

  # Check for Homebrew
  if ! command -v brew &> /dev/null; then
    log_error "Homebrew not found. Please install Homebrew first:"
    echo "  https://brew.sh"
    exit 1
  fi
  log_success "Homebrew is installed"

  # Install Node.js
  if ! command -v node &> /dev/null; then
    log_info "Installing Node.js 20 LTS…"
    brew install node@20
    brew link node@20 --force
    log_success "Node.js installed"
  else
    NODE_VERSION=$(node --version)
    log_success "Node.js is already installed: $NODE_VERSION"
  fi

  # Install pnpm globally
  if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm globally…"
    npm install -g pnpm
    log_success "pnpm installed"
  else
    PNPM_VERSION=$(pnpm --version)
    log_success "pnpm is already installed: $PNPM_VERSION"
  fi

  # Install Xcode Command Line Tools
  if ! command -v xcode-select &> /dev/null || [ -z "$(xcode-select --print-path 2>/dev/null)" ]; then
    log_info "Installing Xcode Command Line Tools…"
    xcode-select --install
    log_warn "Please complete the Xcode installation when the dialog appears, then re-run this script."
    exit 0
  else
    log_success "Xcode Command Line Tools are installed"
  fi

# ─── Windows (Git Bash / WSL2) Setup ─────────────────────────────────────────
elif [ "$OS" = "windows" ] || [ "$OS" = "wsl2" ]; then
  log_info "Setting up for Windows (WSL2/Git Bash)…"
  echo ""

  # Check for Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js 20 LTS:"
    echo "  https://nodejs.org/ (download the LTS version)"
    echo ""
    echo "After installing, restart your terminal and run this script again."
    exit 1
  else
    NODE_VERSION=$(node --version)
    log_success "Node.js is installed: $NODE_VERSION"
  fi

  # Install pnpm globally
  if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm globally…"
    npm install -g pnpm
    log_success "pnpm installed"
  else
    PNPM_VERSION=$(pnpm --version)
    log_success "pnpm is already installed: $PNPM_VERSION"
  fi

  # Check for Visual Studio Build Tools on Windows (not WSL2)
  if [ "$OS" = "windows" ]; then
    if ! command -v cl.exe &> /dev/null; then
      log_warn "Visual Studio Build Tools not found."
      log_info "Downloading Visual Studio Build Tools installer…"
      log_info "Install with 'Desktop development with C++' option enabled."
      echo ""
      echo "  https://visualstudio.microsoft.com/visual-cpp-build-tools/"
      echo ""
      log_warn "After installing Visual Studio Build Tools, restart your terminal and run this script again."
      exit 1
    else
      log_success "Visual Studio Build Tools are installed"
    fi
  fi

# ─── Linux Setup ─────────────────────────────────────────────────────────────
elif [ "$OS" = "linux" ]; then
  log_info "Setting up Linux…"
  echo ""

  # Detect Linux distro
  if command -v apt-get &> /dev/null; then
    DISTRO="debian"
  elif command -v pacman &> /dev/null; then
    DISTRO="arch"
  elif command -v dnf &> /dev/null; then
    DISTRO="fedora"
  else
    DISTRO="unknown"
  fi

  log_info "Detected Linux distro: $DISTRO"

  # Update package manager
  if [ "$DISTRO" = "debian" ]; then
    log_info "Updating apt package manager…"
    sudo apt-get update
    
    # Install Node.js and build tools
    if ! command -v node &> /dev/null; then
      log_info "Installing Node.js 20 LTS and build tools…"
      sudo apt-get install -y nodejs npm build-essential python3 make g++
      log_success "Node.js and build tools installed"
    else
      NODE_VERSION=$(node --version)
      log_success "Node.js is already installed: $NODE_VERSION"
    fi

  elif [ "$DISTRO" = "arch" ]; then
    log_info "Installing Node.js 20 LTS and build tools…"
    sudo pacman -S --noconfirm nodejs npm base-devel python make gcc
    log_success "Node.js and build tools installed"

  elif [ "$DISTRO" = "fedora" ]; then
    log_info "Installing Node.js 20 LTS and build tools…"
    sudo dnf install -y nodejs npm gcc gcc-c++ make python3
    log_success "Node.js and build tools installed"

  else
    log_error "Could not detect your Linux distro. Please install manually:"
    echo "  - Node.js 20 LTS (https://nodejs.org)"
    echo "  - build-essential / gcc / g++ (for compiling native modules)"
    echo "  - python3 and make"
    exit 1
  fi

  # Install pnpm globally
  if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm globally…"
    npm install -g pnpm
    log_success "pnpm installed"
  else
    PNPM_VERSION=$(pnpm --version)
    log_success "pnpm is already installed: $PNPM_VERSION"
  fi

else
  log_error "Unknown operating system. Please install dependencies manually:"
  echo "  - Node.js 20 LTS (https://nodejs.org)"
  echo "  - pnpm (npm install -g pnpm)"
  echo "  - Build tools (Visual Studio Build Tools, Xcode, gcc, etc.)"
  exit 1
fi

echo ""
echo "=========================================="
echo "  Verification"
echo "=========================================="
echo ""

# Verify installations
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
PNPM_VERSION=$(pnpm --version)

log_success "Node.js: $NODE_VERSION"
log_success "npm: $NPM_VERSION"
log_success "pnpm: $PNPM_VERSION"

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. cd to your project directory"
echo "  2. Run: pnpm install"
echo "  3. Run: bash build-dist.sh --win  (or --linux, --mac)"
echo ""
echo "For development, see README.md for more details."
echo ""
