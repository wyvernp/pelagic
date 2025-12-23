import { useMemo } from 'react';
import { format } from 'date-fns';
import type { Trip, Dive } from '../types';
import { useSettings } from './SettingsModal';
import { formatDiveName } from '../utils/diveNames';
import './Sidebar.css';

interface SidebarProps {
  trips: Trip[];
  dives: Dive[];
  selectedTripId: number | null;
  selectedDiveId: number | null;
  onSelectTrip: (tripId: number | null) => void;
  onSelectDive: (diveId: number | null) => void;
  onAddTrip: () => void;
  onEditTrip: (trip: Trip) => void;
  onAddDive: (tripId: number) => void;
  // Bulk edit mode props
  bulkEditMode?: boolean;
  selectedDiveIds?: Set<number>;
  onToggleDiveSelection?: (diveId: number) => void;
  style?: React.CSSProperties;
}

export function Sidebar({
  trips,
  dives,
  selectedTripId,
  selectedDiveId,
  onSelectTrip,
  onSelectDive,
  onAddTrip,
  onEditTrip,
  onAddDive,
  bulkEditMode,
  selectedDiveIds,
  onToggleDiveSelection,
  style,
}: SidebarProps) {
  const settings = useSettings();
  
  // Pre-compute dives by trip ID to avoid filtering per trip during render
  const divesByTripId = useMemo(() => {
    const map = new Map<number, Dive[]>();
    for (const dive of dives) {
      const existing = map.get(dive.trip_id) || [];
      existing.push(dive);
      map.set(dive.trip_id, existing);
    }
    return map;
  }, [dives]);

  const handleDiveClick = (diveId: number, e: React.MouseEvent) => {
    if (bulkEditMode && onToggleDiveSelection) {
      e.preventDefault();
      e.stopPropagation();
      onToggleDiveSelection(diveId);
    } else {
      onSelectDive(diveId);
    }
  };

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-header">
        <h2>Trips</h2>
        <button className="sidebar-add-btn" title="New Trip" onClick={onAddTrip}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
      </div>
      
      <div className="sidebar-content">
        {trips.length === 0 ? (
          <div className="sidebar-empty">
            <p>No trips yet</p>
            <p className="text-muted">Import a dive log to get started</p>
          </div>
        ) : (
          <ul className="trip-list">
            {trips.map((trip) => {
              const tripDives = divesByTripId.get(trip.id) || [];
              const isExpanded = selectedTripId === trip.id;
              
              return (
                <li key={trip.id} className="trip-item">
                  <button
                    className={`trip-button ${isExpanded ? 'expanded' : ''} ${selectedTripId === trip.id && !selectedDiveId ? 'selected' : ''}`}
                    onClick={() => onSelectTrip(isExpanded && !selectedDiveId ? null : trip.id)}
                    onDoubleClick={() => onEditTrip(trip)}
                    title="Click to expand, double-click to edit"
                  >
                    <svg 
                      className={`trip-chevron ${isExpanded ? 'rotated' : ''}`}
                      viewBox="0 0 24 24" 
                      fill="currentColor" 
                      width="16" 
                      height="16"
                    >
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                    </svg>
                    <svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
                    </svg>
                    <div className="trip-info">
                      <span className="trip-name">{trip.name}</span>
                      <span className="trip-date">
                        {format(new Date(trip.date_start), 'MMM d')} - {format(new Date(trip.date_end), 'd, yyyy')}
                      </span>
                    </div>
                  </button>
                  
                  {isExpanded && tripDives.length > 0 && (
                    <ul className="dive-list">
                      {tripDives.map((dive) => {
                        const isSelected = selectedDiveIds?.has(dive.id) ?? false;
                        return (
                          <li key={dive.id}>
                            <button
                              className={`dive-button ${selectedDiveId === dive.id ? 'selected' : ''} ${bulkEditMode ? 'bulk-edit-mode' : ''} ${isSelected ? 'bulk-selected' : ''}`}
                              onClick={(e) => handleDiveClick(dive.id, e)}
                            >
                              {bulkEditMode && (
                                <input 
                                  type="checkbox" 
                                  className="dive-checkbox"
                                  checked={isSelected}
                                  onChange={() => onToggleDiveSelection?.(dive.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              {!bulkEditMode && (
                                <svg className="dive-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                  <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                                </svg>
                              )}
                              <div className="dive-text">
                                <span className={`dive-number ${!settings.diveNamePrefix ? 'number-only' : ''}`}>
                                  {formatDiveName(settings.diveNamePrefix, dive.dive_number)}
                                  {dive.location && <span className="dive-location"> {dive.location}</span>}
                                </span>
                              </div>
                              <span className="dive-depth">{dive.max_depth_m.toFixed(1)}m</span>
                            </button>
                          </li>
                        );
                      })}
                      <li>
                        <button
                          className="dive-button add-dive-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddDive(trip.id);
                          }}
                          title="Add manual dive"
                        >
                          <svg className="dive-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                          </svg>
                          <span className="add-dive-text">Add Dive</span>
                        </button>
                      </li>
                    </ul>
                  )}
                  
                  {isExpanded && tripDives.length === 0 && (
                    <div className="dive-list-empty">
                      <span className="text-muted">No dives yet</span>
                      <button
                        className="add-dive-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddDive(trip.id);
                        }}
                      >
                        Add manual dive
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
