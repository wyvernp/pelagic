import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import { useSearchStore, useNavigationStore } from '../stores';
import type { SearchResults } from '../types';
import './SearchBar.css';

interface SearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrip: (tripId: number) => void;
  onSelectDive: (tripId: number, diveId: number) => void;
}

export function SearchBar({ 
  isOpen, 
  onClose, 
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setSearchResults, searchResults } = useSearchStore();
  const { setViewMode, selectDive, selectPhoto } = useNavigationStore();

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Debounced search - updates store which drives ContentArea display
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSearchResults(null, '');
      return;
    }
    
    setLoading(true);
    try {
      const results = await invoke<SearchResults>('search', { query: searchQuery });
      setSearchResults(results, searchQuery);
      // Clear selections first, then set view mode (order matters - selectDive changes viewMode)
      selectDive(null);
      selectPhoto(null);
      // Set view mode AFTER selectDive to ensure it stays as 'search'
      setViewMode('search');
    } catch (error) {
      logger.error('Search failed:', error);
      setSearchResults(null, '');
    } finally {
      setLoading(false);
    }
  }, [setSearchResults, setViewMode, selectDive, selectPhoto]);

  // Handle input change with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (value.length < 2) {
      setSearchResults(null, '');
      return;
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 150);
  }, [performSearch, setSearchResults]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
        setSearchResults(null, '');
      } else {
        onClose();
      }
    } else if (e.key === 'Enter') {
      // Immediately perform search on Enter (bypass debounce)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (query.length >= 2) {
        performSearch(query);
      }
    }
  }, [query, onClose, setSearchResults, performSearch]);

  // Clear search
  const handleClear = useCallback(() => {
    setQuery('');
    setSearchResults(null, '');
    inputRef.current?.focus();
  }, [setSearchResults]);

  // Calculate result counts
  const totalResults = searchResults 
    ? searchResults.trips.length + searchResults.dives.length + 
      searchResults.photos.length + searchResults.species.length + 
      searchResults.tags.length + searchResults.dive_sites.length
    : 0;

  // Global keyboard handler for Escape
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !query) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, query, onClose]);

  if (!isOpen) return null;

  return (
    <div className="search-bar-container">
      <div className="search-bar-panel">
        <div className="search-bar-main">
          <div className="search-bar-input-row">
            <svg className="search-bar-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="search-bar-input"
              placeholder="Search dives, locations, species, tags, dive sites..."
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            {loading && (
              <span className="search-bar-loading">
                <svg className="spinner" viewBox="0 0 24 24" width="18" height="18">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeLinecap="round"/>
                </svg>
              </span>
            )}
            {query && !loading && (
              <span className="search-bar-count">
                {totalResults} result{totalResults !== 1 ? 's' : ''}
              </span>
            )}
            {query && (
              <button className="search-bar-clear" onClick={handleClear} title="Clear (Esc)">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
            <button 
              className={`search-bar-advanced-btn ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
              title="Advanced options"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
              </svg>
            </button>
            <button className="search-bar-close" onClick={onClose} title="Close">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          
          {showAdvanced && (
            <div className="search-bar-advanced">
              <div className="advanced-hint">
                <span className="hint-title">Search Tips:</span>
                <ul>
                  <li><strong>Species:</strong> Type common or scientific names (e.g., "lionfish", "Pterois volitans")</li>
                  <li><strong>Locations:</strong> Search by dive site, trip location, or ocean</li>
                  <li><strong>People:</strong> Find dives by buddy, divemaster, or guide name</li>
                  <li><strong>Tags:</strong> Search by any tag you've added to photos</li>
                  <li><strong>Associated results:</strong> Searching a species shows all dives where it was seen</li>
                </ul>
              </div>
              <div className="advanced-categories">
                <span className="category-label">Searching:</span>
                <span className="category-tag">🌴 Trips</span>
                <span className="category-tag">🤿 Dives</span>
                <span className="category-tag">📷 Photos</span>
                <span className="category-tag">🐠 Species</span>
                <span className="category-tag">🏷️ Tags</span>
                <span className="category-tag">📍 Dive Sites</span>
              </div>
            </div>
          )}
        </div>
        
        {query.length < 2 && (
          <div className="search-bar-hint">
            Type at least 2 characters to search • Results appear in the main window
          </div>
        )}
      </div>
    </div>
  );
}
