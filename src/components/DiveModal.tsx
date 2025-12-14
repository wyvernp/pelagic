import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { logger } from '../utils/logger';
import type { Dive, EquipmentSet } from '../types';
import './AddTripModal.css'; // Reuse modal styles

interface DiveSite {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

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
  const [location, setLocation] = useState('');
  const [ocean, setOcean] = useState('');
  const [visibility, setVisibility] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [buddy, setBuddy] = useState('');
  const [divemaster, setDivemaster] = useState('');
  const [guide, setGuide] = useState('');
  const [instructor, setInstructor] = useState('');
  const [comments, setComments] = useState('');
  const [isFreshWater, setIsFreshWater] = useState(false);
  const [isBoatDive, setIsBoatDive] = useState(false);
  const [isDriftDive, setIsDriftDive] = useState(false);
  const [isNightDive, setIsNightDive] = useState(false);
  const [isTrainingDive, setIsTrainingDive] = useState(false);
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const locationContainerRef = useRef<HTMLDivElement>(null);
  
  // Equipment state
  const [availableDiveSets, setAvailableDiveSets] = useState<EquipmentSet[]>([]);
  const [availableCameraSets, setAvailableCameraSets] = useState<EquipmentSet[]>([]);
  const [selectedDiveSetIds, setSelectedDiveSetIds] = useState<number[]>([]);
  const [selectedCameraSetIds, setSelectedCameraSetIds] = useState<number[]>([]);

  // Search dive sites when location changes
  const handleLocationChange = (value: string) => {
    setLocation(value);
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Search after user stops typing for 300ms
    if (value.trim().length >= 2) {
      const timeout = setTimeout(async () => {
        try {
          const sites = await invoke<DiveSite[]>('get_dive_sites');
          const filtered = sites.filter(site => 
            site.name.toLowerCase().includes(value.toLowerCase())
          ).slice(0, 10); // Limit to 10 suggestions
          setDiveSites(filtered);
          setShowSuggestions(filtered.length > 0);
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
      setDivemaster(dive.divemaster || '');
      setGuide(dive.guide || '');
      setInstructor(dive.instructor || '');
      setComments(dive.comments || '');
      setIsFreshWater(dive.is_fresh_water);
      setIsBoatDive(dive.is_boat_dive);
      setIsDriftDive(dive.is_drift_dive);
      setIsNightDive(dive.is_night_dive);
      setIsTrainingDive(dive.is_training_dive);
      
      // Load equipment sets
      loadEquipmentData(dive.id);
    }
  }, [isOpen, dive]);
  
  // Load available equipment sets and current dive's assignments
  const loadEquipmentData = async (diveId: number) => {
    try {
      const [diveSets, cameraSets, assignedSets] = await Promise.all([
        invoke<EquipmentSet[]>('get_equipment_sets_by_type', { setType: 'dive' }),
        invoke<EquipmentSet[]>('get_equipment_sets_by_type', { setType: 'camera' }),
        invoke<EquipmentSet[]>('get_equipment_sets_for_dive', { diveId }),
      ]);
      
      setAvailableDiveSets(diveSets);
      setAvailableCameraSets(cameraSets);
      setSelectedDiveSetIds(assignedSets.filter(s => s.set_type === 'dive').map(s => s.id));
      setSelectedCameraSetIds(assignedSets.filter(s => s.set_type === 'camera').map(s => s.id));
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
    
    onSubmit(dive.id, {
      location: location.trim(),
      ocean: ocean.trim(),
      visibility_m: visibility ? parseFloat(visibility) : null,
      buddy: buddy.trim(),
      divemaster: divemaster.trim(),
      guide: guide.trim(),
      instructor: instructor.trim(),
      comments: comments.trim(),
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
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
        `Are you sure you want to delete Dive #${dive.dive_number}? This will also delete all photos associated with this dive.`,
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
          <h2>Edit Dive #{dive.dive_number}</h2>
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
              {dive.nitrox_o2_percent && dive.nitrox_o2_percent > 21 && (
                <div className="info-row">
                  <span className="info-label">Gas:</span>
                  <span className="info-value">EAN{dive.nitrox_o2_percent}</span>
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
                            {site.lat.toFixed(4)}, {site.lon.toFixed(4)}
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
                  step="0.0001"
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
                  step="0.0001"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-divemaster">Divemaster</label>
                <input
                  id="dive-divemaster"
                  type="text"
                  value={divemaster}
                  onChange={(e) => setDivemaster(e.target.value)}
                  placeholder="Divemaster name"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-guide">Guide</label>
                <input
                  id="dive-guide"
                  type="text"
                  value={guide}
                  onChange={(e) => setGuide(e.target.value)}
                  placeholder="Guide name"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-instructor">Instructor</label>
                <input
                  id="dive-instructor"
                  type="text"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="Instructor name"
                />
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
