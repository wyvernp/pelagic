import { create } from 'zustand';

interface SelectionState {
  // Photo multi-select
  selectedPhotoIds: Set<number>;
  // Dive bulk edit
  selectedDiveIds: Set<number>;
  bulkEditMode: boolean;
}

interface SelectionActions {
  // Photo selection
  togglePhotoSelection: (photoId: number) => void;
  setPhotoSelection: (photoIds: Set<number>) => void;
  addToPhotoSelection: (photoId: number) => void;
  clearPhotoSelection: () => void;
  
  // Dive bulk selection
  toggleDiveSelection: (diveId: number) => void;
  selectAllDives: (diveIds: number[]) => void;
  clearDiveSelection: () => void;
  enterBulkEditMode: () => void;
  exitBulkEditMode: () => void;
  
  // Clear all selections
  clearAll: () => void;
}

type SelectionStore = SelectionState & SelectionActions;

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedPhotoIds: new Set(),
  selectedDiveIds: new Set(),
  bulkEditMode: false,

  togglePhotoSelection: (photoId) =>
    set((state) => {
      const next = new Set(state.selectedPhotoIds);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return { selectedPhotoIds: next };
    }),

  setPhotoSelection: (photoIds) =>
    set({ selectedPhotoIds: photoIds }),

  addToPhotoSelection: (photoId) =>
    set((state) => {
      const next = new Set(state.selectedPhotoIds);
      next.add(photoId);
      return { selectedPhotoIds: next };
    }),

  clearPhotoSelection: () =>
    set({ selectedPhotoIds: new Set() }),

  toggleDiveSelection: (diveId) =>
    set((state) => {
      const next = new Set(state.selectedDiveIds);
      if (next.has(diveId)) {
        next.delete(diveId);
      } else {
        next.add(diveId);
      }
      return { selectedDiveIds: next };
    }),

  selectAllDives: (diveIds) =>
    set({ selectedDiveIds: new Set(diveIds) }),

  clearDiveSelection: () =>
    set({ selectedDiveIds: new Set() }),

  enterBulkEditMode: () =>
    set({ bulkEditMode: true, selectedDiveIds: new Set() }),

  exitBulkEditMode: () =>
    set({ bulkEditMode: false, selectedDiveIds: new Set() }),

  clearAll: () =>
    set({
      selectedPhotoIds: new Set(),
      selectedDiveIds: new Set(),
      bulkEditMode: false,
    }),
}));
