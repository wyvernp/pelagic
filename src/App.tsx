import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { confirmDialog } from './utils/dialogs';
import { logger } from './utils/logger';
import {
  useNavigationStore,
  useDataStore,
  useSelectionStore,
  useSearchStore,
  useUIStore,
} from './stores';
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
import { SearchBar } from './components/SearchBar';
import { BatchOperationsModal } from './components/BatchOperationsModal';
import { SettingsModal, type AppSettings } from './components/SettingsModal';
import { WelcomeModal } from './components/WelcomeModal';
import { WalkthroughTour } from './components/WalkthroughTour';
import { MapView } from './components/MapView';
import { DiveComputerModal } from './components/DiveComputerModal';
import { EquipmentModal } from './components/EquipmentModal';
import { BulkEditDiveModal, type BulkDiveFormData } from './components/BulkEditDiveModal';
import type { Photo } from './types';

// Check if we're in dev mode
const isDev = import.meta.env.DEV;

function App() {
  // Navigation store
  const {
    viewMode,
    selectedTripId,
    selectedDiveId,
    selectedPhotoId,
    selectTrip,
    selectDive,
    selectPhoto,
    setViewMode,
  } = useNavigationStore();

  // Data store
  const {
    trips,
    dives,
    photos,
    isLoading,
    thumbnailProgress,
    loadTrips,
    loadDivesForTrip,
    loadPhotosForDive,
    loadPhotosForTrip,
    clearDives,
    setPhotos,
    setThumbnailProgress,
    invalidateTripCache,
    invalidateDiveCache,
  } = useDataStore();

  // Selection store
  const {
    selectedPhotoIds,
    selectedDiveIds,
    bulkEditMode,
    togglePhotoSelection,
    setPhotoSelection,
    clearPhotoSelection,
    toggleDiveSelection,
    selectAllDives,
    enterBulkEditMode,
    exitBulkEditMode,
  } = useSelectionStore();

  // Search store
  const {
    searchResults,
    searchQuery,
    clearSearch,
  } = useSearchStore();

  // UI store
  const {
    activeModal,
    modalContext,
    sidebarWidth,
    isResizing,
    isTourRunning,
    hasCompletedTour,
    openModal,
    closeModal,
    updateModalContext,
    setSidebarWidth,
    setIsResizing,
    saveSidebarWidth,
    startTour,
    endTour,
  } = useUIStore();

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, [setIsResizing]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(200, e.clientX), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      saveSidebarWidth();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, setSidebarWidth, setIsResizing, saveSidebarWidth]);

  // Computed values
  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) ?? null,
    [trips, selectedTripId]
  );

  const selectedDive = useMemo(
    () => dives.find((d) => d.id === selectedDiveId) ?? null,
    [dives, selectedDiveId]
  );

  // Track all photos loaded from the trip's "All Photos" section
  const [allTripPhotos, setAllTripPhotos] = useState<Photo[]>([]);

  // Clear allTripPhotos when trip changes
  useEffect(() => {
    setAllTripPhotos([]);
  }, [selectedTripId]);

  const currentPhotos = useMemo(() => {
    if (viewMode === 'search' && searchResults) {
      return searchResults.photos;
    }
    if (selectedDiveId) {
      return photos.filter((p) => p.dive_id === selectedDiveId);
    }
    // In trip view, merge photos with allTripPhotos (deduped)
    const tripPhotos = photos.filter((p) => p.trip_id === selectedTripId);
    if (allTripPhotos.length > 0) {
      const existingIds = new Set(tripPhotos.map((p) => p.id));
      const additionalPhotos = allTripPhotos.filter((p) => !existingIds.has(p.id));
      return [...tripPhotos, ...additionalPhotos];
    }
    return tripPhotos;
  }, [photos, selectedDiveId, selectedTripId, viewMode, searchResults, allTripPhotos]);

  const selectedPhoto = useMemo(
    () => currentPhotos.find((p) => p.id === selectedPhotoId) ?? null,
    [currentPhotos, selectedPhotoId]
  );

  const tripDives = useMemo(
    () => dives.filter((d) => d.trip_id === selectedTripId),
    [dives, selectedTripId]
  );

  const viewerPhotoId = modalContext.viewerPhotoId ?? null;
  const viewerPhoto = useMemo(
    () => (viewerPhotoId ? currentPhotos.find(p => p.id === viewerPhotoId) ?? null : null),
    [viewerPhotoId, currentPhotos]
  );

  // Load trips on mount
  useEffect(() => {
    loadTrips();
    // Note: Orphan photo linking now runs after photo imports instead of on every startup
  }, [loadTrips]);

  // Check if we need to show welcome modal on first boot
  // In dev mode, always show the tour (but not the welcome modal if already completed)
  useEffect(() => {
    const savedSettings = localStorage.getItem('pelagic-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings) as AppSettings;
      if (!settings.hasCompletedWelcome) {
        openModal('welcome');
      } else if (isDev) {
        // In dev mode, auto-start tour even if welcome is completed
        setTimeout(() => {
          startTour();
        }, 500);
      }
    } else {
      // No settings at all, definitely first boot
      openModal('welcome');
    }
  }, [openModal, startTour]);

  // Regenerate thumbnails in background ONE AT A TIME (non-blocking)
  useEffect(() => {
    let cancelled = false;

    const processThumbsInBackground = async () => {
      try {
        // Defer thumbnail processing to reduce startup load
        await new Promise(resolve => setTimeout(resolve, 5000));
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
              const currentState = useNavigationStore.getState();
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
        const finalState = useNavigationStore.getState();
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
  }, [setThumbnailProgress, setPhotos]);

  // Load dives when trip changes
  useEffect(() => {
    if (selectedTripId) {
      loadDivesForTrip(selectedTripId);
    } else {
      clearDives();
    }
  }, [selectedTripId, loadDivesForTrip, clearDives]);

  // Load photos when dive changes
  // Note: Trip-level photos are loaded by ContentGrid's "All Photos" section
  // We only need to load dive-specific photos here
  useEffect(() => {
    if (selectedDiveId) {
      loadPhotosForDive(selectedDiveId);
    }
    // Don't load trip photos here - ContentGrid handles it via get_all_photos_for_trip
  }, [selectedDiveId, loadPhotosForDive]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openModal('search');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openModal]);

  // Handler functions
  const handleImportPhotos = useCallback(async () => {
    if (!selectedTripId) {
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
        const paths = Array.isArray(selected) ? selected : [selected];
        updateModalContext({ photoImportPaths: paths });
        openModal('photoImport');
      }
    } catch (error) {
      logger.error('Failed to select photos:', error);
      alert('Failed to select photos: ' + error);
    }
  }, [selectedTripId, openModal, updateModalContext]);

  const handlePhotoImportComplete = useCallback(async () => {
    // Invalidate caches since new photos were added
    if (selectedTripId) {
      invalidateTripCache(selectedTripId);
    }
    if (selectedDiveId) {
      invalidateDiveCache(selectedDiveId);
      await loadPhotosForDive(selectedDiveId);
    } else if (selectedTripId) {
      await loadPhotosForTrip(selectedTripId);
    }
  }, [selectedDiveId, selectedTripId, loadPhotosForDive, loadPhotosForTrip, invalidateTripCache, invalidateDiveCache]);

  const handleSelectTrip = useCallback((tripId: number | null) => {
    selectTrip(tripId);
    clearSearch();
  }, [selectTrip, clearSearch]);

  const handleBatchOperationComplete = useCallback(async () => {
    // Invalidate caches since photos may have been moved/deleted
    if (selectedTripId) {
      invalidateTripCache(selectedTripId);
    }
    if (selectedDiveId) {
      invalidateDiveCache(selectedDiveId);
      await loadPhotosForDive(selectedDiveId);
    } else if (selectedTripId) {
      await loadPhotosForTrip(selectedTripId);
    }
    clearPhotoSelection();
  }, [selectedDiveId, selectedTripId, loadPhotosForDive, loadPhotosForTrip, clearPhotoSelection, invalidateTripCache, invalidateDiveCache]);

  const handleSelectDive = useCallback((diveId: number | null) => {
    selectDive(diveId);
    clearPhotoSelection();
    clearSearch();
  }, [selectDive, clearPhotoSelection, clearSearch]);

  const handleSelectPhoto = useCallback((photoId: number, multiSelect: boolean) => {
    if (multiSelect) {
      togglePhotoSelection(photoId);
    } else {
      setPhotoSelection(new Set([photoId]));
    }
    selectPhoto(photoId);
  }, [togglePhotoSelection, setPhotoSelection, selectPhoto]);

  const handleClearSelection = useCallback(() => {
    clearPhotoSelection();
    selectPhoto(null);
  }, [clearPhotoSelection, selectPhoto]);

  // Handle when ContentGrid loads all trip photos (for selection/viewer support)
  const handleAllTripPhotosLoaded = useCallback((loadedPhotos: Photo[]) => {
    setAllTripPhotos(loadedPhotos);
  }, []);

  const handleTagSpecies = useCallback(() => {
    if (selectedPhotoIds.size > 0) {
      openModal('species');
    }
  }, [selectedPhotoIds.size, openModal]);

  const handleTagGeneral = useCallback(() => {
    if (selectedPhotoIds.size > 0) {
      openModal('generalTag');
    }
  }, [selectedPhotoIds.size, openModal]);

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
        clearPhotoSelection();
        selectPhoto(null);
        // Invalidate caches since photos were deleted
        if (selectedTripId) {
          invalidateTripCache(selectedTripId);
        }
        if (selectedDiveId) {
          invalidateDiveCache(selectedDiveId);
          await loadPhotosForDive(selectedDiveId);
        } else if (selectedTripId) {
          await loadPhotosForTrip(selectedTripId);
        }
      } catch (error) {
        logger.error('Failed to delete photos:', error);
        alert('Failed to delete photos: ' + error);
      }
    }
  }, [selectedPhotoIds, clearPhotoSelection, selectPhoto, selectedDiveId, selectedTripId, loadPhotosForDive, loadPhotosForTrip, invalidateTripCache, invalidateDiveCache]);

  const handleOpenPhoto = useCallback((photoId: number) => {
    updateModalContext({ viewerPhotoId: photoId });
    openModal('photoViewer');
  }, [updateModalContext, openModal]);

  const handleCloseViewer = useCallback(() => {
    updateModalContext({ viewerPhotoId: null });
    closeModal();
  }, [updateModalContext, closeModal]);

  const handlePreviousPhoto = useCallback(() => {
    if (viewerPhotoId === null) return;
    const currentIndex = currentPhotos.findIndex(p => p.id === viewerPhotoId);
    if (currentIndex > 0) {
      updateModalContext({ viewerPhotoId: currentPhotos[currentIndex - 1].id });
    }
  }, [viewerPhotoId, currentPhotos, updateModalContext]);

  const handleNextPhoto = useCallback(() => {
    if (viewerPhotoId === null) return;
    const currentIndex = currentPhotos.findIndex(p => p.id === viewerPhotoId);
    if (currentIndex < currentPhotos.length - 1) {
      updateModalContext({ viewerPhotoId: currentPhotos[currentIndex + 1].id });
    }
  }, [viewerPhotoId, currentPhotos, updateModalContext]);

  const handleAddTrip = useCallback(() => {
    updateModalContext({ editingTrip: null });
    openModal('trip');
  }, [updateModalContext, openModal]);

  const handleEditTrip = useCallback((trip: typeof selectedTrip) => {
    updateModalContext({ editingTrip: trip });
    openModal('trip');
  }, [updateModalContext, openModal]);

  const handleTripSubmit = useCallback(async (data: TripFormData) => {
    try {
      const editingTrip = modalContext.editingTrip;
      if (editingTrip) {
        await invoke('update_trip', {
          id: editingTrip.id,
          name: data.name,
          location: data.location,
          resort: data.resort || null,
          dateStart: data.dateStart,
          dateEnd: data.dateEnd,
          notes: data.notes || null,
        });
        closeModal();
        await loadTrips();
      } else {
        const tripId = await invoke<number>('create_trip', {
          name: data.name,
          location: data.location,
          dateStart: data.dateStart,
          dateEnd: data.dateEnd,
        });
        closeModal();
        await loadTrips();
        handleSelectTrip(tripId);
      }
    } catch (error) {
      logger.error('Failed to save trip:', error);
      alert('Failed to save trip: ' + error);
    }
  }, [modalContext.editingTrip, closeModal, loadTrips, handleSelectTrip]);

  const handleDeleteTrip = useCallback(async (tripId: number) => {
    try {
      await invoke('delete_trip', { id: tripId });
      closeModal();
      await loadTrips();
      if (selectedTripId === tripId) {
        handleSelectTrip(null);
      }
    } catch (error) {
      logger.error('Failed to delete trip:', error);
      alert('Failed to delete trip: ' + error);
    }
  }, [closeModal, loadTrips, selectedTripId, handleSelectTrip]);

  const handleEditDive = useCallback((dive: typeof selectedDive) => {
    updateModalContext({ editingDive: dive });
    openModal('dive');
  }, [updateModalContext, openModal]);

  const handleAddDive = useCallback((tripId: number) => {
    updateModalContext({ addDiveTripId: tripId });
    openModal('addDive');
  }, [updateModalContext, openModal]);

  const handleAddDiveSubmit = useCallback(async (data: NewDiveFormData) => {
    const addDiveTripId = modalContext.addDiveTripId;
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

      closeModal();
      updateModalContext({ addDiveTripId: null });

      // Invalidate trip cache since a dive was added
      invalidateTripCache(addDiveTripId);
      await loadDivesForTrip(addDiveTripId);
      handleSelectDive(diveId);
    } catch (error) {
      logger.error('Failed to create dive:', error);
      alert('Failed to create dive: ' + error);
    }
  }, [modalContext.addDiveTripId, closeModal, updateModalContext, loadDivesForTrip, handleSelectDive, invalidateTripCache]);

  const handleDiveSubmit = useCallback(async (diveId: number, data: DiveFormData) => {
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
        diveSiteId: data.dive_site_id,
        isFreshWater: data.is_fresh_water,
        isBoatDive: data.is_boat_dive,
        isDriftDive: data.is_drift_dive,
        isNightDive: data.is_night_dive,
        isTrainingDive: data.is_training_dive,
      });
      closeModal();
      if (selectedTripId) {
        // Invalidate cache since dive was updated
        invalidateTripCache(selectedTripId);
        await loadDivesForTrip(selectedTripId);
      }
    } catch (error) {
      logger.error('Failed to update dive:', error);
      alert('Failed to update dive: ' + error);
    }
  }, [closeModal, selectedTripId, loadDivesForTrip, invalidateTripCache]);

  const handleDeleteDive = useCallback(async (diveId: number) => {
    try {
      await invoke('delete_dive', { id: diveId });
      closeModal();
      handleSelectDive(null);
      if (selectedTripId) {
        // Invalidate cache since dive was deleted
        invalidateTripCache(selectedTripId);
        invalidateDiveCache(diveId);
        await loadDivesForTrip(selectedTripId);
      }
    } catch (error) {
      logger.error('Failed to delete dive:', error);
      alert('Failed to delete dive: ' + error);
    }
  }, [closeModal, handleSelectDive, selectedTripId, loadDivesForTrip, invalidateTripCache, invalidateDiveCache]);

  const handleEnterBulkEditMode = useCallback(() => {
    enterBulkEditMode();
  }, [enterBulkEditMode]);

  const handleExitBulkEditMode = useCallback(() => {
    exitBulkEditMode();
  }, [exitBulkEditMode]);

  const handleToggleDiveSelection = useCallback((diveId: number) => {
    toggleDiveSelection(diveId);
  }, [toggleDiveSelection]);

  const handleSelectAllDives = useCallback(() => {
    selectAllDives(tripDives.map(d => d.id));
  }, [selectAllDives, tripDives]);

  const handleBulkEditSubmit = useCallback(async (diveIds: number[], data: BulkDiveFormData) => {
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

      closeModal();
      handleExitBulkEditMode();

      if (selectedTripId) {
        // Invalidate cache since dives were updated
        invalidateTripCache(selectedTripId);
        await loadDivesForTrip(selectedTripId);
      }
    } catch (error) {
      logger.error('Failed to bulk update dives:', error);
      alert('Failed to bulk update dives: ' + error);
    }
  }, [closeModal, handleExitBulkEditMode, selectedTripId, loadDivesForTrip, invalidateTripCache]);

  const handlePhotosUpdated = useCallback(async () => {
    // Invalidate caches since photos were modified
    if (selectedTripId) {
      invalidateTripCache(selectedTripId);
    }
    if (selectedDiveId) {
      invalidateDiveCache(selectedDiveId);
      await loadPhotosForDive(selectedDiveId);
    } else if (selectedTripId) {
      await loadPhotosForTrip(selectedTripId);
    }
  }, [selectedDiveId, selectedTripId, loadPhotosForDive, loadPhotosForTrip, invalidateTripCache, invalidateDiveCache]);

  const handleClearSearch = useCallback(() => {
    clearSearch();
    setViewMode('trips');
  }, [clearSearch, setViewMode]);

  // Search bar handlers
  const handleSearchSelectTrip = useCallback((tripId: number) => {
    handleSelectTrip(tripId);
    closeModal();
  }, [handleSelectTrip, closeModal]);

  const handleSearchSelectDive = useCallback((tripId: number, diveId: number) => {
    handleSelectTrip(tripId);
    setTimeout(() => handleSelectDive(diveId), 100);
    closeModal();
  }, [handleSelectTrip, handleSelectDive, closeModal]);

  const handleWelcomeComplete = useCallback((prefix: string) => {
    const savedSettings = localStorage.getItem('pelagic-settings');
    const settings = savedSettings
      ? JSON.parse(savedSettings) as AppSettings
      : { diveNamePrefix: 'Dive', hasCompletedWelcome: false };
    settings.diveNamePrefix = prefix;
    settings.hasCompletedWelcome = true;
    localStorage.setItem('pelagic-settings', JSON.stringify(settings));
    window.dispatchEvent(new Event('pelagic-settings-changed'));
    closeModal();
    
    // Start the walkthrough tour after welcome modal
    // In dev mode: always show tour
    // In production: only show if not completed before
    if (isDev || !hasCompletedTour) {
      // Small delay to let the modal close animation complete
      setTimeout(() => {
        startTour();
      }, 300);
    }
  }, [closeModal, hasCompletedTour, startTour]);

  const handleTourComplete = useCallback(() => {
    // In dev mode, don't persist completion so it shows every time
    endTour(!isDev);
  }, [endTour]);

  const handleTourSkip = useCallback(() => {
    // Even when skipped, mark as completed (except in dev mode)
    endTour(!isDev);
  }, [endTour]);

  const handleMapSelectDive = useCallback((tripId: number, diveId: number) => {
    handleSelectTrip(tripId);
    handleSelectDive(diveId);
  }, [handleSelectTrip, handleSelectDive]);

  const handleDivesImported = useCallback(async () => {
    console.log('📥 App.tsx onDivesImported called');
    if (selectedTripId) {
      // Invalidate cache since dives were imported
      invalidateTripCache(selectedTripId);
      await loadDivesForTrip(selectedTripId);
    }
  }, [selectedTripId, loadDivesForTrip, invalidateTripCache]);

  const handleTripsChanged = useCallback(async () => {
    console.log('🔄 App.tsx onTripsChanged called - reloading trips');
    await loadTrips();
    console.log('✅ App.tsx trips reloaded');
  }, [loadTrips]);

  return (
    <div className="app">
      <Header
        onImportPhotos={handleImportPhotos}
        onOpenStatistics={() => openModal('statistics')}
        onOpenExport={() => openModal('export')}
        onOpenSearch={() => openModal('search')}
        onOpenSettings={() => openModal('settings')}
        onOpenMap={() => openModal('map')}
        onOpenDiveComputer={() => openModal('diveComputer')}
        onOpenEquipment={() => openModal('equipment')}
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
          selectedTripId={selectedTripId}
          selectedDiveId={selectedDiveId}
          onSelectTrip={handleSelectTrip}
          onSelectDive={handleSelectDive}
          onAddTrip={handleAddTrip}
          onEditTrip={handleEditTrip}
          onAddDive={handleAddDive}
          bulkEditMode={bulkEditMode}
          selectedDiveIds={selectedDiveIds}
          onToggleDiveSelection={handleToggleDiveSelection}
          style={{ width: sidebarWidth }}
        />
        <div
          className={`sidebar-resizer ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleResizeStart}
        />
        <ContentArea
          viewMode={viewMode}
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
          onBatchOperations={() => openModal('batch')}
          onPhotosUpdated={handlePhotosUpdated}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onSelectTrip={handleSelectTrip}
          onClearSearch={handleClearSearch}
          bulkEditMode={bulkEditMode}
          selectedDiveIds={selectedDiveIds}
          onEnterBulkEditMode={handleEnterBulkEditMode}
          onExitBulkEditMode={handleExitBulkEditMode}
          onToggleDiveSelection={handleToggleDiveSelection}
          onSelectAllDives={handleSelectAllDives}
          onOpenBulkEditModal={() => openModal('bulkEditDive')}
          onAllTripPhotosLoaded={handleAllTripPhotosLoaded}
        />
        <RightPanel
          photo={selectedPhoto}
          dive={selectedDive}
          trip={selectedTrip}
          onPhotoUpdated={handlePhotosUpdated}
        />
      </main>
      <TripModal
        isOpen={activeModal === 'trip'}
        trip={modalContext.editingTrip}
        onClose={closeModal}
        onSubmit={handleTripSubmit}
        onDelete={handleDeleteTrip}
      />
      <DiveModal
        isOpen={activeModal === 'dive'}
        dive={modalContext.editingDive ?? null}
        onClose={closeModal}
        onSubmit={handleDiveSubmit}
        onDelete={handleDeleteDive}
      />
      {modalContext.addDiveTripId && (
        <AddDiveModal
          isOpen={activeModal === 'addDive'}
          tripId={modalContext.addDiveTripId}
          onClose={() => {
            closeModal();
            updateModalContext({ addDiveTripId: null });
          }}
          onSubmit={handleAddDiveSubmit}
        />
      )}
      {selectedTripId && (
        <PhotoImportModal
          isOpen={activeModal === 'photoImport'}
          tripId={selectedTripId}
          dives={dives}
          photoPaths={modalContext.photoImportPaths ?? []}
          onClose={closeModal}
          onImportComplete={handlePhotoImportComplete}
        />
      )}
      {viewerPhoto && activeModal === 'photoViewer' && (
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
        isOpen={activeModal === 'species'}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
        onClose={closeModal}
        onTagsAdded={() => {
          logger.debug('Tags added successfully');
        }}
      />
      <GeneralTagModal
        isOpen={activeModal === 'generalTag'}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
        onClose={closeModal}
        onTagsAdded={() => {
          logger.debug('General tags added successfully');
        }}
      />
      <StatisticsModal
        isOpen={activeModal === 'statistics'}
        onClose={closeModal}
      />
      <ExportModal
        isOpen={activeModal === 'export'}
        onClose={closeModal}
        selectedTrip={selectedTrip}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
      />
      <SearchBar
        isOpen={activeModal === 'search'}
        onClose={closeModal}
        onSelectTrip={handleSearchSelectTrip}
        onSelectDive={handleSearchSelectDive}
      />
      <BatchOperationsModal
        isOpen={activeModal === 'batch'}
        onClose={closeModal}
        selectedPhotoIds={Array.from(selectedPhotoIds)}
        currentDiveId={selectedDiveId}
        dives={dives}
        onOperationComplete={handleBatchOperationComplete}
      />
      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={closeModal}
      />
      <WelcomeModal
        isOpen={activeModal === 'welcome'}
        onComplete={handleWelcomeComplete}
      />
      <MapView
        isOpen={activeModal === 'map'}
        onClose={closeModal}
        onSelectDive={handleMapSelectDive}
      />
      <DiveComputerModal
        isOpen={activeModal === 'diveComputer'}
        onClose={closeModal}
        tripId={selectedTripId}
        onDivesImported={handleDivesImported}
        onTripsChanged={handleTripsChanged}
      />
      <EquipmentModal
        isOpen={activeModal === 'equipment'}
        onClose={closeModal}
      />
      <BulkEditDiveModal
        isOpen={activeModal === 'bulkEditDive'}
        selectedDiveIds={Array.from(selectedDiveIds)}
        onClose={closeModal}
        onSubmit={handleBulkEditSubmit}
      />
      <WalkthroughTour
        run={isTourRunning}
        onComplete={handleTourComplete}
        onSkip={handleTourSkip}
      />
    </div>
  );
}

export default App;
