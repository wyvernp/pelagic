import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { logger } from '../utils/logger';
import { renderShareCard } from '../utils/shareCardRenderer';
import {
  SHARE_PRESETS,
  SHARE_LAYOUTS,
  CARD_THEMES,
  DEFAULT_OVERLAY,
} from '../utils/shareCardPresets';
import type {
  ShareCardPreset,
  ShareCardLayout,
  PhotoSlotState,
  CardTheme,
  OverlayConfig,
  ShareCardConfig,
  SelectablePhoto,
} from '../types/shareCard';
import type { Dive, Trip, Photo, DiveSample, SpeciesTag, GeneralTag, DiveSite, SearchResults } from '../types';
import {
  InstagramIcon,
  FacebookIcon,
  TwitterXIcon,
  SaveFileIcon,
  ClipboardIcon,
} from './icons/SocialIcons';
import './ShareCardModal.css';

// ── Helpers ──

/** Map platform preset ID to icon */
function PresetIcon({ presetId, size = 16 }: { presetId: string; size?: number }) {
  if (presetId.startsWith('instagram')) return <InstagramIcon size={size} />;
  if (presetId.startsWith('facebook') || presetId.includes('linkedin')) return <FacebookIcon size={size} />;
  if (presetId.startsWith('x-') || presetId.includes('twitter')) return <TwitterXIcon size={size} />;
  // Square / universal
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

/** Simple layout thumbnail SVG */
function LayoutThumb({ layout }: { layout: ShareCardLayout }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      {layout.slots.map((slot, i) => (
        <rect
          key={i}
          x={slot.x * 100 + 1}
          y={slot.y * 100 + 1}
          width={Math.max(slot.width * 100 - 2, 1)}
          height={Math.max(slot.height * 100 - 2, 1)}
          rx="3"
          className="slot"
        />
      ))}
      {layout.hasInfoPanel && layout.infoPanel && (
        <rect
          x={layout.infoPanel.x * 100 + 1}
          y={layout.infoPanel.y * 100 + 1}
          width={Math.max(layout.infoPanel.width * 100 - 2, 1)}
          height={Math.max(layout.infoPanel.height * 100 - 2, 1)}
          rx="3"
          fill="currentColor"
          opacity={0.25}
        />
      )}
    </svg>
  );
}

// ── Props ──

export interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The type of item being shared */
  shareType: 'dive' | 'trip' | 'photo';
  /** The dive being shared (if shareType is 'dive' or 'photo') */
  dive?: Dive | null;
  /** The trip being shared */
  trip?: Trip | null;
  /** Available photos for the card */
  photos: Photo[];
  /** Pre-selected photo ID (e.g., from context menu on a single photo) */
  initialPhotoId?: number | null;
}

export function ShareCardModal({
  isOpen,
  onClose,
  shareType,
  dive,
  trip,
  photos,
  initialPhotoId,
}: ShareCardModalProps) {
  // ── State ──
  const [preset, setPreset] = useState<ShareCardPreset>(SHARE_PRESETS[0]);
  const [layout, setLayout] = useState<ShareCardLayout>(SHARE_LAYOUTS[0]);
  const [theme, setTheme] = useState<CardTheme>('dark');
  const [overlay, setOverlay] = useState<OverlayConfig>({ ...DEFAULT_OVERLAY });
  const [slots, setSlots] = useState<PhotoSlotState[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Image data cache (photoId -> data URL)
  const imageCache = useRef<Map<number, string>>(new Map());

  // Species tags and general tags for overlay
  const [speciesTags, setSpeciesTags] = useState<string[]>([]);
  const [generalTags, setGeneralTags] = useState<string[]>([]);
  const [diveSamples, setDiveSamples] = useState<{ time: number; depth: number }[]>([]);
  const [diveSiteName, setDiveSiteName] = useState<string | undefined>(undefined);
  const [tripStats, setTripStats] = useState<{
    diveCount: number;
    totalUnderwaterSeconds: number;
    deepestDiveM: number | undefined;
    speciesCount: number;
  } | null>(null);

  // All available photos (loaded internally based on shareType)
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [photoSearch, setPhotoSearch] = useState('');
  const [searchResultPhotos, setSearchResultPhotos] = useState<Photo[] | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load all relevant photos based on share type ──
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadPhotos = async () => {
      try {
        let loaded: Photo[] = [];
        if (shareType === 'trip' && trip) {
          loaded = await invoke<Photo[]>('get_all_photos_for_trip', { tripId: trip.id });
        } else if ((shareType === 'dive' || shareType === 'photo') && dive) {
          loaded = await invoke<Photo[]>('get_photos_for_dive', { diveId: dive.id });
        } else {
          // Fallback to passed-in photos
          loaded = photos;
        }
        if (!cancelled) setAllPhotos(loaded);
      } catch (err) {
        logger.warn('Failed to load photos for share card:', err);
        if (!cancelled) setAllPhotos(photos);
      }
    };

    loadPhotos();
    return () => { cancelled = true; };
  }, [isOpen, shareType, dive, trip, photos]);

  // ── Photo search ──
  useEffect(() => {
    if (!photoSearch.trim()) {
      setSearchResultPhotos(null);
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const q = photoSearch.trim().toLowerCase();
        const allPhotoIds = new Set(allPhotos.map(p => p.id));

        // Backend search returns photos matching by filename, species tags, general tags
        const results = await invoke<SearchResults>('search', { query: photoSearch.trim() });
        const backendMatched = results.photos.filter(p => allPhotoIds.has(p.id));

        // Also do local filename match (instant, catches partial matches backend might miss)
        const filenameMatches = allPhotos.filter(p =>
          p.filename.toLowerCase().includes(q)
        );

        // Merge results, deduplicated, preserving allPhotos order
        const matchedIds = new Set([
          ...backendMatched.map(p => p.id),
          ...filenameMatches.map(p => p.id),
        ]);
        setSearchResultPhotos(allPhotos.filter(p => matchedIds.has(p.id)));
      } catch (err) {
        logger.warn('Photo search failed:', err);
        // Fallback to filename filter only
        const q = photoSearch.trim().toLowerCase();
        setSearchResultPhotos(allPhotos.filter(p =>
          p.filename.toLowerCase().includes(q)
        ));
      }
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [photoSearch, allPhotos]);

  // ── Selectable photos (from loaded photos, filtered by search) ──
  const displayPhotos = searchResultPhotos ?? allPhotos;
  const selectablePhotos = useMemo<SelectablePhoto[]>(() => {
    return displayPhotos.map(p => ({
      id: p.id,
      filePath: p.file_path,
      thumbnailPath: p.thumbnail_path,
      filename: p.filename,
      captureTime: p.capture_time ?? undefined,
      width: p.width ?? undefined,
      height: p.height ?? undefined,
      rating: p.rating ?? undefined,
    }));
  }, [displayPhotos]);

  // All selectable photos (unfiltered) for slot initialization
  const allSelectablePhotos = useMemo<SelectablePhoto[]>(() => {
    return allPhotos.map(p => ({
      id: p.id,
      filePath: p.file_path,
      thumbnailPath: p.thumbnail_path,
      filename: p.filename,
      captureTime: p.capture_time ?? undefined,
      width: p.width ?? undefined,
      height: p.height ?? undefined,
      rating: p.rating ?? undefined,
    }));
  }, [allPhotos]);

  // ── Load contextual data (tags, samples, dive site name) ──
  useEffect(() => {
    if (!isOpen) return;

    const loadContext = async () => {
      try {
        // Resolve dive site name if dive has a dive_site_id
        if (dive?.dive_site_id) {
          const site = await invoke<DiveSite | null>('get_dive_site', { id: dive.dive_site_id });
          setDiveSiteName(site?.name);
        } else {
          setDiveSiteName(undefined);
        }

        if (shareType === 'photo' && initialPhotoId) {
          // For photo share: load species/general tags for THIS specific photo
          const [species, tags] = await Promise.all([
            invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId: initialPhotoId }),
            invoke<GeneralTag[]>('get_general_tags_for_photo', { photoId: initialPhotoId }),
          ]);
          setSpeciesTags(species.map(s => s.name));
          setGeneralTags(tags.map(t => t.name));

          // Load dive samples if we have a dive
          if (dive) {
            const samples = await invoke<DiveSample[]>('get_dive_samples', { diveId: dive.id });
            setDiveSamples(samples.map(s => ({ time: s.time_seconds, depth: s.depth_m })));
          } else {
            setDiveSamples([]);
          }
        } else if (dive) {
          // For dive share: aggregate species/general tags across all dive photos
          const divePhotos = await invoke<Photo[]>('get_photos_for_dive', { diveId: dive.id });
          const photoIds = divePhotos.map(p => p.id);

          if (photoIds.length > 0) {
            // Load all species/general tags from all photos in this dive
            const tagResults = await Promise.all([
              ...photoIds.map(pid => invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId: pid })),
            ]);
            const allSpecies = new Map<number, string>();
            for (const result of tagResults) {
              for (const sp of result) {
                allSpecies.set(sp.id, sp.name);
              }
            }
            setSpeciesTags(Array.from(allSpecies.values()));

            const genResults = await Promise.all([
              ...photoIds.map(pid => invoke<GeneralTag[]>('get_general_tags_for_photo', { photoId: pid })),
            ]);
            const allGenTags = new Map<number, string>();
            for (const result of genResults) {
              for (const gt of result) {
                allGenTags.set(gt.id, gt.name);
              }
            }
            setGeneralTags(Array.from(allGenTags.values()));
          } else {
            setSpeciesTags([]);
            setGeneralTags([]);
          }

          // Load dive samples for profile
          const samples = await invoke<DiveSample[]>('get_dive_samples', { diveId: dive.id });
          setDiveSamples(samples.map(s => ({ time: s.time_seconds, depth: s.depth_m })));
        } else if (trip) {
          // For trip share: compute trip stats from dives
          const [tripDives, speciesCount, tripPhotos] = await Promise.all([
            invoke<Dive[]>('get_dives_for_trip', { tripId: trip.id }),
            invoke<number>('get_trip_species_count', { tripId: trip.id }),
            invoke<Photo[]>('get_photos_for_trip', { tripId: trip.id }),
          ]);

          // Compute stats from dives
          const diveCount = tripDives.length;
          const totalUnderwaterSeconds = tripDives.reduce((sum, d) => sum + (d.duration_seconds || 0), 0);
          const deepestDiveM = tripDives.length > 0
            ? Math.max(...tripDives.map(d => d.max_depth_m || 0))
            : undefined;
          setTripStats({ diveCount, totalUnderwaterSeconds, deepestDiveM, speciesCount });

          // Aggregate species tags from trip photos
          const photoIds = tripPhotos.map(p => p.id);
          if (photoIds.length > 0) {
            const limited = photoIds.slice(0, 50);
            const tagResults = await Promise.all(
              limited.map(pid => invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId: pid }))
            );
            const allSpecies = new Map<number, string>();
            for (const result of tagResults) {
              for (const sp of result) {
                allSpecies.set(sp.id, sp.name);
              }
            }
            setSpeciesTags(Array.from(allSpecies.values()).slice(0, 15));
          } else {
            setSpeciesTags([]);
          }
          setGeneralTags([]);
          setDiveSamples([]);
        }
      } catch (err) {
        logger.warn('Failed to load share card context:', err);
      }
    };

    loadContext();
  }, [isOpen, dive, trip, shareType, initialPhotoId]);

  // ── Initialize slots when layout or photos change ──
  useEffect(() => {
    if (!isOpen) return;

    const newSlots: PhotoSlotState[] = [];
    for (let i = 0; i < layout.slotCount; i++) {
      let photoToUse: SelectablePhoto | undefined;

      if (i === 0 && initialPhotoId) {
        photoToUse = allSelectablePhotos.find(p => p.id === initialPhotoId);
      }
      if (!photoToUse && allSelectablePhotos[i]) {
        photoToUse = allSelectablePhotos[i];
      }

      if (photoToUse) {
        newSlots.push({
          photoId: photoToUse.id,
          filePath: photoToUse.filePath,
          dataUrl: imageCache.current.get(photoToUse.id),
          crop: { x: 0, y: 0 },
          zoom: 1,
          croppedAreaPixels: null,
        });
      } else {
        newSlots.push({
          photoId: -1,
          filePath: '',
          crop: { x: 0, y: 0 },
          zoom: 1,
          croppedAreaPixels: null,
        });
      }
    }
    setSlots(newSlots);
    setActiveSlotIndex(0);
  }, [isOpen, layout, allSelectablePhotos, initialPhotoId]);

  // ── Load image data for slots ──
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadImages = async () => {
      for (const slot of slots) {
        if (slot.photoId < 0 || slot.dataUrl) continue;
        if (imageCache.current.has(slot.photoId)) {
          if (!cancelled) {
            setSlots(prev => prev.map(s =>
              s.photoId === slot.photoId
                ? { ...s, dataUrl: imageCache.current.get(slot.photoId) }
                : s
            ));
          }
          continue;
        }

        try {
          const dataUrl = await invoke<string>('get_image_data', { filePath: slot.filePath });
          if (!cancelled) {
            imageCache.current.set(slot.photoId, dataUrl);
            setSlots(prev => prev.map(s =>
              s.photoId === slot.photoId ? { ...s, dataUrl } : s
            ));
          }
        } catch (err) {
          logger.warn('Failed to load image for share card:', err);
        }
      }
    };

    loadImages();
    return () => { cancelled = true; };
  }, [isOpen, slots]);

  // ── Assign photo to a slot ──
  const handlePhotoClick = useCallback((photo: SelectablePhoto) => {
    setSlots(prev => {
      const newSlots = [...prev];
      // Check if this photo is already in a slot
      const existingIdx = newSlots.findIndex(s => s.photoId === photo.id);
      if (existingIdx >= 0) {
        // Deselect it
        newSlots[existingIdx] = {
          photoId: -1,
          filePath: '',
          crop: { x: 0, y: 0 },
          zoom: 1,
          croppedAreaPixels: null,
        };
        return newSlots;
      }

      // Find first empty slot, or replace active slot
      let targetIdx = newSlots.findIndex(s => s.photoId < 0);
      if (targetIdx < 0) targetIdx = activeSlotIndex;

      newSlots[targetIdx] = {
        photoId: photo.id,
        filePath: photo.filePath,
        dataUrl: imageCache.current.get(photo.id),
        crop: { x: 0, y: 0 },
        zoom: 1,
        croppedAreaPixels: null,
      };

      return newSlots;
    });
  }, [activeSlotIndex]);

  // ── Crop handlers ──
  const handleCropChange = useCallback((crop: { x: number; y: number }) => {
    setSlots(prev => prev.map((s, i) =>
      i === activeSlotIndex ? { ...s, crop } : s
    ));
  }, [activeSlotIndex]);

  const handleZoomChange = useCallback((zoom: number) => {
    setSlots(prev => prev.map((s, i) =>
      i === activeSlotIndex ? { ...s, zoom } : s
    ));
  }, [activeSlotIndex]);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setSlots(prev => prev.map((s, i) =>
      i === activeSlotIndex ? { ...s, croppedAreaPixels } : s
    ));
  }, [activeSlotIndex]);

  // ── Overlay toggle ──
  const toggleOverlay = useCallback((key: keyof OverlayConfig) => {
    setOverlay(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // ── Compute active slot's aspect ratio ──
  const activeSlotAspect = useMemo(() => {
    const layoutSlot = layout.slots[activeSlotIndex];
    if (!layoutSlot) return preset.width / preset.height;
    const slotW = layoutSlot.width * preset.width;
    const slotH = layoutSlot.height * preset.height;
    return slotW / slotH;
  }, [layout, activeSlotIndex, preset]);

  // ── Build share card config ──
  const buildConfig = useCallback((): ShareCardConfig => {
    return {
      shareType,
      preset,
      layout,
      slots,
      theme,
      overlay,
      diveData: dive ? {
        diveNumber: dive.dive_number,
        date: dive.date,
        time: dive.time,
        maxDepthM: dive.max_depth_m,
        meanDepthM: dive.mean_depth_m,
        durationSeconds: dive.duration_seconds,
        waterTempC: dive.water_temp_c ?? undefined,
        location: dive.location ?? undefined,
        siteName: diveSiteName,
        buddy: dive.buddy ?? undefined,
        isNightDive: dive.is_night_dive,
        isBoatDive: dive.is_boat_dive,
      } : undefined,
      tripData: trip ? {
        name: trip.name,
        location: trip.location,
        dateStart: trip.date_start,
        dateEnd: trip.date_end,
        diveCount: tripStats?.diveCount,
        totalUnderwaterSeconds: tripStats?.totalUnderwaterSeconds,
        deepestDiveM: tripStats?.deepestDiveM,
        speciesCount: tripStats?.speciesCount,
      } : undefined,
      speciesTags,
      generalTags,
      diveSamples,
    };
  }, [shareType, preset, layout, slots, theme, overlay, dive, trip, speciesTags, generalTags, diveSamples, diveSiteName, tripStats]);

  // ── Render preview (debounced) ──
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Only render if at least one slot has an image
    const hasAnyImage = slots.some(s => s.dataUrl);
    if (!hasAnyImage) {
      setPreviewUrl(null);
      return;
    }

    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(async () => {
      try {
        setIsRendering(true);
        const config = buildConfig();
        const result = await renderShareCard(config, 'jpeg', 0.8);
        setPreviewUrl(result.dataUrl);
      } catch (err) {
        logger.warn('Failed to render preview:', err);
      } finally {
        setIsRendering(false);
      }
    }, 400);

    return () => {
      if (previewTimeout.current) clearTimeout(previewTimeout.current);
    };
  }, [isOpen, slots, preset, layout, theme, overlay, buildConfig]);

  // ── Save to file ──
  const handleSave = useCallback(async () => {
    try {
      setStatusMsg(null);
      setIsRendering(true);
      const config = buildConfig();
      const result = await renderShareCard(config, 'png', 1.0);

      const filePath = await save({
        title: 'Save Share Card',
        defaultPath: `share_card_${preset.id}_${Date.now()}.png`,
        filters: [
          { name: 'PNG Image', extensions: ['png'] },
          { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        ],
      });

      if (!filePath) {
        setIsRendering(false);
        return;
      }

      // Convert blob to base64 for Tauri file writing
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Strip the data URL prefix
          resolve(dataUrl.split(',')[1]);
        };
        reader.readAsDataURL(result.blob);
      });

      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await writeFile(filePath, bytes);

      setStatusMsg({ text: `Saved to ${filePath}`, type: 'success' });
    } catch (err) {
      logger.error('Failed to save share card:', err);
      setStatusMsg({ text: `Error: ${err}`, type: 'error' });
    } finally {
      setIsRendering(false);
    }
  }, [buildConfig, preset]);

  // ── Copy to clipboard ──
  const handleCopy = useCallback(async () => {
    try {
      setStatusMsg(null);
      setIsRendering(true);
      const config = buildConfig();
      const result = await renderShareCard(config, 'png', 1.0);

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': result.blob,
        }),
      ]);

      setStatusMsg({ text: 'Copied to clipboard!', type: 'success' });
    } catch (err) {
      logger.error('Failed to copy share card:', err);
      setStatusMsg({ text: `Copy failed: ${err}`, type: 'error' });
    } finally {
      setIsRendering(false);
    }
  }, [buildConfig]);

  // ── Reset on close ──
  useEffect(() => {
    if (!isOpen) {
      setStatusMsg(null);
      setPreviewUrl(null);
      setPhotoSearch('');
      setSearchResultPhotos(null);
      setAllPhotos([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeSlot = slots[activeSlotIndex];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal share-card-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-title"
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id="share-card-title">
            Share {shareType === 'trip' ? 'Trip' : shareType === 'dive' ? 'Dive' : 'Photo'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body: Left config + Right preview */}
        <div className="share-card-content">
          {/* ── Left Panel ── */}
          <div className="share-card-left">

            {/* Platform Presets */}
            <div className="share-card-section">
              <h3 className="share-card-section-title">Platform</h3>
              <div className="share-card-presets">
                {SHARE_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`share-card-preset-btn ${preset.id === p.id ? 'active' : ''}`}
                    onClick={() => setPreset(p)}
                    title={`${p.width}×${p.height}`}
                  >
                    <PresetIcon presetId={p.id} size={14} />
                    <span>{p.name}</span>
                    <span className="share-card-preset-size">{p.width}×{p.height}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Layouts */}
            <div className="share-card-section">
              <h3 className="share-card-section-title">Layout</h3>
              <div className="share-card-layouts">
                {SHARE_LAYOUTS.map(l => (
                  <button
                    key={l.id}
                    className={`share-card-layout-btn ${layout.id === l.id ? 'active' : ''}`}
                    onClick={() => setLayout(l)}
                    title={l.name}
                  >
                    <LayoutThumb layout={l} />
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Selector */}
            <div className="share-card-section">
              <h3 className="share-card-section-title">
                Photos ({slots.filter(s => s.photoId >= 0).length}/{layout.slotCount})
                {allPhotos.length > 0 && (
                  <span className="share-card-photo-count">{allPhotos.length} available</span>
                )}
              </h3>
              <div className="share-card-photo-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by filename or species..."
                  value={photoSearch}
                  onChange={e => setPhotoSearch(e.target.value)}
                />
                {photoSearch && (
                  <button
                    className="share-card-photo-search-clear"
                    onClick={() => setPhotoSearch('')}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              {selectablePhotos.length === 0 ? (
                <div className="share-card-empty-photos">No photos available</div>
              ) : (
                <div className="share-card-photo-grid">
                  {selectablePhotos.map(photo => {
                    const slotIdx = slots.findIndex(s => s.photoId === photo.id);
                    return (
                      <div
                        key={photo.id}
                        className={`share-card-photo-thumb ${slotIdx >= 0 ? 'selected' : ''}`}
                        onClick={() => handlePhotoClick(photo)}
                      >
                        <PhotoThumb photo={photo} />
                        {slotIdx >= 0 && (
                          <span className="slot-badge">{slotIdx + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Per-Slot Crop Editor */}
            {layout.slotCount > 0 && (
              <div className="share-card-section">
                <h3 className="share-card-section-title">Framing</h3>
                {layout.slotCount > 1 && (
                  <div className="share-card-slot-tabs">
                    {slots.map((_, i) => (
                      <button
                        key={i}
                        className={`share-card-slot-tab ${activeSlotIndex === i ? 'active' : ''}`}
                        onClick={() => setActiveSlotIndex(i)}
                      >
                        Slot {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                {activeSlot?.dataUrl ? (
                  <>
                    <div className="share-card-crop-container">
                      <Cropper
                        image={activeSlot.dataUrl}
                        crop={activeSlot.crop}
                        zoom={activeSlot.zoom}
                        aspect={activeSlotAspect}
                        onCropChange={handleCropChange}
                        onZoomChange={handleZoomChange}
                        onCropComplete={handleCropComplete}
                        showGrid={false}
                      />
                    </div>
                    <div className="share-card-zoom-row">
                      <label>Zoom</label>
                      <input
                        type="range"
                        min={1}
                        max={4}
                        step={0.05}
                        value={activeSlot.zoom}
                        onChange={e => handleZoomChange(parseFloat(e.target.value))}
                      />
                    </div>
                  </>
                ) : (
                  <div className="share-card-crop-empty">
                    {activeSlot?.photoId >= 0 ? 'Loading image...' : 'Select a photo above'}
                  </div>
                )}
              </div>
            )}

            {/* Theme */}
            <div className="share-card-section">
              <h3 className="share-card-section-title">Theme</h3>
              <div className="share-card-themes">
                {(Object.keys(CARD_THEMES) as CardTheme[]).map(t => (
                  <button
                    key={t}
                    className={`share-card-theme-btn theme-${t} ${theme === t ? 'active' : ''}`}
                    onClick={() => setTheme(t)}
                    title={t.charAt(0).toUpperCase() + t.slice(1)}
                  />
                ))}
              </div>
            </div>

            {/* Overlay Toggles */}
            <div className="share-card-section">
              <h3 className="share-card-section-title">Overlay</h3>
              <div className="share-card-toggles">
                <label className="share-card-toggle">
                  <input type="checkbox" checked={overlay.showLocation} onChange={() => toggleOverlay('showLocation')} />
                  Location
                </label>
                <label className="share-card-toggle">
                  <input type="checkbox" checked={overlay.showDate} onChange={() => toggleOverlay('showDate')} />
                  Date
                </label>
                {shareType !== 'trip' && (
                  <>
                    <label className="share-card-toggle">
                      <input type="checkbox" checked={overlay.showDiveNumber} onChange={() => toggleOverlay('showDiveNumber')} />
                      Dive Number
                    </label>
                    <label className="share-card-toggle">
                      <input type="checkbox" checked={overlay.showDepth} onChange={() => toggleOverlay('showDepth')} />
                      Max Depth
                    </label>
                    <label className="share-card-toggle">
                      <input type="checkbox" checked={overlay.showDuration} onChange={() => toggleOverlay('showDuration')} />
                      Duration
                    </label>
                    <label className="share-card-toggle">
                      <input type="checkbox" checked={overlay.showTemp} onChange={() => toggleOverlay('showTemp')} />
                      Water Temp
                    </label>
                    {diveSamples.length > 1 && (
                      <label className="share-card-toggle">
                        <input type="checkbox" checked={overlay.showDiveProfile} onChange={() => toggleOverlay('showDiveProfile')} />
                        Dive Profile
                      </label>
                    )}
                  </>
                )}
                {speciesTags.length > 0 && (
                  <label className="share-card-toggle">
                    <input type="checkbox" checked={overlay.showSpeciesTags} onChange={() => toggleOverlay('showSpeciesTags')} />
                    Species Tags ({speciesTags.length})
                  </label>
                )}
                {generalTags.length > 0 && (
                  <label className="share-card-toggle">
                    <input type="checkbox" checked={overlay.showGeneralTags} onChange={() => toggleOverlay('showGeneralTags')} />
                    Tags ({generalTags.length})
                  </label>
                )}
                <label className="share-card-toggle">
                  <input type="checkbox" checked={overlay.showWatermark} onChange={() => toggleOverlay('showWatermark')} />
                  Watermark
                </label>
              </div>
            </div>

            {/* Custom Text */}
            <div className="share-card-section">
              <h3 className="share-card-section-title">Custom Text</h3>
              <textarea
                className="share-card-text-input"
                placeholder="Add caption or note..."
                value={overlay.customText}
                onChange={e => setOverlay(prev => ({ ...prev, customText: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Status */}
            {statusMsg && (
              <div className={`share-card-status ${statusMsg.type}`}>
                {statusMsg.text}
              </div>
            )}
          </div>

          {/* ── Right Panel (Preview) ── */}
          <div className="share-card-right">
            <div className="share-card-preview-label">
              {preset.name} • {preset.width}×{preset.height}
            </div>
            <div className="share-card-preview-wrapper">
              {isRendering && !previewUrl ? (
                <div className="share-card-preview-loading">
                  <div className="spinner" />
                  Rendering preview...
                </div>
              ) : previewUrl ? (
                <img
                  className="share-card-preview-image"
                  src={previewUrl}
                  alt="Share card preview"
                  draggable={false}
                />
              ) : (
                <div className="share-card-preview-placeholder">
                  Select photos to see preview
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="share-card-footer">
          <span className="share-card-footer-left">
            {preset.width}×{preset.height} • {layout.name}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleCopy}
            disabled={isRendering || !slots.some(s => s.dataUrl)}
            title="Copy to clipboard"
          >
            <ClipboardIcon size={16} />
            Copy
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isRendering || !slots.some(s => s.dataUrl)}
          >
            <SaveFileIcon size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Photo Thumbnail Subcomponent ──

function PhotoThumb({ photo }: { photo: SelectablePhoto }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = photo.thumbnailPath || photo.filePath;

    invoke<string>('get_image_data', { filePath: path })
      .then(dataUrl => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        // Silently fail - thumbnail not available
      });

    return () => { cancelled = true; };
  }, [photo.thumbnailPath, photo.filePath]);

  if (!src) {
    return <div style={{ width: '100%', height: '100%', background: 'var(--bg-dark)' }} />;
  }

  return <img src={src} alt={photo.filename} loading="lazy" />;
}
