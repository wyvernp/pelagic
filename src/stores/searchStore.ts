import { create } from 'zustand';
import type { SearchResults } from '../types';

interface SearchState {
  searchResults: SearchResults | null;
  searchQuery: string;
}

interface SearchActions {
  setSearchResults: (results: SearchResults | null, query: string) => void;
  clearSearch: () => void;
}

type SearchStore = SearchState & SearchActions;

export const useSearchStore = create<SearchStore>((set) => ({
  searchResults: null,
  searchQuery: '',

  setSearchResults: (results, query) =>
    set({ searchResults: results, searchQuery: query }),

  clearSearch: () =>
    set({ searchResults: null, searchQuery: '' }),
}));
