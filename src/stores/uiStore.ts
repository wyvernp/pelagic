import { create } from 'zustand';
import type { Trip, Dive } from '../types';

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
  | 'photoViewer';

// Context that modals might need
export interface ModalContext {
  editingTrip?: Trip | null;
  editingDive?: Dive | null;
  addDiveTripId?: number | null;
  photoImportPaths?: string[];
  viewerPhotoId?: number | null;
}

interface UIState {
  activeModal: ModalName | null;
  modalContext: ModalContext;
  sidebarWidth: number;
  isResizing: boolean;
}

interface UIActions {
  openModal: (name: ModalName, context?: Partial<ModalContext>) => void;
  closeModal: () => void;
  updateModalContext: (context: Partial<ModalContext>) => void;
  setSidebarWidth: (width: number) => void;
  setIsResizing: (isResizing: boolean) => void;
  saveSidebarWidth: () => void;
}

type UIStore = UIState & UIActions;

const getInitialSidebarWidth = (): number => {
  if (typeof window === 'undefined') return 280;
  const saved = localStorage.getItem('pelagic-sidebar-width');
  return saved ? parseInt(saved, 10) : 280;
};

export const useUIStore = create<UIStore>((set, get) => ({
  activeModal: null,
  modalContext: {},
  sidebarWidth: getInitialSidebarWidth(),
  isResizing: false,

  openModal: (name, context) =>
    set((state) => ({
      activeModal: name,
      modalContext: context ? { ...state.modalContext, ...context } : state.modalContext,
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
}));

// Helper hook to check if a specific modal is open
export const useIsModalOpen = (name: ModalName): boolean => {
  return useUIStore((state) => state.activeModal === name);
};
