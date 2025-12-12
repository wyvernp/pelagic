import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SearchResults, PhotoFilter } from '../types';
import './SearchModal.css';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchResults: (results: SearchResults | null, query: string) => void;
  onApplyFilter?: (filter: PhotoFilter) => void;
  currentTripId?: number;
  currentDiveId?: number;
}

export function SearchModal({ 
  isOpen, 
  onClose, 
  onSearchResults,
  onApplyFilter,
  currentTripId,
  currentDiveId,
}: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ratingMin, setRatingMin] = useState<number | ''>('');
  const [ratingMax, setRatingMax] = useState<number | ''>('');
  const [cameraModel, setCameraModel] = useState('');
  const [lensModel, setLensModel] = useState('');
  const [isoMin, setIsoMin] = useState('');
  const [isoMax, setIsoMax] = useState('');
  const [apertureMin, setApertureMin] = useState('');
  const [apertureMax, setApertureMax] = useState('');
  const [focalLengthMin, setFocalLengthMin] = useState('');
  const [focalLengthMax, setFocalLengthMax] = useState('');
  const [widthMin, setWidthMin] = useState('');
  const [widthMax, setWidthMax] = useState('');
  const [heightMin, setHeightMin] = useState('');
  const [heightMax, setHeightMax] = useState('');
  const [hasRaw, setHasRaw] = useState<'all' | 'yes' | 'no'>('all');
  const [isProcessed, setIsProcessed] = useState<'all' | 'processed' | 'raw'>('all');
  const [exposureCompMin, setExposureCompMin] = useState('');
  const [exposureCompMax, setExposureCompMax] = useState('');
  const [whiteBalance, setWhiteBalance] = useState('');
  const [flashFired, setFlashFired] = useState<'all' | 'yes' | 'no'>('all');
  const [meteringMode, setMeteringMode] = useState('');

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      return;
    }
    
    setLoading(true);
    try {
      const searchResults = await invoke<SearchResults>('search', { query: searchQuery });
      onSearchResults(searchResults, searchQuery);
      onClose();
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [onSearchResults, onClose]);

  const applyFilters = useCallback(() => {
    if (!onApplyFilter) return;

    const filter: PhotoFilter = {};
    
    if (dateFrom) filter.dateFrom = dateFrom;
    if (dateTo) filter.dateTo = dateTo;
    if (ratingMin !== '') filter.ratingMin = Number(ratingMin);
    if (ratingMax !== '') filter.ratingMax = Number(ratingMax);
    if (cameraModel) filter.cameraModel = cameraModel;
    if (lensModel) filter.lensModel = lensModel;
    if (isoMin) filter.isoMin = Number(isoMin);
    if (isoMax) filter.isoMax = Number(isoMax);
    if (apertureMin) filter.apertureMin = Number(apertureMin);
    if (apertureMax) filter.apertureMax = Number(apertureMax);
    if (focalLengthMin) filter.focalLengthMin = Number(focalLengthMin);
    if (focalLengthMax) filter.focalLengthMax = Number(focalLengthMax);
    if (widthMin) filter.widthMin = Number(widthMin);
    if (widthMax) filter.widthMax = Number(widthMax);
    if (heightMin) filter.heightMin = Number(heightMin);
    if (heightMax) filter.heightMax = Number(heightMax);
    if (hasRaw === 'yes') filter.hasRaw = true;
    if (hasRaw === 'no') filter.hasRaw = false;
    if (isProcessed === 'processed') filter.isProcessed = true;
    if (isProcessed === 'raw') filter.isProcessed = false;
    if (exposureCompMin) filter.exposureCompensationMin = Number(exposureCompMin);
    if (exposureCompMax) filter.exposureCompensationMax = Number(exposureCompMax);
    if (whiteBalance) filter.whiteBalance = whiteBalance;
    if (flashFired === 'yes') filter.flashFired = true;
    if (flashFired === 'no') filter.flashFired = false;
    if (meteringMode) filter.meteringMode = meteringMode;
    if (currentTripId) filter.tripId = currentTripId;
    if (currentDiveId) filter.diveId = currentDiveId;

    onApplyFilter(filter);
    onClose();
  }, [
    onApplyFilter, onClose, dateFrom, dateTo, ratingMin, ratingMax, 
    cameraModel, lensModel, isoMin, isoMax, apertureMin, apertureMax,
    focalLengthMin, focalLengthMax, widthMin, widthMax, heightMin, heightMax, 
    hasRaw, isProcessed, exposureCompMin, exposureCompMax, whiteBalance,
    flashFired, meteringMode, currentTripId, currentDiveId
  ]);

  const clearFilters = useCallback(() => {
    setDateFrom('');
    setDateTo('');
    setRatingMin('');
    setRatingMax('');
    setCameraModel('');
    setLensModel('');
    setIsoMin('');
    setIsoMax('');
    setApertureMin('');
    setApertureMax('');
    setFocalLengthMin('');
    setFocalLengthMax('');
    setWidthMin('');
    setWidthMax('');
    setHeightMin('');
    setHeightMax('');
    setHasRaw('all');
    setIsProcessed('all');
    setExposureCompMin('');
    setExposureCompMax('');
    setWhiteBalance('');
    setFlashFired('all');
    setMeteringMode('');
  }, []);

  const hasActiveFilters = dateFrom || dateTo || ratingMin !== '' || ratingMax !== '' || 
    cameraModel || lensModel || isoMin || isoMax || apertureMin || apertureMax ||
    focalLengthMin || focalLengthMax || widthMin || widthMax || heightMin || heightMax || 
    hasRaw !== 'all' || isProcessed !== 'all' || exposureCompMin || exposureCompMax ||
    whiteBalance || flashFired !== 'all' || meteringMode;

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length >= 2) {
      performSearch(query);
    }
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay search-overlay" onClick={onClose}>
      <div className={`search-modal ${showAdvanced ? 'expanded' : 'compact'}`} onClick={(e) => e.stopPropagation()}>
        {/* Text Search Section */}
        <form onSubmit={handleSubmit}>
          <div className="search-input-container">
            <svg className="search-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search species, dive sites, tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={!showAdvanced}
            />
            <button 
              type="submit" 
              className="search-submit"
              disabled={query.length < 2 || loading}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Advanced Filter Toggle */}
        {onApplyFilter && (
          <div className="filter-toggle-section">
            <button 
              type="button"
              className="filter-toggle-btn"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
              </svg>
              Advanced Filters
              {hasActiveFilters && <span className="filter-badge">{Object.keys({dateFrom, dateTo, ratingMin, ratingMax, cameraModel, widthMin, widthMax, heightMin, heightMax}).filter(k => eval(k)).length}</span>}
              <svg 
                className={`toggle-icon ${showAdvanced ? 'expanded' : ''}`}
                viewBox="0 0 24 24" 
                fill="currentColor" 
                width="16" 
                height="16"
              >
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Advanced Filters Panel */}
        {showAdvanced && onApplyFilter && (
          <form onSubmit={handleFilterSubmit} className="advanced-filters">
            <div className="filters-grid">
              {/* Date Range */}
              <div className="filter-group">
                <label className="filter-label">Date Range</label>
                <div className="filter-row">
                  <input
                    type="date"
                    className="filter-input"
                    placeholder="From"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="date"
                    className="filter-input"
                    placeholder="To"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              {/* Rating Range */}
              <div className="filter-group">
                <label className="filter-label">Rating (0-5 stars)</label>
                <div className="filter-row">
                  <input
                    type="number"
                    min="0"
                    max="5"
                    className="filter-input"
                    placeholder="Min"
                    value={ratingMin}
                    onChange={(e) => setRatingMin(e.target.value ? Number(e.target.value) : '')}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    className="filter-input"
                    placeholder="Max"
                    value={ratingMax}
                    onChange={(e) => setRatingMax(e.target.value ? Number(e.target.value) : '')}
                  />
                </div>
              </div>

              {/* Camera Model */}
              <div className="filter-group">
                <label className="filter-label">Camera Model</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="e.g., Canon EOS R5"
                  value={cameraModel}
                  onChange={(e) => setCameraModel(e.target.value)}
                />
              </div>

              {/* Lens Model */}
              <div className="filter-group">
                <label className="filter-label">Lens</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="e.g., 60mm macro"
                  value={lensModel}
                  onChange={(e) => setLensModel(e.target.value)}
                />
              </div>

              {/* ISO Range */}
              <div className="filter-group">
                <label className="filter-label">ISO</label>
                <div className="filter-row">
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Min"
                    value={isoMin}
                    onChange={(e) => setIsoMin(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Max"
                    value={isoMax}
                    onChange={(e) => setIsoMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Aperture Range */}
              <div className="filter-group">
                <label className="filter-label">Aperture (f-stop)</label>
                <div className="filter-row">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="filter-input"
                    placeholder="Min"
                    value={apertureMin}
                    onChange={(e) => setApertureMin(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="filter-input"
                    placeholder="Max"
                    value={apertureMax}
                    onChange={(e) => setApertureMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Focal Length Range */}
              <div className="filter-group">
                <label className="filter-label">Focal Length (mm)</label>
                <div className="filter-row">
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Min"
                    value={focalLengthMin}
                    onChange={(e) => setFocalLengthMin(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Max"
                    value={focalLengthMax}
                    onChange={(e) => setFocalLengthMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Image Width */}
              <div className="filter-group">
                <label className="filter-label">Width (pixels)</label>
                <div className="filter-row">
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Min"
                    value={widthMin}
                    onChange={(e) => setWidthMin(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Max"
                    value={widthMax}
                    onChange={(e) => setWidthMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Image Height */}
              <div className="filter-group">
                <label className="filter-label">Height (pixels)</label>
                <div className="filter-row">
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Min"
                    value={heightMin}
                    onChange={(e) => setHeightMin(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    min="0"
                    className="filter-input"
                    placeholder="Max"
                    value={heightMax}
                    onChange={(e) => setHeightMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Exposure Compensation */}
              <div className="filter-group">
                <label className="filter-label">Exp Comp (EV)</label>
                <div className="filter-row">
                  <input
                    type="number"
                    step="0.1"
                    className="filter-input"
                    placeholder="Min"
                    value={exposureCompMin}
                    onChange={(e) => setExposureCompMin(e.target.value)}
                  />
                  <span className="filter-separator">to</span>
                  <input
                    type="number"
                    step="0.1"
                    className="filter-input"
                    placeholder="Max"
                    value={exposureCompMax}
                    onChange={(e) => setExposureCompMax(e.target.value)}
                  />
                </div>
              </div>

              {/* White Balance */}
              <div className="filter-group">
                <label className="filter-label">White Balance</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="e.g., Auto, Manual"
                  value={whiteBalance}
                  onChange={(e) => setWhiteBalance(e.target.value)}
                />
              </div>

              {/* Flash */}
              <div className="filter-group">
                <label className="filter-label">Flash</label>
                <select
                  className="filter-input"
                  value={flashFired}
                  onChange={(e) => setFlashFired(e.target.value as 'all' | 'yes' | 'no')}
                >
                  <option value="all">Any</option>
                  <option value="yes">Fired</option>
                  <option value="no">Not Fired</option>
                </select>
              </div>

              {/* Metering Mode */}
              <div className="filter-group">
                <label className="filter-label">Metering Mode</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="e.g., Spot, Matrix"
                  value={meteringMode}
                  onChange={(e) => setMeteringMode(e.target.value)}
                />
              </div>

              {/* RAW/Processed Filters */}
              <div className="filter-group">
                <label className="filter-label">RAW Pairing</label>
                <select
                  className="filter-input"
                  value={hasRaw}
                  onChange={(e) => setHasRaw(e.target.value as 'all' | 'yes' | 'no')}
                >
                  <option value="all">All Photos</option>
                  <option value="yes">Only RAW Pairs</option>
                  <option value="no">No RAW Version</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">File Type</label>
                <select
                  className="filter-input"
                  value={isProcessed}
                  onChange={(e) => setIsProcessed(e.target.value as 'all' | 'processed' | 'raw')}
                >
                  <option value="all">All Types</option>
                  <option value="processed">Processed Only (JPG/PNG)</option>
                  <option value="raw">RAW Only (DNG/CR2/etc)</option>
                </select>
              </div>
            </div>

            <div className="filter-actions">
              <button
                type="button"
                className="filter-btn secondary"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                Clear All
              </button>
              <button
                type="submit"
                className="filter-btn primary"
              >
                Apply Filters
              </button>
            </div>
          </form>
        )}

        <div className="search-tips">
          <span>Press <kbd>Enter</kbd> to search</span>
          <span><kbd>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
