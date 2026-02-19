import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { Trip, Dive, Photo } from '../types';

interface DataState {
  trips: Trip[];
  dives: Dive[];
  photos: Photo[];
  isLoading: boolean;
  thumbnailProgress: { current: number; total: number } | null;
  // Caches to prevent re-fetching when navigating between trips
  divesCache: Map<number, Dive[]>;
  photosCache: Map<number, Photo[]>; // Key format: tripId or `dive_${diveId}`
  // Cache version counters - increment to signal components to invalidate their local caches
  tripCacheVersions: Map<number, number>;
  currentTripId: number | null;
  currentDiveId: number | null;
}

interface DataActions {
  loadTrips: () => Promise<void>;
  loadDivesForTrip: (tripId: number) => Promise<void>;
  loadPhotosForDive: (diveId: number) => Promise<void>;
  loadPhotosForTrip: (tripId: number) => Promise<void>;
  setTrips: (trips: Trip[]) => void;
  setDives: (dives: Dive[]) => void;
  setPhotos: (photos: Photo[]) => void;
  clearDives: () => void;
  clearPhotos: () => void;
  setThumbnailProgress: (progress: { current: number; total: number } | null) => void;
  reloadCurrentPhotos: (selectedDiveId: number | null, selectedTripId: number | null) => Promise<void>;
  // Cache invalidation methods - call these when data is modified
  invalidateTripCache: (tripId: number) => void;
  invalidateDiveCache: (diveId: number) => void;
  invalidateAllCaches: () => void;
}

type DataStore = DataState & DataActions;

export const useDataStore = create<DataStore>((set, get) => ({
  trips: [],
  dives: [],
  photos: [],
  isLoading: true,
  thumbnailProgress: null,
  divesCache: new Map(),
  photosCache: new Map(),
  tripCacheVersions: new Map(),
  currentTripId: null,
  currentDiveId: null,

  loadTrips: async () => {
    try {
      set({ isLoading: true });
      const result = await invoke<Trip[]>('get_trips');
      set({ trips: result });
    } catch (error) {
      logger.error('Failed to load trips:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadDivesForTrip: async (tripId) => {
    const { divesCache, currentTripId } = get();
    
    // Check cache first - if cached, use it
    const cached = divesCache.get(tripId);
    if (cached) {
      // Only skip if already displaying this cached data
      if (currentTripId === tripId && get().dives === cached) {
        return;
      }
      logger.debug(`Using cached dives for trip ${tripId}`);
      set({ dives: cached, currentTripId: tripId });
      return;
    }
    
    try {
      const result = await invoke<Dive[]>('get_dives_for_trip', { tripId });
      // Update cache and state
      const newCache = new Map(get().divesCache);
      newCache.set(tripId, result);
      set({ dives: result, divesCache: newCache, currentTripId: tripId });
    } catch (error) {
      logger.error('Failed to load dives:', error);
    }
  },

  loadPhotosForDive: async (diveId) => {
    const { photosCache, currentDiveId } = get();
    // Use negative diveId as cache key to distinguish from trip IDs (positive)
    const cacheKey = -diveId;
    
    // If already viewing this dive with photos loaded, skip fetch
    if (currentDiveId === diveId && get().photos.length > 0) {
      return;
    }
    
    // Check cache first
    const cached = photosCache.get(cacheKey);
    if (cached) {
      logger.debug(`Using cached photos for dive ${diveId}`);
      set({ photos: cached, currentDiveId: diveId });
      return;
    }
    
    try {
      const result = await invoke<Photo[]>('get_photos_for_dive', { diveId });
      // Update cache and state
      const newCache = new Map(get().photosCache);
      newCache.set(cacheKey, result);
      set({ photos: result, photosCache: newCache, currentDiveId: diveId });
    } catch (error) {
      logger.error('Failed to load photos:', error);
    }
  },

  loadPhotosForTrip: async (tripId) => {
    const { photosCache, currentTripId, currentDiveId } = get();
    
    // If we're viewing a dive, don't reload trip photos
    if (currentDiveId !== null) {
      return;
    }
    
    // If already viewing this trip with photos loaded, skip fetch
    if (currentTripId === tripId && get().photos.length > 0 && currentDiveId === null) {
      return;
    }
    
    // Check cache first
    const cached = photosCache.get(tripId);
    if (cached) {
      logger.debug(`Using cached photos for trip ${tripId}`);
      set({ photos: cached, currentDiveId: null });
      return;
    }
    
    try {
      const result = await invoke<Photo[]>('get_photos_for_trip', { tripId });
      // Update cache and state
      const newCache = new Map(get().photosCache);
      newCache.set(tripId, result);
      set({ photos: result, photosCache: newCache, currentDiveId: null });
    } catch (error) {
      logger.error('Failed to load photos:', error);
    }
  },

  setTrips: (trips) => set({ trips }),
  setDives: (dives) => set({ dives }),
  setPhotos: (photos) => set({ photos }),
  clearDives: () => set({ dives: [], currentTripId: null }),
  clearPhotos: () => set({ photos: [], currentDiveId: null }),
  setThumbnailProgress: (progress) => set({ thumbnailProgress: progress }),

  reloadCurrentPhotos: async (selectedDiveId, selectedTripId) => {
    // Force reload bypassing cache
    const { photosCache } = get();
    const newCache = new Map(photosCache);
    
    if (selectedDiveId) {
      newCache.delete(-selectedDiveId);
      set({ photosCache: newCache, currentDiveId: null });
      await get().loadPhotosForDive(selectedDiveId);
    } else if (selectedTripId) {
      newCache.delete(selectedTripId);
      set({ photosCache: newCache });
      await get().loadPhotosForTrip(selectedTripId);
    }
  },

  // Cache invalidation methods
  invalidateTripCache: (tripId) => {
    const { divesCache, photosCache, tripCacheVersions } = get();
    const newDivesCache = new Map(divesCache);
    const newPhotosCache = new Map(photosCache);
    const newTripCacheVersions = new Map(tripCacheVersions);
    
    newDivesCache.delete(tripId);
    newPhotosCache.delete(tripId);
    // Increment version to signal components with local caches to refresh
    newTripCacheVersions.set(tripId, (tripCacheVersions.get(tripId) || 0) + 1);
    
    logger.debug(`Invalidated cache for trip ${tripId}, version now ${newTripCacheVersions.get(tripId)}`);
    set({ divesCache: newDivesCache, photosCache: newPhotosCache, tripCacheVersions: newTripCacheVersions });
  },

  invalidateDiveCache: (diveId) => {
    const { photosCache } = get();
    const newPhotosCache = new Map(photosCache);
    
    newPhotosCache.delete(-diveId);
    
    logger.debug(`Invalidated cache for dive ${diveId}`);
    set({ photosCache: newPhotosCache });
  },

  invalidateAllCaches: () => {
    logger.debug('Invalidating all data caches');
    set({ 
      divesCache: new Map(), 
      photosCache: new Map(),
      tripCacheVersions: new Map(),
      currentTripId: null,
      currentDiveId: null 
    });
  },
}));
