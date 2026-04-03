import { create } from 'zustand';
import type { SearchResults, CommunitySearchResults } from '../types';

interface SearchState {
  searchResults: SearchResults | null;
  searchQuery: string;
  communityResults: CommunitySearchResults | null;
  communityLoading: boolean;
}

interface SearchActions {
  setSearchResults: (results: SearchResults | null, query: string) => void;
  setCommunityResults: (results: CommunitySearchResults | null) => void;
  setCommunityLoading: (loading: boolean) => void;
  clearSearch: () => void;
}

type SearchStore = SearchState & SearchActions;

export const useSearchStore = create<SearchStore>((set) => ({
  searchResults: null,
  searchQuery: '',
  communityResults: null,
  communityLoading: false,

  setSearchResults: (results, query) =>
    set({ searchResults: results, searchQuery: query }),

  setCommunityResults: (results) =>
    set({ communityResults: results, communityLoading: false }),

  setCommunityLoading: (loading) =>
    set({ communityLoading: loading }),

  clearSearch: () =>
    set({ searchResults: null, searchQuery: '', communityResults: null, communityLoading: false }),
}));
