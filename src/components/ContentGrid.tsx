import { useState, useEffect, useRef, useMemo, useCallback, memo, CSSProperties, ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Grid } from 'react-window';
import { logger } from '../utils/logger';
import { formatDiveName } from '../utils/diveNames';
import type { Dive, Photo, ViewMode, DiveWithDetails } from '../types';
import { ImageLoader } from './ImageLoader';
import { useSettings } from './SettingsModal';
import './ContentGrid.css';

// Custom props passed to virtualized photo cells
interface VirtualizedPhotoCellProps {
  photos: Photo[];
  selectedPhotoIds: Set<number>;
  focusedIndex: number;
  onPhotoClick: (photoId: number, e: React.MouseEvent) => void;
  onPhotoDoubleClick: (photoId: number) => void;
  onFocus: (index: number) => void;
  columnCount: number;
}

// Virtualized photo cell component for react-window v2
// Note: react-window v2 handles memoization internally, so we don't need memo() here
function VirtualizedPhotoCell({
  columnIndex,
  rowIndex,
  style,
  photos,
  selectedPhotoIds,
  focusedIndex,
  onPhotoClick,
  onPhotoDoubleClick,
  onFocus,
  columnCount,
}: {
  ariaAttributes: { "aria-colindex": number; role: "gridcell" };
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
} & VirtualizedPhotoCellProps): ReactElement {
  const index = rowIndex * columnCount + columnIndex;
  
  if (index >= photos.length) {
    return <div style={style} />; // Empty cell placeholder
  }
  
  const photo = photos[index];
  const isSelected = selectedPhotoIds.has(photo.id);
  const isFocused = focusedIndex === index;
  
  // Adjust style to add padding for the item
  const adjustedStyle: CSSProperties = {
    ...style,
    padding: '6px',
    boxSizing: 'border-box' as const,
  };
  
  return (
    <div style={adjustedStyle}>
      <button
        className={`grid-item photo-card ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
        onClick={(e) => {
          onPhotoClick(photo.id, e);
          onFocus(index);
        }}
        onDoubleClick={() => onPhotoDoubleClick(photo.id)}
        onFocus={() => onFocus(index)}
        tabIndex={0}
        role="gridcell"
        aria-selected={isSelected}
        aria-label={`Photo ${photo.filename}${isSelected ? ', selected' : ''}`}
        style={{ width: '100%', height: '100%' }}
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
        {isSelected && (
          <div className="photo-selected-check">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
        )}
      </button>
    </div>
  );
}

interface ContentGridProps {
  viewMode: ViewMode;
  tripId?: number | null; // Trip ID for caching - avoids re-render when dives array ref changes
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
  // Callback when all trip photos are loaded (for selection/viewer support)
  onAllTripPhotosLoaded?: (photos: Photo[]) => void;
}

export const ContentGrid = memo(function ContentGrid({
  viewMode,
  tripId,
  dives,
  photos,
  selectedPhotoIds,
  onSelectDive,
  onSelectPhoto,
  onOpenPhoto,
  bulkEditMode,
  selectedDiveIds,
  onToggleDiveSelection,
  onAllTripPhotosLoaded,
}: ContentGridProps) {
  // Store dives with their pre-loaded details (stats + thumbnail paths)
  const [divesWithDetails, setDivesWithDetails] = useState<DiveWithDetails[]>([]);
  const [allTripPhotos, setAllTripPhotos] = useState<Photo[]>([]);
  const [allPhotosCount, setAllPhotosCount] = useState<number>(0);
  const [allPhotosLoading, setAllPhotosLoading] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [allPhotosExpanded, setAllPhotosExpanded] = useState<boolean>(false);
  const loadingRef = useRef<boolean>(false);
  const abortRef = useRef<boolean>(false);
  const photosAbortRef = useRef<boolean>(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const virtualGridContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const settings = useSettings();
  
  // Cache for dive details to avoid refetching when navigating back to a trip
  const diveDetailsCache = useRef<Map<number, { details: DiveWithDetails[], photoCount: number, allPhotos?: Photo[] }>>(new Map());
  // Track current trip to detect changes
  const currentTripIdRef = useRef<number | null>(null);
  
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
  
  // Calculate grid dimensions for virtualization
  const gridGap = 12;
  const gridPadding = 16;
  const columnCount = useMemo(() => {
    const availableWidth = containerWidth - (gridPadding * 2);
    return Math.max(1, Math.floor((availableWidth + gridGap) / (thumbnailSize + gridGap)));
  }, [containerWidth, thumbnailSize]);
  
  const itemWidth = useMemo(() => {
    const availableWidth = containerWidth - (gridPadding * 2);
    return (availableWidth - (gridGap * (columnCount - 1))) / columnCount;
  }, [containerWidth, columnCount]);
  
  // Track container size for virtualization
  useEffect(() => {
    const container = virtualGridContainerRef.current;
    if (!container) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(container);
    setContainerWidth(container.clientWidth);
    
    return () => observer.disconnect();
  }, [allPhotosExpanded]);
  
  // Load dive details (stats + thumbnails) in a single batch call
  useEffect(() => {
    // Use tripId prop directly instead of extracting from dives array
    // This prevents re-running when dives array reference changes but tripId is the same
    if (viewMode === 'trip' && tripId) {
      // Check if we're switching to a different trip or staying on the same one
      if (currentTripIdRef.current === tripId && divesWithDetails.length > 0) {
        // Same trip, data already loaded - skip fetch
        return;
      }
      
      // Check cache first - this is instant, no delay needed
      const cached = diveDetailsCache.current.get(tripId);
      if (cached) {
        logger.debug(`Using cached dive details for trip ${tripId}`);
        setDivesWithDetails(cached.details);
        setAllPhotosCount(cached.photoCount);
        // Restore cached photos if available, otherwise reset
        if (cached.allPhotos) {
          setAllTripPhotos(cached.allPhotos);
          setAllPhotosExpanded(true); // Keep expanded if we have photos
          // Notify parent about restored photos for selection/viewer support
          onAllTripPhotosLoaded?.(cached.allPhotos);
        } else {
          setAllTripPhotos([]);
          setAllPhotosExpanded(false);
        }
        currentTripIdRef.current = tripId;
        return;
      }
      
      // No cache - need to fetch from backend
      // Abort any previous loading
      abortRef.current = true;
      photosAbortRef.current = true;
      
      // Clear previous local state (but NOT image cache - that persists across trips)
      setDivesWithDetails([]);
      setAllTripPhotos([]);
      setAllPhotosCount(0);
      setAllPhotosExpanded(false);
      
      // Use requestAnimationFrame to batch state updates before fetching
      const rafId = requestAnimationFrame(() => {
        abortRef.current = false;
        loadingRef.current = true;
        
        const loadDiveDataBatch = async () => {
          try {
            // Single batch call replaces 2N IPC calls (was: get_dive_thumbnail_photos + get_dive_stats per dive)
            const [details, allPhotos] = await Promise.all([
              invoke<DiveWithDetails[]>('get_dives_with_details', { tripId, thumbnailLimit: 4 }),
              invoke<Photo[]>('get_all_photos_for_trip', { tripId })
            ]);
            
            if (!abortRef.current) {
              // Update cache
              diveDetailsCache.current.set(tripId, { 
                details, 
                photoCount: allPhotos.length 
              });
              currentTripIdRef.current = tripId;
              
              setDivesWithDetails(details);
              setAllPhotosCount(allPhotos.length);
            }
          } catch (error) {
            logger.error('Failed to load dive data:', error);
          } finally {
            loadingRef.current = false;
          }
        };
        
        loadDiveDataBatch();
      });
      
      return () => {
        cancelAnimationFrame(rafId);
        abortRef.current = true;
        photosAbortRef.current = true;
      };
    } else {
      setDivesWithDetails([]);
      setAllTripPhotos([]);
      setAllPhotosCount(0);
      currentTripIdRef.current = null;
    }
  }, [viewMode, tripId]); // Now depends on tripId, not dives array

  // Load all photos progressively when section is expanded
  useEffect(() => {
    if (!allPhotosExpanded || viewMode !== 'trip' || !tripId) {
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
        
        // Update cache with all photos for faster navigation back
        if (!photosAbortRef.current && tripId) {
          const existing = diveDetailsCache.current.get(tripId);
          if (existing) {
            diveDetailsCache.current.set(tripId, { ...existing, allPhotos });
          }
        }
        
        // Notify parent about loaded photos for selection/viewer support
        if (!photosAbortRef.current) {
          onAllTripPhotosLoaded?.(allPhotos);
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
  }, [allPhotosExpanded, viewMode, tripId, allTripPhotos.length, PHOTO_BATCH_SIZE, onAllTripPhotosLoaded]);

  // hasDives checks if we're in trip view and have dives to load
  // We render dive cards once divesWithDetails is loaded (from batch endpoint)
  const hasDives = viewMode === 'trip' && divesWithDetails.length > 0;
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

  // Check if we have content to display, or if we're still loading
  const isLoadingDives = viewMode === 'trip' && dives.length > 0 && divesWithDetails.length === 0;
  
  // Early return for empty state - AFTER all hooks
  // Don't show empty state while loading
  if (!hasDives && !hasPhotos && !isLoadingDives) {
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
          {divesWithDetails.map((diveDetail) => {
            const { thumbnail_paths, photo_count, species_count, ...dive } = diveDetail;
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
                {thumbnail_paths.length > 0 && (
                  <div className={`dive-card-thumbs thumbs-${Math.min(thumbnail_paths.length, 4)}`}>
                    {thumbnail_paths.slice(0, 4).map((thumbPath, idx) => (
                      <div key={`${dive.id}-thumb-${idx}`} className="dive-thumb-wrapper">
                        <ImageLoader
                          filePath={thumbPath}
                          alt=""
                          className="dive-thumb"
                          placeholderClassName="dive-thumb-placeholder"
                        />
                        {idx === 3 && photo_count > 4 && (
                          <div className="dive-thumb-more">+{photo_count - 4}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {thumbnail_paths.length === 0 && (
                  <div className="dive-card-no-photos">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                      <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"/>
                    </svg>
                  </div>
                )}
                
                <div className="dive-card-content">
                  <div className="dive-card-header">
                    <span className="dive-card-number">{formatDiveName(settings.diveNamePrefix, dive.dive_number)}</span>
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
                    {photo_count > 0 && (
                      <span className="dive-stat">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                        </svg>
                        {photo_count}
                      </span>
                    )}
                    {species_count > 0 && (
                      <span className="dive-stat species">
                        🐠 {species_count}
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

      {/* All photos section - collapsible in trip view, uses virtualization for performance */}
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
              ref={virtualGridContainerRef}
              className="virtualized-photo-grid-container"
              style={{ height: '500px' }} 
            >
              {allTripPhotos.length > 0 && containerWidth > 0 && (
                <Grid<VirtualizedPhotoCellProps>
                  columnCount={columnCount}
                  columnWidth={itemWidth + gridGap}
                  rowCount={Math.ceil(allTripPhotos.length / columnCount)}
                  rowHeight={itemWidth + gridGap}
                  style={{ height: 500, width: containerWidth }}
                  cellComponent={VirtualizedPhotoCell}
                  cellProps={{
                    photos: allTripPhotos,
                    selectedPhotoIds,
                    focusedIndex,
                    onPhotoClick: handlePhotoClick,
                    onPhotoDoubleClick: onOpenPhoto,
                    onFocus: setFocusedIndex,
                    columnCount,
                  }}
                />
              )}
              {allTripPhotos.length === 0 && allPhotosLoading && (
                <div className="photo-grid-loading">Loading photos...</div>
              )}
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
});
