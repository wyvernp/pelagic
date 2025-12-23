import { create } from 'zustand';
import type { ViewMode } from '../types';

interface NavigationState {
  viewMode: ViewMode;
  selectedTripId: number | null;
  selectedDiveId: number | null;
  selectedPhotoId: number | null;
}

interface NavigationActions {
  selectTrip: (tripId: number | null) => void;
  selectDive: (diveId: number | null) => void;
  selectPhoto: (photoId: number | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  reset: () => void;
}

type NavigationStore = NavigationState & NavigationActions;

const initialState: NavigationState = {
  viewMode: 'trips',
  selectedTripId: null,
  selectedDiveId: null,
  selectedPhotoId: null,
};

export const useNavigationStore = create<NavigationStore>((set) => ({
  ...initialState,

  selectTrip: (tripId) =>
    set({
      viewMode: tripId ? 'trip' : 'trips',
      selectedTripId: tripId,
      selectedDiveId: null,
      selectedPhotoId: null,
    }),

  selectDive: (diveId) =>
    set((state) => ({
      viewMode: diveId ? 'dive' : 'trip',
      selectedDiveId: diveId,
      selectedPhotoId: null,
      // Keep selectedTripId unchanged
      selectedTripId: state.selectedTripId,
    })),

  selectPhoto: (photoId) =>
    set({ selectedPhotoId: photoId }),

  setViewMode: (viewMode) =>
    set({ viewMode }),

  reset: () => set(initialState),
}));
