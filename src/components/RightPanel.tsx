import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import type { Photo, Dive, SpeciesTag, GeneralTag, Trip, IdentificationResult, TankPressure, DiveTank, EquipmentSet, PhotoDiveContext, ExternalSubmission, SpeciesEnrichmentCache, INatSubmissionResult } from '../types';
import { IUCN_LABELS, IUCN_COLORS, MEGAFAUNA_DEEP_LINKS } from '../types';
import { useGeminiApiKey, useSettings } from './SettingsModal';
import { logger } from '../utils/logger';
import './RightPanel.css';

interface CommunitySiteSpecies {
  species_name: string;
  scientific_name: string | null;
  category: string | null;
  sighting_count: number;
  last_seen: string | null;
  min_depth: number | null;
  max_depth: number | null;
}

interface RightPanelProps {
  photo: Photo | null;
  dive: Dive | null;
  trip?: Trip | null;
  onPhotoUpdated?: () => void;
  onSpeciesIdentified?: () => void;
}

// Format file size in human-readable format
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Tank summary for display (merged from DiveTank metadata + TankPressure time series)
interface TankSummary {
  sensorId: number;
  sensorName?: string;
  gasIndex: number;
  o2Percent?: number;
  hePercent?: number;
  startPressure?: number;
  endPressure?: number;
  consumption?: number;
}

export function RightPanel({ photo, dive, trip, onPhotoUpdated, onSpeciesIdentified }: RightPanelProps) {
  const [speciesTags, setSpeciesTags] = useState<SpeciesTag[]>([]);
  const [generalTags, setGeneralTags] = useState<GeneralTag[]>([]);
  const [rating, setRating] = useState(0);
  const [caption, setCaption] = useState('');
  const [captionSaving, setCaptionSaving] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [showContextInput, setShowContextInput] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');
  const [tankPressures, setTankPressures] = useState<TankPressure[]>([]);
  const [diveTanks, setDiveTanks] = useState<DiveTank[]>([]);
  const [diveEquipmentSets, setDiveEquipmentSets] = useState<EquipmentSet[]>([]);
  const [cameraEquipmentSets, setCameraEquipmentSets] = useState<EquipmentSet[]>([]);
  const [diveContext, setDiveContext] = useState<PhotoDiveContext | null>(null);
  const [submissions, setSubmissions] = useState<ExternalSubmission[]>([]);
  const [inatConnected, setInatConnected] = useState(false);
  const [enrichments, setEnrichments] = useState<Map<number, SpeciesEnrichmentCache>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { apiKey: geminiApiKey } = useGeminiApiKey();
  const settings = useSettings();

  // Community sightings state
  const [communitySightings, setCommunitySightings] = useState<CommunitySiteSpecies[]>([]);
  const [communitySightingsOpen, setCommunitySightingsOpen] = useState(false);
  const [communitySightingsLoading, setCommunitySightingsLoading] = useState(false);

  // Reset community sightings when dive changes
  useEffect(() => {
    setCommunitySightings([]);
    setCommunitySightingsOpen(false);
  }, [dive?.id]);

  const handleLoadCommunitySightings = useCallback(async () => {
    if (!dive?.latitude || !dive?.longitude) return;
    if (communitySightingsOpen) {
      setCommunitySightingsOpen(false);
      return;
    }
    setCommunitySightingsLoading(true);
    setCommunitySightingsOpen(true);
    try {
      const nearbySites = await invoke<Array<{ id: string | null }>>('community_get_nearby_dive_sites', {
        lat: dive.latitude,
        lon: dive.longitude,
        radiusKm: 1.0,
      });
      // Fetch species summary for each nearby site
      const allSpecies: CommunitySiteSpecies[] = [];
      for (const site of nearbySites) {
        if (site.id) {
          const summary = await invoke<CommunitySiteSpecies[]>('community_get_site_species_summary', { diveSiteId: site.id });
          allSpecies.push(...summary);
        }
      }
      // Deduplicate by species_name, keeping highest sighting_count
      const speciesMap = new Map<string, CommunitySiteSpecies>();
      for (const sp of allSpecies) {
        const existing = speciesMap.get(sp.species_name);
        if (!existing || sp.sighting_count > existing.sighting_count) {
          speciesMap.set(sp.species_name, sp);
        }
      }
      setCommunitySightings(Array.from(speciesMap.values()).sort((a, b) => b.sighting_count - a.sighting_count));
    } catch (err) {
      logger.error('Failed to load community sightings:', err);
      setCommunitySightings([]);
    } finally {
      setCommunitySightingsLoading(false);
    }
  }, [dive?.latitude, dive?.longitude, communitySightingsOpen]);

  // Check iNaturalist connection on mount
  useEffect(() => {
    invoke<string | null>('inat_get_username')
      .then((username) => setInatConnected(!!username))
      .catch(() => setInatConnected(false));
  }, []);

  // Load tags when photo changes (separate from rating to avoid unnecessary reloads)
  useEffect(() => {
    if (photo) {
      loadSpeciesTags(photo.id);
      loadGeneralTags(photo.id);
    } else {
      setSpeciesTags([]);
      setGeneralTags([]);
    }
  }, [photo?.id]);

  // Load dive context when photo changes (depth at capture, etc.)
  useEffect(() => {
    if (photo?.dive_id) {
      loadDiveContext(photo.id);
    } else {
      setDiveContext(null);
    }
  }, [photo?.id, photo?.dive_id]);

  // Sync rating state when photo or its rating changes
  useEffect(() => {
    setRating(photo?.rating || 0);
  }, [photo?.id, photo?.rating]);

  // Sync caption state when photo changes
  useEffect(() => {
    setCaption(photo?.caption || '');
  }, [photo?.id, photo?.caption]);

  // Load external submissions and enrichment data
  useEffect(() => {
    if (photo) {
      loadSubmissions(photo.id);
    } else {
      setSubmissions([]);
    }
    setSubmitError(null);
  }, [photo?.id]);

  useEffect(() => {
    // Fetch enrichment data for each species tag
    const newEnrichments = new Map<number, SpeciesEnrichmentCache>();
    if (speciesTags.length > 0) {
      Promise.all(
        speciesTags.map(async (tag) => {
          try {
            const data = await invoke<SpeciesEnrichmentCache | null>('get_species_enrichment', { speciesTagId: tag.id });
            if (data) newEnrichments.set(tag.id, data);
          } catch {
            // silently skip
          }
        })
      ).then(() => setEnrichments(newEnrichments));
    } else {
      setEnrichments(newEnrichments);
    }
  }, [speciesTags]);

  // Load tank data and equipment sets when dive changes
  useEffect(() => {
    if (dive) {
      loadTankPressures(dive.id);
      loadDiveTanks(dive.id);
      loadEquipmentSets(dive.id);
    } else {
      setTankPressures([]);
      setDiveTanks([]);
      setDiveEquipmentSets([]);
      setCameraEquipmentSets([]);
    }
  }, [dive?.id]);

  const loadTankPressures = async (diveId: number) => {
    try {
      const pressures = await invoke<TankPressure[]>('get_tank_pressures', { diveId });
      setTankPressures(pressures);
    } catch (error) {
      logger.error('Failed to load tank pressures:', error);
      setTankPressures([]);
    }
  };

  const loadDiveTanks = async (diveId: number) => {
    try {
      const tanks = await invoke<DiveTank[]>('get_dive_tanks', { diveId });
      setDiveTanks(tanks);
    } catch (error) {
      logger.error('Failed to load dive tanks:', error);
      setDiveTanks([]);
    }
  };

  const loadEquipmentSets = async (diveId: number) => {
    try {
      const sets = await invoke<EquipmentSet[]>('get_equipment_sets_for_dive', { diveId });
      setDiveEquipmentSets(sets.filter(s => s.set_type === 'dive'));
      setCameraEquipmentSets(sets.filter(s => s.set_type === 'camera'));
    } catch (error) {
      logger.error('Failed to load equipment sets:', error);
      setDiveEquipmentSets([]);
      setCameraEquipmentSets([]);
    }
  };

  const loadDiveContext = async (photoId: number) => {
    try {
      const ctx = await invoke<PhotoDiveContext | null>('get_photo_dive_context', { photoId });
      setDiveContext(ctx);
    } catch (error) {
      logger.error('Failed to load dive context:', error);
      setDiveContext(null);
    }
  };

  const loadSubmissions = async (photoId: number) => {
    try {
      const subs = await invoke<ExternalSubmission[]>('get_photo_submissions', { photoId });
      setSubmissions(subs);
    } catch (error) {
      logger.error('Failed to load submissions:', error);
      setSubmissions([]);
    }
  };

  const handleSubmitToINat = async () => {
    if (!photo) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await invoke<INatSubmissionResult>('inat_submit_observation', { photoId: photo.id });
      await loadSubmissions(photo.id);
      await invoke('open_url', { url: result.url });
    } catch (error) {
      logger.error('Failed to submit to iNaturalist:', error);
      setSubmitError(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const openExternalUrl = async (url: string) => {
    try {
      await invoke('open_url', { url });
    } catch (error) {
      logger.error('Failed to open URL:', error);
    }
  };

  // Compute tank summaries by merging dive_tanks (gas mix metadata) with tank_pressures (time series)
  const tankSummaries = useMemo<TankSummary[]>(() => {
    // Start with dive_tanks as the primary source if available
    if (diveTanks.length > 0) {
      const summaries: TankSummary[] = diveTanks.map(tank => {
        // Try to find matching pressure data from tank_pressures
        const pressureReadings = tankPressures.filter(tp => tp.sensor_id === tank.sensor_id);
        let startPressure = tank.start_pressure_bar ?? undefined;
        let endPressure = tank.end_pressure_bar ?? undefined;
        
        // If we have pressure readings, use those for more accurate start/end
        if (pressureReadings.length > 0) {
          pressureReadings.sort((a, b) => a.time_seconds - b.time_seconds);
          startPressure = pressureReadings[0].pressure_bar;
          endPressure = pressureReadings[pressureReadings.length - 1].pressure_bar;
        }

        return {
          sensorId: tank.sensor_id,
          sensorName: undefined, // dive_tanks doesn't have sensor name yet
          gasIndex: tank.gas_index,
          o2Percent: tank.o2_percent ?? undefined,
          hePercent: tank.he_percent ?? undefined,
          startPressure,
          endPressure,
          consumption: startPressure !== undefined && endPressure !== undefined 
            ? startPressure - endPressure 
            : undefined,
        };
      });

      // Sort by gas index, then sensor ID
      summaries.sort((a, b) => {
        if (a.gasIndex !== b.gasIndex) return a.gasIndex - b.gasIndex;
        return a.sensorId - b.sensorId;
      });

      return summaries;
    }

    // Fallback: compute from tank_pressures only (legacy data)
    if (tankPressures.length === 0) return [];

    // Group by sensor_id
    const bySensor = new Map<number, TankPressure[]>();
    for (const tp of tankPressures) {
      const existing = bySensor.get(tp.sensor_id) || [];
      existing.push(tp);
      bySensor.set(tp.sensor_id, existing);
    }

    // Create summary for each tank
    const summaries: TankSummary[] = [];
    for (const [sensorId, readings] of bySensor.entries()) {
      // Sort by time to get first and last
      readings.sort((a, b) => a.time_seconds - b.time_seconds);
      const first = readings[0];
      const last = readings[readings.length - 1];
      summaries.push({
        sensorId,
        sensorName: first.sensor_name,
        gasIndex: 0,
        startPressure: first.pressure_bar,
        endPressure: last.pressure_bar,
        consumption: first.pressure_bar - last.pressure_bar,
      });
    }

    // Sort by sensor name if available, otherwise by sensor ID
    summaries.sort((a, b) => {
      if (a.sensorName && b.sensorName) {
        return a.sensorName.localeCompare(b.sensorName);
      }
      return a.sensorId - b.sensorId;
    });

    return summaries;
  }, [diveTanks, tankPressures]);

  const loadSpeciesTags = async (photoId: number) => {
    try {
      const tags = await invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId });
      setSpeciesTags(tags);
    } catch (error) {
      logger.error('Failed to load species tags:', error);
      setSpeciesTags([]);
    }
  };

  const loadGeneralTags = async (photoId: number) => {
    try {
      const tags = await invoke<GeneralTag[]>('get_general_tags_for_photo', { photoId });
      setGeneralTags(tags);
    } catch (error) {
      logger.error('Failed to load general tags:', error);
      setGeneralTags([]);
    }
  };

  const handleRemoveSpeciesTag = async (tagId: number) => {
    if (!photo) return;
    try {
      await invoke('remove_species_tag_from_photo', {
        photoId: photo.id,
        speciesTagId: tagId,
      });
      loadSpeciesTags(photo.id);
    } catch (error) {
      logger.error('Failed to remove species tag:', error);
    }
  };

  const handleRemoveGeneralTag = async (tagId: number) => {
    if (!photo) return;
    try {
      await invoke('remove_general_tag_from_photo', {
        photoId: photo.id,
        generalTagId: tagId,
      });
      loadGeneralTags(photo.id);
    } catch (error) {
      logger.error('Failed to remove general tag:', error);
    }
  };

  const [rescanning, setRescanning] = useState(false);

  const handleRatingChange = async (newRating: number) => {
    if (!photo) return;
    // Toggle off if clicking same star
    const finalRating = newRating === rating ? 0 : newRating;
    setRating(finalRating);
    try {
      await invoke('update_photo_rating', {
        photoId: photo.id,
        rating: finalRating,
      });
      onPhotoUpdated?.();
    } catch (error) {
      logger.error('Failed to update rating:', error);
      setRating(photo.rating || 0);
    }
  };

  const handleCaptionSave = async () => {
    if (!photo) return;
    const trimmed = caption.trim();
    if (trimmed === (photo.caption || '')) return;
    setCaptionSaving(true);
    try {
      await invoke('update_photo_caption', {
        photoId: photo.id,
        caption: trimmed || null,
      });
      onPhotoUpdated?.();
    } catch (error) {
      logger.error('Failed to update caption:', error);
      setCaption(photo.caption || '');
    } finally {
      setCaptionSaving(false);
    }
  };

  const handleRescanExif = async () => {
    if (!photo || rescanning) return;
    setRescanning(true);
    try {
      const result = await invoke('rescan_photo_exif', { photoId: photo.id });
      logger.debug('Rescan result:', result);
      alert('EXIF rescanned! Refreshing photo data...');
      onPhotoUpdated?.();
    } catch (error) {
      logger.error('Failed to rescan EXIF:', error);
      alert('Failed to rescan EXIF: ' + error);
    } finally {
      setRescanning(false);
    }
  };

  const handleDumpExif = async () => {
    if (!photo) return;
    try {
      const tags = await invoke<string[]>('debug_dump_exif', { photoId: photo.id });
      logger.debug('=== EXIF DUMP for', photo.filename, '===');
      tags.forEach(tag => logger.debug(tag));
      alert(`EXIF dump logged to console. Found ${tags.length} entries.`);
    } catch (error) {
      logger.error('Failed to dump EXIF:', error);
      alert('Failed to dump EXIF: ' + error);
    }
  };

  const handleIdentifyClick = () => {
    if (!photo) return;
    
    if (!geminiApiKey) {
      setIdentifyError('Please set your Google Gemini API key in Settings');
      return;
    }
    
    // If there are existing species tags, show context input for correction
    if (speciesTags.length > 0) {
      setShowContextInput(true);
      setAdditionalContext('');
    } else {
      // No existing tags, identify directly
      handleIdentifySpecies();
    }
  };

  const handleIdentifySpecies = async (userContext?: string) => {
    if (!photo) return;
    
    if (!geminiApiKey) {
      setIdentifyError('Please set your Google Gemini API key in Settings');
      return;
    }
    
    setIdentifying(true);
    setIdentifyError(null);
    setShowContextInput(false);
    
    try {
      // Build location context from trip and dive
      let locationContext: string | undefined;
      if (trip?.location) {
        locationContext = trip.location;
        if (dive?.location && dive.location !== trip.location) {
          locationContext += `, ${dive.location}`;
        }
      } else if (dive?.location) {
        locationContext = dive.location;
      }
      
      // Add user context if provided - don't mention previous IDs to avoid hallucinations
      if (userContext && userContext.trim()) {
        const userHint = `Additional context from user: ${userContext.trim()}`;
        locationContext = locationContext 
          ? `${locationContext}. ${userHint}`
          : userHint;
        
        // Remove old species tags when re-identifying
        for (const tag of speciesTags) {
          await invoke('remove_species_tag_from_photo', {
            photoId: photo.id,
            speciesTagId: tag.id,
          });
        }
      }
      
      const result = await invoke<IdentificationResult>('identify_species_in_photo', {
        apiKey: geminiApiKey,
        photoId: photo.id,
        locationContext,
      });
      
      if (result.error) {
        setIdentifyError(result.error);
        return;
      }
      
      if (result.identification?.common_name) {
        // Create and apply the species tag
        const tagId = await invoke<number>('get_or_create_species_tag', {
          name: result.identification.common_name,
          category: result.identification.category,
          scientificName: result.identification.scientific_name,
        });
        
        await invoke('add_species_tag_to_photos', {
          photoIds: [photo.id],
          speciesTagId: tagId,
        });
        
        // Add category as a general tag (e.g., "fish", "nudibranch", "crab")
        if (result.identification.category) {
          const categoryTag = result.identification.category.toLowerCase();
          const generalTagId = await invoke<number>('get_or_create_general_tag', {
            name: categoryTag,
          });
          await invoke('add_general_tag_to_photos', {
            photoIds: [photo.id],
            generalTagId: generalTagId,
          });
        }
        
        // Also add any additional species found
        for (const species of result.identification.multiple_species || []) {
          if (species.common_name && species.common_name !== result.identification.common_name) {
            const additionalTagId = await invoke<number>('get_or_create_species_tag', {
              name: species.common_name,
              category: species.category,
              scientificName: species.scientific_name,
            });
            await invoke('add_species_tag_to_photos', {
              photoIds: [photo.id],
              speciesTagId: additionalTagId,
            });
            
            // Add category tag for additional species too
            if (species.category) {
              const categoryTag = species.category.toLowerCase();
              const generalTagId = await invoke<number>('get_or_create_general_tag', {
                name: categoryTag,
              });
              await invoke('add_general_tag_to_photos', {
                photoIds: [photo.id],
                generalTagId: generalTagId,
              });
            }
          }
        }
        
        // Reload tags
        loadSpeciesTags(photo.id);
        loadGeneralTags(photo.id);
        
        // Notify parent to sync community
        onSpeciesIdentified?.();
        
        // Show confidence info
        const confidence = result.identification.confidence || 'unknown';
        logger.info(`Identified as ${result.identification.common_name} (${confidence} confidence)`);
        if (result.identification.description) {
          logger.debug(`Description: ${result.identification.description}`);
        }
      } else {
        setIdentifyError('No species identified in this photo');
      }
    } catch (error) {
      logger.error('Failed to identify species:', error);
      setIdentifyError(`Failed: ${error}`);
    } finally {
      setIdentifying(false);
    }
  };

  if (!photo && !dive && !trip) {
    return (
      <aside className="panel">
        <div className="panel-header">
          <h3>Details</h3>
        </div>
        <div className="panel-content">
          <div className="panel-empty">
            <p className="text-muted">Select a photo to view details</p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel">
      {photo && (
        <>
          <div className="panel-header">
            <h3>Photo Info</h3>
          </div>
          <div className="panel-content">
            <div className="panel-section">
              <div className="panel-section-header">
                <h4 className="panel-section-title">File</h4>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    className="btn-icon-small" 
                    onClick={handleRescanExif}
                    disabled={rescanning}
                    title="Rescan EXIF data"
                  >
                    {rescanning ? '⏳' : '🔄'}
                  </button>
                  <button 
                    className="btn-icon-small" 
                    onClick={handleDumpExif}
                    title="Debug: dump all EXIF tags to console"
                  >
                    🔍
                  </button>
                </div>
              </div>
              <dl className="info-list">
                <div className="info-item">
                  <dt>Filename</dt>
                  <dd className="filename-value">{photo.filename}</dd>
                </div>
                {photo.capture_time && (
                  <div className="info-item">
                    <dt>Captured</dt>
                    <dd>{format(new Date(photo.capture_time), 'MMM d, yyyy HH:mm:ss')}</dd>
                  </div>
                )}
                {photo.file_size_bytes && (
                  <div className="info-item">
                    <dt>File Size</dt>
                    <dd>{formatFileSize(photo.file_size_bytes)}</dd>
                  </div>
                )}
                {photo.width && photo.height && (
                  <div className="info-item">
                    <dt>Dimensions</dt>
                    <dd>{photo.width} × {photo.height}</dd>
                  </div>
                )}
                {photo.is_processed && (
                  <div className="info-item">
                    <dt>Type</dt>
                    <dd>Processed version</dd>
                  </div>
                )}
              </dl>
            </div>

            {(photo.camera_make || photo.camera_model || photo.lens_info) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Camera</h4>
                <dl className="info-list">
                  {photo.camera_make && (
                    <div className="info-item">
                      <dt>Make</dt>
                      <dd>{photo.camera_make}</dd>
                    </div>
                  )}
                  {photo.camera_model && (
                    <div className="info-item">
                      <dt>Model</dt>
                      <dd>{photo.camera_model}</dd>
                    </div>
                  )}
                  {photo.lens_info && (
                    <div className="info-item">
                      <dt>Lens</dt>
                      <dd>{photo.lens_info}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {(photo.focal_length_mm || photo.aperture || photo.shutter_speed || photo.iso || photo.exposure_compensation !== undefined || photo.white_balance || photo.flash_fired !== undefined || photo.metering_mode) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Exposure</h4>
                <div className="exif-grid">
                  {photo.focal_length_mm && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.focal_length_mm}mm</span>
                      <span className="exif-label">Focal</span>
                    </div>
                  )}
                  {photo.aperture && (
                    <div className="exif-item">
                      <span className="exif-value">f/{photo.aperture}</span>
                      <span className="exif-label">Aperture</span>
                    </div>
                  )}
                  {photo.shutter_speed && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.shutter_speed}</span>
                      <span className="exif-label">Shutter</span>
                    </div>
                  )}
                  {photo.iso && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.iso}</span>
                      <span className="exif-label">ISO</span>
                    </div>
                  )}
                  {(photo.exposure_compensation !== undefined && photo.exposure_compensation !== null) && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.exposure_compensation > 0 ? '+' : ''}{Number(photo.exposure_compensation).toFixed(1)} EV</span>
                      <span className="exif-label">Exp Comp</span>
                    </div>
                  )}
                  {(photo.flash_fired !== undefined && photo.flash_fired !== null) && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.flash_fired ? 'Yes' : 'No'}</span>
                      <span className="exif-label">Flash</span>
                    </div>
                  )}
                  {photo.white_balance && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.white_balance}</span>
                      <span className="exif-label">WB</span>
                    </div>
                  )}
                  {photo.metering_mode && (
                    <div className="exif-item">
                      <span className="exif-value">{photo.metering_mode}</span>
                      <span className="exif-label">Metering</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(photo.gps_latitude !== undefined && photo.gps_latitude !== null && photo.gps_longitude !== undefined && photo.gps_longitude !== null) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Location</h4>
                <dl className="info-list">
                  <div className="info-item">
                    <dt>GPS</dt>
                    <dd>{Number(photo.gps_latitude).toFixed(6)}, {Number(photo.gps_longitude).toFixed(6)}</dd>
                  </div>
                </dl>
              </div>
            )}

            {diveContext && (
              <div className="panel-section">
                <h4 className="panel-section-title">Dive Context</h4>
                {diveContext.depth_at_capture_m != null && (
                  <div className="dive-context-depth">
                    <span className="depth-value">{diveContext.depth_at_capture_m.toFixed(1)}</span>
                    <span className="depth-unit">m</span>
                    <span className="depth-label">depth at capture</span>
                  </div>
                )}
                <dl className="info-list">
                  {diveContext.time_into_dive_seconds != null && (
                    <div className="info-item">
                      <dt>Time into dive</dt>
                      <dd>{Math.floor(diveContext.time_into_dive_seconds / 60)}:{String(diveContext.time_into_dive_seconds % 60).padStart(2, '0')}</dd>
                    </div>
                  )}
                  {diveContext.temp_at_capture_c != null && (
                    <div className="info-item">
                      <dt>Temp at depth</dt>
                      <dd>{diveContext.temp_at_capture_c.toFixed(1)} °C</dd>
                    </div>
                  )}
                  <div className="info-item">
                    <dt>Dive duration</dt>
                    <dd>{Math.floor(diveContext.dive_duration_seconds / 60)} min</dd>
                  </div>
                  {diveContext.water_temp_c != null && (
                    <div className="info-item">
                      <dt>Water temp</dt>
                      <dd>{diveContext.water_temp_c.toFixed(1)} °C</dd>
                    </div>
                  )}
                  {diveContext.dive_location && (
                    <div className="info-item">
                      <dt>Dive site</dt>
                      <dd>{diveContext.dive_location}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <div className="panel-section">
              <h4 className="panel-section-title">Rating</h4>
              <div className="rating-stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`star-btn ${star <= rating ? 'active' : ''}`}
                    onClick={() => handleRatingChange(star)}
                    title={`${star} star${star !== 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-section">
              <h4 className="panel-section-title">Caption</h4>
              <textarea
                className="caption-textarea"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={handleCaptionSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                placeholder="Add a caption or note..."
                rows={3}
                disabled={captionSaving}
              />
            </div>

            <div className="panel-section">
              <div className="panel-section-header">
                <h4 className="panel-section-title">Tags</h4>
                <button
                  className="btn-identify"
                  onClick={handleIdentifyClick}
                  disabled={identifying || !geminiApiKey}
                  title={!geminiApiKey ? 'Set API key in Settings first' : speciesTags.length > 0 ? 'Re-identify with additional context' : 'Use AI to identify species'}
                >
                  {identifying ? '🔄' : '🤖'} {identifying ? 'Identifying...' : speciesTags.length > 0 ? 'Re-ID' : 'AI ID'}
                </button>
              </div>
              {showContextInput && (
                <div className="context-input-container">
                  <p className="context-hint">Current ID: {speciesTags.map(t => t.name).join(', ')}</p>
                  <textarea
                    className="context-input"
                    placeholder="What's wrong with the ID? e.g., 'This is actually a clownfish' or 'The colors are orange and white striped'"
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    rows={3}
                  />
                  <div className="context-buttons">
                    <button 
                      className="btn btn-secondary btn-small"
                      onClick={() => setShowContextInput(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn btn-primary btn-small"
                      onClick={() => handleIdentifySpecies(additionalContext)}
                    >
                      Re-identify
                    </button>
                  </div>
                </div>
              )}
              {identifyError && (
                <div className="identify-error">{identifyError}</div>
              )}
              <div className="tags-section">
                <label className="tag-label">Species</label>
                <div className={`tag-list ${speciesTags.length === 0 ? 'empty' : ''}`}>
                  {speciesTags.length > 0 ? (
                    speciesTags.map((tag) => {
                      const enrichment = enrichments.get(tag.id);
                      const iucnStatus = enrichment?.iucn_status;
                      const scientificName = tag.scientific_name;
                      const deepLink = scientificName ? MEGAFAUNA_DEEP_LINKS[scientificName] : undefined;
                      return (
                        <div key={tag.id} className="tag-chip">
                          <span className="tag-chip-icon">🐠</span>
                          <span className="tag-chip-name">{tag.name}</span>
                          {iucnStatus && iucnStatus !== 'NE' && (
                            <span
                              className="iucn-badge"
                              style={{ backgroundColor: IUCN_COLORS[iucnStatus] || '#9e9e9e' }}
                              title={IUCN_LABELS[iucnStatus] || iucnStatus}
                            >
                              {iucnStatus}
                            </span>
                          )}
                          {deepLink?.sharkbookUrl && (
                            <button
                              className="btn-icon-tiny"
                              title={`Submit to Sharkbook (${deepLink.name})`}
                              onClick={(e) => { e.stopPropagation(); openExternalUrl(deepLink.sharkbookUrl!); }}
                            >
                              🦈
                            </button>
                          )}
                          {deepLink?.mantaMatcherUrl && (
                            <button
                              className="btn-icon-tiny"
                              title={`Submit to MantaMatcher (${deepLink.name})`}
                              onClick={(e) => { e.stopPropagation(); openExternalUrl(deepLink.mantaMatcherUrl!); }}
                            >
                              🐙
                            </button>
                          )}
                          <button 
                            className="tag-chip-remove" 
                            onClick={() => handleRemoveSpeciesTag(tag.id)}
                            title="Remove tag"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-muted">No species tagged</span>
                  )}
                </div>
                
                <label className="tag-label">General</label>
                <div className={`tag-list ${generalTags.length === 0 ? 'empty' : ''}`}>
                  {generalTags.length > 0 ? (
                    generalTags.map((tag) => (
                      <div key={tag.id} className="tag-chip general">
                        <span className="tag-chip-icon">🏷️</span>
                        <span className="tag-chip-name">{tag.name}</span>
                        <button 
                          className="tag-chip-remove" 
                          onClick={() => handleRemoveGeneralTag(tag.id)}
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted">No tags</span>
                  )}
                </div>
              </div>
            </div>

            {/* Citizen Science Section */}
            {speciesTags.length > 0 && (
              <div className="panel-section">
                <h4 className="panel-section-title">Citizen Science</h4>
                
                {/* iNaturalist submission */}
                {submissions.some(s => s.platform === 'inaturalist') ? (
                  <div className="submission-status">
                    <span className="submission-icon">✅</span>
                    <span>Submitted to iNaturalist</span>
                    {submissions.filter(s => s.platform === 'inaturalist').map(s => (
                      s.external_url && (
                        <button
                          key={s.id}
                          className="btn-link"
                          onClick={() => openExternalUrl(s.external_url!)}
                          title="View on iNaturalist"
                        >
                          View →
                        </button>
                      )
                    ))}
                  </div>
                ) : inatConnected ? (
                  <button
                    className="btn btn-secondary btn-small citizen-science-btn"
                    onClick={handleSubmitToINat}
                    disabled={submitting}
                    title="Submit this sighting to iNaturalist"
                  >
                    {submitting ? '⏳ Submitting...' : '🌿 Submit to iNaturalist'}
                  </button>
                ) : (
                  <p className="citizen-science-hint">Connect your iNaturalist account in Settings to submit sightings.</p>
                )}
                {submitError && (
                  <div className="identify-error">{submitError}</div>
                )}

                {/* Enrichment taxonomy info */}
                {Array.from(enrichments.values()).map((e, i) => (
                  e.family && (
                    <div key={i} className="taxonomy-info">
                      <span className="taxonomy-path">
                        {[e.kingdom, e.phylum, e.class_name, e.order_name, e.family].filter(Boolean).join(' › ')}
                      </span>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </>
      )}
      
      {!photo && dive && (
        <>
          <div className="panel-header">
            <h3>Dive Details</h3>
          </div>
          <div className="panel-content">
            <div className="panel-section">
              <h4 className="panel-section-title">Dive Info</h4>
              <dl className="info-list">
                <div className="info-item">
                  <dt>Date</dt>
                  <dd>{format(new Date(dive.date), 'MMMM d, yyyy')}</dd>
                </div>
                <div className="info-item">
                  <dt>Time</dt>
                  <dd>{dive.time}</dd>
                </div>
                <div className="info-item">
                  <dt>Duration</dt>
                  <dd>{Math.floor(dive.duration_seconds / 60)} minutes</dd>
                </div>
                <div className="info-item">
                  <dt>Max Depth</dt>
                  <dd>{dive.max_depth_m.toFixed(1)} m</dd>
                </div>
                {dive.mean_depth_m > 0 && (
                  <div className="info-item">
                    <dt>Avg Depth</dt>
                    <dd>{dive.mean_depth_m.toFixed(1)} m</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Environment Section */}
            {(dive.water_temp_c || dive.air_temp_c || dive.visibility_m || dive.surface_pressure_bar) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Environment</h4>
                <dl className="info-list">
                  {dive.water_temp_c && (
                    <div className="info-item">
                      <dt>Water Temp</dt>
                      <dd>{dive.water_temp_c.toFixed(1)} °C</dd>
                    </div>
                  )}
                  {dive.air_temp_c && (
                    <div className="info-item">
                      <dt>Air Temp</dt>
                      <dd>{dive.air_temp_c.toFixed(1)} °C</dd>
                    </div>
                  )}
                  {dive.visibility_m && (
                    <div className="info-item">
                      <dt>Visibility</dt>
                      <dd>{dive.visibility_m} m</dd>
                    </div>
                  )}
                  {dive.surface_pressure_bar && (
                    <div className="info-item">
                      <dt>Surface Pressure</dt>
                      <dd>{dive.surface_pressure_bar.toFixed(3)} bar</dd>
                    </div>
                  )}
                  {dive.is_fresh_water && (
                    <div className="info-item">
                      <dt>Water Type</dt>
                      <dd>Fresh water</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Gas & Decompression Section */}
            {(diveTanks.some(t => t.o2_percent && t.o2_percent !== 21) || dive.cns_percent || dive.otu) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Gas & Deco</h4>
                <dl className="info-list">
                  {diveTanks.some(t => t.o2_percent && t.o2_percent !== 21) && (
                    <div className="info-item">
                      <dt>Gas Mix</dt>
                      <dd>
                        {diveTanks.map(t => {
                          if (!t.o2_percent || t.o2_percent === 21) return null;
                          if (t.he_percent && t.he_percent > 0) {
                            return `TX${t.o2_percent}/${t.he_percent}`;
                          }
                          return `EAN${t.o2_percent}`;
                        }).filter(Boolean).join(', ')}
                      </dd>
                    </div>
                  )}
                  {dive.cns_percent != null && dive.cns_percent > 0 && (
                    <div className="info-item">
                      <dt>CNS</dt>
                      <dd>{dive.cns_percent.toFixed(0)}%</dd>
                    </div>
                  )}
                  {dive.otu != null && dive.otu > 0 && (
                    <div className="info-item">
                      <dt>OTU</dt>
                      <dd>{dive.otu}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Tank Pressures Section */}
            {tankSummaries.length > 0 && (
              <div className="panel-section">
                <h4 className="panel-section-title">Tanks</h4>
                <dl className="info-list">
                  {tankSummaries.map((tank, index) => {
                    // Format gas mix display
                    let gasMix = '';
                    if (tank.o2Percent !== undefined) {
                      if (tank.o2Percent === 21 && (!tank.hePercent || tank.hePercent === 0)) {
                        gasMix = 'Air';
                      } else if (tank.hePercent && tank.hePercent > 0) {
                        // Trimix
                        gasMix = `${tank.o2Percent}/${tank.hePercent}`;
                      } else {
                        // Nitrox
                        gasMix = `EAN${tank.o2Percent}`;
                      }
                    }
                    
                    // Format tank name
                    const tankName = tank.sensorName || (tankSummaries.length > 1 ? `Tank ${index + 1}` : 'Tank');
                    
                    return (
                      <div key={`${tank.sensorId}-${tank.gasIndex}`} className="info-item tank-summary">
                        <dt>
                          {tankName}
                          {gasMix && <span className="tank-gas-mix"> ({gasMix})</span>}
                        </dt>
                        <dd>
                          {tank.startPressure !== undefined && tank.endPressure !== undefined ? (
                            <>
                              {tank.startPressure.toFixed(0)} → {tank.endPressure.toFixed(0)} bar
                              {tank.consumption !== undefined && tank.consumption > 0 && (
                                <span className="tank-consumption"> (−{tank.consumption.toFixed(0)})</span>
                              )}
                            </>
                          ) : gasMix ? (
                            <span className="tank-gas-only">{gasMix}</span>
                          ) : (
                            <span className="tank-no-data">No pressure data</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}

            {/* Equipment Section */}
            {(dive.dive_computer_model || diveEquipmentSets.length > 0 || cameraEquipmentSets.length > 0) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Equipment</h4>
                <dl className="info-list">
                  {dive.dive_computer_model && (
                    <div className="info-item">
                      <dt>Dive Computer</dt>
                      <dd>{dive.dive_computer_model}</dd>
                    </div>
                  )}
                  {dive.dive_computer_serial && (
                    <div className="info-item">
                      <dt>Serial</dt>
                      <dd>{dive.dive_computer_serial}</dd>
                    </div>
                  )}
                </dl>
                {diveEquipmentSets.length > 0 && (
                  <div className="equipment-sets-section">
                    <label className="equipment-sets-label">🤿 Dive Gear</label>
                    <div className="equipment-chips">
                      {diveEquipmentSets.map(set => (
                        <span key={set.id} className="equipment-chip">
                          {set.name}
                          {set.is_default && <span className="default-star">★</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {cameraEquipmentSets.length > 0 && (
                  <div className="equipment-sets-section">
                    <label className="equipment-sets-label">📷 Camera Gear</label>
                    <div className="equipment-chips">
                      {cameraEquipmentSets.map(set => (
                        <span key={set.id} className="equipment-chip">
                          {set.name}
                          {set.is_default && <span className="default-star">★</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Location Section */}
            {(dive.location || (dive.latitude && dive.longitude)) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Location</h4>
                <dl className="info-list">
                  {dive.location && (
                    <div className="info-item">
                      <dt>Site</dt>
                      <dd>{dive.location}</dd>
                    </div>
                  )}
                  {dive.ocean && (
                    <div className="info-item">
                      <dt>Ocean</dt>
                      <dd>{dive.ocean}</dd>
                    </div>
                  )}
                  {dive.latitude != null && dive.longitude != null && (
                    <div className="info-item">
                      <dt>GPS</dt>
                      <dd>{dive.latitude.toFixed(6)}, {dive.longitude.toFixed(6)}</dd>
                    </div>
                  )}
                </dl>
                {dive.latitude != null && dive.longitude != null && settings.communitySharing && (
                  <div className="community-sightings-section">
                    <button
                      className="community-sightings-btn"
                      onClick={handleLoadCommunitySightings}
                      disabled={communitySightingsLoading}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                      {communitySightingsLoading ? 'Loading...' : communitySightingsOpen ? 'Hide Community Sightings' : 'Community Sightings'}
                    </button>
                    {communitySightingsOpen && !communitySightingsLoading && (
                      <div className="community-sightings-list">
                        {communitySightings.length === 0 ? (
                          <div className="community-sightings-empty">No community observations near this location yet.</div>
                        ) : (
                          communitySightings.map((sp, i) => (
                            <div key={i} className="community-sighting-item">
                              <div className="community-sighting-name">
                                {sp.species_name}
                                {sp.scientific_name && <span className="community-sighting-sci"> ({sp.scientific_name})</span>}
                              </div>
                              <div className="community-sighting-meta">
                                {sp.sighting_count} sighting{sp.sighting_count !== 1 ? 's' : ''}
                                {sp.last_seen && <> &middot; Last seen {sp.last_seen}</>}
                                {sp.min_depth != null && sp.max_depth != null && (
                                  <> &middot; {sp.min_depth === sp.max_depth ? `${sp.min_depth}m` : `${sp.min_depth}-${sp.max_depth}m`}</>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* People Section */}
            {(dive.buddy || dive.divemaster || dive.guide || dive.instructor) && (
              <div className="panel-section">
                <h4 className="panel-section-title">People</h4>
                <dl className="info-list">
                  {dive.buddy && (
                    <div className="info-item">
                      <dt>Buddy</dt>
                      <dd>{dive.buddy}</dd>
                    </div>
                  )}
                  {(dive.divemaster || dive.guide || dive.instructor) && (
                    <div className="info-item">
                      <dt>Guide / Instructor</dt>
                      <dd className="personnel-display">
                        <span className="personnel-name">
                          {dive.divemaster || dive.guide || dive.instructor}
                        </span>
                        <span className="personnel-roles">
                          {dive.divemaster && <span className="role-tag">DM</span>}
                          {dive.guide && <span className="role-tag">Guide</span>}
                          {dive.instructor && <span className="role-tag">Instructor</span>}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Dive Type Tags */}
            {(dive.is_boat_dive || dive.is_drift_dive || dive.is_night_dive || dive.is_training_dive) && (
              <div className="panel-section">
                <h4 className="panel-section-title">Dive Type</h4>
                <div className="dive-type-tags">
                  {dive.is_boat_dive && <span className="dive-type-tag">🚤 Boat</span>}
                  {dive.is_drift_dive && <span className="dive-type-tag">🌊 Drift</span>}
                  {dive.is_night_dive && <span className="dive-type-tag">🌙 Night</span>}
                  {dive.is_training_dive && <span className="dive-type-tag">📚 Training</span>}
                </div>
              </div>
            )}

            {dive.comments && (
              <div className="panel-section">
                <h4 className="panel-section-title">Notes</h4>
                <p className="dive-notes">{dive.comments}</p>
              </div>
            )}
          </div>
        </>
      )}
      
      {!photo && !dive && trip && (
        <>
          <div className="panel-header">
            <h3>Trip Details</h3>
          </div>
          <div className="panel-content">
            <div className="panel-section">
              <h4 className="panel-section-title">Trip Info</h4>
              <dl className="info-list">
                <div className="info-item">
                  <dt>Name</dt>
                  <dd>{trip.name}</dd>
                </div>
                <div className="info-item">
                  <dt>Location</dt>
                  <dd>{trip.location}</dd>
                </div>
                {trip.resort && (
                  <div className="info-item">
                    <dt>Resort</dt>
                    <dd>{trip.resort}</dd>
                  </div>
                )}
                <div className="info-item">
                  <dt>Dates</dt>
                  <dd>
                    {format(new Date(trip.date_start), 'MMM d')} - {format(new Date(trip.date_end), 'MMM d, yyyy')}
                  </dd>
                </div>
              </dl>
            </div>
            
            {trip.notes && (
              <div className="panel-section">
                <h4 className="panel-section-title">Notes</h4>
                <p className="dive-notes">{trip.notes}</p>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
