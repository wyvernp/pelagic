import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import './AddTripModal.css'; // Reuse modal styles

interface DiveSite {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

export interface NewDiveFormData {
  // Computer-like fields (normally from dive computer)
  date: string;
  time: string;
  duration_minutes: number;
  max_depth_m: number;
  mean_depth_m: number;
  water_temp_c: number | null;
  air_temp_c: number | null;
  surface_pressure_bar: number | null;
  cns_percent: number | null;
  nitrox_o2_percent: number | null;
  
  // User-editable fields
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

interface AddDiveModalProps {
  isOpen: boolean;
  tripId: number;
  onClose: () => void;
  onSubmit: (data: NewDiveFormData) => void;
}

export function AddDiveModal({ isOpen, tripId: _tripId, onClose, onSubmit }: AddDiveModalProps) {
  // Computer-like fields
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [maxDepth, setMaxDepth] = useState('');
  const [meanDepth, setMeanDepth] = useState('');
  const [waterTemp, setWaterTemp] = useState('');
  const [airTemp, setAirTemp] = useState('');
  const [surfacePressure, setSurfacePressure] = useState('');
  const [cnsPercent, setCnsPercent] = useState('');
  const [nitroxO2, setNitroxO2] = useState('21');
  
  // User-editable fields
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
  
  // Dive site suggestions
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const locationContainerRef = useRef<HTMLDivElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      // Set default date to today
      const today = new Date();
      setDate(today.toISOString().split('T')[0]);
      setTime('09:00');
      setDurationMinutes('');
      setMaxDepth('');
      setMeanDepth('');
      setWaterTemp('');
      setAirTemp('');
      setSurfacePressure('');
      setCnsPercent('');
      setNitroxO2('21');
      setLocation('');
      setOcean('');
      setVisibility('');
      setLatitude('');
      setLongitude('');
      setBuddy('');
      setDivemaster('');
      setGuide('');
      setInstructor('');
      setComments('');
      setIsFreshWater(false);
      setIsBoatDive(false);
      setIsDriftDive(false);
      setIsNightDive(false);
      setIsTrainingDive(false);
    }
  }, [isOpen]);
  
  // Search dive sites when location changes
  const handleLocationChange = (value: string) => {
    setLocation(value);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    if (value.trim().length >= 2) {
      const timeout = setTimeout(async () => {
        try {
          const sites = await invoke<DiveSite[]>('get_dive_sites');
          const filtered = sites.filter(site => 
            site.name.toLowerCase().includes(value.toLowerCase())
          ).slice(0, 10);
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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!date || !time || !durationMinutes || !maxDepth) {
      alert('Please fill in the required fields: Date, Time, Duration, and Max Depth');
      return;
    }
    
    const duration = parseFloat(durationMinutes);
    const depth = parseFloat(maxDepth);
    const mean = meanDepth ? parseFloat(meanDepth) : depth * 0.6; // Estimate mean as 60% of max if not provided
    
    onSubmit({
      date,
      time: time + ':00', // Add seconds
      duration_minutes: duration,
      max_depth_m: depth,
      mean_depth_m: mean,
      water_temp_c: waterTemp ? parseFloat(waterTemp) : null,
      air_temp_c: airTemp ? parseFloat(airTemp) : null,
      surface_pressure_bar: surfacePressure ? parseFloat(surfacePressure) : null,
      cns_percent: cnsPercent ? parseFloat(cnsPercent) : null,
      nitrox_o2_percent: nitroxO2 ? parseFloat(nitroxO2) : null,
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

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2>Add Manual Dive</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Dive Computer Data Section */}
            <h3 className="section-title">Dive Data</h3>
            <p className="section-description">Enter the data you would normally get from a dive computer</p>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-date">Date *</label>
                <input
                  id="dive-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-time">Time *</label>
                <input
                  id="dive-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-duration">Duration (min) *</label>
                <input
                  id="dive-duration"
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="e.g., 45"
                  min="1"
                  max="300"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-max-depth">Max Depth (m) *</label>
                <input
                  id="dive-max-depth"
                  type="number"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(e.target.value)}
                  placeholder="e.g., 18.5"
                  min="0"
                  max="200"
                  step="0.1"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-mean-depth">Avg Depth (m)</label>
                <input
                  id="dive-mean-depth"
                  type="number"
                  value={meanDepth}
                  onChange={(e) => setMeanDepth(e.target.value)}
                  placeholder="Auto-calculated"
                  min="0"
                  max="200"
                  step="0.1"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-water-temp">Water Temp (°C)</label>
                <input
                  id="dive-water-temp"
                  type="number"
                  value={waterTemp}
                  onChange={(e) => setWaterTemp(e.target.value)}
                  placeholder="e.g., 27"
                  min="-5"
                  max="40"
                  step="0.1"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-air-temp">Air Temp (°C)</label>
                <input
                  id="dive-air-temp"
                  type="number"
                  value={airTemp}
                  onChange={(e) => setAirTemp(e.target.value)}
                  placeholder="e.g., 30"
                  min="-20"
                  max="50"
                  step="0.1"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-nitrox">O₂ %</label>
                <input
                  id="dive-nitrox"
                  type="number"
                  value={nitroxO2}
                  onChange={(e) => setNitroxO2(e.target.value)}
                  placeholder="21"
                  min="21"
                  max="100"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dive-surface-pressure">Surface Pressure (bar)</label>
                <input
                  id="dive-surface-pressure"
                  type="number"
                  value={surfacePressure}
                  onChange={(e) => setSurfacePressure(e.target.value)}
                  placeholder="e.g., 1.013"
                  min="0.9"
                  max="1.1"
                  step="0.001"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="dive-cns">CNS %</label>
                <input
                  id="dive-cns"
                  type="number"
                  value={cnsPercent}
                  onChange={(e) => setCnsPercent(e.target.value)}
                  placeholder="e.g., 15"
                  min="0"
                  max="200"
                />
              </div>
            </div>

            <hr className="modal-divider" />
            
            {/* User-editable fields section */}
            <h3 className="section-title">Dive Details</h3>
            
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
            <div className="modal-footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Add Dive
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
