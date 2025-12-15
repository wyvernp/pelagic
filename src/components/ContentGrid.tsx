import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { Dive, Photo, ViewMode, DiveStats } from '../types';
import { ImageLoader } from './ImageLoader';
import { useSettings } from './SettingsModal';
import './ContentGrid.css';

interface DiveThumbnails {
  [diveId: number]: Photo[];
}

interface DiveStatsMap {
  [diveId: number]: DiveStats;
}

interface ContentGridProps {
  viewMode: ViewMode;
  dives: Dive[];
  photos: Photo[];
  selectedPhotoIds: Set<number>;
  onSelectDive: (diveId: number) => void;
  onSelectPhoto: (photoId: number, multiSelect: boolean) => void;
  onOpenPhoto: (photoId: number) => void;
  // Bulk edit mode props
  bulkEditMode?: boolean;
  selectedDiveIds?: Set<number>;
  onToggleDiveSelection?: (diveId: number) => void;
}

export function ContentGrid({
  viewMode,
  dives,
  photos,
  selectedPhotoIds,
  onSelectDive,
  onSelectPhoto,
  onOpenPhoto,
  bulkEditMode,
  selectedDiveIds,
  onToggleDiveSelection,
}: ContentGridProps) {
  const [diveThumbnails, setDiveThumbnails] = useState<DiveThumbnails>({});
  const [diveStats, setDiveStats] = useState<DiveStatsMap>({});
  const [allTripPhotos, setAllTripPhotos] = useState<Photo[]>([]);
  const [allPhotosCount, setAllPhotosCount] = useState<number>(0);
  const [allPhotosLoading, setAllPhotosLoading] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [allPhotosExpanded, setAllPhotosExpanded] = useState<boolean>(false);
  const loadingRef = useRef<boolean>(false);
  const abortRef = useRef<boolean>(false);
  const photosAbortRef = useRef<boolean>(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const settings = useSettings();
  
  // Batch size for progressive photo loading
  const PHOTO_BATCH_SIZE = 50;
  
  // Map thumbnail size setting to actual pixel values
  const thumbnailSize = useMemo(() => {
    switch (settings.thumbnailSize) {
      case 'small': return 120;
      case 'large': return 240;
      case 'medium':
      default: return 180;
    }
  }, [settings.thumbnailSize]);
  
  // Load thumbnails and stats for dives progressively (non-blocking)
  useEffect(() => {
    if (viewMode === 'trip' && dives.length > 0) {
      // Abort any previous loading
      abortRef.current = true;
      photosAbortRef.current = true;
      
      // Clear previous data
      setDiveThumbnails({});
      setDiveStats({});
      setAllTripPhotos([]);
      setAllPhotosCount(0);
      setAllPhotosExpanded(false);
      
      // Small delay to let the abort take effect
      const timeoutId = setTimeout(() => {
        abortRef.current = false;
        loadingRef.current = true;
        
        const loadDiveDataProgressively = async () => {
          // First, get the photo count for the trip (fast query)
          try {
            const tripId = dives[0]?.trip_id;
            if (tripId) {
              const allPhotos = await invoke<Photo[]>('get_all_photos_for_trip', { tripId });
              if (!abortRef.current) {
                setAllPhotosCount(allPhotos.length);
              }
            }
          } catch (error) {
            logger.error('Failed to get photo count for trip:', error);
          }
          
          // Load data for each dive one at a time to avoid blocking
          for (const dive of dives) {
            if (abortRef.current) break;
            
            try {
              // Load thumbnails and stats for this dive
              const [thumbs, stats] = await Promise.all([
                invoke<Photo[]>('get_dive_thumbnail_photos', { diveId: dive.id, limit: 4 }),
                invoke<DiveStats>('get_dive_stats', { diveId: dive.id })
              ]);
              
              if (abortRef.current) break;
              
              // Update state incrementally
              setDiveThumbnails(prev => ({ ...prev, [dive.id]: thumbs }));
              setDiveStats(prev => ({ ...prev, [dive.id]: stats }));
              
              // Small yield to let UI update
              await new Promise(resolve => setTimeout(resolve, 10));
            } catch (error) {
              logger.error(`Failed to load data for dive ${dive.id}:`, error);
            }
          }
          
          loadingRef.current = false;
        };
        
        loadDiveDataProgressively();
      }, 50);
      
      return () => {
        clearTimeout(timeoutId);
        abortRef.current = true;
        photosAbortRef.current = true;
      };
    } else {
      setDiveThumbnails({});
      setDiveStats({});
      setAllTripPhotos([]);
      setAllPhotosCount(0);
    }
  }, [viewMode, dives]);

  // Load all photos progressively when section is expanded
  useEffect(() => {
    if (!allPhotosExpanded || viewMode !== 'trip' || dives.length === 0) {
      return;
    }
    
    // If we already have photos loaded, don't reload
    if (allTripPhotos.length > 0) {
      return;
    }
    
    photosAbortRef.current = false;
    setAllPhotosLoading(true);
    
    const loadPhotosProgressively = async () => {
      try {
        const tripId = dives[0]?.trip_id;
        if (!tripId) return;
        
        // Load all photos (we'll render them progressively)
        const allPhotos = await invoke<Photo[]>('get_all_photos_for_trip', { tripId });
        
        if (photosAbortRef.current) return;
        
        // Add photos in batches with small delays to keep UI responsive
        for (let i = 0; i < allPhotos.length; i += PHOTO_BATCH_SIZE) {
          if (photosAbortRef.current) break;
          
          const batch = allPhotos.slice(0, i + PHOTO_BATCH_SIZE);
          setAllTripPhotos(batch);
          
          // Yield to let UI render
          if (i + PHOTO_BATCH_SIZE < allPhotos.length) {
            await new Promise(resolve => setTimeout(resolve, 16)); // ~1 frame
          }
        }
        
        setAllPhotosLoading(false);
      } catch (error) {
        logger.error('Failed to load all photos for trip:', error);
        setAllPhotosLoading(false);
      }
    };
    
    loadPhotosProgressively();
    
    return () => {
      photosAbortRef.current = true;
    };
  }, [allPhotosExpanded, viewMode, dives, allTripPhotos.length, PHOTO_BATCH_SIZE]);

  const hasDives = viewMode === 'trip' && dives.length > 0;
  const hasPhotos = photos.length > 0;

  // Calculate grid columns for keyboard navigation
  const getGridColumns = useCallback(() => {
    if (!gridRef.current) return 4;
    const gridStyle = window.getComputedStyle(gridRef.current);
    const columns = gridStyle.gridTemplateColumns.split(' ').length;
    return columns || 4;
  }, []);

  // Keyboard navigation for photo grid
  useEffect(() => {
    if (!hasPhotos || photos.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if the grid or its children are focused
      if (!gridRef.current?.contains(document.activeElement) && document.activeElement !== gridRef.current) {
        return;
      }

      const columns = getGridColumns();
      let newIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          newIndex = Math.min(focusedIndex + 1, photos.length - 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = Math.max(focusedIndex - 1, 0);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newIndex = Math.min(focusedIndex + columns, photos.length - 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          newIndex = Math.max(focusedIndex - columns, 0);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < photos.length) {
            onOpenPhoto(photos[focusedIndex].id);
          }
          break;
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < photos.length) {
            onSelectPhoto(photos[focusedIndex].id, e.ctrlKey || e.metaKey || e.shiftKey);
          }
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = photos.length - 1;
          break;
        default:
          return;
      }

      if (newIndex !== focusedIndex && newIndex >= 0) {
        setFocusedIndex(newIndex);
        // Focus the photo button
        const photoButtons = gridRef.current?.querySelectorAll('.photo-card');
        if (photoButtons && photoButtons[newIndex]) {
          (photoButtons[newIndex] as HTMLElement).focus();
        }
        // Also select the photo (without multi-select unless modifier held)
        if (e.key !== 'Enter' && e.key !== ' ') {
          onSelectPhoto(photos[newIndex].id, false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasPhotos, photos, focusedIndex, getGridColumns, onSelectPhoto, onOpenPhoto]);

  // Reset focused index when photos change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [photos, allTripPhotos]);

  // Determine if we're in trip view with photos to show
  const showAllPhotosSection = viewMode === 'trip' && allPhotosCount > 0;

  // Early return for empty state - AFTER all hooks
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

  const handleDiveCardClick = (diveId: number, e: React.MouseEvent) => {
    if (bulkEditMode && onToggleDiveSelection) {
      e.preventDefault();
      e.stopPropagation();
      onToggleDiveSelection(diveId);
    } else {
      onSelectDive(diveId);
    }
  };

  return (
    <div className="content-grid-wrapper">
      {/* Dive cards when viewing a trip */}
      {hasDives && (
        <div 
          className="content-grid dive-grid"
          style={{ '--thumbnail-size': `${thumbnailSize}px` } as React.CSSProperties}
        >
          {dives.map((dive) => {
            const thumbnails = diveThumbnails[dive.id] || [];
            const stats = diveStats[dive.id] || { photo_count: 0, species_count: 0 };
            const isSelected = selectedDiveIds?.has(dive.id) ?? false;
            
            return (
              <button
                key={dive.id}
                className={`grid-item dive-card ${bulkEditMode ? 'bulk-edit-mode' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={(e) => handleDiveCardClick(dive.id, e)}
              >
                {/* Selection checkbox in bulk edit mode */}
                {bulkEditMode && (
                  <div className="dive-card-checkbox">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => onToggleDiveSelection?.(dive.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                {/* Selection indicator */}
                {isSelected && (
                  <div className="dive-selected-check">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  </div>
                )}
                {/* Thumbnail grid */}
                {thumbnails.length > 0 && (
                  <div className={`dive-card-thumbs thumbs-${Math.min(thumbnails.length, 4)}`}>
                    {thumbnails.slice(0, 4).map((photo, idx) => (
                      <div key={photo.id} className="dive-thumb-wrapper">
                        <ImageLoader
                          filePath={photo.thumbnail_path}
                          alt=""
                          className="dive-thumb"
                          placeholderClassName="dive-thumb-placeholder"
                        />
                        {idx === 3 && stats.photo_count > 4 && (
                          <div className="dive-thumb-more">+{stats.photo_count - 4}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {thumbnails.length === 0 && (
                  <div className="dive-card-no-photos">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                      <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"/>
                    </svg>
                  </div>
                )}
                
                <div className="dive-card-content">
                  <div className="dive-card-header">
                    <span className="dive-card-number">#{dive.dive_number}</span>
                    <span className="dive-card-depth">{dive.max_depth_m.toFixed(1)}m</span>
                  </div>
                  
                  <div className="dive-card-location">
                    {dive.location || 'Unnamed Site'}
                  </div>
                  
                  <div className="dive-card-stats">
                    <span className="dive-stat">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      {Math.floor(dive.duration_seconds / 60)}min
                    </span>
                    {dive.water_temp_c && (
                      <span className="dive-stat">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                          <path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4z"/>
                        </svg>
                        {dive.water_temp_c}°
                      </span>
                    )}
                    {stats.photo_count > 0 && (
                      <span className="dive-stat">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                        </svg>
                        {stats.photo_count}
                      </span>
                    )}
                    {stats.species_count > 0 && (
                      <span className="dive-stat species">
                        🐠 {stats.species_count}
                      </span>
                    )}
                  </div>
                  
                  {(dive.is_night_dive || dive.is_boat_dive || dive.is_drift_dive) && (
                    <div className="dive-card-tags">
                      {dive.is_night_dive && <span className="dive-tag">🌙</span>}
                      {dive.is_boat_dive && <span className="dive-tag">🚤</span>}
                      {dive.is_drift_dive && <span className="dive-tag">🌊</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* All photos section - collapsible in trip view, loads on expand */}
      {showAllPhotosSection && (
        <div className="unassigned-photos-section">
          <button 
            className="unassigned-photos-header"
            onClick={() => setAllPhotosExpanded(!allPhotosExpanded)}
            aria-expanded={allPhotosExpanded}
          >
            <svg 
              className={`expand-icon ${allPhotosExpanded ? 'expanded' : ''}`}
              viewBox="0 0 24 24" 
              fill="currentColor" 
              width="20" 
              height="20"
            >
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
            <span className="unassigned-photos-title">
              All Photos
            </span>
            <span className="unassigned-photos-count">
              {allPhotosLoading && allTripPhotos.length < allPhotosCount 
                ? `Loading ${allTripPhotos.length}/${allPhotosCount}...`
                : `${allPhotosCount} photo${allPhotosCount !== 1 ? 's' : ''}`
              }
            </span>
          </button>
          
          {allPhotosExpanded && (
            <div 
              ref={gridRef}
              className="content-grid photo-grid"
              style={{ '--thumbnail-size': `${thumbnailSize}px` } as React.CSSProperties}
              tabIndex={0}
              role="grid"
              aria-label="All trip photos gallery"
            >
              {allTripPhotos.map((photo, index) => (
                <button
                  key={photo.id}
                  className={`grid-item photo-card ${selectedPhotoIds.has(photo.id) ? 'selected' : ''} ${focusedIndex === index ? 'focused' : ''}`}
                  onClick={(e) => {
                    handlePhotoClick(photo.id, e);
                    setFocusedIndex(index);
                  }}
                  onDoubleClick={() => onOpenPhoto(photo.id)}
                  onFocus={() => setFocusedIndex(index)}
                  tabIndex={0}
                  role="gridcell"
                  aria-selected={selectedPhotoIds.has(photo.id)}
                  aria-label={`Photo ${photo.filename}${selectedPhotoIds.has(photo.id) ? ', selected' : ''}`}
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
          )}
        </div>
      )}

      {/* Photo thumbnails when NOT in trip view (regular dive view) */}
      {!showAllPhotosSection && hasPhotos && (
        <div 
          ref={gridRef}
          className="content-grid photo-grid"
          style={{ '--thumbnail-size': `${thumbnailSize}px` } as React.CSSProperties}
          tabIndex={0}
          role="grid"
          aria-label="Photo gallery"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              className={`grid-item photo-card ${selectedPhotoIds.has(photo.id) ? 'selected' : ''} ${focusedIndex === index ? 'focused' : ''}`}
              onClick={(e) => {
                handlePhotoClick(photo.id, e);
                setFocusedIndex(index);
              }}
              onDoubleClick={() => onOpenPhoto(photo.id)}
              onFocus={() => setFocusedIndex(index)}
              tabIndex={0}
              role="gridcell"
              aria-selected={selectedPhotoIds.has(photo.id)}
              aria-label={`Photo ${photo.filename}${selectedPhotoIds.has(photo.id) ? ', selected' : ''}`}
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
      )}
    </div>
  );
}
