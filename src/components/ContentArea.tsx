import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Trip, Dive, Photo, ViewMode, DiveSample, PhotoSortField, SortDirection, SearchResults, IdentificationResult } from '../types';
import { DiveProfile } from './DiveProfile';
import { ContentGrid } from './ContentGrid';
import { StatsBar } from './StatsBar';
import { useSettings } from './SettingsModal';
import { logger } from '../utils/logger';
import { confirmDialog } from '../utils/dialogs';
import './ContentArea.css';

interface ContentAreaProps {
  viewMode: ViewMode;
  trip: Trip | null;
  dive: Dive | null;
  dives: Dive[];
  photos: Photo[];
  selectedPhotoIds: Set<number>;
  onSelectDive: (diveId: number | null) => void;
  onSelectPhoto: (photoId: number, multiSelect: boolean) => void;
  onOpenPhoto: (photoId: number) => void;
  onEditDive?: (dive: Dive) => void;
  onTagSpecies?: () => void;
  onTagGeneral?: () => void;
  onDeletePhotos?: () => void;
  onClearSelection?: () => void;
  onBatchOperations?: () => void;
  onPhotosUpdated?: () => void;
  searchResults?: SearchResults | null;
  searchQuery?: string;
  onSelectTrip?: (tripId: number) => void;
  onClearSearch?: () => void;
  // Bulk edit mode props
  bulkEditMode?: boolean;
  selectedDiveIds?: Set<number>;
  onEnterBulkEditMode?: () => void;
  onExitBulkEditMode?: () => void;
  onToggleDiveSelection?: (diveId: number) => void;
  onSelectAllDives?: () => void;
  onOpenBulkEditModal?: () => void;
}

export function ContentArea({
  viewMode,
  trip,
  dive,
  dives,
  photos,
  selectedPhotoIds,
  onSelectDive,
  onSelectPhoto,
  onOpenPhoto,
  onEditDive,
  onTagSpecies,
  onTagGeneral,
  onDeletePhotos,
  onClearSelection,
  onBatchOperations,
  onPhotosUpdated,
  searchResults,
  searchQuery,
  onSelectTrip,
  onClearSearch,
  bulkEditMode,
  selectedDiveIds,
  onEnterBulkEditMode,
  onExitBulkEditMode,
  onToggleDiveSelection,
  onSelectAllDives,
  onOpenBulkEditModal,
}: ContentAreaProps) {
  const [samples, setSamples] = useState<DiveSample[]>([]);
  const [sortField, setSortField] = useState<PhotoSortField>('capture_time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [batchIdentifying, setBatchIdentifying] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number; total: number} | null>(null);
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);
  const settings = useSettings();

  // Sort photos
  const sortedPhotos = useMemo(() => {
    const sorted = [...photos].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'capture_time') {
        const timeA = a.capture_time || '';
        const timeB = b.capture_time || '';
        comparison = timeA.localeCompare(timeB);
      } else if (sortField === 'filename') {
        comparison = a.filename.localeCompare(b.filename);
      } else if (sortField === 'rating') {
        comparison = (b.rating || 0) - (a.rating || 0); // Higher ratings first
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [photos, sortField, sortDirection]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value.startsWith('rating')) {
      setSortField('rating');
      setSortDirection('desc');
    } else {
      const [field, dir] = value.split('-') as [PhotoSortField, SortDirection];
      setSortField(field);
      setSortDirection(dir);
    }
  };

  // Batch AI species identification
  const handleBatchIdentify = async () => {
    if (!settings.geminiApiKey) {
      alert('Please set your Google Gemini API key in Settings first');
      return;
    }
    
    const photoIds = Array.from(selectedPhotoIds);
    if (photoIds.length === 0) {
      alert('Please select photos to identify');
      return;
    }
    
    const confirmed = await confirmDialog(
      'AI Species Identification',
      `Identify species in ${photoIds.length} photo${photoIds.length !== 1 ? 's' : ''}? This may take some time.`
    );
    if (!confirmed) {
      return;
    }
    
    setBatchIdentifying(true);
    setBatchProgress({ current: 0, total: photoIds.length });
    
    // Build location context
    let locationContext: string | undefined;
    if (trip?.location) {
      locationContext = trip.location;
      if (dive?.location && dive.location !== trip.location) {
        locationContext += `, ${dive.location}`;
      }
    } else if (dive?.location) {
      locationContext = dive.location;
    }
    
    try {
      const results = await invoke<IdentificationResult[]>('identify_species_batch', {
        apiKey: settings.geminiApiKey,
        photoIds,
        locationContext,
      });
      
      // Process results
      let successCount = 0;
      let errorCount = 0;
      
      for (const result of results) {
        setBatchProgress({ current: results.indexOf(result) + 1, total: photoIds.length });
        
        if (result.error) {
          logger.error(`Error identifying photo ${result.photo_id}:`, result.error);
          errorCount++;
          continue;
        }
        
        if (result.identification?.common_name) {
          // Create and apply the species tag
          try {
            const tagId = await invoke<number>('get_or_create_species_tag', {
              name: result.identification.common_name,
              category: result.identification.category,
              scientificName: result.identification.scientific_name,
            });
            
            await invoke('add_species_tag_to_photos', {
              photoIds: [result.photo_id],
              speciesTagId: tagId,
            });
            
            // Add category as a general tag (e.g., "fish", "nudibranch", "crab")
            if (result.identification.category) {
              const categoryTag = result.identification.category.toLowerCase();
              const generalTagId = await invoke<number>('get_or_create_general_tag', {
                name: categoryTag,
              });
              await invoke('add_general_tag_to_photos', {
                photoIds: [result.photo_id],
                generalTagId: generalTagId,
              });
            }
            
            // Also add any additional species found
            for (const species of result.identification.multiple_species || []) {
              if (species.common_name && species.common_name !== result.identification.common_name) {
                const additionalTagId = await invoke<number>('get_or_create_species_tag', {
                  name: species.common_name,
                  category: species.category,
                  scientificName: species.scientific_name,
                });
                await invoke('add_species_tag_to_photos', {
                  photoIds: [result.photo_id],
                  speciesTagId: additionalTagId,
                });
                
                // Add category tag for additional species too
                if (species.category) {
                  const categoryTag = species.category.toLowerCase();
                  const generalTagId = await invoke<number>('get_or_create_general_tag', {
                    name: categoryTag,
                  });
                  await invoke('add_general_tag_to_photos', {
                    photoIds: [result.photo_id],
                    generalTagId: generalTagId,
                  });
                }
              }
            }
            
            successCount++;
          } catch (e) {
            logger.error(`Failed to create tag for photo ${result.photo_id}:`, e);
            errorCount++;
          }
        }
      }
      
      alert(`Batch identification complete!\n${successCount} photos identified\n${errorCount} errors`);
      onPhotosUpdated?.();
      
    } catch (error) {
      logger.error('Batch identification failed:', error);
      alert(`Batch identification failed: ${error}`);
    } finally {
      setBatchIdentifying(false);
      setBatchProgress(null);
    }
  };

  useEffect(() => {
    async function loadSamples() {
      if (dive) {
        try {
          const diveSamples = await invoke<DiveSample[]>('get_dive_samples', { diveId: dive.id });
          setSamples(diveSamples);
        } catch (error) {
          logger.error('Failed to load dive samples:', error);
          setSamples([]);
        }
      } else {
        setSamples([]);
      }
    }
    loadSamples();
  }, [dive]);

  // Search results view
  if (viewMode === 'search' && searchResults) {
    const totalResults = searchResults.trips.length + searchResults.dives.length + 
                         searchResults.photos.length + searchResults.species.length + 
                         searchResults.tags.length;
    
    return (
      <div className="content">
        <div className="content-header search-header">
          <h2>
            Search Results for "{searchQuery}"
            <span className="result-count">({totalResults} results)</span>
          </h2>
          <button className="clear-search-btn" onClick={onClearSearch}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Clear Search
          </button>
        </div>
        
        <div className="search-results-content">
          {/* Trips Section */}
          {searchResults.trips.length > 0 && (
            <div className="search-results-section">
              <h3 className="section-title">
                <span className="section-icon">🌴</span>
                Trips ({searchResults.trips.length})
              </h3>
              <div className="results-grid trips-grid">
                {searchResults.trips.map((tripItem) => (
                  <button
                    key={tripItem.id}
                    className="result-card trip-card"
                    onClick={() => onSelectTrip?.(tripItem.id)}
                  >
                    <div className="card-title">{tripItem.name}</div>
                    <div className="card-meta">{tripItem.location}</div>
                    <div className="card-meta">{tripItem.date_start}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Dives Section */}
          {searchResults.dives.length > 0 && (
            <div className="search-results-section">
              <h3 className="section-title">
                <span className="section-icon">🤿</span>
                Dives ({searchResults.dives.length})
              </h3>
              <div className="results-grid dives-grid">
                {searchResults.dives.map((diveItem) => (
                  <button
                    key={diveItem.id}
                    className="result-card dive-card"
                    onClick={() => onSelectDive(diveItem.id)}
                  >
                    <div className="card-title">
                      Dive #{diveItem.dive_number} - {diveItem.location || 'Unknown'}
                    </div>
                    <div className="card-meta">
                      {diveItem.date} • {diveItem.max_depth_m?.toFixed(1)}m max
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Photos Section */}
          {searchResults.photos.length > 0 && (
            <div className="search-results-section">
              <h3 className="section-title">
                <span className="section-icon">📷</span>
                Photos ({searchResults.photos.length})
              </h3>
              <ContentGrid
                viewMode="search"
                dives={[]}
                photos={searchResults.photos}
                selectedPhotoIds={selectedPhotoIds}
                onSelectDive={onSelectDive}
                onSelectPhoto={onSelectPhoto}
                onOpenPhoto={onOpenPhoto}
              />
            </div>
          )}
          
          {/* Species Section */}
          {searchResults.species.length > 0 && (
            <div className="search-results-section">
              <h3 className="section-title">
                <span className="section-icon">🐠</span>
                Species ({searchResults.species.length})
              </h3>
              <div className="results-grid species-grid">
                {searchResults.species.map((speciesItem) => (
                  <div key={speciesItem.id} className="result-card species-card">
                    <div className="card-title">{speciesItem.name}</div>
                    {speciesItem.scientific_name && (
                      <div className="card-meta"><em>{speciesItem.scientific_name}</em></div>
                    )}
                    {speciesItem.category && (
                      <div className="card-meta">{speciesItem.category}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Tags Section */}
          {searchResults.tags.length > 0 && (
            <div className="search-results-section">
              <h3 className="section-title">
                <span className="section-icon">🏷️</span>
                Tags ({searchResults.tags.length})
              </h3>
              <div className="results-grid tags-grid">
                {searchResults.tags.map((tagItem) => (
                  <div key={tagItem.id} className="result-card tag-card">
                    <div className="card-title">{tagItem.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {totalResults === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>No results found</h3>
              <p>Try a different search term</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'trips') {
    return (
      <div className="content">
        <StatsBar />
        <div className="empty-state">
          <div className="empty-state-icon">🐠</div>
          <h3>Welcome to Pelagic</h3>
          <p>Select a trip from the sidebar or import your dive log to get started</p>
        </div>
      </div>
    );
  }

  const title = dive 
    ? `Dive ${dive.dive_number} - ${dive.location || 'Unnamed Dive'}`
    : trip?.name || 'Trip';

  const hasSelection = selectedPhotoIds.size > 0;
  const hasDiveSelection = selectedDiveIds && selectedDiveIds.size > 0;

  return (
    <div className="content">
      {/* Stats bar for trip view (not dive view, which has its own profile) */}
      {viewMode === 'trip' && trip && (
        <StatsBar trip={trip} dives={dives} photos={{ length: photos.length }} />
      )}
      
      <div className="content-header">
        <h2>{title}</h2>
        <div className="content-actions">
          {/* Edit dropdown for dive view */}
          {viewMode === 'dive' && dive && onEditDive && (
            <div className="edit-dropdown-container">
              <button 
                className="edit-dive-btn"
                onClick={() => setEditDropdownOpen(!editDropdownOpen)}
                title="Edit options"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                Edit
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" className="dropdown-arrow">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
              {editDropdownOpen && (
                <div className="edit-dropdown-menu" onClick={() => setEditDropdownOpen(false)}>
                  <button onClick={() => onEditDive(dive)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                    Edit This Dive
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Edit dropdown for trip view - includes bulk edit option */}
          {viewMode === 'trip' && dives.length > 0 && onEnterBulkEditMode && !bulkEditMode && (
            <div className="edit-dropdown-container">
              <button 
                className="edit-dive-btn"
                onClick={() => setEditDropdownOpen(!editDropdownOpen)}
                title="Edit options"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                Edit
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" className="dropdown-arrow">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
              {editDropdownOpen && (
                <div className="edit-dropdown-menu" onClick={() => setEditDropdownOpen(false)}>
                  <button onClick={onEnterBulkEditMode}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                    </svg>
                    Bulk Edit Dives
                  </button>
                </div>
              )}
            </div>
          )}
          <select 
            className="sort-select"
            value={sortField === 'rating' ? 'rating' : `${sortField}-${sortDirection}`}
            onChange={handleSortChange}
          >
            <option value="capture_time-asc">Time (Oldest First)</option>
            <option value="capture_time-desc">Time (Newest First)</option>
            <option value="filename-asc">Filename (A-Z)</option>
            <option value="filename-desc">Filename (Z-A)</option>
            <option value="rating">Rating (Best First)</option>
          </select>
        </div>
      </div>
      
      {/* Bulk edit toolbar */}
      {bulkEditMode && (
        <div className="selection-toolbar bulk-edit-toolbar">
          <span className="selection-count">
            {hasDiveSelection 
              ? `${selectedDiveIds?.size} dive${selectedDiveIds?.size !== 1 ? 's' : ''} selected`
              : 'Select dives to edit'}
          </span>
          <div className="selection-actions">
            <button 
              className="toolbar-btn"
              onClick={onSelectAllDives}
              title="Select all dives"
            >
              Select All
            </button>
            <button 
              className="toolbar-btn primary"
              onClick={onOpenBulkEditModal}
              disabled={!hasDiveSelection}
              title="Edit selected dives"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
              Edit {hasDiveSelection ? `${selectedDiveIds?.size} ` : ''}Dives
            </button>
            <button 
              className="toolbar-btn secondary"
              onClick={onExitBulkEditMode}
              title="Cancel bulk edit"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Selection toolbar */}
      {hasSelection && !bulkEditMode && (
        <div className="selection-toolbar">
          <span className="selection-count">
            {selectedPhotoIds.size} photo{selectedPhotoIds.size !== 1 ? 's' : ''} selected
            {batchProgress && (
              <span className="batch-progress">
                {' '}• Identifying {batchProgress.current}/{batchProgress.total}...
              </span>
            )}
          </span>
          <div className="selection-actions">
            <button 
              className="toolbar-btn ai-btn"
              onClick={handleBatchIdentify}
              disabled={batchIdentifying || !settings.geminiApiKey}
              title={!settings.geminiApiKey ? 'Set API key in Settings first' : 'AI identify species in selected photos'}
            >
              <span className="btn-icon">{batchIdentifying ? '⏳' : '🤖'}</span>
              {batchIdentifying ? 'Identifying...' : 'AI ID All'}
            </button>
            <button 
              className="toolbar-btn"
              onClick={onTagSpecies}
              title="Tag species (T)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
              </svg>
              Species
            </button>
            <button 
              className="toolbar-btn"
              onClick={onTagGeneral}
              title="Add tag (G)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/>
              </svg>
              Tag
            </button>
            <button 
              className="toolbar-btn danger"
              onClick={onDeletePhotos}
              title="Delete photos (Del)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              Delete
            </button>
            <button 
              className="toolbar-btn"
              onClick={onBatchOperations}
              title="Batch operations"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
              More...
            </button>
            <button 
              className="toolbar-btn secondary"
              onClick={onClearSelection}
              title="Clear selection (Esc)"
            >
              Clear
            </button>
          </div>
        </div>
      )}
      
      {viewMode === 'dive' && dive && (
        <DiveProfile dive={dive} samples={samples} />
      )}
      
      <div className="content-body">
        <ContentGrid
          viewMode={viewMode}
          dives={viewMode === 'trip' ? dives : []}
          photos={sortedPhotos}
          selectedPhotoIds={selectedPhotoIds}
          onSelectDive={onSelectDive}
          onSelectPhoto={onSelectPhoto}
          onOpenPhoto={onOpenPhoto}
          bulkEditMode={bulkEditMode}
          selectedDiveIds={selectedDiveIds}
          onToggleDiveSelection={onToggleDiveSelection}
        />
      </div>
    </div>
  );
}
