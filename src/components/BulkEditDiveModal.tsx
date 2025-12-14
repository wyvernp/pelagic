import { useState } from 'react';
import './AddTripModal.css'; // Reuse modal styles
import './BulkEditDiveModal.css';

export interface BulkDiveFormData {
  // Only fields that make sense to bulk edit
  location: string | null;
  ocean: string | null;
  buddy: string | null;
  divemaster: string | null;
  guide: string | null;
  instructor: string | null;
  is_boat_dive: boolean | null;
  is_night_dive: boolean | null;
  is_drift_dive: boolean | null;
  is_fresh_water: boolean | null;
  is_training_dive: boolean | null;
}

interface BulkEditDiveModalProps {
  isOpen: boolean;
  selectedDiveIds: number[];
  onClose: () => void;
  onSubmit: (diveIds: number[], data: BulkDiveFormData) => void;
}

export function BulkEditDiveModal({ isOpen, selectedDiveIds, onClose, onSubmit }: BulkEditDiveModalProps) {
  // Track which fields should be updated (checked = will be applied)
  const [updateLocation, setUpdateLocation] = useState(false);
  const [updateOcean, setUpdateOcean] = useState(false);
  const [updateBuddy, setUpdateBuddy] = useState(false);
  const [updateDivemaster, setUpdateDivemaster] = useState(false);
  const [updateGuide, setUpdateGuide] = useState(false);
  const [updateInstructor, setUpdateInstructor] = useState(false);
  const [updateBoatDive, setUpdateBoatDive] = useState(false);
  const [updateNightDive, setUpdateNightDive] = useState(false);
  const [updateDriftDive, setUpdateDriftDive] = useState(false);
  const [updateFreshWater, setUpdateFreshWater] = useState(false);
  const [updateTrainingDive, setUpdateTrainingDive] = useState(false);

  // Field values
  const [location, setLocation] = useState('');
  const [ocean, setOcean] = useState('');
  const [buddy, setBuddy] = useState('');
  const [divemaster, setDivemaster] = useState('');
  const [guide, setGuide] = useState('');
  const [instructor, setInstructor] = useState('');
  const [isBoatDive, setIsBoatDive] = useState(false);
  const [isNightDive, setIsNightDive] = useState(false);
  const [isDriftDive, setIsDriftDive] = useState(false);
  const [isFreshWater, setIsFreshWater] = useState(false);
  const [isTrainingDive, setIsTrainingDive] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data: BulkDiveFormData = {
      location: updateLocation ? location : null,
      ocean: updateOcean ? ocean : null,
      buddy: updateBuddy ? buddy : null,
      divemaster: updateDivemaster ? divemaster : null,
      guide: updateGuide ? guide : null,
      instructor: updateInstructor ? instructor : null,
      is_boat_dive: updateBoatDive ? isBoatDive : null,
      is_night_dive: updateNightDive ? isNightDive : null,
      is_drift_dive: updateDriftDive ? isDriftDive : null,
      is_fresh_water: updateFreshWater ? isFreshWater : null,
      is_training_dive: updateTrainingDive ? isTrainingDive : null,
    };
    
    onSubmit(selectedDiveIds, data);
  };

  const handleClose = () => {
    // Reset all states
    setUpdateLocation(false);
    setUpdateOcean(false);
    setUpdateBuddy(false);
    setUpdateDivemaster(false);
    setUpdateGuide(false);
    setUpdateInstructor(false);
    setUpdateBoatDive(false);
    setUpdateNightDive(false);
    setUpdateDriftDive(false);
    setUpdateFreshWater(false);
    setUpdateTrainingDive(false);
    setLocation('');
    setOcean('');
    setBuddy('');
    setDivemaster('');
    setGuide('');
    setInstructor('');
    setIsBoatDive(false);
    setIsNightDive(false);
    setIsDriftDive(false);
    setIsFreshWater(false);
    setIsTrainingDive(false);
    onClose();
  };

  if (!isOpen) return null;

  const hasAnyUpdate = updateLocation || updateOcean || updateBuddy || 
    updateDivemaster || updateGuide || updateInstructor ||
    updateBoatDive || updateNightDive || updateDriftDive || 
    updateFreshWater || updateTrainingDive;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>Bulk Edit {selectedDiveIds.length} Dives</h2>
            <button type="button" className="modal-close" onClick={handleClose}>
              ×
            </button>
          </div>
          
          <div className="modal-body">
            <p className="bulk-edit-help">
              Check the fields you want to update. Only checked fields will be applied to all selected dives.
            </p>
            
            <h3 className="section-title">Location</h3>
            
            <div className="form-row">
              <div className="form-group bulk-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateLocation}
                    onChange={(e) => setUpdateLocation(e.target.checked)}
                  />
                  <span>Dive Site</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Dive site name"
                  disabled={!updateLocation}
                />
              </div>
              
              <div className="form-group bulk-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateOcean}
                    onChange={(e) => setUpdateOcean(e.target.checked)}
                  />
                  <span>Ocean/Body of Water</span>
                </label>
                <input
                  type="text"
                  value={ocean}
                  onChange={(e) => setOcean(e.target.value)}
                  placeholder="e.g., Pacific Ocean"
                  disabled={!updateOcean}
                />
              </div>
            </div>

            <h3 className="section-title">People</h3>
            
            <div className="form-row">
              <div className="form-group bulk-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateBuddy}
                    onChange={(e) => setUpdateBuddy(e.target.checked)}
                  />
                  <span>Buddy</span>
                </label>
                <input
                  type="text"
                  value={buddy}
                  onChange={(e) => setBuddy(e.target.value)}
                  placeholder="Buddy name"
                  disabled={!updateBuddy}
                />
              </div>
              
              <div className="form-group bulk-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateDivemaster}
                    onChange={(e) => setUpdateDivemaster(e.target.checked)}
                  />
                  <span>Divemaster</span>
                </label>
                <input
                  type="text"
                  value={divemaster}
                  onChange={(e) => setDivemaster(e.target.value)}
                  placeholder="Divemaster name"
                  disabled={!updateDivemaster}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group bulk-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateGuide}
                    onChange={(e) => setUpdateGuide(e.target.checked)}
                  />
                  <span>Guide</span>
                </label>
                <input
                  type="text"
                  value={guide}
                  onChange={(e) => setGuide(e.target.value)}
                  placeholder="Guide name"
                  disabled={!updateGuide}
                />
              </div>
              
              <div className="form-group bulk-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateInstructor}
                    onChange={(e) => setUpdateInstructor(e.target.checked)}
                  />
                  <span>Instructor</span>
                </label>
                <input
                  type="text"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="Instructor name"
                  disabled={!updateInstructor}
                />
              </div>
            </div>

            <h3 className="section-title">Dive Type</h3>
            
            <div className="form-row checkbox-row">
              <div className="form-group bulk-field checkbox-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateBoatDive}
                    onChange={(e) => setUpdateBoatDive(e.target.checked)}
                  />
                  <span>Boat Dive</span>
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={isBoatDive}
                    onChange={(e) => setIsBoatDive(e.target.checked)}
                    disabled={!updateBoatDive}
                  />
                  <span className="toggle-text">{isBoatDive ? '🚤 Yes' : 'No'}</span>
                </label>
              </div>
              
              <div className="form-group bulk-field checkbox-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateNightDive}
                    onChange={(e) => setUpdateNightDive(e.target.checked)}
                  />
                  <span>Night Dive</span>
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={isNightDive}
                    onChange={(e) => setIsNightDive(e.target.checked)}
                    disabled={!updateNightDive}
                  />
                  <span className="toggle-text">{isNightDive ? '🌙 Yes' : 'No'}</span>
                </label>
              </div>
              
              <div className="form-group bulk-field checkbox-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateDriftDive}
                    onChange={(e) => setUpdateDriftDive(e.target.checked)}
                  />
                  <span>Drift Dive</span>
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={isDriftDive}
                    onChange={(e) => setIsDriftDive(e.target.checked)}
                    disabled={!updateDriftDive}
                  />
                  <span className="toggle-text">{isDriftDive ? '🌊 Yes' : 'No'}</span>
                </label>
              </div>
            </div>
            
            <div className="form-row checkbox-row">
              <div className="form-group bulk-field checkbox-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateFreshWater}
                    onChange={(e) => setUpdateFreshWater(e.target.checked)}
                  />
                  <span>Fresh Water</span>
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={isFreshWater}
                    onChange={(e) => setIsFreshWater(e.target.checked)}
                    disabled={!updateFreshWater}
                  />
                  <span className="toggle-text">{isFreshWater ? '💧 Yes' : 'No'}</span>
                </label>
              </div>
              
              <div className="form-group bulk-field checkbox-field">
                <label className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={updateTrainingDive}
                    onChange={(e) => setUpdateTrainingDive(e.target.checked)}
                  />
                  <span>Training Dive</span>
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={isTrainingDive}
                    onChange={(e) => setIsTrainingDive(e.target.checked)}
                    disabled={!updateTrainingDive}
                  />
                  <span className="toggle-text">{isTrainingDive ? '📚 Yes' : 'No'}</span>
                </label>
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={!hasAnyUpdate}
            >
              Update {selectedDiveIds.length} Dives
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
