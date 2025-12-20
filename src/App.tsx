import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { confirmDialog } from './utils/dialogs';
import { logger } from './utils/logger';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { RightPanel } from './components/RightPanel';
import { TripModal, type TripFormData } from './components/AddTripModal';
import { DiveModal, type DiveFormData } from './components/DiveModal';
import { AddDiveModal, type NewDiveFormData } from './components/AddDiveModal';
import { PhotoImportModal } from './components/PhotoImportModal';
import { PhotoViewer } from './components/PhotoViewer';
import { SpeciesTagModal } from './components/SpeciesTagModal';
import { GeneralTagModal } from './components/GeneralTagModal';
import { StatisticsModal } from './components/StatisticsModal';
import { ExportModal } from './components/ExportModal';
import { SearchModal } from './components/SearchModal';
import { BatchOperationsModal } from './components/BatchOperationsModal';
import { SettingsModal } from './components/SettingsModal';
import { MapView } from './components/MapView';
import { DiveComputerModal } from './components/DiveComputerModal';
import { EquipmentModal } from './components/EquipmentModal';
import { BulkEditDiveModal, type BulkDiveFormData } from './components/BulkEditDiveModal';
import type { Trip, Dive, Photo, AppState, SearchResults } from './types';

function App() {
  const [state, setState] = useState<AppState>({
    viewMode: 'trips',
    selectedTripId: null,
    selectedDiveId: null,
    selectedPhotoId: null,
  });
  
  // Multi-select state for photos
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());
  
  // Bulk edit mode for dives
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedDiveIds, setSelectedDiveIds] = useState<Set<number>>(new Set());
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [dives, setDives] = useState<Dive[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [diveModalOpen, setDiveModalOpen] = useState(false);
  const [editingDive, setEditingDive] = useState<Dive | null>(null);
  const [addDiveModalOpen, setAddDiveModalOpen] = useState(false);
  const [addDiveTripId, setAddDiveTripId] = useState<number | null>(null);
  const [photoImportOpen, setPhotoImportOpen] = useState(false);
  const [photoImportPaths, setPhotoImportPaths] = useState<string[]>([]);
  const [viewerPhotoId, setViewerPhotoId] = useState<number | null>(null);
  const [thumbnailProgress, setThumbnailProgress] = useState<{ current: number; total: number } | null>(null);
  const [speciesModalOpen, setSpeciesModalOpen] = useState(false);
  const [generalTagModalOpen, setGeneralTagModalOpen] = useState(false);
  const [statisticsModalOpen, setStatisticsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const [diveComputerModalOpen, setDiveComputerModalOpen] = useState(false);
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  
  // Search results state
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Refs to track current state for background effects (avoids stale closures)
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Computed values - defined early so handlers can use them
  const selectedTrip = trips.find((t) => t.id === state.selectedTripId) ?? null;
  const selectedDive = dives.find((d) => d.id === state.selectedDiveId) ?? null;
  
  // Handle search results photos
  const currentPhotos = useMemo(() => {
    if (state.viewMode === 'search' && searchResults) {
      return searchResults.photos;
    }
    return state.selectedDiveId
      ? photos.filter((p) => p.dive_id === state.selectedDiveId)
      : photos.filter((p) => p.trip_id === state.selectedTripId);
  }, [photos, state.selectedDiveId, state.selectedTripId, state.viewMode, searchResults]);
  
  const selectedPhoto = currentPhotos.find((p) => p.id === state.selectedPhotoId) ?? null;
  const tripDives = dives.filter((d) => d.trip_id === state.selectedTripId);
  const viewerPhoto = viewerPhotoId ? currentPhotos.find(p => p.id === viewerPhotoId) ?? null : null;

  // Load trips on mount
  useEffect(() => {
    loadTrips();
    
    // Link any orphan processed photos to their RAW counterparts
    invoke<number>('link_orphan_processed_photos')
      .then((count) => {
        if (count > 0) {
          logger.info(`Linked ${count} orphan processed photos to their RAW files`);
        }
      })
      .catch((err) => logger.error('Failed to link orphan photos:', err));
  }, []);
  
  // Regenerate thumbnails in background ONE AT A TIME (non-blocking)
  useEffect(() => {
    let cancelled = false;
    
    const processThumbsInBackground = async () => {
      try {
        // Wait a bit before starting
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (cancelled) return;
        
        // Get list of photos needing thumbnails
        const photoIds = await invoke<number[]>('get_photos_needing_thumbnails');
        if (photoIds.length === 0 || cancelled) return;
        
        logger.info(`Starting background thumbnail generation for ${photoIds.length} photos`);
        setThumbnailProgress({ current: 0, total: photoIds.length });
        
        // Process one at a time
        for (let i = 0; i < photoIds.length; i++) {
          if (cancelled) break;
          
          try {
            await invoke('generate_single_thumbnail', { photoId: photoIds[i] });
            setThumbnailProgress({ current: i + 1, total: photoIds.length });
            
            // Every 10 thumbnails, reload current photo view to show progress
            if ((i + 1) % 10 === 0) {
              const currentState = stateRef.current;
              if (currentState.selectedDiveId) {
                const newPhotos = await invoke<Photo[]>('get_photos_for_dive', { diveId: currentState.selectedDiveId });
                setPhotos(newPhotos);
              } else if (currentState.selectedTripId) {
                const newPhotos = await invoke<Photo[]>('get_photos_for_trip', { tripId: currentState.selectedTripId });
                setPhotos(newPhotos);
              }
            }
          } catch (err) {
            logger.warn(`Failed to generate thumbnail for photo ${photoIds[i]}:`, err);
          }
        }
        
        logger.info('Background thumbnail generation complete');
        setThumbnailProgress(null);
        
        // Final reload of photos using current state
        const finalState = stateRef.current;
        if (finalState.selectedDiveId) {
          const newPhotos = await invoke<Photo[]>('get_photos_for_dive', { diveId: finalState.selectedDiveId });
          setPhotos(newPhotos);
        } else if (finalState.selectedTripId) {
          const newPhotos = await invoke<Photo[]>('get_photos_for_trip', { tripId: finalState.selectedTripId });
          setPhotos(newPhotos);
        }
      } catch (error) {
        logger.error('Failed to regenerate thumbnails:', error);
        setThumbnailProgress(null);
      }
    };
    
    processThumbsInBackground();
    
    return () => { cancelled = true; };
  }, []); // Only run once on mount

  // Load dives when trip changes
  useEffect(() => {
    if (state.selectedTripId) {
      loadDivesForTrip(state.selectedTripId);
    } else {
      setDives([]);
    }
  }, [state.selectedTripId]);

  // Load photos when dive changes
  useEffect(() => {
    if (state.selectedDiveId) {
      loadPhotosForDive(state.selectedDiveId);
    } else if (state.selectedTripId) {
      loadPhotosForTrip(state.selectedTripId);
    } else {
      setPhotos([]);
    }
  }, [state.selectedDiveId, state.selectedTripId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadTrips = async () => {
    try {
      setIsLoading(true);
      const result = await invoke<Trip[]>('get_trips');
      setTrips(result);
    } catch (error) {
      logger.error('Failed to load trips:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDivesForTrip = async (tripId: number) => {
    try {
      const result = await invoke<Dive[]>('get_dives_for_trip', { tripId });
      setDives(result);
    } catch (error) {
      logger.error('Failed to load dives:', error);
    }
  };

  const loadPhotosForDive = async (diveId: number) => {
    try {
      const result = await invoke<Photo[]>('get_photos_for_dive', { diveId });
      setPhotos(result);
    } catch (error) {
      logger.error('Failed to load photos:', error);
    }
  };

  const loadPhotosForTrip = async (tripId: number) => {
    try {
      const result = await invoke<Photo[]>('get_photos_for_trip', { tripId });
      setPhotos(result);
    } catch (error) {
      logger.error('Failed to load photos:', error);
    }
  };

  const handleImportPhotos = async () => {
    if (!state.selectedTripId) {
      alert('Please select a trip first before importing photos.');
      return;
    }

    try {
      const selected = await open({
        multiple: true,
        directory: true,
        filters: [{
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng']
        }]
      });

      if (selected) {
        // Convert to array if single selection
        const paths = Array.isArray(selected) ? selected : [selected];
        setPhotoImportPaths(paths);
        setPhotoImportOpen(true);
      }
    } catch (error) {
      logger.error('Failed to select photos:', error);
      alert('Failed to select photos: ' + error);
    }
  };

  const handlePhotoImportComplete = async () => {
    // Reload photos for current view
    if (state.selectedDiveId) {
      await loadPhotosForDive(state.selectedDiveId);
    } else if (state.selectedTripId) {
      await loadPhotosForTrip(state.selectedTripId);
    }
  };

  const handleSelectTrip = useCallback((tripId: number | null) => {
    setState({
      viewMode: tripId ? 'trip' : 'trips',
      selectedTripId: tripId,
      selectedDiveId: null,
      selectedPhotoId: null,
    });
    // Clear search results when navigating to a trip
    setSearchResults(null);
    setSearchQuery('');
  }, []);

  // Batch operations handler
  const handleBatchOperationComplete = useCallback(async () => {
    // Reload photos after batch operation
    if (state.selectedDiveId) {
      await loadPhotosForDive(state.selectedDiveId);
    } else if (state.selectedTripId) {
      await loadPhotosForTrip(state.selectedTripId);
    }
    // Clear selection
    setSelectedPhotoIds(new Set());
  }, [state.selectedDiveId, state.selectedTripId]);

  const handleSelectDive = useCallback((diveId: number | null) => {
    setState((prev) => ({
      ...prev,
      viewMode: diveId ? 'dive' : 'trip',
      selectedDiveId: diveId,
      selectedPhotoId: null,
    }));
    // Clear multi-select when changing dives
    setSelectedPhotoIds(new Set());
    // Clear search results
    setSearchResults(null);
    setSearchQuery('');
  }, []);

  const handleSelectPhoto = useCallback((photoId: number, multiSelect: boolean) => {
    if (multiSelect) {
      // Multi-select mode: toggle the photo in selection
      setSelectedPhotoIds(prev => {
        const next = new Set(prev);
        if (next.has(photoId)) {
          next.delete(photoId);
        } else {
          next.add(photoId);
        }
        return next;
      });
    } else {
      // Single select: clear multi-selection and select just this photo
      setSelectedPhotoIds(new Set([photoId]));
    }
    // Always update the single selected photo for the right panel
    setState((prev) => ({
      ...prev,
      selectedPhotoId: photoId,
    }));
  }, []);
  
  const handleClearSelection = useCallback(() => {
    setSelectedPhotoIds(new Set());
    setState((prev) => ({
      ...prev,
      selectedPhotoId: null,
    }));
  }, []);
  
  const handleTagSpecies = useCallback(() => {
    if (selectedPhotoIds.size > 0) {
      setSpeciesModalOpen(true);
    }
  }, [selectedPhotoIds]);
  
  const handleTagGeneral = useCallback(() => {
    if (selectedPhotoIds.size > 0) {
      setGeneralTagModalOpen(true);
    }
  }, [selectedPhotoIds]);
  
  const handleDeletePhotos = useCallback(async () => {
    if (selectedPhotoIds.size === 0) return;
    
    const count = selectedPhotoIds.size;
    const confirmed = await confirmDialog(
      'Delete Photos',
      `Are you sure you want to delete ${count} photo${count !== 1 ? 's' : ''}?\n\nThis will remove the photos from the database but will NOT delete the original files from disk.`,
      { okLabel: 'Delete', kind: 'warning' }
    );
    
    if (confirmed) {
      try {
        await invoke('delete_photos', { photoIds: Array.from(selectedPhotoIds) });
        // Clear selection
        setSelectedPhotoIds(new Set());
        setState(prev => ({ ...prev, selectedPhotoId: null }));
        // Reload photos
        if (state.selectedDiveId) {
          await loadPhotosForDive(state.selectedDiveId);
        } else if (state.selectedTripId) {
          await loadPhotosForTrip(state.selectedTripId);
        }
      } catch (error) {
        logger.error('Failed to delete photos:', error);
        alert('Failed to delete photos: ' + error);
      }
    }
  }, [selectedPhotoIds, state.selectedDiveId, state.selectedTripId]);

  const handleOpenPhoto = useCallback((photoId: number) => {
    setViewerPhotoId(photoId);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerPhotoId(null);
  }, []);

  const handlePreviousPhoto = useCallback(() => {
    if (viewerPhotoId === null) return;
    const currentIndex = currentPhotos.findIndex(p => p.id === viewerPhotoId);
    if (currentIndex > 0) {
      setViewerPhotoId(currentPhotos[currentIndex - 1].id);
    }
  }, [viewerPhotoId, currentPhotos]);

  const handleNextPhoto = useCallback(() => {
    if (viewerPhotoId === null) return;
    const currentIndex = currentPhotos.findIndex(p => p.id === viewerPhotoId);
    if (currentIndex < currentPhotos.length - 1) {
      setViewerPhotoId(currentPhotos[currentIndex + 1].id);
    }
  }, [viewerPhotoId, currentPhotos]);

  const handleAddTrip = () => {
    setEditingTrip(null);
    setTripModalOpen(true);
  };

  const handleEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setTripModalOpen(true);
  };

  const handleTripSubmit = async (data: TripFormData) => {
    try {
      if (editingTrip) {
        // Update existing trip
        await invoke('update_trip', {
          id: editingTrip.id,
          name: data.name,
          location: data.location,
          resort: data.resort || null,
          dateStart: data.dateStart,
          dateEnd: data.dateEnd,
          notes: data.notes || null,
        });
        setTripModalOpen(false);
        await loadTrips();
      } else {
        // Create new trip
        const tripId = await invoke<number>('create_trip', {
          name: data.name,
          location: data.location,
          dateStart: data.dateStart,
          dateEnd: data.dateEnd,
        });
        setTripModalOpen(false);
        await loadTrips();
        handleSelectTrip(tripId);
      }
    } catch (error) {
      logger.error('Failed to save trip:', error);
      alert('Failed to save trip: ' + error);
    }
  };

  const handleDeleteTrip = async (tripId: number) => {
    try {
      await invoke('delete_trip', { id: tripId });
      setTripModalOpen(false);
      await loadTrips();
      if (state.selectedTripId === tripId) {
        handleSelectTrip(null);
      }
    } catch (error) {
      logger.error('Failed to delete trip:', error);
      alert('Failed to delete trip: ' + error);
    }
  };

  const handleEditDive = (dive: Dive) => {
    setEditingDive(dive);
    setDiveModalOpen(true);
  };

  const handleAddDive = (tripId: number) => {
    setAddDiveTripId(tripId);
    setAddDiveModalOpen(true);
  };

  const handleAddDiveSubmit = async (data: NewDiveFormData) => {
    if (!addDiveTripId) return;
    
    try {
      const diveId = await invoke<number>('create_manual_dive', {
        tripId: addDiveTripId,
        date: data.date,
        time: data.time,
        durationSeconds: Math.round(data.duration_minutes * 60),
        maxDepthM: data.max_depth_m,
        meanDepthM: data.mean_depth_m,
        waterTempC: data.water_temp_c,
        airTempC: data.air_temp_c,
        surfacePressureBar: data.surface_pressure_bar,
        cnsPercent: data.cns_percent,
        nitroxO2Percent: data.nitrox_o2_percent,
        location: data.location || null,
        ocean: data.ocean || null,
        visibilityM: data.visibility_m,
        buddy: data.buddy || null,
        divemaster: data.divemaster || null,
        guide: data.guide || null,
        instructor: data.instructor || null,
        comments: data.comments || null,
        latitude: data.latitude,
        longitude: data.longitude,
        isFreshWater: data.is_fresh_water,
        isBoatDive: data.is_boat_dive,
        isDriftDive: data.is_drift_dive,
        isNightDive: data.is_night_dive,
        isTrainingDive: data.is_training_dive,
      });
      
      setAddDiveModalOpen(false);
      setAddDiveTripId(null);
      
      // Reload dives and select the new one
      await loadDivesForTrip(addDiveTripId);
      handleSelectDive(diveId);
    } catch (error) {
      logger.error('Failed to create dive:', error);
      alert('Failed to create dive: ' + error);
    }
  };

  const handleDiveSubmit = async (diveId: number, data: DiveFormData) => {
    try {
      await invoke('update_dive', {
        id: diveId,
        location: data.location || null,
        ocean: data.ocean || null,
        visibilityM: data.visibility_m,
        buddy: data.buddy || null,
        divemaster: data.divemaster || null,
        guide: data.guide || null,
        instructor: data.instructor || null,
        comments: data.comments || null,
        latitude: data.latitude,
        longitude: data.longitude,
        isFreshWater: data.is_fresh_water,
        isBoatDive: data.is_boat_dive,
        isDriftDive: data.is_drift_dive,
        isNightDive: data.is_night_dive,
        isTrainingDive: data.is_training_dive,
      });
      setDiveModalOpen(false);
      // Reload dives to get updated data
      if (state.selectedTripId) {
        await loadDivesForTrip(state.selectedTripId);
      }
    } catch (error) {
      logger.error('Failed to update dive:', error);
      alert('Failed to update dive: ' + error);
    }
  };

  const handleDeleteDive = async (diveId: number) => {
    try {
      await invoke('delete_dive', { id: diveId });
      setDiveModalOpen(false);
      // Clear selection and reload dives
      handleSelectDive(null);
      if (state.selectedTripId) {
        await loadDivesForTrip(state.selectedTripId);
      }
    } catch (error) {
      logger.error('Failed to delete dive:', error);
      alert('Failed to delete dive: ' + error);
    }
  };

  // Bulk edit mode handlers
  const handleEnterBulkEditMode = useCallback(() => {
    setBulkEditMode(true);
    setSelectedDiveIds(new Set());
  }, []);

  const handleExitBulkEditMode = useCallback(() => {
    setBulkEditMode(false);
    setSelectedDiveIds(new Set());
  }, []);

  const handleToggleDiveSelection = useCallback((diveId: number) => {
    setSelectedDiveIds(prev => {
      const next = new Set(prev);
      if (next.has(diveId)) {
        next.delete(diveId);
      } else {
        next.add(diveId);
      }
      return next;
    });
  }, []);

  const handleSelectAllDives = useCallback(() => {
    setSelectedDiveIds(new Set(tripDives.map(d => d.id)));
  }, [tripDives]);

  const handleBulkEditSubmit = async (diveIds: number[], data: BulkDiveFormData) => {
    try {
      await invoke('bulk_update_dives', {
        diveIds,
        location: data.location !== null ? (data.location || null) : undefined,
        ocean: data.ocean !== null ? (data.ocean || null) : undefined,
        buddy: data.buddy !== null ? (data.buddy || null) : undefined,
        divemaster: data.divemaster !== null ? (data.divemaster || null) : undefined,
        guide: data.guide !== null ? (data.guide || null) : undefined,
        instructor: data.instructor !== null ? (data.instructor || null) : undefined,
        isBoatDive: data.is_boat_dive,
        isNightDive: data.is_night_dive,
        isDriftDive: data.is_drift_dive,
        isFreshWater: data.is_fresh_water,
        isTrainingDive: data.is_training_dive,
      });
      
      setBulkEditModalOpen(false);
      handleExitBulkEditMode();
      
      // Reload dives to reflect changes
      if (state.selectedTripId) {
        await loadDivesForTrip(state.selectedTripId);
      }
    } catch (error) {
      logger.error('Failed to bulk update dives:', error);
      alert('Failed to bulk update dives: ' + error);
    }
  };

  return (
    <div className="app">
      <Header 
        onImportPhotos={handleImportPhotos} 
        onOpenStatistics={() => setStatisticsModalOpen(true)} 
        onOpenExport={() => setExportModalOpen(true)}
        onOpenSearch={() => setSearchModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenMap={() => setMapViewOpen(true)}
        onOpenDiveComputer={() => setDiveComputerModalOpen(true)}
        onOpenEquipment={() => setEquipmentModalOpen(true)}
      />
      {thumbnailProgress && (
        <div className="thumbnail-progress">
          Generating thumbnails: {thumbnailProgress.current} / {thumbnailProgress.total}
        </div>
      )}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Loading trips...</span>
        </div>
      )}
      <main className="app-main">
        <Sidebar
          trips={trips}
          dives={dives}
          selectedTripId={state.selectedTripId}
          selectedDiveId={state.selectedDiveId}
          onSelectTrip={handleSelectTrip}
          onSelectDive={handleSelectDive}
          onAddTrip={handleAddTrip}
          onEditTrip={handleEditTrip}
          onAddDive={handleAddDive}
          bulkEditMode={bulkEditMode}
          selectedDiveIds={selectedDiveIds}
          onToggleDiveSelection={handleToggleDiveSelection}
        />
        <ContentArea
          viewMode={state.viewMode}
          trip={selectedTrip}
          dive={selectedDive}
          dives={tripDives}
          photos={currentPhotos}
          selectedPhotoIds={selectedPhotoIds}
          onSelectDive={handleSelectDive}
          onSelectPhoto={handleSelectPhoto}
          onOpenPhoto={handleOpenPhoto}
          onEditDive={handleEditDive}
          onTagSpecies={handleTagSpecies}
          onTagGeneral={handleTagGeneral}
          onDeletePhotos={handleDeletePhotos}
          onClearSelection={handleClearSelection}
          onBatchOperations={() => setBatchModalOpen(true)}
          onPhotosUpdated={() => {
            // Reload photos to reflect species tag changes
            if (state.selectedDiveId) {
              loadPhotosForDive(state.selectedDiveId);
            } else if (state.selectedTripId) {
              loadPhotosForTrip(state.selectedTripId);
            }
          }}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onSelectTrip={handleSelectTrip}
          onClearSearch={() => {
            setSearchResults(null);
            setSearchQuery('');
            setState(prev => ({ ...prev, viewMode: 'trips' }));
          }}
          bulkEditMode={bulkEditMode}
          selectedDiveIds={selectedDiveIds}
          onEnterBulkEditMode={handleEnterBulkEditMode}
          onExitBulkEditMode={handleExitBulkEditMode}
          onToggleDiveSelection={handleToggleDiveSelection}
          onSelectAllDives={handleSelectAllDives}
          onOpenBulkEditModal={() => setBulkEditModalOpen(true)}
        />
        <RightPanel
          photo={selectedPhoto}
          dive={selectedDive}
          trip={selectedTrip}
          onPhotoUpdated={() => {
            // Reload photos to reflect rating changes
            if (state.selectedDiveId) {
              loadPhotosForDive(state.selectedDiveId);
            } else if (state.selectedTripId) {
              loadPhotosForTrip(state.selectedTripId);
            }
          }}
        />
      </main>
      <TripModal
        isOpen={tripModalOpen}
        trip={editingTrip}
        onClose={() => setTripModalOpen(false)}
        onSubmit={handleTripSubmit}
        onDelete={handleDeleteTrip}
      />
      <DiveModal
        isOpen={diveModalOpen}
        dive={editingDive}
        onClose={() => setDiveModalOpen(false)}
        onSubmit={handleDiveSubmit}
        onDelete={handleDeleteDive}
      />
      {addDiveTripId && (
        <AddDiveModal
          isOpen={addDiveModalOpen}
          tripId={addDiveTripId}
          onClose={() => {
            setAddDiveModalOpen(false);
            setAddDiveTripId(null);
          }}
          onSubmit={handleAddDiveSubmit}
        />
      )}
      {state.selectedTripId && (
        <PhotoImportModal
          isOpen={photoImportOpen}
          tripId={state.selectedTripId}
          dives={dives}
          photoPaths={photoImportPaths}
          onClose={() => setPhotoImportOpen(false)}
          onImportComplete={handlePhotoImportComplete}
        />
      )}
      {viewerPhoto && (
        <PhotoViewer
          photo={viewerPhoto}
          onClose={handleCloseViewer}
          onPrevious={handlePreviousPhoto}
          onNext={handleNextPhoto}
          hasPrevious={currentPhotos.findIndex(p => p.id === viewerPhotoId) > 0}
          hasNext={currentPhotos.findIndex(p => p.id === viewerPhotoId) < currentPhotos.length - 1}
        />
      )}
      <SpeciesTagModal
        isOpen={speciesModalOpen}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
        onClose={() => setSpeciesModalOpen(false)}
        onTagsAdded={() => {
          logger.debug('Tags added successfully');
        }}
      />
      <GeneralTagModal
        isOpen={generalTagModalOpen}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
        onClose={() => setGeneralTagModalOpen(false)}
        onTagsAdded={() => {
          logger.debug('General tags added successfully');
        }}
      />
      <StatisticsModal
        isOpen={statisticsModalOpen}
        onClose={() => setStatisticsModalOpen(false)}
      />
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        selectedTrip={selectedTrip}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
      />
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        currentTripId={state.selectedTripId ?? undefined}
        currentDiveId={state.selectedDiveId ?? undefined}
        onSearchResults={(results, query) => {
          setSearchResults(results);
          setSearchQuery(query);
          // Switch to search results view mode
          if (results) {
            setState(prev => ({
              ...prev,
              viewMode: 'search',
              selectedDiveId: null,
              selectedPhotoId: null,
            }));
          }
        }}
        onApplyFilter={async (filter) => {
          try {
            const filteredPhotos = await invoke<Photo[]>('filter_photos', { filter });
            setPhotos(filteredPhotos);
            // Stay in current view mode
          } catch (error) {
            logger.error('Failed to apply filter:', error);
          }
        }}
      />
      <BatchOperationsModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
        currentDiveId={state.selectedDiveId}
        dives={dives}
        onOperationComplete={handleBatchOperationComplete}
      />
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
      <MapView
        isOpen={mapViewOpen}
        onClose={() => setMapViewOpen(false)}
        onSelectDive={(tripId, diveId) => {
          handleSelectTrip(tripId);
          handleSelectDive(diveId);
        }}
      />
      <DiveComputerModal
        isOpen={diveComputerModalOpen}
        onClose={() => setDiveComputerModalOpen(false)}
        tripId={state.selectedTripId}
        onDivesImported={async (_importedDives) => {
          console.log('📥 App.tsx onDivesImported called with', _importedDives.length, 'dives');
          // Dives were already saved by the modal - just reload
          if (state.selectedTripId) {
            await loadDivesForTrip(state.selectedTripId);
          }
        }}
        onTripsChanged={async () => {
          console.log('🔄 App.tsx onTripsChanged called - reloading trips');
          // A new trip was created during import - refresh the trips list
          await loadTrips();
          console.log('✅ App.tsx trips reloaded');
        }}
      />
      <EquipmentModal
        isOpen={equipmentModalOpen}
        onClose={() => setEquipmentModalOpen(false)}
      />
      <BulkEditDiveModal
        isOpen={bulkEditModalOpen}
        selectedDiveIds={Array.from(selectedDiveIds)}
        onClose={() => setBulkEditModalOpen(false)}
        onSubmit={handleBulkEditSubmit}
      />
    </div>
  );
}

export default App;
