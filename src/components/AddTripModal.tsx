import { useState, useEffect } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Trip } from '../types';
import './AddTripModal.css';

export interface TripFormData {
  name: string;
  location: string;
  resort: string;
  dateStart: string;
  dateEnd: string;
  notes: string;
}

interface TripModalProps {
  isOpen: boolean;
  trip?: Trip | null; // If provided, we're editing
  onClose: () => void;
  onSubmit: (data: TripFormData) => void;
  onDelete?: (tripId: number) => void;
}

export function TripModal({ isOpen, trip, onClose, onSubmit, onDelete }: TripModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [resort, setResort] = useState('');
  const [dateStart, setDateStart] = useState(today);
  const [dateEnd, setDateEnd] = useState(today);
  const [notes, setNotes] = useState('');

  const isEditing = !!trip;

  // Reset form when modal opens/closes or trip changes
  useEffect(() => {
    if (isOpen && trip) {
      setName(trip.name);
      setLocation(trip.location);
      setResort(trip.resort || '');
      setDateStart(trip.date_start);
      setDateEnd(trip.date_end);
      setNotes(trip.notes || '');
    } else if (isOpen && !trip) {
      setName('');
      setLocation('');
      setResort('');
      setDateStart(today);
      setDateEnd(today);
      setNotes('');
    }
  }, [isOpen, trip, today]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    onSubmit({
      name: name.trim(),
      location: location.trim(),
      resort: resort.trim(),
      dateStart,
      dateEnd,
      notes: notes.trim(),
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (trip && onDelete) {
      const confirmed = await confirm(
        `Are you sure you want to delete "${trip.name}"? This will also delete all dives and photos in this trip.`,
        {
          title: 'Delete Trip',
          kind: 'warning',
        }
      );
      
      if (confirmed) {
        onDelete(trip.id);
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Trip' : 'New Trip'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="trip-name">Trip Name *</label>
              <input
                id="trip-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Raja Ampat 2025"
                autoFocus
                required
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="trip-location">Location</label>
                <input
                  id="trip-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Indonesia"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="trip-resort">Resort / Operator</label>
                <input
                  id="trip-resort"
                  type="text"
                  value={resort}
                  onChange={(e) => setResort(e.target.value)}
                  placeholder="e.g., Misool Eco Resort"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="trip-start">Start Date *</label>
                <input
                  id="trip-start"
                  type="date"
                  value={dateStart}
                  onChange={(e) => {
                    setDateStart(e.target.value);
                    if (e.target.value > dateEnd) {
                      setDateEnd(e.target.value);
                    }
                  }}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="trip-end">End Date *</label>
                <input
                  id="trip-end"
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  min={dateStart}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="trip-notes">Trip Details / Notes</label>
              <textarea
                id="trip-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about the trip, diving conditions, highlights, etc."
                rows={4}
              />
            </div>
          </div>
          
          <div className="modal-footer">
            {isEditing && onDelete && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete Trip
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                {isEditing ? 'Save Changes' : 'Create Trip'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Keep backward compatible export
export { TripModal as AddTripModal };
