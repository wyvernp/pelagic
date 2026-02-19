import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { logger } from '../utils/logger';
import { useSettings } from './SettingsModal';
import { formatDiveName } from '../utils/diveNames';
import type { Dive, EquipmentSet, DiveTank, DiveSite } from '../types';
import './AddTripModal.css'; // Reuse modal styles

export interface DiveFormData {
  location: string;
  ocean: string;
  visibility_m: number | null;
  buddy: string;
  divemaster: string;
  guide: string;
  instructor: string;
  comments: string;
  latitude: number | null;
  longitude: number | null;
  dive_site_id: number | null;
  is_fresh_water: boolean;
  is_boat_dive: boolean;
  is_drift_dive: boolean;
  is_night_dive: boolean;
  is_training_dive: boolean;
}

interface DiveModalProps {
  isOpen: boolean;
  dive: Dive | null;
  onClose: () => void;
  onSubmit: (diveId: number, data: DiveFormData) => void;
  onDelete?: (diveId: number) => void;
}

export function DiveModal({ isOpen, dive, onClose, onSubmit, onDelete }: DiveModalProps) {
  const settings = useSettings();
  const [location, setLocation] = useState('');
  const [ocean, setOcean] = useState('');
  const [visibility, setVisibility] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [buddy, setBuddy] = useState('');
  // Combined personnel field with role checkboxes
  const [personnelName, setPersonnelName] = useState('');
  const [isDivemaster, setIsDivemaster] = useState(false);
  const [isGuide, setIsGuide] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);
  const [comments, setComments] = useState('');
  const [isFreshWater, setIsFreshWater] = useState(false);
  const [isBoatDive, setIsBoatDive] = useState(false);
  const [isDriftDive, setIsDriftDive] = useState(false);
  const [isNightDive, setIsNightDive] = useState(false);
  const [isTrainingDive, setIsTrainingDive] = useState(false);
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const locationContainerRef = useRef<HTMLDivElement>(null);
  
  // Equipment state
  const [availableDiveSets, setAvailableDiveSets] = useState<EquipmentSet[]>([]);
  const [availableCameraSets, setAvailableCameraSets] = useState<EquipmentSet[]>([]);
  const [selectedDiveSetIds, setSelectedDiveSetIds] = useState<number[]>([]);
  const [selectedCameraSetIds, setSelectedCameraSetIds] = useState<number[]>([]);
  
  // Tank/gas data
  const [tanks, setTanks] = useState<DiveTank[]>([]);

  // Search dive sites when location changes (server-side search)
  const handleLocationChange = (value: string) => {
    setLocation(value);
    setSelectedSiteId(null); // Clear selected site when user types
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Search after user stops typing for 300ms
    if (value.trim().length >= 2) {
      const timeout = setTimeout(async () => {
        try {
          // Use server-side search instead of fetching all sites
          const sites = await invoke<DiveSite[]>('search_dive_sites', { query: value });
          setDiveSites(sites.slice(0, 15)); // Limit display to 15
          setShowSuggestions(sites.length > 0);
        } catch (error) {
          logger.error('Failed to search dive sites:', error);
        }
      }, 300);
      setSearchTimeout(timeout);
    } else {
      setShowSuggestions(false);
      setDiveSites([]);
    }
  };
  
  // Select a dive site from suggestions
  const handleSelectSite = (site: DiveSite) => {
    setLocation(site.name);
    setLatitude(site.lat.toString());
    setLongitude(site.lon.toString());
    setSelectedSiteId(site.id);
    setShowSuggestions(false);
    setDiveSites([]);
  };
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (locationContainerRef.current && !locationContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset form when modal opens or dive changes
  useEffect(() => {
    if (isOpen && dive) {
      setLocation(dive.location || '');
      setOcean(dive.ocean || '');
      setVisibility(dive.visibility_m?.toString() || '');
      setLatitude(dive.latitude?.toString() || '');
      setLongitude(dive.longitude?.toString() || '');
      setBuddy(dive.buddy || '');
      // Load personnel: pick name from whichever field is populated, set role flags
      const dmName = dive.divemaster || '';
      const guideName = dive.guide || '';
      const instrName = dive.instructor || '';
      const name = dmName || guideName || instrName;
      setPersonnelName(name);
      setIsDivemaster(!!dmName);
      setIsGuide(!!guideName);
      setIsInstructor(!!instrName);
      setComments(dive.comments || '');
      setIsFreshWater(dive.is_fresh_water);
      setIsBoatDive(dive.is_boat_dive);
      setIsDriftDive(dive.is_drift_dive);
      setIsNightDive(dive.is_night_dive);
      setIsTrainingDive(dive.is_training_dive);
      setSelectedSiteId(dive.dive_site_id || null);
      
      // Load equipment sets
      loadEquipmentData(dive.id);
    }
  }, [isOpen, dive]);
  
  // Load available equipment sets and current dive's assignments
  const loadEquipmentData = async (diveId: number) => {
    try {
      const [diveSets, cameraSets, assignedSets, diveTanks] = await Promise.all([
        invoke<EquipmentSet[]>('get_equipment_sets_by_type', { setType: 'dive' }),
        invoke<EquipmentSet[]>('get_equipment_sets_by_type', { setType: 'camera' }),
        invoke<EquipmentSet[]>('get_equipment_sets_for_dive', { diveId }),
        invoke<DiveTank[]>('get_dive_tanks', { diveId }),
      ]);
      
      setAvailableDiveSets(diveSets);
      setAvailableCameraSets(cameraSets);
      setSelectedDiveSetIds(assignedSets.filter(s => s.set_type === 'dive').map(s => s.id));
      setSelectedCameraSetIds(assignedSets.filter(s => s.set_type === 'camera').map(s => s.id));
      setTanks(diveTanks);
    } catch (error) {
      logger.error('Failed to load equipment data:', error);
    }
  };

  if (!isOpen || !dive) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Save equipment sets
    try {
      const allSelectedSets = [...selectedDiveSetIds, ...selectedCameraSetIds];
      await invoke('set_dive_equipment_sets', {
        diveId: dive.id,
        setIds: allSelectedSets,
      });
    } catch (error) {
      logger.error('Failed to save equipment sets:', error);
    }
    
    // Determine dive_site_id: use selected site, or auto-create if location + GPS provided
    let finalSiteId = selectedSiteId;
    const lat = latitude ? parseFloat(latitude) : null;
    const lon = longitude ? parseFloat(longitude) : null;
    const loc = location.trim();
    
    if (!finalSiteId && loc && lat !== null && lon !== null) {
      // Try to find or create a dive site
      try {
        finalSiteId = await invoke<number>('find_or_create_dive_site', {
          name: loc,
          lat,
          lon,
        });
        logger.info('Auto-linked dive to site:', finalSiteId);
      } catch (error) {
        logger.error('Failed to find/create dive site:', error);
      }
    }
    
    onSubmit(dive.id, {
      location: loc,
      ocean: ocean.trim(),
      visibility_m: visibility ? parseFloat(visibility) : null,
      buddy: buddy.trim(),
      divemaster: isDivemaster ? personnelName.trim() : '',
      guide: isGuide ? personnelName.trim() : '',
      instructor: isInstructor ? personnelName.trim() : '',
      comments: comments.trim(),
      latitude: lat,
      longitude: lon,
      dive_site_id: finalSiteId,
      is_fresh_water: isFreshWater,
      is_boat_dive: isBoatDive,
      is_drift_dive: isDriftDive,
      is_night_dive: isNightDive,
      is_training_dive: isTrainingDive,
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (dive && onDelete) {
      const confirmed = await confirm(
        `Are you sure you want to delete ${formatDiveName(settings.diveNamePrefix, dive.dive_number)}? This will also delete all photos associated with this dive.`,
        {
          title: 'Delete Dive',
          kind: 'warning',
        }
      );
      
      if (confirmed) {
        onDelete(dive.id);
      }
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2>Edit {formatDiveName(settings.diveNamePrefix, dive.dive_number)}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Read-only dive info */}
            <div className="dive-info-summary">
              <div className="info-row">
                <span className="info-label">Date:</span>
                <span className="info-value">{formatDate(dive.date)} at {dive.time?.slice(0, 5)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Duration:</span>
                <span className="info-value">{Math.floor(dive.duration_seconds / 60)} min</span>
              </div>
              <div className="info-row">
                <span className="info-label">Max Depth:</span>
                <span className="info-value">{dive.max_depth_m.toFixed(1)} m</span>
              </div>
              {dive.water_temp_c && (
                <div className="info-row">
                  <span className="info-label">Water Temp:</span>
                  <span className="info-value">{dive.water_temp_c.toFixed(1)}°C</span>
                </div>
              )}
              {tanks.length > 0 && tanks.some(t => t.o2_percent && t.o2_percent !== 21) && (
                <div className="info-row">
                  <span className="info-label">Gas:</span>
                  <span className="info-value">
                    {tanks.map(t => {
                      if (!t.o2_percent || t.o2_percent === 21) return null;
                      if (t.he_percent && t.he_percent > 0) {
                        return `TX${t.o2_percent}/${t.he_percent}`;
                      }
                      return `EAN${t.o2_percent}`;
                    }).filter(Boolean).join(', ') || 'Air'}
                  </span>
                </div>
              )}
            </div>

            <hr className="modal-divider" />
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-location">Dive Site</label>
                <div ref={locationContainerRef} style={{ position: 'relative' }}>
                  <input
                    id="dive-location"
                    type="text"
                    value={location}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    onFocus={() => location.length >= 2 && diveSites.length > 0 && setShowSuggestions(true)}
                    placeholder="e.g., Blue Corner"
                    autoComplete="off"
                    autoFocus
                  />
                  {showSuggestions && diveSites.length > 0 && (
                    <div className="dive-site-suggestions">
                      {diveSites.map((site) => (
                        <div
                          key={site.id}
                          className="dive-site-suggestion"
                          onClick={() => handleSelectSite(site)}
                        >
                          <div className="suggestion-name">{site.name}</div>
                          <div className="suggestion-coords">
                            {site.lat.toFixed(6)}, {site.lon.toFixed(6)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-ocean">Ocean / Body of Water</label>
                <input
                  id="dive-ocean"
                  type="text"
                  value={ocean}
                  onChange={(e) => setOcean(e.target.value)}
                  placeholder="e.g., Pacific Ocean"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-visibility">Visibility (m)</label>
                <input
                  id="dive-visibility"
                  type="number"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  placeholder="e.g., 25"
                  min="0"
                  max="100"
                  step="0.5"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-buddy">Buddy</label>
                <input
                  id="dive-buddy"
                  type="text"
                  value={buddy}
                  onChange={(e) => setBuddy(e.target.value)}
                  placeholder="Dive buddy name"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-latitude">Latitude</label>
                <input
                  id="dive-latitude"
                  type="number"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g., -8.5069"
                  min="-90"
                  max="90"
                  step="any"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-longitude">Longitude</label>
                <input
                  id="dive-longitude"
                  type="number"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g., 115.2624"
                  min="-180"
                  max="180"
                  step="any"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label htmlFor="dive-personnel">Guide / Instructor</label>
                <input
                  id="dive-personnel"
                  type="text"
                  value={personnelName}
                  onChange={(e) => setPersonnelName(e.target.value)}
                  placeholder="Name"
                />
              </div>
              
              <div className="form-group" style={{ flex: 1 }}>
                <label>Role</label>
                <div className="checkbox-group personnel-roles">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isDivemaster}
                      onChange={(e) => setIsDivemaster(e.target.checked)}
                    />
                    <span>DM</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isGuide}
                      onChange={(e) => setIsGuide(e.target.checked)}
                    />
                    <span>Guide</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isInstructor}
                      onChange={(e) => setIsInstructor(e.target.checked)}
                    />
                    <span>Instructor</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div className="form-group">
              <label>Dive Type</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isBoatDive}
                    onChange={(e) => setIsBoatDive(e.target.checked)}
                  />
                  <span>Boat Dive</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isDriftDive}
                    onChange={(e) => setIsDriftDive(e.target.checked)}
                  />
                  <span>Drift Dive</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isNightDive}
                    onChange={(e) => setIsNightDive(e.target.checked)}
                  />
                  <span>Night Dive</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isFreshWater}
                    onChange={(e) => setIsFreshWater(e.target.checked)}
                  />
                  <span>Fresh Water</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isTrainingDive}
                    onChange={(e) => setIsTrainingDive(e.target.checked)}
                  />
                  <span>Training Dive</span>
                </label>
              </div>
            </div>
            
            {/* Equipment Sets Section */}
            {(availableDiveSets.length > 0 || availableCameraSets.length > 0) && (
              <>
                <hr className="modal-divider" />
                
                {availableDiveSets.length > 0 && (
                  <div className="form-group">
                    <label>🤿 Dive Gear</label>
                    <div className="checkbox-group equipment-set-group">
                      {availableDiveSets.map(set => (
                        <label key={set.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedDiveSetIds.includes(set.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDiveSetIds(prev => [...prev, set.id]);
                              } else {
                                setSelectedDiveSetIds(prev => prev.filter(id => id !== set.id));
                              }
                            }}
                          />
                          <span>
                            {set.name}
                            {set.is_default && <span className="default-indicator"> ★</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {availableCameraSets.length > 0 && (
                  <div className="form-group">
                    <label>📷 Camera Gear</label>
                    <div className="checkbox-group equipment-set-group">
                      {availableCameraSets.map(set => (
                        <label key={set.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedCameraSetIds.includes(set.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCameraSetIds(prev => [...prev, set.id]);
                              } else {
                                setSelectedCameraSetIds(prev => prev.filter(id => id !== set.id));
                              }
                            }}
                          />
                          <span>
                            {set.name}
                            {set.is_default && <span className="default-indicator"> ★</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div className="form-group">
              <label htmlFor="dive-comments">Notes</label>
              <textarea
                id="dive-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add notes about this dive - marine life spotted, conditions, memorable moments..."
                rows={4}
              />
            </div>
          </div>
          
          <div className="modal-footer">
            {onDelete && dive && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete Dive
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
