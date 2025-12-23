import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import type { Photo, Dive, SpeciesTag, GeneralTag, Trip, IdentificationResult, TankPressure, DiveTank } from '../types';
import { useGeminiApiKey } from './SettingsModal';
import { logger } from '../utils/logger';
import './RightPanel.css';

interface RightPanelProps {
  photo: Photo | null;
  dive: Dive | null;
  trip?: Trip | null;
  onPhotoUpdated?: () => void;
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

export function RightPanel({ photo, dive, trip, onPhotoUpdated }: RightPanelProps) {
  const [speciesTags, setSpeciesTags] = useState<SpeciesTag[]>([]);
  const [generalTags, setGeneralTags] = useState<GeneralTag[]>([]);
  const [rating, setRating] = useState(0);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [showContextInput, setShowContextInput] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');
  const [tankPressures, setTankPressures] = useState<TankPressure[]>([]);
  const [diveTanks, setDiveTanks] = useState<DiveTank[]>([]);
  const { apiKey: geminiApiKey } = useGeminiApiKey();

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

  // Sync rating state when photo or its rating changes
  useEffect(() => {
    setRating(photo?.rating || 0);
  }, [photo?.id, photo?.rating]);

  // Load tank data when dive changes
  useEffect(() => {
    if (dive) {
      loadTankPressures(dive.id);
      loadDiveTanks(dive.id);
    } else {
      setTankPressures([]);
      setDiveTanks([]);
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
                    speciesTags.map((tag) => (
                      <div key={tag.id} className="tag-chip">
                        <span className="tag-chip-icon">🐠</span>
                        <span className="tag-chip-name">{tag.name}</span>
                        <button 
                          className="tag-chip-remove" 
                          onClick={() => handleRemoveSpeciesTag(tag.id)}
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </div>
                    ))
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
            {dive.dive_computer_model && (
              <div className="panel-section">
                <h4 className="panel-section-title">Equipment</h4>
                <dl className="info-list">
                  <div className="info-item">
                    <dt>Dive Computer</dt>
                    <dd>{dive.dive_computer_model}</dd>
                  </div>
                  {dive.dive_computer_serial && (
                    <div className="info-item">
                      <dt>Serial</dt>
                      <dd>{dive.dive_computer_serial}</dd>
                    </div>
                  )}
                </dl>
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
              </div>
            )}

            {/* People Section */}
            {(dive.buddy || dive.divemaster || dive.instructor) && (
              <div className="panel-section">
                <h4 className="panel-section-title">People</h4>
                <dl className="info-list">
                  {dive.buddy && (
                    <div className="info-item">
                      <dt>Buddy</dt>
                      <dd>{dive.buddy}</dd>
                    </div>
                  )}
                  {dive.divemaster && (
                    <div className="info-item">
                      <dt>Divemaster</dt>
                      <dd>{dive.divemaster}</dd>
                    </div>
                  )}
                  {dive.instructor && (
                    <div className="info-item">
                      <dt>Instructor</dt>
                      <dd>{dive.instructor}</dd>
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
