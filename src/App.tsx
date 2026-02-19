import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { confirmDialog } from './utils/dialogs';
import { logger } from './utils/logger';
import { formatDiveName } from './utils/diveNames';
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
import { SettingsModal, useSettings, useGeminiApiKey, type AppSettings } from './components/SettingsModal';
import { WelcomeModal } from './components/WelcomeModal';
import { WalkthroughTour } from './components/WalkthroughTour';
import { MapView } from './components/MapView';
import { DiveComputerModal } from './components/DiveComputerModal';
import { EquipmentModal } from './components/EquipmentModal';
import { BulkEditDiveModal, type BulkDiveFormData } from './components/BulkEditDiveModal';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { MigrationScreen, type MigrationProgress } from './components/MigrationScreen';
import { SetupWizardModal } from './components/SetupWizardModal';
import { ShareCardModal } from './components/ShareCardModal';
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
    contextMenu,
    openModal,
    closeModal,
    updateModalContext,
    setSidebarWidth,
    setIsResizing,
    saveSidebarWidth,
    startTour,
    endTour,
    showContextMenu,
    hideContextMenu,
  } = useUIStore();

  // Migration state - tracks if database migration is in progress
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  // Listen for migration events from the backend
  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined;
    let unlistenComplete: UnlistenFn | undefined;

    const setupListeners = async () => {
      unlistenProgress = await listen<MigrationProgress>('migration-progress', (event) => {
        setMigrationProgress(event.payload);
      });

      unlistenComplete = await listen('migration-complete', () => {
        setMigrationProgress(null);
      });
    };

    setupListeners();

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, []);

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
      } else if (!settings.hasCompletedSetup) {
        // Welcome done but setup wizard not completed — show it directly
        openModal('setupWizard');
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
    // After tour, show setup wizard if not completed
    const savedSettings = localStorage.getItem('pelagic-settings');
    const settings = savedSettings ? JSON.parse(savedSettings) as AppSettings : null;
    if (!settings?.hasCompletedSetup) {
      setTimeout(() => {
        openModal('setupWizard');
      }, 300);
    }
  }, [endTour, openModal]);

  const handleTourSkip = useCallback(() => {
    // Even when skipped, mark as completed (except in dev mode)
    endTour(!isDev);
    // After tour skip, also show setup wizard if not completed
    const savedSettings = localStorage.getItem('pelagic-settings');
    const settings = savedSettings ? JSON.parse(savedSettings) as AppSettings : null;
    if (!settings?.hasCompletedSetup) {
      setTimeout(() => {
        openModal('setupWizard');
      }, 300);
    }
  }, [endTour, openModal]);

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

  // Context menu handlers
  const handleDiveContextMenu = useCallback((diveId: number, tripId: number, x: number, y: number) => {
    showContextMenu('dive', diveId, x, y, tripId);
  }, [showContextMenu]);

  const handleTripContextMenu = useCallback((tripId: number, x: number, y: number) => {
    showContextMenu('trip', tripId, x, y);
  }, [showContextMenu]);

  const handleMoveDiveToTrip = useCallback(async (diveId: number, newTripId: number, oldTripId: number) => {
    try {
      await invoke('move_dive_to_trip', { diveId, newTripId });
      hideContextMenu();
      // Invalidate both old and new trip caches
      invalidateTripCache(oldTripId);
      invalidateTripCache(newTripId);
      // Reload dives if we're viewing one of the affected trips
      if (selectedTripId === oldTripId || selectedTripId === newTripId) {
        await loadDivesForTrip(selectedTripId);
      }
      // If we moved the currently selected dive, deselect it
      if (selectedDiveId === diveId && selectedTripId === oldTripId) {
        handleSelectDive(null);
      }
    } catch (error) {
      logger.error('Failed to move dive:', error);
      alert('Failed to move dive: ' + error);
    }
  }, [hideContextMenu, invalidateTripCache, selectedTripId, selectedDiveId, loadDivesForTrip, handleSelectDive]);

  const handleContextMenuDeleteDive = useCallback(async (diveId: number) => {
    const confirmed = await confirmDialog(
      'Delete Dive',
      'Are you sure you want to delete this dive?\n\nThis will also delete all photos and dive samples associated with it.',
      { okLabel: 'Delete', kind: 'warning' }
    );
    if (confirmed) {
      hideContextMenu();
      await handleDeleteDive(diveId);
    }
  }, [hideContextMenu, handleDeleteDive]);

  const handleContextMenuEditDive = useCallback((diveId: number) => {
    hideContextMenu();
    const dive = dives.find(d => d.id === diveId);
    if (dive) {
      handleEditDive(dive);
    }
  }, [hideContextMenu, dives, handleEditDive]);

  const handleContextMenuDeleteTrip = useCallback(async (tripId: number) => {
    const confirmed = await confirmDialog(
      'Delete Trip',
      'Are you sure you want to delete this trip?\n\nThis will also delete all dives and photos associated with it.',
      { okLabel: 'Delete', kind: 'warning' }
    );
    if (confirmed) {
      hideContextMenu();
      await handleDeleteTrip(tripId);
    }
  }, [hideContextMenu, handleDeleteTrip]);

  const handleContextMenuEditTrip = useCallback((tripId: number) => {
    hideContextMenu();
    const trip = trips.find(t => t.id === tripId);
    if (trip) {
      handleEditTrip(trip);
    }
  }, [hideContextMenu, trips, handleEditTrip]);

  // Photo context menu handler
  const handlePhotoContextMenu = useCallback((photo: Photo, x: number, y: number) => {
    showContextMenu('photo', photo.id, x, y, photo.trip_id ?? undefined, photo);
  }, [showContextMenu]);

  // Settings hook - declared early as needed by context menu handlers
  const settings = useSettings();
  const { apiKey: geminiApiKey } = useGeminiApiKey();

  // Photo context menu action handlers
  const handleContextMenuAIIdentify = useCallback(async (photo: Photo) => {
    hideContextMenu();
    // Set this photo as selected and open species tag modal
    setPhotoSelection(new Set([photo.id]));
    openModal('species');
  }, [hideContextMenu, setPhotoSelection, openModal]);

  const handleContextMenuEditPhoto = useCallback(async (photo: Photo) => {
    hideContextMenu();
    try {
      const editorPath = settings.defaultImageEditor || undefined;
      await invoke('open_in_editor', { filePath: photo.file_path, editorPath });
    } catch (error) {
      logger.error('Failed to open in editor:', error);
      alert('Failed to open photo in editor: ' + error);
    }
  }, [hideContextMenu, settings.defaultImageEditor]);

  const handleContextMenuDeletePhoto = useCallback(async (photo: Photo) => {
    // Check for RAW/processed pair
    let photoIdsToDelete = [photo.id];
    let confirmMessage = `Are you sure you want to delete this photo?\n\nThis will remove the photo from the database but will NOT delete the original file from disk.`;
    
    // If this is a processed photo, check for RAW version
    if (photo.raw_photo_id) {
      const rawPhoto: Photo | null = await invoke('get_raw_version', { photoId: photo.id });
      if (rawPhoto) {
        confirmMessage = `This photo has a linked RAW version.\n\nDelete both the processed and RAW versions?\n\nThis will remove both photos from the database but will NOT delete the original files from disk.`;
        photoIdsToDelete = [photo.id, rawPhoto.id];
      }
    }
    
    // If this is a RAW photo, check for processed version
    if (!photo.is_processed && photo.raw_photo_id === null) {
      const processedPhoto: Photo | null = await invoke('get_processed_version', { photoId: photo.id });
      if (processedPhoto) {
        confirmMessage = `This RAW photo has a linked processed version.\n\nDelete both the RAW and processed versions?\n\nThis will remove both photos from the database but will NOT delete the original files from disk.`;
        photoIdsToDelete = [photo.id, processedPhoto.id];
      }
    }

    const confirmed = await confirmDialog(
      'Delete Photo',
      confirmMessage,
      { okLabel: 'Delete', kind: 'warning' }
    );

    if (confirmed) {
      hideContextMenu();
      try {
        await invoke('delete_photos', { photoIds: photoIdsToDelete });
        clearPhotoSelection();
        selectPhoto(null);
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
        logger.error('Failed to delete photo:', error);
        alert('Failed to delete photo: ' + error);
      }
    }
  }, [hideContextMenu, clearPhotoSelection, selectPhoto, selectedDiveId, selectedTripId, loadPhotosForDive, loadPhotosForTrip, invalidateTripCache, invalidateDiveCache]);

  const handleContextMenuMovePhoto = useCallback(async (photo: Photo, targetDiveId: number | null) => {
    // Check for RAW/processed pair
    let photoIdsToMove = [photo.id];
    let confirmMessage = '';
    
    // If this is a processed photo, check for RAW version
    if (photo.raw_photo_id) {
      const rawPhoto: Photo | null = await invoke('get_raw_version', { photoId: photo.id });
      if (rawPhoto) {
        confirmMessage = `This photo has a linked RAW version. Move both photos?`;
        photoIdsToMove = [photo.id, rawPhoto.id];
      }
    }
    
    // If this is a RAW photo, check for processed version
    if (!photo.is_processed && photo.raw_photo_id === null) {
      const processedPhoto: Photo | null = await invoke('get_processed_version', { photoId: photo.id });
      if (processedPhoto) {
        confirmMessage = `This RAW photo has a linked processed version. Move both photos?`;
        photoIdsToMove = [photo.id, processedPhoto.id];
      }
    }

    // If there's a pair, confirm before moving
    if (confirmMessage) {
      const confirmed = await confirmDialog('Move Photos', confirmMessage, { okLabel: 'Move Both' });
      if (!confirmed) return;
    }

    hideContextMenu();
    try {
      await invoke('move_photos_to_dive', { photoIds: photoIdsToMove, diveId: targetDiveId });
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
      logger.error('Failed to move photo:', error);
      alert('Failed to move photo: ' + error);
    }
  }, [hideContextMenu, selectedDiveId, selectedTripId, loadPhotosForDive, loadPhotosForTrip, invalidateTripCache, invalidateDiveCache]);

  const handleContextMenuTagSpecies = useCallback((photo: Photo) => {
    hideContextMenu();
    setPhotoSelection(new Set([photo.id]));
    openModal('species');
  }, [hideContextMenu, setPhotoSelection, openModal]);

  const handleContextMenuTagGeneral = useCallback((photo: Photo) => {
    hideContextMenu();
    setPhotoSelection(new Set([photo.id]));
    openModal('generalTag');
  }, [hideContextMenu, setPhotoSelection, openModal]);

  // Build context menu items based on current context menu state
  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu.isOpen || !contextMenu.targetId) return [];

    if (contextMenu.type === 'dive') {
      const currentTripId = contextMenu.targetTripId;
      const otherTrips = trips.filter(t => t.id !== currentTripId);
      
      const items: ContextMenuItem[] = [
        {
          label: 'Edit Dive',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          ),
          onClick: () => handleContextMenuEditDive(contextMenu.targetId!),
        },
        {
          label: 'Share to Social',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
          ),
          onClick: () => {
            hideContextMenu();
            updateModalContext({ shareType: 'dive' });
            openModal('shareCard');
          },
        },
        {
          label: 'Delete Dive',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          ),
          onClick: () => handleContextMenuDeleteDive(contextMenu.targetId!),
          danger: true,
        },
      ];

      // Add "Move to Trip" submenu if there are other trips
      if (otherTrips.length > 0) {
        items.splice(1, 0, {
          label: 'Move to Trip',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z"/>
            </svg>
          ),
          onClick: () => {},
          submenu: otherTrips.map(trip => ({
            label: trip.name,
            onClick: () => handleMoveDiveToTrip(contextMenu.targetId!, trip.id, currentTripId!),
          })),
        });
      }

      return items;
    }

    if (contextMenu.type === 'trip') {
      return [
        {
          label: 'Edit Trip',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          ),
          onClick: () => handleContextMenuEditTrip(contextMenu.targetId!),
        },
        {
          label: 'Share to Social',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
          ),
          onClick: () => {
            hideContextMenu();
            updateModalContext({ shareType: 'trip' });
            openModal('shareCard');
          },
        },
        {
          label: 'Delete Trip',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          ),
          onClick: () => handleContextMenuDeleteTrip(contextMenu.targetId!),
          danger: true,
        },
      ];
    }

    if (contextMenu.type === 'photo' && contextMenu.targetPhoto) {
      const photo = contextMenu.targetPhoto;
      const currentDiveId = photo.dive_id;
      const availableDives = dives.filter(d => d.id !== currentDiveId);
      
      const items: ContextMenuItem[] = [
        {
          label: 'AI Identify Species',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          ),
          onClick: () => handleContextMenuAIIdentify(photo),
          disabled: !geminiApiKey,
        },
        {
          label: 'Tag Species',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
            </svg>
          ),
          onClick: () => handleContextMenuTagSpecies(photo),
        },
        {
          label: 'Add Tag',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/>
            </svg>
          ),
          onClick: () => handleContextMenuTagGeneral(photo),
        },
        {
          label: 'Open in Editor',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
            </svg>
          ),
          onClick: () => handleContextMenuEditPhoto(photo),
        },
      ];

      // Add "Move to Dive" submenu if there are dives available
      if (availableDives.length > 0 || currentDiveId !== null) {
        const submenuItems: ContextMenuItem[] = [];
        
        // Add "Unassigned" option if currently assigned to a dive
        if (currentDiveId !== null) {
          submenuItems.push({
            label: '(Unassigned)',
            onClick: () => handleContextMenuMovePhoto(photo, null),
          });
        }
        
        // Add available dives
        availableDives.forEach(dive => {
          const diveName = formatDiveName(settings.diveNamePrefix, dive.dive_number);
          submenuItems.push({
            label: diveName,
            onClick: () => handleContextMenuMovePhoto(photo, dive.id),
          });
        });

        items.push({
          label: 'Move to Dive',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z"/>
            </svg>
          ),
          onClick: () => {},
          submenu: submenuItems,
        });
      }

      // Add Delete at the end
      items.push({
        label: 'Share to Social',
        icon: (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
          </svg>
        ),
        onClick: () => {
          hideContextMenu();
          updateModalContext({ shareType: 'photo', sharePhotoId: photo.id });
          openModal('shareCard');
        },
      });

      // Add Delete at the end
      items.push({
        label: 'Delete',
        icon: (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        ),
        onClick: () => handleContextMenuDeletePhoto(photo),
        danger: true,
      });

      return items;
    }

    return [];
  }, [contextMenu, trips, dives, geminiApiKey, handleContextMenuEditDive, handleContextMenuDeleteDive, handleMoveDiveToTrip, handleContextMenuEditTrip, handleContextMenuDeleteTrip, handleContextMenuAIIdentify, handleContextMenuTagSpecies, handleContextMenuTagGeneral, handleContextMenuEditPhoto, handleContextMenuMovePhoto, handleContextMenuDeletePhoto, hideContextMenu, openModal, updateModalContext]);

  // Block default context menu on blank space
  const handleAppContextMenu = useCallback((e: React.MouseEvent) => {
    // Allow context menu on input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    e.preventDefault();
  }, []);

  return (
    <div className="app" onContextMenu={handleAppContextMenu}>
      {/* Migration screen - shows during database updates */}
      {migrationProgress && (
        <MigrationScreen progress={migrationProgress} />
      )}
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
          onDiveContextMenu={handleDiveContextMenu}
          onTripContextMenu={handleTripContextMenu}
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
          onDiveContextMenu={handleDiveContextMenu}
          onPhotoContextMenu={handlePhotoContextMenu}
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
      <SetupWizardModal
        isOpen={activeModal === 'setupWizard'}
        onComplete={() => {
          closeModal();
        }}
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
      <ShareCardModal
        isOpen={activeModal === 'shareCard'}
        onClose={closeModal}
        shareType={modalContext.shareType || 'photo'}
        dive={selectedDive}
        trip={selectedTrip}
        photos={currentPhotos}
        initialPhotoId={modalContext.sharePhotoId}
      />
      <WalkthroughTour
        run={isTourRunning}
        onComplete={handleTourComplete}
        onSkip={handleTourSkip}
      />
      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={hideContextMenu}
      />
    </div>
  );
}

export default App;
