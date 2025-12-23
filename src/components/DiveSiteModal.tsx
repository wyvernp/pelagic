import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { DiveSite } from '../types';
import './DiveSiteModal.css';

interface DiveSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  diveSite: DiveSite | null;
  onSave?: () => void;
  onDelete?: () => void;
}

export function DiveSiteModal({ isOpen, onClose, diveSite, onSave, onDelete }: DiveSiteModalProps) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (diveSite) {
      setName(diveSite.name);
      setLat(diveSite.lat.toString());
      setLon(diveSite.lon.toString());
      setError(null);
    }
  }, [diveSite]);

  const handleSave = async () => {
    if (!diveSite) return;
    
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('Latitude must be between -90 and 90');
      return;
    }
    
    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      setError('Longitude must be between -180 and 180');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      await invoke('update_dive_site', {
        id: diveSite.id,
        name: name.trim(),
        lat: latNum,
        lon: lonNum,
      });
      onSave?.();
      onClose();
    } catch (err) {
      logger.error('Failed to update dive site:', err);
      setError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!diveSite) return;
    
    if (!confirm(`Are you sure you want to delete "${diveSite.name}"?\n\nThis will not affect any dives that use this site.`)) {
      return;
    }
    
    setDeleting(true);
    setError(null);
    
    try {
      await invoke('delete_dive_site', { id: diveSite.id });
      onDelete?.();
      onClose();
    } catch (err) {
      logger.error('Failed to delete dive site:', err);
      setError(`Failed to delete: ${err}`);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !diveSite) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal dive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Dive Site</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ color: '#ff6b6b', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,107,107,0.1)', borderRadius: '4px' }}>
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="site-name">Name</label>
            <input
              id="site-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Blue Corner"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="site-lat">Latitude</label>
              <input
                id="site-lat"
                type="number"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="e.g., -8.5069"
                min="-90"
                max="90"
                step="any"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="site-lon">Longitude</label>
              <input
                id="site-lon"
                type="number"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="e.g., 115.2624"
                min="-180"
                max="180"
                step="any"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span>{diveSite.is_user_created ? '👤 User created' : '📥 Imported from CSV'}</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <button 
              className="button button-danger" 
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="button button-secondary" onClick={onClose}>
                Cancel
              </button>
              <button 
                className="button button-primary" 
                onClick={handleSave}
                disabled={saving || deleting}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
