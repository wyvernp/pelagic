import { useEffect, useCallback, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { Photo } from '../types';
import { ImageLoader } from './ImageLoader';
import { useSettings } from './SettingsModal';
import './PhotoViewer.css';

type ViewMode = 'display' | 'raw' | 'processed' | 'side-by-side';

interface PhotoViewerProps {
  photo: Photo;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function PhotoViewer({
  photo,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: PhotoViewerProps) {
  const settings = useSettings();
  const [viewMode, setViewMode] = useState<ViewMode>('display');
  const [displayPhoto, setDisplayPhoto] = useState<Photo>(photo);
  const [processedPhoto, setProcessedPhoto] = useState<Photo | null>(null);
  const [rawPhoto, setRawPhoto] = useState<Photo>(photo);
  const [hasProcessedVersion, setHasProcessedVersion] = useState(false);
  
  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Reset zoom when photo changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo]);

  // Load the display version (processed if available) and alternate versions
  useEffect(() => {
    const loadVersions = async () => {
      try {
        logger.debug('Loading versions for photo:', photo.id, photo.filename);
        
        // Get the best version for display (processed if exists)
        const display = await invoke<Photo>('get_display_version', { photoId: photo.id });
        logger.debug('Display version:', display.id, display.filename, 'is_processed:', display.is_processed);
        setDisplayPhoto(display);
        
        // Try to get the processed version (if photo is RAW and has one)
        const processed = await invoke<Photo | null>('get_processed_version', { photoId: photo.id });
        logger.debug('Processed version:', processed ? `${processed.id} ${processed.filename}` : 'none');
        setProcessedPhoto(processed);
        setHasProcessedVersion(!!processed);
        
        // The RAW is always the passed-in photo (since we filter processed from the grid)
        setRawPhoto(photo);
      } catch (error) {
        logger.error('Failed to load photo versions:', error);
        setDisplayPhoto(photo);
        setRawPhoto(photo);
        setHasProcessedVersion(false);
      }
    };
    loadVersions();
    setViewMode('display');
  }, [photo]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.min(Math.max(0.5, z + delta), 5));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z - 0.25, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Open in external editor
  const handleOpenInEditor = useCallback(async () => {
    try {
      // Use the currently displayed photo's file path (raw or processed depending on view)
      const filePath = viewMode === 'processed' && processedPhoto 
        ? processedPhoto.file_path 
        : rawPhoto.file_path;
      
      const editorPath = settings.defaultImageEditor || undefined;
      await invoke('open_in_editor', { filePath, editorPath });
    } catch (error) {
      logger.error('Failed to open in editor:', error);
    }
  }, [rawPhoto, processedPhoto, viewMode, settings.defaultImageEditor]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  }, [isPanning, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (hasPrevious && onPrevious) onPrevious();
        break;
      case 'ArrowRight':
        if (hasNext && onNext) onNext();
        break;
      case 'r':
      case 'R':
        if (hasProcessedVersion) {
          setViewMode(v => v === 'raw' ? 'display' : 'raw');
        }
        break;
      case 'p':
      case 'P':
        if (hasProcessedVersion) {
          setViewMode(v => v === 'processed' ? 'display' : 'processed');
        }
        break;
      case 's':
      case 'S':
        if (hasProcessedVersion) {
          setViewMode(v => v === 'side-by-side' ? 'display' : 'side-by-side');
        }
        break;
      case 'e':
      case 'E':
        handleOpenInEditor();
        break;
      case '+':
      case '=':
        handleZoomIn();
        break;
      case '-':
        handleZoomOut();
        break;
      case '0':
        handleResetZoom();
        break;
    }
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext, hasProcessedVersion, handleZoomIn, handleZoomOut, handleResetZoom, handleOpenInEditor]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Determine which photo(s) to display based on view mode
  const getDisplayPhotos = (): { left: Photo; right?: Photo; leftLabel?: string; rightLabel?: string } => {
    switch (viewMode) {
      case 'raw':
        return { left: rawPhoto, leftLabel: 'RAW' };
      case 'processed':
        return { left: processedPhoto || displayPhoto, leftLabel: 'Processed' };
      case 'side-by-side':
        if (processedPhoto) {
          return { left: rawPhoto, right: processedPhoto, leftLabel: 'RAW', rightLabel: 'Processed' };
        }
        return { left: displayPhoto };
      default: // 'display' - shows processed if available, otherwise RAW
        return { left: displayPhoto };
    }
  };

  const { left: leftPhoto, right: rightPhoto, leftLabel, rightLabel } = getDisplayPhotos();

  return (
    <div className="photo-viewer-overlay" onClick={onClose}>
      <div className="photo-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className="photo-viewer-close" onClick={onClose} title="Close (Esc)">
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>

        {/* View mode toggle - only show if processed version exists */}
        {hasProcessedVersion && (
          <div className="photo-viewer-mode-toggle">
            <button
              className={`mode-btn ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
              title="View RAW (R)"
            >
              RAW
            </button>
            <button
              className={`mode-btn ${viewMode === 'processed' ? 'active' : ''}`}
              onClick={() => setViewMode('processed')}
              title="View Processed (P)"
            >
              Processed
            </button>
            <button
              className={`mode-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
              title="Side by Side (S)"
            >
              Compare
            </button>
          </div>
        )}

        {/* Navigation buttons */}
        {hasPrevious && (
          <button 
            className="photo-viewer-nav photo-viewer-prev" 
            onClick={onPrevious}
            title="Previous (←)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
        )}
        
        {hasNext && (
          <button 
            className="photo-viewer-nav photo-viewer-next" 
            onClick={onNext}
            title="Next (→)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
        )}

        {/* Zoom controls */}
        <div className="photo-viewer-zoom-controls">
          <button onClick={handleZoomOut} title="Zoom out (-)">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} title="Zoom in (+)">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          <button onClick={handleResetZoom} title="Reset zoom (0)">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
          </button>
          <div className="zoom-controls-divider"></div>
          <button onClick={handleOpenInEditor} title="Open in external editor (E)">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
        </div>

        {/* Main image(s) */}
        <div 
          ref={imageContainerRef}
          className={`photo-viewer-image-container ${rightPhoto ? 'side-by-side' : ''} ${isPanning ? 'panning' : ''}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            className="photo-viewer-image-wrapper"
            style={{
              transform: !rightPhoto ? `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` : undefined,
            }}
          >
            <ImageLoader
              filePath={leftPhoto.file_path}
              alt={leftPhoto.filename}
              className="photo-viewer-image"
              placeholderClassName="photo-viewer-placeholder"
            />
            {leftLabel && rightPhoto && (
              <span className="photo-label">{leftLabel}</span>
            )}
          </div>
          {rightPhoto && (
            <div className="photo-viewer-image-wrapper">
              <ImageLoader
                filePath={rightPhoto.file_path}
                alt={rightPhoto.filename}
                className="photo-viewer-image"
                placeholderClassName="photo-viewer-placeholder"
              />
              {rightLabel && <span className="photo-label">{rightLabel}</span>}
            </div>
          )}
        </div>

        {/* Photo info bar - show RAW file info since that's what's in the grid */}
        <div className="photo-viewer-info">
          <span className="photo-viewer-filename">
            {rawPhoto.filename}
            {hasProcessedVersion && leftPhoto.is_processed && (
              <span className="processed-indicator"> (showing processed)</span>
            )}
          </span>
          <div className="photo-viewer-metadata">
            {rawPhoto.camera_model && (
              <span>{rawPhoto.camera_model}</span>
            )}
            {rawPhoto.focal_length_mm && (
              <span>{rawPhoto.focal_length_mm}mm</span>
            )}
            {rawPhoto.aperture && (
              <span>f/{rawPhoto.aperture}</span>
            )}
            {rawPhoto.shutter_speed && (
              <span>{rawPhoto.shutter_speed}s</span>
            )}
            {rawPhoto.iso && (
              <span>ISO {rawPhoto.iso}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
