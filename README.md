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
