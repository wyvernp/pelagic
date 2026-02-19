import { create } from 'zustand';
import type { Trip, Dive, Photo } from '../types';

// Context menu state
export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  type: 'dive' | 'trip' | 'photo' | null;
  targetId: number | null;
  targetTripId?: number | null; // For dives, the trip they belong to
  targetPhoto?: Photo | null; // For photos, the full photo object
}

// All modal types in the app
export type ModalName =
  | 'trip'
  | 'dive'
  | 'addDive'
  | 'photoImport'
  | 'species'
  | 'generalTag'
  | 'statistics'
  | 'export'
  | 'search'
  | 'batch'
  | 'settings'
  | 'welcome'
  | 'map'
  | 'diveComputer'
  | 'equipment'
  | 'bulkEditDive'
  | 'photoViewer'
  | 'setupWizard'
  | 'shareCard';

// Context that modals might need
export interface ModalContext {
  editingTrip?: Trip | null;
  editingDive?: Dive | null;
  addDiveTripId?: number | null;
  photoImportPaths?: string[];
  viewerPhotoId?: number | null;
  // Share card context
  shareType?: 'dive' | 'trip' | 'photo';
  sharePhotoId?: number | null;
}

interface UIState {
  activeModal: ModalName | null;
  modalContext: ModalContext;
  sidebarWidth: number;
  isResizing: boolean;
  // Walkthrough tour state
  isTourRunning: boolean;
  hasCompletedTour: boolean;
  // Context menu state
  contextMenu: ContextMenuState;
}

interface UIActions {
  openModal: (name: ModalName, context?: Partial<ModalContext>) => void;
  closeModal: () => void;
  updateModalContext: (context: Partial<ModalContext>) => void;
  setSidebarWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
  saveSidebarWidth: () => void;
  // Tour actions
  startTour: () => void;
  endTour: (completed: boolean) => void;
  resetTour: () => void;
  // Context menu actions
  showContextMenu: (type: 'dive' | 'trip' | 'photo', targetId: number, x: number, y: number, targetTripId?: number, targetPhoto?: Photo) => void;
  hideContextMenu: () => void;
}

type UIStore = UIState & UIActions;

const getInitialSidebarWidth = (): number => {
  if (typeof window === 'undefined') return 280;
  const saved = localStorage.getItem('pelagic-sidebar-width');
  return saved ? parseInt(saved, 10) : 280;
};

const getHasCompletedTour = (): boolean => {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('pelagic-settings');
  if (saved) {
    try {
      const settings = JSON.parse(saved);
      return settings.hasCompletedTour === true;
    } catch {
      return false;
    }
  }
  return false;
};

export const useUIStore = create<UIStore>((set, get) => ({
  activeModal: null,
  modalContext: {},
  sidebarWidth: getInitialSidebarWidth(),
  contextMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    type: null,
    targetId: null,
    targetTripId: null,
  },
  isResizing: false,
  isTourRunning: false,
  hasCompletedTour: getHasCompletedTour(),

  openModal: (name, context) =>
    set((state) => ({
      activeModal: name,
      modalContext: context ? { ...state.modalContext, ...context } : state.modalContext,
      // Pause tour when modal opens
      isTourRunning: false,
    })),

  closeModal: () =>
    set({ activeModal: null }),

  updateModalContext: (context) =>
    set((state) => ({
      modalContext: { ...state.modalContext, ...context },
    })),

  setSidebarWidth: (width) =>
    set({ sidebarWidth: width }),

  setIsResizing: (isResizing) =>
    set({ isResizing }),

  saveSidebarWidth: () => {
    const { sidebarWidth } = get();
    localStorage.setItem('pelagic-sidebar-width', sidebarWidth.toString());
  },

  startTour: () =>
    set({ isTourRunning: true }),

  endTour: (completed: boolean) => {
    set({ isTourRunning: false, hasCompletedTour: completed });
    if (completed) {
      // Save to localStorage
      const saved = localStorage.getItem('pelagic-settings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.hasCompletedTour = true;
      localStorage.setItem('pelagic-settings', JSON.stringify(settings));
    }
  },

  resetTour: () => {
    // Clear the hasCompletedTour flag from localStorage
    const saved = localStorage.getItem('pelagic-settings');
    const settings = saved ? JSON.parse(saved) : {};
    settings.hasCompletedTour = false;
    localStorage.setItem('pelagic-settings', JSON.stringify(settings));
    set({ hasCompletedTour: false, isTourRunning: true });
  },

  showContextMenu: (type, targetId, x, y, targetTripId, targetPhoto) =>
    set({
      contextMenu: {
        isOpen: true,
        x,
        y,
        type,
        targetId,
        targetTripId: targetTripId ?? null,
        targetPhoto: targetPhoto ?? null,
      },
    }),

  hideContextMenu: () =>
    set({
      contextMenu: {
        isOpen: false,
        x: 0,
        y: 0,
        type: null,
        targetId: null,
        targetTripId: null,
        targetPhoto: null,
      },
    }),
}));

// Helper hook to check if a specific modal is open
export const useIsModalOpen = (name: ModalName): boolean => {
  return useUIStore((state) => state.activeModal === name);
};
