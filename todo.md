# PelagicDesktopV2 - Development Roadmap & Issues

Generated: December 21, 2025

---

## Table of Contents
- [Critical Issues](#critical-issues)
- [Major Issues](#major-issues)
- [Minor Issues](#minor-issues)
- [Feature Gaps vs Dive Log Apps](#feature-gaps-vs-dive-log-apps)
- [Feature Gaps vs Photo Management Apps](#feature-gaps-vs-photo-management-apps)
- [Unique Advantages to Maintain](#unique-advantages-to-maintain)

---

## Critical Issues

### 1. ~~API Key Stored in Plain Text localStorage~~ ✅ FIXED
**Location:** `src/components/SettingsModal.tsx`

**Status:** Fixed on December 21, 2025

**Solution implemented:**
1. Added `tauri-plugin-store = "2.0"` to Cargo.toml for encrypted local storage
2. Registered store plugin in lib.rs
3. Added `store:default` permission to capabilities/default.json  
4. Created `get_secure_setting` and `set_secure_setting` Tauri commands
5. Updated SettingsModal.tsx to store API key via secure Tauri commands
6. Added `useGeminiApiKey()` hook for other components to access the key
7. Automatic migration from localStorage to secure storage for existing users
8. Updated ContentArea.tsx and RightPanel.tsx to use the new hook

---

### 2. No Input Validation on Database Operations
**Location:** `src-tauri/src/commands.rs`, `src-tauri/src/db.rs`

**Problem:** User inputs passed directly to database without validation. Risk of data corruption, crashes, and malformed data.

**Fix:**
1. Create a `validation.rs` module with validation functions:
   ```rust
   pub fn validate_date(date: &str) -> Result<(), ValidationError> {
       NaiveDate::parse_from_str(date, "%Y-%m-%d")
           .map_err(|_| ValidationError::InvalidDate)?;
       Ok(())
   }
   
   pub fn validate_depth(depth: f64) -> Result<(), ValidationError> {
       if depth < 0.0 || depth > 350.0 {
           return Err(ValidationError::DepthOutOfRange);
       }
       Ok(())
   }
   ```
2. Apply validation in commands before database operations
3. Return structured error messages to frontend for user feedback
4. Add string length limits (e.g., max 255 chars for names)
5. Validate numeric ranges (duration, temperature, depth)

---

### 3. God Component Anti-Pattern in App.tsx
**Location:** `src/App.tsx` (~700 lines, 35+ useState calls)

**Problem:** Massive component with all state, causing prop drilling, difficult testing, and unnecessary re-renders.

**Fix:**
1. Install Zustand: `npm install zustand`
2. Create store slices in `src/stores/`:
   ```typescript
   // src/stores/diveStore.ts
   import { create } from 'zustand';
   
   interface DiveState {
     trips: Trip[];
     selectedTrip: Trip | null;
     selectedDive: Dive | null;
     setSelectedTrip: (trip: Trip | null) => void;
     setSelectedDive: (dive: Dive | null) => void;
     loadTrips: () => Promise<void>;
   }
   
   export const useDiveStore = create<DiveState>((set) => ({
     trips: [],
     selectedTrip: null,
     selectedDive: null,
     setSelectedTrip: (trip) => set({ selectedTrip: trip }),
     // ...
   }));
   ```
3. Create separate stores: `diveStore`, `photoStore`, `uiStore`, `settingsStore`
4. Refactor components to use stores directly instead of props
5. Split App.tsx into smaller container components

---

## Major Issues

### 4. Zero Test Coverage
**Problem:** No test files in the entire codebase. No regression protection.

**Fix:**
1. Install Vitest: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
2. Add vitest config to `vite.config.ts`:
   ```typescript
   test: {
     globals: true,
     environment: 'jsdom',
     setupFiles: './src/test/setup.ts',
   }
   ```
3. Priority test targets:
   - Dive import logic (critical path)
   - Photo-to-dive matching algorithm
   - Species search/filter logic
   - Database CRUD operations (Rust tests)
4. Add Rust tests in `src-tauri/src/`:
   ```rust
   #[cfg(test)]
   mod tests {
       #[test]
       fn test_create_trip() { ... }
   }
   ```
5. Set up CI/CD to run tests on PR

---

### 5. Type Definitions Duplicated Frontend/Backend
**Locations:** `src/types/index.ts`, `src-tauri/src/db.rs`

**Problem:** Types manually duplicated between TypeScript and Rust, can drift out of sync.

**Fix:**
1. Install `ts-rs` crate: Add to `Cargo.toml`:
   ```toml
   [dependencies]
   ts-rs = { version = "7", features = ["serde-compat"] }
   ```
2. Derive TypeScript types from Rust structs:
   ```rust
   use ts_rs::TS;
   
   #[derive(TS, Serialize, Deserialize)]
   #[ts(export, export_to = "../src/types/generated/")]
   pub struct Trip {
       pub id: i64,
       pub name: String,
       // ...
   }
   ```
3. Add build script to generate types: `cargo test export_bindings`
4. Import generated types in frontend instead of manual definitions
5. Add to pre-commit hook to ensure types stay in sync

---

### 6. Memory Leak Risk in Image Loading
**Location:** `src/hooks/useImageData.ts`, `src/components/ContentGrid.tsx`

**Problem:** Full base64 images loaded into React state with no caching or virtualization.

**Fix:**
1. Implement LRU cache for images:
   ```typescript
   // src/utils/imageCache.ts
   import LRU from 'lru-cache';
   
   const imageCache = new LRU<string, string>({
     max: 100, // Max 100 images
     maxSize: 500 * 1024 * 1024, // 500MB max
     sizeCalculation: (value) => value.length,
   });
   ```
2. Use Tauri's asset protocol instead of base64:
   ```rust
   // Register asset protocol for local files
   tauri::Builder::default()
       .register_uri_scheme_protocol("localimage", |app, request| {
           // Stream file directly
       })
   ```
3. Implement virtualization for photo grid using react-window:
   ```typescript
   import { FixedSizeGrid } from 'react-window';
   // Only render visible photos
   ```
4. Use `IntersectionObserver` for lazy loading thumbnails
5. Clear image cache when switching trips/dives

---

### 7. N+1 Query Pattern in ContentArea
**Location:** `src/components/ContentArea.tsx`

**Problem:** 2 IPC calls per dive (thumbnails + stats). 50 dives = 100 roundtrips.

**Fix:**
1. Create batch command in Rust:
   ```rust
   #[tauri::command]
   pub fn get_dives_with_details(
       trip_id: i64
   ) -> Result<Vec<DiveWithDetails>, String> {
       // Single query with JOINs
       let sql = r#"
           SELECT d.*, 
                  COUNT(p.id) as photo_count,
                  MIN(p.thumbnail_path) as first_thumb
           FROM dives d
           LEFT JOIN photos p ON p.dive_id = d.id
           WHERE d.trip_id = ?
           GROUP BY d.id
       "#;
   }
   ```
2. Fetch all data in single call from frontend
3. Similarly batch: `get_photos_with_species_tags`, `get_trips_with_dive_counts`
4. Consider GraphQL-like batching for complex queries

---

### 8. Blocking Mutex on Database
**Location:** `src-tauri/src/commands.rs` (all commands)

**Problem:** Single database connection with blocking mutex. Long operations freeze all DB access.

**Fix:**
1. Option A - Connection pooling with r2d2:
   ```rust
   use r2d2::Pool;
   use r2d2_sqlite::SqliteConnectionManager;
   
   let manager = SqliteConnectionManager::file("pelagic.db");
   let pool = Pool::builder().max_size(10).build(manager)?;
   ```
2. Option B - Async with tokio-rusqlite:
   ```rust
   use tokio_rusqlite::Connection;
   
   #[tauri::command]
   async fn get_dives(state: State<'_, AppState>) -> Result<Vec<Dive>, String> {
       state.db.call(|conn| {
           // Query runs on dedicated thread
       }).await
   }
   ```
3. Move heavy operations (thumbnail generation, EXIF scanning) to background tasks
4. Show progress indicators for long operations

---

## Minor Issues

### 9. Alert-Based Error Handling
**Locations:** Multiple components (App.tsx, modals)

**Problem:** Using native `alert()` for errors is poor UX.

**Fix:**
1. Install react-hot-toast: `npm install react-hot-toast`
2. Add Toaster to App:
   ```typescript
   import { Toaster, toast } from 'react-hot-toast';
   // In App.tsx: <Toaster position="bottom-right" />
   ```
3. Replace all `alert()` calls:
   ```typescript
   // Before
   alert('Failed to delete: ' + error);
   // After
   toast.error('Failed to delete photos');
   ```
4. Add success toasts for confirmations
5. Style toasts to match app theme

---

### 10. No Error Boundaries
**Problem:** Component errors crash the entire app.

**Fix:**
1. Create ErrorBoundary component:
   ```typescript
   // src/components/ErrorBoundary.tsx
   class ErrorBoundary extends Component<Props, State> {
     static getDerivedStateFromError(error: Error) {
       return { hasError: true, error };
     }
     
     render() {
       if (this.state.hasError) {
         return <ErrorFallback error={this.state.error} />;
       }
       return this.props.children;
     }
   }
   ```
2. Wrap major sections (Sidebar, ContentArea, RightPanel)
3. Add "Report Bug" button in error fallback
4. Log errors to file for debugging

---

### 11. Version Hardcoded in SettingsModal
**Locations:** `src/components/SettingsModal.tsx`, `package.json`

**Problem:** Version "0.2.10" hardcoded but package.json shows "0.2.18".

**Fix:**
1. Option A - Import from package.json:
   ```typescript
   import { version } from '../../package.json';
   ```
2. Option B - Build-time injection via Vite:
   ```typescript
   // vite.config.ts
   define: {
     __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
   }
   // Usage: <p>Version {__APP_VERSION__}</p>
   ```
3. Tauri also exposes version via `tauri.conf.json` - can read via command

---

### 12. No Undo for Destructive Operations
**Problem:** Deleting photos/dives is permanent.

**Fix:**
1. Implement soft delete with `deleted_at` column:
   ```sql
   ALTER TABLE photos ADD COLUMN deleted_at TEXT;
   -- Query with: WHERE deleted_at IS NULL
   ```
2. Add "Trash" view to recover recently deleted items
3. Permanent delete after 30 days or manual empty trash
4. For immediate undo, implement command pattern:
   ```typescript
   interface Command {
     execute(): Promise<void>;
     undo(): Promise<void>;
   }
   ```

---

### 13. Plain CSS Without Modules
**Locations:** All `.css` files in `src/components/`

**Problem:** Global CSS risks style collisions.

**Fix:**
1. Rename files: `Component.css` → `Component.module.css`
2. Update imports:
   ```typescript
   // Before
   import './ContentGrid.css';
   // After
   import styles from './ContentGrid.module.css';
   // Usage: className={styles.gridContainer}
   ```
3. Alternatively, consider Tailwind CSS for utility-first approach
4. Or styled-components for CSS-in-JS

---

### 14. Missing Database Indexes
**Location:** `src-tauri/src/db.rs`

**Problem:** Missing indexes for common query patterns.

**Fix:**
Add indexes for frequently queried columns:
```sql
-- Photo filtering by rating
CREATE INDEX idx_photos_rating ON photos(rating);

-- Species search
CREATE INDEX idx_species_common_name ON species_tags(common_name);
CREATE INDEX idx_species_scientific ON species_tags(scientific_name);

-- Dive date queries
CREATE INDEX idx_dives_date ON dives(date);

-- Composite for common photo queries
CREATE INDEX idx_photos_dive_rating ON photos(dive_id, rating);
```

---

## Feature Gaps vs Dive Log Apps

### From Subsurface (Technical Diving Focus)
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| SAC rate calculation | Medium | Calculate from tank pressure delta / time / depth |
| Trimix support | Low | Add He% field to gas mix, update CNS/OTU calculations |
| Decompression info display | Medium | Parse deco ceiling from dive computer data |
| Partial pressure calculations | Medium | ppO2 = FO2 × (depth/10 + 1), add to profile view |
| Cloud sync | High | Use Tauri's HTTP client + cloud backend (Supabase/Firebase) |
| Multiple diver profiles | Low | Add users table, foreign key on dives |

### From MacDive
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Certification management | Low | New table for c-cards with images |
| Service reminders for gear | Medium | Add `next_service_date` to equipment, notification system |
| Wider dive computer support | High | Integrate libdivecomputer via FFI bindings |

### From Diving Log 6.0
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Deco calculator | Medium | Implement Bühlmann ZH-L16 algorithm |
| Profile editor | Low | Allow manual profile creation/editing |
| Report designer | Low | Use puppeteer/wkhtmltopdf for custom PDF layouts |
| Google Earth export | Low | Generate KML file from dive GPS coordinates |

### From Garmin Dive
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Dive site discovery | Medium | Integrate dive site database API |
| Community reviews | Low | Would require cloud backend + moderation |

### General Gaps
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Mobile companion app | High | React Native or Tauri Mobile (beta) |
| Offline-first sync | High | Use CRDTs or operational transforms |
| Multi-language support | Medium | i18next integration |
| Logbook printing/PDF export | Medium | Generate styled PDF from dive data |

---

## Feature Gaps vs Photo Management Apps

### From Lightroom / Capture One
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| AI-assisted culling | Medium | Use Gemini to rate photo sharpness/composition |
| Cloud sync for photos | High | Sync metadata only, not full images (too large) |

### From digiKam / Mylio
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Face recognition | Medium | Use local ML model (face-api.js or Rust bindings) |
| Duplicate detection | Low | Already have file hash - expose in UI |
| Hierarchical tags | Low | Add parent_id to tags table |

### From Photo Mechanic
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| IPTC copyright templates | Medium | Pre-fill copyright, creator, contact info on export |
| Batch rename | Medium | Pattern-based renaming (date, dive, sequence) |
| Fast culling workflow | Medium | Keyboard shortcuts for rating, flagging |

### From DxO PhotoLab
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Underwater color correction presets | High | Partner with UW photographers for LUT presets |

### General Photo Gaps
| Feature | Priority | Implementation Notes |
|---------|----------|---------------------|
| Video support | Medium | Thumbnails, metadata extraction for video files |
| Slideshow mode | Low | Full-screen auto-advance with dive info overlay |
| Before/after comparison | Low | Already have RAW vs processed - add slider UI |

---

## Unique Advantages to Maintain

These are PelagicDesktopV2's differentiators - protect and enhance them:

1. **AI Species Identification** - No competitor has this. Enhance with:
   - Offline model for common species
   - User corrections to improve accuracy
   - iNaturalist integration for verification

2. **Dive-Photo Correlation** - Linking photos to depth/time is unique. Enhance with:
   - Show photo position on dive profile
   - "What was I photographing at X depth?" query

3. **Scientific Species Cataloguing** - Binomial names, categories. Enhance with:
   - WoRMS (World Register of Marine Species) integration
   - Species distribution maps
   - Life list / species count achievements

4. **Custom Dive Computer Library** - Full control. Enhance with:
   - More device support
   - Better error handling
   - Contribute to open source community

5. **Underwater Photography Focus** - Purpose-built UX. Enhance with:
   - UW-specific metadata (strobe power, filter used)
   - Backscatter detection AI
   - Composition tips based on species

---

## Priority Matrix

| Priority | Items |
|----------|-------|
| **P0 - Critical** | API key security, Input validation |
| **P1 - High** | State management refactor, Cloud sync, Mobile app |
| **P2 - Medium** | Test coverage, Type generation, N+1 fixes, Toast notifications |
| **P3 - Low** | CSS modules, Undo system, Technical diving features |

---

## Next Steps

1. [x] Fix API key storage (P0) - ✅ Completed December 21, 2025
2. [ ] Add input validation layer (P0) - 4 hours  
3. [ ] Implement Zustand stores (P1) - 8 hours
4. [ ] Set up Vitest + first tests (P2) - 4 hours
5. [ ] Add ts-rs type generation (P2) - 2 hours
6. [ ] Replace alerts with toasts (P2) - 1 hour
7. [ ] Fix version display (Minor) - 15 minutes
