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
  
  const handleMergeWithBelow = (groupIndex: number) => {
    if (groupIndex >= groups.length - 1) return;
    
    setGroups(prev => {
      const newGroups = [...prev];
      const targetGroup = newGroups[groupIndex];
      const sourceGroup = newGroups[groupIndex + 1];
      
      // Merge dives
      const mergedDives = [...targetGroup.dives, ...sourceGroup.dives];
      const dateStart = new Date(Math.min(...mergedDives.map(d => d.date.getTime())));
      const dateEnd = new Date(Math.max(...mergedDives.map(d => d.date.getTime())));
      
      newGroups[groupIndex] = {
        ...targetGroup,
        dives: mergedDives,
        dateStart,
        dateEnd,
        defaultTripName: formatDateRange(dateStart, dateEnd),
        newTripName: formatDateRange(dateStart, dateEnd),
      };
      
      // Remove source group
      newGroups.splice(groupIndex + 1, 1);
      
      return newGroups;
    });
  };
  
  const handleSplitDive = (groupId: string, diveId: string) => {
    setGroups(prev => {
      const groupIndex = prev.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return prev;
      
      const group = prev[groupIndex];
      const diveIndex = group.dives.findIndex(d => d.id === diveId);
      if (diveIndex === -1) return prev;
      
      // Can't split if only one dive in group
      if (group.dives.length <= 1) return prev;
      
      const diveToSplit = group.dives[diveIndex];
      const remainingDives = group.dives.filter(d => d.id !== diveId);
      
      // Update the original group
      const origDateStart = new Date(Math.min(...remainingDives.map(d => d.date.getTime())));
      const origDateEnd = new Date(Math.max(...remainingDives.map(d => d.date.getTime())));
      
      const updatedOrigGroup: DiveGroup = {
        ...group,
        dives: remainingDives,
        dateStart: origDateStart,
        dateEnd: origDateEnd,
        defaultTripName: formatDateRange(origDateStart, origDateEnd),
        newTripName: formatDateRange(origDateStart, origDateEnd),
      };
      
      // Create new group for the split dive
      const newGroup: DiveGroup = {
        id: `group-${Date.now()}`,
        dives: [diveToSplit],
        dateStart: diveToSplit.date,
        dateEnd: diveToSplit.date,
        defaultTripName: formatDateRange(diveToSplit.date, diveToSplit.date),
        selectedTripId: null,
        newTripName: formatDateRange(diveToSplit.date, diveToSplit.date),
        status: 'pending',
      };
      
      // Insert the new group in the right position (after original, maintaining time order)
      const newGroups = [...prev];
      newGroups[groupIndex] = updatedOrigGroup;
      
      // Find the right position to insert based on date
      let insertIndex = groupIndex + 1;
      if (diveToSplit.date < origDateStart) {
        insertIndex = groupIndex; // Insert before if the split dive is earlier
        newGroups[groupIndex] = newGroup;
        newGroups.splice(groupIndex + 1, 0, updatedOrigGroup);
        return newGroups.filter((_, i) => i !== groupIndex + 2); // Remove the duplicate original
      }
      
      newGroups.splice(insertIndex, 0, newGroup);
      return newGroups;
    });
  };
  
  const handleSplitAtDive = (groupId: string, diveId: string) => {
    // Split the group into two: all dives before this one, and this one + all after
    setGroups(prev => {
      const groupIndex = prev.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return prev;
      
      const group = prev[groupIndex];
      // Sort dives by date to ensure consistent split
      const sortedDives = [...group.dives].sort((a, b) => a.date.getTime() - b.date.getTime());
      const diveIndex = sortedDives.findIndex(d => d.id === diveId);
      if (diveIndex === -1 || diveIndex === 0) return prev; // Can't split at first dive
      
      const firstGroupDives = sortedDives.slice(0, diveIndex);
      const secondGroupDives = sortedDives.slice(diveIndex);
      
      if (firstGroupDives.length === 0 || secondGroupDives.length === 0) return prev;
      
      // Create first group
      const firstDateStart = new Date(Math.min(...firstGroupDives.map(d => d.date.getTime())));
      const firstDateEnd = new Date(Math.max(...firstGroupDives.map(d => d.date.getTime())));
      const firstGroup: DiveGroup = {
        ...group,
        dives: firstGroupDives,
        dateStart: firstDateStart,
        dateEnd: firstDateEnd,
        defaultTripName: formatDateRange(firstDateStart, firstDateEnd),
        newTripName: formatDateRange(firstDateStart, firstDateEnd),
      };
      
      // Create second group
      const secondDateStart = new Date(Math.min(...secondGroupDives.map(d => d.date.getTime())));
      const secondDateEnd = new Date(Math.max(...secondGroupDives.map(d => d.date.getTime())));
      const secondGroup: DiveGroup = {
        id: `group-${Date.now()}`,
        dives: secondGroupDives,
        dateStart: secondDateStart,
        dateEnd: secondDateEnd,
        defaultTripName: formatDateRange(secondDateStart, secondDateEnd),
        selectedTripId: null,
        newTripName: formatDateRange(secondDateStart, secondDateEnd),
        status: 'pending',
      };
      
      const newGroups = [...prev];
      newGroups.splice(groupIndex, 1, firstGroup, secondGroup);
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
                        ↑ Merge
                      </button>
                    )}
                    {groupIndex < groups.length - 1 && group.status === 'pending' && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleMergeWithBelow(groupIndex)}
                        disabled={isImporting}
                        title="Combine with the group below"
                      >
                        ↓ Merge
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
                      <th className="col-actions">Actions</th>
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
                        <td className="col-actions">
                          {group.status === 'pending' && group.dives.length > 1 && (
                            <div className="dive-actions">
                              <button
                                className="btn-icon"
                                onClick={() => handleSplitDive(group.id, dive.id)}
                                disabled={isImporting}
                                title="Move this dive to its own separate trip"
                              >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                  <path d="M14 4l2.29 2.29-2.88 2.88 1.42 1.42 2.88-2.88L20 10V4h-6zm-4 0H4v6l2.29-2.29 4.71 4.7V20h2v-8.41l-5.29-5.3L10 4z"/>
                                </svg>
                              </button>
                              {(() => {
                                const sortedDives = [...group.dives].sort((a, b) => a.date.getTime() - b.date.getTime());
                                const diveIdx = sortedDives.findIndex(d => d.id === dive.id);
                                return diveIdx > 0 ? (
                                  <button
                                    className="btn-icon"
                                    onClick={() => handleSplitAtDive(group.id, dive.id)}
                                    disabled={isImporting}
                                    title="Split trip here - earlier dives become a separate trip"
                                  >
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M8 19h3v4h2v-4h3l-4-4-4 4zm8-14h-3V1h-2v4H8l4 4 4-4zM4 11v2h16v-2H4z"/>
                                    </svg>
                                  </button>
                                ) : null;
                              })()}
                            </div>
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
