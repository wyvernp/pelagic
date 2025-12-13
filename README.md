# Pelagic

Pelagic is a desktop application for underwater photographers to organize dive photos, visualize dive profiles, and manage their digital logbook. It allows users to import dives from various formats, tag marine species, and manage RAW+JPEG image pairs.

## Features

- **Dive Logging**: Import dive logs from supported devices and file formats.
- **Dive Visualization**: Interactive graphs for depth, temperature, tank pressure, NDL, and more.
- **Photo Management**: Organize photos by trip and dive. Supports RAW and JPEG formats.
- **Geotagging**: View dive sites on an interactive map.
- **Species Tagging**: Tag and catalog marine life encountered during dives.
- **Statistics**: View detailed statistics about your diving history.

## Supported Formats

- **Garmin FIT**: Native support for parsing FIT files from Garmin Descent and other devices.
- **Suunto**: Support for Suunto EON Steel/Core/D5 via WebHID and JSON export import.
- **SSRF**: Import support for Subsurface Repository Format files.
- **UDDF/UDCF**: (Planned/Partial support)

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Rust, Tauri
- **Database**: SQLite
- **Visualization**: Visx (Charts), Leaflet (Maps)

## Building & Development

### Prerequisites

- **Node.js** (v18 or later)
- **Rust** (latest stable)
- **For Windows builds**: Visual Studio Build Tools or Windows SDK
- **For macOS builds**: Xcode Command Line Tools

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PelagicDesktopV2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Build for development**
   ```bash
   npm run build
   npm run tauri dev
   ```

### Building Release Installers

#### Windows (.msi installer)

Run the automated build script:
```bash
# Build with automatic version bump (patch version)
.\build-release.ps1

# Build with minor version bump
.\build-release.ps1 -Minor

# Build with major version bump
.\build-release.ps1 -Major

# Build without version bump
.\build-release.ps1 -SkipBump
```

The script will:
- Update version numbers in all config files
- Build the application
- Create a Windows MSI installer
- Output installers to `src-tauri\target\release\bundle\`

#### macOS (.dmg installer)

**Note**: Must be built on a Mac with Xcode installed.

1. **Make the build script executable**
   ```bash
   chmod +x build-release-macos.sh
   ```

2. **Run the build**
   ```bash
   ./build-release-macos.sh
   ```

The script will:
- Check for required dependencies (Node.js, Rust, Xcode)
- Install macOS Rust targets
- Build a universal binary (Intel + Apple Silicon)
- Create a macOS DMG installer
- Output installers to `src-tauri/target/universal-apple-darwin/release/bundle/`

### Database Setup

The application includes an embedded SQLite database that is automatically initialized on first run. The database includes:

- Pre-populated dive sites (1,934+ locations worldwide)
- Schema for trips, dives, photos, and species tagging
- Automatic migrations for schema updates

## Credits & Acknowledgements

This project makes use of several open-source libraries and resources. We gratefully acknowledge the following:

### Core Technologies
- [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop applications with a web frontend.
- [React](https://react.dev/) - The library for web and native user interfaces.
- [Rust](https://www.rust-lang.org/) - A language empowering everyone to build reliable and efficient software.

### Dive Data & Protocols
- [libdivecomputer](https://www.libdivecomputer.org/) - The protocol implementations for dive computer communication in this project are heavily inspired by and referenced from the `libdivecomputer` project. We thank Jef Driesen and contributors for their extensive work in documenting these protocols.
- [fitparser](https://github.com/rozgo/fitparser) - Rust crate used for parsing Garmin FIT files.

### Visualization
- [Visx](https://airbnb.io/visx/) - A collection of reusable low-level visualization components for React.
- [Leaflet](https://leafletjs.com/) - An open-source JavaScript library for mobile-friendly interactive maps.

### Image & Data Processing
- [image](https://github.com/image-rs/image) - Encoding and decoding images in Rust.
- [rawloader](https://github.com/pedrocr/rawloader) - RAW image decoding.
- [kamadak-exif](https://github.com/kamadak/exif-rs) - EXIF parsing library.
- [quick-xml](https://github.com/tafia/quick-xml) - High performance XML pull reader/writer.
- [rusqlite](https://github.com/rusqlite/rusqlite) - Ergonomic wrapper for SQLite.

## License

MIT License
