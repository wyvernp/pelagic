import { useState, useEffect } from 'react';
import type { Trip } from '../types';
import type { Dive as DCDive } from '../../dive-computer-ts/src/index';
import './DiveImportReviewModal.css';

// Tank pressure reading (for file imports like FIT)
export interface TankPressureReading {
  sensor_id: number;
  sensor_name?: string;
  time_seconds: number;
  pressure_bar: number;
}

// A dive ready for import (from dive computer or file)
export interface ImportableDive {
  id: string; // Temporary ID for tracking in UI
  dcDive: DCDive;
  date: Date;
  selected: boolean;
  isDuplicate?: boolean;
  // Optional tank pressure data (for file imports that have separate tank pressure records)
  tankPressures?: TankPressureReading[];
}

// A group of dives that will be imported together to a trip
export interface DiveGroup {
  id: string;
  dives: ImportableDive[];
  dateStart: Date;
  dateEnd: Date;
  defaultTripName: string;
  selectedTripId: number | null; // null = create new trip
  newTripName: string;
  status: 'pending' | 'importing' | 'complete' | 'error';
  errorMessage?: string;
}

interface DiveImportReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  dives: ImportableDive[];
  existingTrips: Trip[];
  onImport: (groups: DiveGroup[]) => Promise<void>;
  onCreateTrip: () => Promise<Trip | null>; // Opens AddTripModal, returns created trip
}

// Format duration in seconds to mm:ss or hh:mm:ss
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Format depth in meters
function formatDepth(mm: number): string {
  return (mm / 1000).toFixed(1);
}

// Format date range for default trip name
function formatDateRange(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return `${startStr} - ${endStr}`;
}

// Group dives by time gap (in hours)
function groupDivesByTimeGap(dives: ImportableDive[], gapHours: number): DiveGroup[] {
  if (dives.length === 0) return [];
  
  // Sort by date
  const sorted = [...dives].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const groups: DiveGroup[] = [];
  let currentGroup: ImportableDive[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prevDive = sorted[i - 1];
    const currDive = sorted[i];
    const gapMs = currDive.date.getTime() - prevDive.date.getTime();
    const gapInHours = gapMs / (1000 * 60 * 60);
    
    if (gapInHours > gapHours) {
      // Start new group
      const dateStart = new Date(Math.min(...currentGroup.map(d => d.date.getTime())));
      const dateEnd = new Date(Math.max(...currentGroup.map(d => d.date.getTime())));
      
      groups.push({
        id: `group-${groups.length}`,
        dives: currentGroup,
        dateStart,
        dateEnd,
        defaultTripName: formatDateRange(dateStart, dateEnd),
        selectedTripId: null,
        newTripName: formatDateRange(dateStart, dateEnd),
        status: 'pending',
      });
      currentGroup = [currDive];
    } else {
      currentGroup.push(currDive);
    }
  }
  
  // Add final group
  if (currentGroup.length > 0) {
    const dateStart = new Date(Math.min(...currentGroup.map(d => d.date.getTime())));
    const dateEnd = new Date(Math.max(...currentGroup.map(d => d.date.getTime())));
    
    groups.push({
      id: `group-${groups.length}`,
      dives: currentGroup,
      dateStart,
      dateEnd,
      defaultTripName: formatDateRange(dateStart, dateEnd),
      selectedTripId: null,
      newTripName: formatDateRange(dateStart, dateEnd),
      status: 'pending',
    });
  }
  
  return groups;
}

export function DiveImportReviewModal({
  isOpen,
  onClose,
  dives,
  existingTrips,
  onImport,
  onCreateTrip: _onCreateTrip, // Will be used in future step
}: DiveImportReviewModalProps) {
  const [gapHours, setGapHours] = useState(36);
  const [groups, setGroups] = useState<DiveGroup[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  
  // Dives are already ImportableDive format - use directly
  // Regroup when dives or gap changes
  useEffect(() => {
    const newGroups = groupDivesByTimeGap(dives, gapHours);
    setGroups(newGroups);
  }, [dives, gapHours]);
  
  if (!isOpen) return null;
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isImporting) {
      onClose();
    }
  };
  
  const handleTripChange = (groupId: string, tripId: number | null) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, selectedTripId: tripId } : g
    ));
  };
  
  const handleNewTripNameChange = (groupId: string, name: string) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, newTripName: name } : g
    ));
  };
  
  const handleMergeWithAbove = (groupIndex: number) => {
    if (groupIndex === 0) return;
    
    setGroups(prev => {
      const newGroups = [...prev];
      const targetGroup = newGroups[groupIndex - 1];
      const sourceGroup = newGroups[groupIndex];
      
      // Merge dives
      const mergedDives = [...targetGroup.dives, ...sourceGroup.dives];
      const dateStart = new Date(Math.min(...mergedDives.map(d => d.date.getTime())));
      const dateEnd = new Date(Math.max(...mergedDives.map(d => d.date.getTime())));
      
      newGroups[groupIndex - 1] = {
        ...targetGroup,
        dives: mergedDives,
        dateStart,
        dateEnd,
        defaultTripName: formatDateRange(dateStart, dateEnd),
        newTripName: formatDateRange(dateStart, dateEnd),
      };
      
      // Remove source group
      newGroups.splice(groupIndex, 1);
      
      return newGroups;
    });
  };
  
  const handleToggleDive = (groupId: string, diveId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        dives: g.dives.map(d => 
          d.id === diveId ? { ...d, selected: !d.selected } : d
        ),
      };
    }));
  };
  
  const handleImport = async () => {
    setIsImporting(true);
    try {
      await onImport(groups);
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error}`);
    } finally {
      setIsImporting(false);
    }
  };
  
  const totalDives = groups.reduce((sum, g) => sum + g.dives.filter(d => d.selected).length, 0);
  const allComplete = groups.every(g => g.status === 'complete');
  
  return (
    <div className="dive-import-review-overlay" onClick={handleBackdropClick}>
      <div className="dive-import-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Review Downloaded Dives</h2>
          <button className="modal-close" onClick={onClose} disabled={isImporting}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div className="modal-body">
          {/* Gap configuration */}
          <div className="gap-config">
            <label htmlFor="gap-hours">
              Group dives separated by more than
            </label>
            <input
              id="gap-hours"
              type="number"
              min="1"
              max="168"
              value={gapHours}
              onChange={(e) => setGapHours(Math.max(1, parseInt(e.target.value) || 36))}
              disabled={isImporting}
            />
            <span>hours into separate trips</span>
          </div>
          
          {/* Dive groups */}
          <div className="dive-groups">
            {groups.map((group, groupIndex) => (
              <div key={group.id} className={`dive-group ${group.status}`}>
                <div className="group-header">
                  <div className="group-info">
                    <span className="group-date-range">{group.defaultTripName}</span>
                    <span className="group-dive-count">
                      {group.dives.filter(d => d.selected).length} dive{group.dives.filter(d => d.selected).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="group-actions">
                    {groupIndex > 0 && group.status === 'pending' && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleMergeWithAbove(groupIndex)}
                        disabled={isImporting}
                        title="Combine with the group above"
                      >
                        ↑ Merge with above
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Trip selector */}
                <div className="group-trip-selector">
                  <label>Import to:</label>
                  <select
                    value={group.selectedTripId ?? 'new'}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleTripChange(group.id, value === 'new' ? null : parseInt(value));
                    }}
                    disabled={isImporting || group.status !== 'pending'}
                  >
                    <option value="new">Create new trip...</option>
                    {existingTrips.map(trip => (
                      <option key={trip.id} value={trip.id}>
                        {trip.name} ({trip.date_start} to {trip.date_end})
                      </option>
                    ))}
                  </select>
                  
                  {group.selectedTripId === null && (
                    <input
                      type="text"
                      className="new-trip-name"
                      value={group.newTripName}
                      onChange={(e) => handleNewTripNameChange(group.id, e.target.value)}
                      placeholder="Trip name"
                      disabled={isImporting || group.status !== 'pending'}
                    />
                  )}
                </div>
                
                {/* Status indicator */}
                {group.status !== 'pending' && (
                  <div className={`group-status status-${group.status}`}>
                    {group.status === 'importing' && '⏳ Importing...'}
                    {group.status === 'complete' && '✓ Imported'}
                    {group.status === 'error' && `✗ Error: ${group.errorMessage}`}
                  </div>
                )}
                
                {/* Dive table */}
                <table className="dive-table">
                  <thead>
                    <tr>
                      <th className="col-select"></th>
                      <th className="col-date">Date</th>
                      <th className="col-time">Time</th>
                      <th className="col-duration">Duration</th>
                      <th className="col-depth">Max Depth</th>
                      <th className="col-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.dives.map(dive => (
                      <tr 
                        key={dive.id} 
                        className={`${dive.selected ? '' : 'deselected'} ${dive.isDuplicate ? 'duplicate' : ''}`}
                      >
                        <td className="col-select">
                          <input
                            type="checkbox"
                            checked={dive.selected}
                            onChange={() => handleToggleDive(group.id, dive.id)}
                            disabled={isImporting || group.status !== 'pending'}
                          />
                        </td>
                        <td className="col-date">
                          {dive.date.toLocaleDateString()}
                        </td>
                        <td className="col-time">
                          {dive.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="col-duration">
                          {formatDuration(dive.dcDive.duration.seconds)}
                        </td>
                        <td className="col-depth">
                          {formatDepth(dive.dcDive.maxDepth.mm)}m
                        </td>
                        <td className="col-status">
                          {dive.isDuplicate && (
                            <span className="status-badge duplicate" title="A dive with this date/time already exists">
                              Duplicate
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            
            {groups.length === 0 && (
              <div className="no-dives">
                No dives to import
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <div className="footer-info">
            {totalDives} dive{totalDives !== 1 ? 's' : ''} selected across {groups.length} trip{groups.length !== 1 ? 's' : ''}
          </div>
          <div className="footer-actions">
            <button 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={isImporting}
            >
              {allComplete ? 'Close' : 'Cancel'}
            </button>
            {!allComplete && (
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={isImporting || totalDives === 0}
              >
                {isImporting ? 'Importing...' : `Import ${totalDives} Dive${totalDives !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
