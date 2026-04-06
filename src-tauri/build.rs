fn main() {
    // ── libdivecomputer static library ──────────────────────────────────
    build_libdivecomputer();

    // ── Tauri codegen ───────────────────────────────────────────────────
    tauri_build::build();
}

/// Generate `libdivecomputer/version.h` from `version.h.in` into OUT_DIR.
/// This replaces the autoconf substitution step so CI builds work without
/// running `./configure`.
fn generate_libdc_version_header(libdc: &str) -> std::path::PathBuf {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR not set");
    let out_include = std::path::Path::new(&out_dir)
        .join("include")
        .join("libdivecomputer");
    std::fs::create_dir_all(&out_include).expect("failed to create generated include dir");

    let version_h_out = out_include.join("version.h");
    if !version_h_out.exists() {
        let template =
            std::fs::read_to_string(format!("{libdc}/include/libdivecomputer/version.h.in"))
                .expect("failed to read version.h.in");
        let generated = template
            .replace("@DC_VERSION@", "0.10.0-devel")
            .replace("@DC_VERSION_MAJOR@", "0")
            .replace("@DC_VERSION_MINOR@", "10")
            .replace("@DC_VERSION_MICRO@", "0");
        std::fs::write(&version_h_out, generated).expect("failed to write generated version.h");
    }

    // Return the OUT_DIR/include path so the caller can add it to cc
    std::path::Path::new(&out_dir).join("include")
}

/// Compile libdivecomputer C sources into a static library that Rust links.
///
/// Strategy:
///   • All protocol + parser + core files are always compiled.
///   • Transport layer (serial, USB HID, Bluetooth, IrDA, USB) files are
///     compiled but their platform-specific implementations are guarded
///     behind HAVE_* defines. We only enable the ones we can satisfy with
///     zero extra C dependencies. Missing backends return DC_STATUS_UNSUPPORTED
///     at runtime — that is fine because we will progressively enable them
///     and can also bridge transport from Rust via dc_custom_open().
fn build_libdivecomputer() {
    let libdc = "third-party/libdivecomputer";

    // Generate version.h from version.h.in (replaces autoconf ./configure step)
    let generated_include = generate_libdc_version_header(libdc);

    // All .c files under src/, minus the platform-opposite serial file.
    let mut sources: Vec<String> = vec![
        // ── Core ────────────────────────────────────────────────────────
        "aes.c",
        "array.c",
        "buffer.c",
        "checksum.c",
        "common.c",
        "context.c",
        "custom.c",
        "datetime.c",
        "descriptor.c",
        "device.c",
        "hdlc.c",
        "ihex.c",
        "iostream.c",
        "iterator.c",
        "packet.c",
        "parser.c",
        "platform.c",
        "rbstream.c",
        "ringbuffer.c",
        "timer.c",
        "version.c",
        // ── Transport stubs / implementations ───────────────────────────
        "ble.c",
        "bluetooth.c",
        "irda.c",
        "socket.c",
        "usb.c",
        "usbhid.c",
        // ── Device protocols + parsers ──────────────────────────────────
        "atomics_cobalt.c",
        "atomics_cobalt_parser.c",
        "citizen_aqualand.c",
        "citizen_aqualand_parser.c",
        "cochran_commander.c",
        "cochran_commander_parser.c",
        "cressi_edy.c",
        "cressi_edy_parser.c",
        "cressi_goa.c",
        "cressi_goa_parser.c",
        "cressi_leonardo.c",
        "cressi_leonardo_parser.c",
        "deepblu_cosmiq.c",
        "deepblu_cosmiq_parser.c",
        "deepsix_excursion.c",
        "deepsix_excursion_parser.c",
        "diverite_nitekq.c",
        "diverite_nitekq_parser.c",
        "divesoft_freedom.c",
        "divesoft_freedom_parser.c",
        "divesystem_idive.c",
        "divesystem_idive_parser.c",
        "halcyon_symbios.c",
        "halcyon_symbios_parser.c",
        "hw_frog.c",
        "hw_ostc.c",
        "hw_ostc_parser.c",
        "hw_ostc3.c",
        "liquivision_lynx.c",
        "liquivision_lynx_parser.c",
        "mares_common.c",
        "mares_darwin.c",
        "mares_darwin_parser.c",
        "mares_iconhd.c",
        "mares_iconhd_parser.c",
        "mares_nemo.c",
        "mares_nemo_parser.c",
        "mares_puck.c",
        "mclean_extreme.c",
        "mclean_extreme_parser.c",
        "oceanic_atom2.c",
        "oceanic_atom2_parser.c",
        "oceanic_common.c",
        "oceanic_veo250.c",
        "oceanic_veo250_parser.c",
        "oceanic_vtpro.c",
        "oceanic_vtpro_parser.c",
        "oceans_s1.c",
        "oceans_s1_common.c",
        "oceans_s1_parser.c",
        "pelagic_i330r.c",
        "reefnet_sensus.c",
        "reefnet_sensus_parser.c",
        "reefnet_sensuspro.c",
        "reefnet_sensuspro_parser.c",
        "reefnet_sensusultra.c",
        "reefnet_sensusultra_parser.c",
        "seac_screen.c",
        "seac_screen_common.c",
        "seac_screen_parser.c",
        "shearwater_common.c",
        "shearwater_petrel.c",
        "shearwater_predator.c",
        "shearwater_predator_parser.c",
        "sporasub_sp2.c",
        "sporasub_sp2_parser.c",
        "suunto_common.c",
        "suunto_common2.c",
        "suunto_d9.c",
        "suunto_d9_parser.c",
        "suunto_eon.c",
        "suunto_eon_parser.c",
        "suunto_eonsteel.c",
        "suunto_eonsteel_parser.c",
        "suunto_solution.c",
        "suunto_solution_parser.c",
        "suunto_vyper.c",
        "suunto_vyper_parser.c",
        "suunto_vyper2.c",
        "tecdiving_divecomputereu.c",
        "tecdiving_divecomputereu_parser.c",
        "uwatec_aladin.c",
        "uwatec_memomouse.c",
        "uwatec_memomouse_parser.c",
        "uwatec_smart.c",
        "uwatec_smart_parser.c",
        "zeagle_n2ition3.c",
    ]
    .iter()
    .map(|f| format!("{libdc}/src/{f}"))
    .collect();

    // Platform-specific serial implementation
    if cfg!(target_os = "windows") {
        sources.push(format!("{libdc}/src/serial_win32.c"));
    } else {
        sources.push(format!("{libdc}/src/serial_posix.c"));
    }

    let mut build = cc::Build::new();
    build
        .files(&sources)
        // Public headers
        .include(format!("{libdc}/include"))
        // Private headers (src/ has *-private.h, platform.h, array.h, etc.)
        .include(format!("{libdc}/src"))
        // Generated headers (version.h from version.h.in)
        .include(&generated_include)
        // Warnings are noisy in third-party C — suppress
        .warnings(false)
        // Optimise even in debug builds; libdc is a stable dependency
        .opt_level(2);

    // ── Platform defines ────────────────────────────────────────────────
    // We intentionally do NOT define HAVE_CONFIG_H. Instead we pass the
    // handful of platform defines we need directly.  This avoids generating
    // a config.h and keeps the build self-contained.

    if cfg!(target_os = "windows") {
        // Windows serial works out of the box (Win32 API)
        // Bluetooth RFCOMM could be enabled with HAVE_WS2BTH_H but we skip
        // for now to avoid the winsock2/ws2bth dependency.
        build.define("_WIN32", None);
    }

    if cfg!(target_os = "macos") {
        build.define("HAVE_MACH_MACH_TIME_H", None);
    }

    if cfg!(unix) {
        build.define("HAVE_PTHREAD_H", None);
    }

    // We do NOT define HAVE_HIDAPI, HAVE_LIBUSB, HAVE_BLUEZ, HAVE_WS2BTH_H,
    // HAVE_AF_IRDA_H, or HAVE_LINUX_IRDA_H.  Those transport files will
    // compile fine — their implementations are guarded behind these defines
    // and return DC_STATUS_UNSUPPORTED when the backend is absent.
    //
    // The plan is to provide I/O from Rust via dc_custom_open() callbacks,
    // so we don't need the native C transports initially.

    build.compile("divecomputer");

    // ── Link native libraries needed by the compiled C code ─────────────
    if cfg!(target_os = "windows") {
        // serial_win32.c uses SetupDi* for enumeration + CreateFile for I/O
        println!("cargo:rustc-link-lib=setupapi");
        // socket.c / bluetooth.c use winsock
        println!("cargo:rustc-link-lib=ws2_32");
    }

    // Tell cargo to re-run if any libdc source changes
    println!("cargo:rerun-if-changed={libdc}/src");
    println!("cargo:rerun-if-changed={libdc}/include");
}
