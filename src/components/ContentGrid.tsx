import type { Dive, Photo, ViewMode } from '../types';
import { ImageLoader } from './ImageLoader';
import './ContentGrid.css';

interface ContentGridProps {
  viewMode: ViewMode;
  dives: Dive[];
  photos: Photo[];
  selectedPhotoIds: Set<number>;
  onSelectDive: (diveId: number) => void;
  onSelectPhoto: (photoId: number, multiSelect: boolean) => void;
  onOpenPhoto: (photoId: number) => void;
}

export function ContentGrid({
  viewMode,
  dives,
  photos,
  selectedPhotoIds,
  onSelectDive,
  onSelectPhoto,
  onOpenPhoto,
}: ContentGridProps) {
  const hasDives = viewMode === 'trip' && dives.length > 0;
  const hasPhotos = photos.length > 0;
  
  if (!hasDives && !hasPhotos) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📷</div>
        <h3>No content yet</h3>
        <p>
          {viewMode === 'trip'
            ? 'Import dive logs and photos to see them here'
            : 'No photos assigned to this dive'}
        </p>
      </div>
    );
  }

  const handlePhotoClick = (photoId: number, e: React.MouseEvent) => {
    // Multi-select with Ctrl/Cmd or Shift
    const multiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
    onSelectPhoto(photoId, multiSelect);
  };

  return (
    <div className="content-grid">
      {/* Dive cards when viewing a trip */}
      {hasDives && (
        <>
          {dives.map((dive) => (
            <button
              key={dive.id}
              className="grid-item dive-card"
              onClick={() => onSelectDive(dive.id)}
            >
              <div className="dive-card-header">
                <span className="dive-card-number">Dive {dive.dive_number}</span>
                <span className="dive-card-depth">{dive.max_depth_m.toFixed(1)}m</span>
              </div>
              <div className="dive-card-body">
                <div className="dive-card-location">
                  {dive.location || 'Unnamed Dive'}
                </div>
                <div className="dive-card-stats">
                  <span>{Math.floor(dive.duration_seconds / 60)} min</span>
                  {dive.water_temp_c && <span>{dive.water_temp_c}°C</span>}
                </div>
              </div>
              <div className="dive-card-footer">
                {dive.is_night_dive && <span className="dive-tag">🌙 Night</span>}
                {dive.is_boat_dive && <span className="dive-tag">🚤 Boat</span>}
                {dive.is_drift_dive && <span className="dive-tag">🌊 Drift</span>}
              </div>
            </button>
          ))}
        </>
      )}
      
      {/* Photo thumbnails */}
      {photos.map((photo) => (
        <button
          key={photo.id}
          className={`grid-item photo-card ${selectedPhotoIds.has(photo.id) ? 'selected' : ''}`}
          onClick={(e) => handlePhotoClick(photo.id, e)}
          onDoubleClick={() => onOpenPhoto(photo.id)}
        >
          <ImageLoader
            filePath={photo.thumbnail_path}
            alt={photo.filename}
            className="photo-thumbnail"
            placeholderClassName="photo-placeholder"
          />
          <div className="photo-info">
            <span className="photo-filename">{photo.filename}</span>
          </div>
          {photo.raw_photo_id && (
            <div className="photo-badge" title="Has RAW version">
              RAW
            </div>
          )}
          {selectedPhotoIds.has(photo.id) && (
            <div className="photo-selected-check">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
