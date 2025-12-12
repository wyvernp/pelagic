import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Dive, PhotoImportPreview, PhotoGroup, PhotoAssignment, ScannedPhoto } from '../types';
import './AddTripModal.css';
import './PhotoImportModal.css';

interface PhotoImportModalProps {
  isOpen: boolean;
  tripId: number;
  dives: Dive[];
  photoPaths: string[];
  onClose: () => void;
  onImportComplete: () => void;
}

export function PhotoImportModal({
  isOpen,
  tripId,
  dives,
  photoPaths,
  onClose,
  onImportComplete,
}: PhotoImportModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState<PhotoImportPreview | null>(null);
  const [assignments, setAssignments] = useState<Map<number, number | null>>(new Map()); // groupIndex -> diveId
  const [gapMinutes, setGapMinutes] = useState(60);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  // Scan photos when modal opens
  useEffect(() => {
    if (isOpen && photoPaths.length > 0) {
      scanPhotos();
    }
  }, [isOpen, photoPaths, gapMinutes]);

  const scanPhotos = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await invoke<PhotoImportPreview>('scan_photos_for_import', {
        paths: photoPaths,
        tripId,
        gapMinutes,
      });
      setPreview(result);
      
      // Initialize assignments from suggestions
      const initialAssignments = new Map<number, number | null>();
      result.groups.forEach((group, index) => {
        initialAssignments.set(index, group.suggested_dive_id ?? null);
      });
      setAssignments(initialAssignments);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleDiveAssignment = (groupIndex: number, diveId: number | null) => {
    setAssignments(prev => {
      const next = new Map(prev);
      next.set(groupIndex, diveId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!preview) return;
    
    setIsImporting(true);
    setError(null);
    
    try {
      // Build assignment list
      const photoAssignments: PhotoAssignment[] = [];
      
      // Add photos from matched groups
      preview.groups.forEach((group, index) => {
        const diveId = assignments.get(index);
        group.photos.forEach(photo => {
          photoAssignments.push({
            file_path: photo.file_path,
            dive_id: diveId ?? undefined,
          });
        });
      });
      
      // Add unmatched photos (no dive assignment)
      preview.unmatched_photos.forEach(photo => {
        photoAssignments.push({
          file_path: photo.file_path,
          dive_id: undefined,
        });
      });
      
      // Add photos without time (no dive assignment)
      preview.photos_without_time.forEach(photo => {
        photoAssignments.push({
          file_path: photo.file_path,
          dive_id: undefined,
        });
      });
      
      const count = await invoke<number>('import_photos', {
        tripId,
        assignments: photoAssignments,
        overwrite: overwriteExisting,
      });
      
      alert(`Successfully imported ${count} photos!`);
      onImportComplete();
      onClose();
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      // Auto-enable overwrite if we hit a duplicate error
      if (errorMsg.includes('UNIQUE constraint') || errorMsg.includes('already exists')) {
        setOverwriteExisting(true);
      }
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatTime = (isoTime?: string) => {
    if (!isoTime) return 'Unknown time';
    try {
      return new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoTime;
    }
  };

  const formatDate = (isoTime?: string) => {
    if (!isoTime) return '';
    try {
      return new Date(isoTime).toLocaleDateString();
    } catch {
      return '';
    }
  };

  const totalPhotos = preview
    ? preview.groups.reduce((sum, g) => sum + g.photos.length, 0) +
      preview.unmatched_photos.length +
      preview.photos_without_time.length
    : 0;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal modal-xl">
        <div className="modal-header">
          <h2>Import Photos</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body photo-import-body">
          {error && (
            <div className="error-banner">
              {error}
              {error.includes('UNIQUE constraint') && (
                <p className="error-hint">
                  Some photos were already imported. Check "Overwrite existing photos" below and try again.
                </p>
              )}
            </div>
          )}

          {isScanning ? (
            <div className="scanning-state">
              <div className="spinner"></div>
              <p>Scanning photos and reading EXIF data...</p>
            </div>
          ) : preview ? (
            <>
              <div className="import-summary">
                <p>
                  Found <strong>{totalPhotos}</strong> photos in{' '}
                  <strong>{preview.groups.length}</strong> groups
                  {preview.photos_without_time.length > 0 && (
                    <> + <strong>{preview.photos_without_time.length}</strong> without timestamps</>
                  )}
                </p>
                <div className="import-options">
                  <div className="gap-control">
                    <label>
                      Time gap between groups:
                      <select 
                        value={gapMinutes} 
                        onChange={(e) => setGapMinutes(Number(e.target.value))}
                      >
                        <option value={30}>30 minutes</option>
                        <option value={60}>1 hour</option>
                        <option value={120}>2 hours</option>
                        <option value={180}>3 hours</option>
                      </select>
                    </label>
                  </div>
                  <label className="overwrite-control">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={(e) => setOverwriteExisting(e.target.checked)}
                    />
                    Overwrite existing photos (re-import)
                  </label>
                </div>
              </div>

              <div className="import-info">
                <p className="info-text">
                  📷 Photos are grouped by time gaps. Each group is matched to a dive in order.
                  <br />
                  💡 <strong>Tip:</strong> If your camera's clock was wrong, don't worry! 
                  Groups are matched to dives by their relative order, not absolute time.
                </p>
              </div>

              <div className="photo-groups">
                {preview.groups.map((group, index) => (
                  <PhotoGroupCard
                    key={index}
                    group={group}
                    groupIndex={index}
                    dives={dives}
                    selectedDiveId={assignments.get(index) ?? null}
                    onDiveChange={(diveId) => handleDiveAssignment(index, diveId)}
                    formatTime={formatTime}
                    formatDate={formatDate}
                  />
                ))}

                {preview.unmatched_photos.length > 0 && (
                  <div className="photo-group unmatched">
                    <div className="group-header">
                      <div className="group-info">
                        <span className="group-title">Extra Photos (No Matching Dive)</span>
                        <span className="group-count">{preview.unmatched_photos.length} photos</span>
                      </div>
                      <div className="group-assignment">
                        <span className="assignment-label">Will be added to trip only</span>
                      </div>
                    </div>
                    <PhotoThumbnails photos={preview.unmatched_photos} />
                  </div>
                )}

                {preview.photos_without_time.length > 0 && (
                  <div className="photo-group no-time">
                    <div className="group-header">
                      <div className="group-info">
                        <span className="group-title">Photos Without Timestamps</span>
                        <span className="group-count">{preview.photos_without_time.length} photos</span>
                      </div>
                      <div className="group-assignment">
                        <span className="assignment-label">Will be added to trip only</span>
                      </div>
                    </div>
                    <PhotoThumbnails photos={preview.photos_without_time} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>Select photos or a folder to import</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImport}
            disabled={isScanning || isImporting || !preview || totalPhotos === 0}
          >
            {isImporting ? 'Importing...' : `Import ${totalPhotos} Photos`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PhotoGroupCardProps {
  group: PhotoGroup;
  groupIndex: number;
  dives: Dive[];
  selectedDiveId: number | null;
  onDiveChange: (diveId: number | null) => void;
  formatTime: (time?: string) => string;
  formatDate: (time?: string) => string;
}

function PhotoGroupCard({
  group,
  groupIndex,
  dives,
  selectedDiveId,
  onDiveChange,
  formatTime,
  formatDate,
}: PhotoGroupCardProps) {
  const timeRange = group.start_time && group.end_time
    ? `${formatTime(group.start_time)} - ${formatTime(group.end_time)}`
    : 'Unknown time range';
  
  const date = formatDate(group.start_time);

  return (
    <div className="photo-group">
      <div className="group-header">
        <div className="group-info">
          <span className="group-title">Group {groupIndex + 1}</span>
          <span className="group-time">{date} {timeRange}</span>
          <span className="group-count">{group.photos.length} photos</span>
          {group.duration_minutes !== undefined && group.duration_minutes > 0 && (
            <span className="group-duration">({group.duration_minutes} min span)</span>
          )}
        </div>
        <div className="group-assignment">
          <label>
            Assign to:
            <select
              value={selectedDiveId ?? ''}
              onChange={(e) => onDiveChange(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">-- No dive --</option>
              {dives.map((dive) => (
                <option key={dive.id} value={dive.id}>
                  Dive {dive.dive_number} - {dive.location || dive.date}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <PhotoThumbnails photos={group.photos} />
    </div>
  );
}

function PhotoThumbnails({ photos }: { photos: ScannedPhoto[] }) {
  const displayCount = 8;
  const displayPhotos = photos.slice(0, displayCount);
  const remaining = photos.length - displayCount;

  return (
    <div className="photo-thumbnails">
      {displayPhotos.map((photo, i) => (
        <div key={i} className="photo-thumb">
          <div className="thumb-placeholder">
            <span className="thumb-icon">📷</span>
          </div>
          <span className="thumb-name" title={photo.filename}>
            {photo.filename.length > 15 
              ? photo.filename.slice(0, 12) + '...' 
              : photo.filename}
          </span>
        </div>
      ))}
      {remaining > 0 && (
        <div className="photo-thumb more">
          <div className="thumb-placeholder">
            <span className="more-count">+{remaining}</span>
          </div>
          <span className="thumb-name">more</span>
        </div>
      )}
    </div>
  );
}
