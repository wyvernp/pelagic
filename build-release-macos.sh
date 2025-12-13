#!/bin/bash

# Build release for macOS
# Run this script on a Mac with Xcode and Rust installed

set -e

echo "=========================================="
echo "  Pelagic macOS Release Builder"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This script must be run on macOS${NC}"
    exit 1
fi

# Check for required tools
echo -e "${YELLOW}Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed${NC}"
    echo "Install from: https://rustup.rs/"
    exit 1
fi

if ! xcode-select -p &> /dev/null; then
    echo -e "${RED}Error: Xcode Command Line Tools not installed${NC}"
    echo "Run: xcode-select --install"
    exit 1
fi

# Check and install Rust targets
echo -e "${YELLOW}Checking Rust targets...${NC}"
if ! rustup target list --installed | grep -q "aarch64-apple-darwin"; then
    echo -e "${CYAN}Installing aarch64-apple-darwin target...${NC}"
    rustup target add aarch64-apple-darwin
fi

if ! rustup target list --installed | grep -q "x86_64-apple-darwin"; then
    echo -e "${CYAN}Installing x86_64-apple-darwin target...${NC}"
    rustup target add x86_64-apple-darwin
fi

# Get version from tauri.conf.json
VERSION=$(grep -o '"version": *"[^"]*"' src-tauri/tauri.conf.json | grep -o '"[0-9.]*"' | tr -d '"')
echo -e "${GREEN}Building version: ${VERSION}${NC}"
echo ""

# Install npm dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install npm dependencies${NC}"
    exit 1
fi

# Build for both architectures (universal binary)
echo ""
echo -e "${CYAN}Building universal binary (Intel + Apple Silicon)...${NC}"
npm run tauri build -- --target universal-apple-darwin

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "  ${GREEN}Build Complete!${NC}"
echo "=========================================="
echo ""
echo -e "Version: ${GREEN}${VERSION}${NC}"
echo ""
echo -e "${YELLOW}Installers can be found in:${NC}"
echo "  src-tauri/target/universal-apple-darwin/release/bundle/"
echo ""

# List built files
BUNDLE_PATH="src-tauri/target/universal-apple-darwin/release/bundle"
if [ -d "$BUNDLE_PATH" ]; then
    echo -e "${YELLOW}Built artifacts:${NC}"
    find "$BUNDLE_PATH" -type f -not -path "*/\.*" | while read file; do
        SIZE=$(du -h "$file" | cut -f1)
        RELPATH=${file#$BUNDLE_PATH/}
        echo "  $RELPATH ($SIZE)"
    done
fi

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo -e "${CYAN}The .dmg file is the macOS installer (equivalent to .msi on Windows)${NC}"
