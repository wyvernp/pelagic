# Building & Running Pelagic Desktop

## Prerequisites

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Rust (stable) | 1.77.2+ | `rustc --version` |
| Tauri CLI | 2.x | `npx tauri --version` |
| **Windows only**: MinGW-w64 (gcc) | any | `gcc --version` |

MinGW is required because the Rust toolchain is `stable-x86_64-pc-windows-gnu`,
and the `cc` crate uses `gcc` to compile the bundled libdivecomputer C library.
Ensure `C:\msys64\mingw64\bin` (or your MinGW path) is in `PATH`.

## First-time setup

```powershell
# Clone with submodules (libdivecomputer is a git submodule)
git clone --recurse-submodules <repo-url>
cd PelagicDesktopV2

# If already cloned without submodules:
git submodule update --init --recursive

# Install npm dependencies
npm install
```

## Development (hot-reload)

```powershell
# Ensure gcc is in PATH (Windows/MinGW)
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"

# Start dev mode — builds Rust backend + Vite dev server with HMR
npm run tauri dev
```

This will:
1. Start the Vite dev server on `http://localhost:1420`
2. Compile the Rust backend (including libdivecomputer C sources via `cc` crate)
3. Launch the Pelagic desktop window pointing at the Vite dev server

First build takes ~2–5 minutes (compiling ~110 libdivecomputer C files + all Rust crates).
Subsequent rebuilds are incremental and much faster.

## Production build

```powershell
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
npm run tauri build
```

Output location:
- Windows installer: `src-tauri/target/release/bundle/nsis/`
- Standalone exe: `src-tauri/target/release/pelagic.exe`

## Project structure (key files)

```
PelagicDesktopV2/
├── src/                          # React/TypeScript frontend
│   ├── components/               # UI components
│   ├── stores/                   # Zustand state stores
│   └── utils/                    # Helpers, logger
├── dive-computer-ts/             # TypeScript dive computer library
│   └── src/protocols/            # Device protocol implementations
├── src-tauri/                    # Rust backend (Tauri)
│   ├── src/
│   │   ├── lib.rs                # App setup, plugin registration
│   │   ├── commands.rs           # Tauri command handlers (IPC)
│   │   ├── import.rs             # Dive file parsers (FIT, SSRF, JSON)
│   │   ├── libdc.rs              # libdivecomputer FFI bindings
│   │   ├── db.rs                 # SQLite database layer
│   │   └── photos.rs             # Photo/thumbnail processing
│   ├── build.rs                  # Compiles libdivecomputer C sources
│   ├── Cargo.toml                # Rust dependencies
│   └── third-party/
│       └── libdivecomputer/      # Git submodule — C library (300+ dive computers)
├── package.json                  # npm scripts & JS dependencies
├── vite.config.ts                # Vite bundler config (port 1420)
└── tsconfig.json                 # TypeScript config
```

## Troubleshooting

### `gcc.exe not found` during build
The `cc` crate needs gcc to compile libdivecomputer. Add MinGW to PATH:
```powershell
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
```

### `submodule 'third-party/libdivecomputer' not initialized`
```powershell
cd src-tauri
git submodule update --init --recursive
```

### Port 1420 already in use
Kill the existing process or change the port in `vite.config.ts` and
`src-tauri/tauri.conf.json` (`devUrl`).
