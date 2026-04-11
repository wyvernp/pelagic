import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { format, getYear, getMonth } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import { modKey } from '../utils/platform';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Trip, Dive, DiveSite, SidebarGroupMode, TimelineNumberBy } from '../types';
import { useSettings } from './SettingsModal';
import { formatDiveName } from '../utils/diveNames';
import { useUIStore } from '../stores/uiStore';
import { useDataStore } from '../stores/dataStore';
import { logger } from '../utils/logger';
import './Sidebar.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const GROUP_MODE_LABELS: Record<SidebarGroupMode, string> = {
  trips: 'Trips',
  timeline: 'Timeline',
  location: 'Location',
  type: 'Dive Type',
};

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
  // Context menu props
  onDiveContextMenu?: (diveId: number, tripId: number, x: number, y: number) => void;
  onTripContextMenu?: (tripId: number, x: number, y: number) => void;
  style?: React.CSSProperties;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Shared dive item renderer
function DiveItem({
  dive,
  selectedDiveId,
  bulkEditMode,
  selectedDiveIds,
  settings,
  onDiveClick,
  onDiveRightClick,
  onToggleDiveSelection,
  overrideNumber,
}: {
  dive: Dive;
  selectedDiveId: number | null;
  bulkEditMode?: boolean;
  selectedDiveIds?: Set<number>;
  settings: { diveNamePrefix: string };
  onDiveClick: (diveId: number, e: React.MouseEvent) => void;
  onDiveRightClick: (diveId: number, tripId: number | null, e: React.MouseEvent) => void;
  onToggleDiveSelection?: (diveId: number) => void;
  overrideNumber?: number;
}) {
  const isSelected = selectedDiveIds?.has(dive.id) ?? false;
  const displayNumber = overrideNumber ?? dive.dive_number;
  return (
    <button
      className={`dive-button ${selectedDiveId === dive.id ? 'selected' : ''} ${bulkEditMode ? 'bulk-edit-mode' : ''} ${isSelected ? 'bulk-selected' : ''}`}
      onClick={(e) => onDiveClick(dive.id, e)}
      onContextMenu={(e) => onDiveRightClick(dive.id, dive.trip_id, e)}
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
          {formatDiveName(settings.diveNamePrefix, displayNumber)}
          {dive.location && <span className="dive-location"> {dive.location}</span>}
        </span>
      </div>
      <span className="dive-depth">{dive.max_depth_m.toFixed(1)}m</span>
    </button>
  );
}

// Draggable wrapper for dive items in trip mode
function DraggableDiveItem(props: {
  dive: Dive;
  selectedDiveId: number | null;
  bulkEditMode?: boolean;
  selectedDiveIds?: Set<number>;
  settings: { diveNamePrefix: string };
  onDiveClick: (diveId: number, e: React.MouseEvent) => void;
  onDiveRightClick: (diveId: number, tripId: number | null, e: React.MouseEvent) => void;
  onToggleDiveSelection?: (diveId: number) => void;
  isDragEnabled: boolean;
  overrideNumber?: number;
}) {
  const { isDragEnabled, ...diveItemProps } = props;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `dive-${props.dive.id}`,
    data: { type: 'dive', dive: props.dive },
    disabled: !isDragEnabled,
  });

  return (
    <li ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : undefined }} {...listeners} {...attributes}>
      <DiveItem {...diveItemProps} />
    </li>
  );
}
// Droppable wrapper for trip headers
function DroppableTripItem({
  tripId,
  children,
}: {
  tripId: number;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `trip-${tripId}`,
    data: { type: 'trip', tripId },
  });

  return (
    <li
      ref={setNodeRef}
      className={`trip-item ${isOver ? 'drop-target' : ''}`}
    >
      {children}
    </li>
  );
}

// Group header with expand/collapse
function GroupHeader({
  label,
  sublabel,
  icon,
  isExpanded,
  isSelected,
  onClick,
  count,
}: {
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      className={`trip-button ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
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
      {icon}
      <div className="trip-info">
        <span className="trip-name">{label}</span>
        {sublabel && <span className="trip-date">{sublabel}</span>}
      </div>
      <span className="group-count">{count}</span>
    </button>
  );
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
  onDiveContextMenu,
  onTripContextMenu,
  style,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const settings = useSettings();
  const { sidebarGroupMode, setSidebarGroupMode, sidebarTabOrder, setSidebarTabOrder, timelineNumberBy, setTimelineNumberBy } = useUIStore();
  const { allDives, allDiveSites, loadAllDives, loadAllDiveSites } = useDataStore();
  
  // Track expanded groups for non-trip modes
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Load all dives when switching to non-trip grouping
  useEffect(() => {
    if (sidebarGroupMode !== 'trips') {
      loadAllDives();
      if (sidebarGroupMode === 'location') {
        loadAllDiveSites();
      }
    }
  }, [sidebarGroupMode, loadAllDives, loadAllDiveSites]);

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // Pre-compute dives by trip ID for trip mode
  const divesByTripId = useMemo(() => {
    const map = new Map<number, Dive[]>();
    for (const dive of dives) {
      if (dive.trip_id != null) {
        const existing = map.get(dive.trip_id) || [];
        existing.push(dive);
        map.set(dive.trip_id, existing);
      }
    }
    return map;
  }, [dives]);

  // Tripless dives (for the "Individual Dives" section in trip mode)
  const [triplessDives, setTriplessDives] = useState<Dive[]>([]);
  const [triplessDivesExpanded, setTriplessDivesExpanded] = useState(false);

  useEffect(() => {
    if (sidebarGroupMode === 'trips') {
      invoke<Dive[]>('get_tripless_dives').then(setTriplessDives).catch(() => setTriplessDives([]));
    }
  }, [sidebarGroupMode, dives]); // re-fetch when dives change

  // Timeline grouping: Year -> Month -> Dives
  const timelineGroups = useMemo(() => {
    if (sidebarGroupMode !== 'timeline' || !allDives) return null;
    // Build 3-level hierarchy: Year → Month → Day → Dives
    const groups = new Map<number, Map<number, Map<number, Dive[]>>>();
    for (const dive of allDives) {
      const d = new Date(dive.date);
      const year = getYear(d);
      const month = getMonth(d);
      const day = d.getDate();
      if (!groups.has(year)) groups.set(year, new Map());
      const yearMap = groups.get(year)!;
      if (!yearMap.has(month)) yearMap.set(month, new Map());
      const monthMap = yearMap.get(month)!;
      if (!monthMap.has(day)) monthMap.set(day, []);
      monthMap.get(day)!.push(dive);
    }
    // Sort years descending, months descending, days descending, dives ascending within leaf
    return Array.from(groups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => ({
        year,
        months: Array.from(months.entries())
          .sort(([a], [b]) => b - a)
          .map(([month, days]) => ({
            month,
            days: Array.from(days.entries())
              .sort(([a], [b]) => b - a)
              .map(([day, dayDives]) => ({
                day,
                dives: dayDives.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
              })),
          })),
      }));
  }, [sidebarGroupMode, allDives]);

  // Location grouping: Country/Location -> Dive Site -> Dives
  const locationGroups = useMemo(() => {
    if (sidebarGroupMode !== 'location' || !allDives) return null;
    const diveSiteMap = new Map<number, DiveSite>();
    if (allDiveSites) {
      for (const site of allDiveSites) {
        diveSiteMap.set(site.id, site);
      }
    }
    // Group by location string (or "Unknown Location")
    const groups = new Map<string, Dive[]>();
    for (const dive of allDives) {
      const loc = dive.location || 'Unknown Location';
      if (!groups.has(loc)) groups.set(loc, []);
      groups.get(loc)!.push(dive);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([location, locDives]) => ({
        location,
        dives: locDives.sort((a, b) => b.date.localeCompare(a.date)),
      }));
  }, [sidebarGroupMode, allDives, allDiveSites]);

  // Type grouping: infer dive type from flags and depth
  const typeGroups = useMemo(() => {
    if (sidebarGroupMode !== 'type' || !allDives) return null;
    const groups = new Map<string, Dive[]>();
    for (const dive of allDives) {
      // Infer type: freediving if shallow (<5m mean) and short (<180s), otherwise scuba
      let type = 'Scuba';
      if (dive.mean_depth_m < 5 && dive.duration_seconds < 180) {
        type = 'Freediving';
      }
      if (dive.is_training_dive) {
        type = 'Training';
      }
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(dive);
    }
    // Fixed order
    const order = ['Scuba', 'Freediving', 'Training'];
    return order
      .filter(t => groups.has(t))
      .map(type => ({
        type,
        dives: groups.get(type)!.sort((a, b) => b.date.localeCompare(a.date)),
      }));
  }, [sidebarGroupMode, allDives]);

  const handleDiveClick = (diveId: number, e: React.MouseEvent) => {
    if (bulkEditMode && onToggleDiveSelection) {
      e.preventDefault();
      e.stopPropagation();
      onToggleDiveSelection(diveId);
    } else {
      // For non-trip modes, we need to also select the trip
      if (sidebarGroupMode !== 'trips' && allDives) {
        const dive = allDives.find(d => d.id === diveId);
        if (dive && dive.trip_id != null) {
          onSelectTrip(dive.trip_id);
        }
      }
      onSelectDive(diveId);
    }
  };

  const handleDiveRightClick = (diveId: number, tripId: number | null, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDiveContextMenu?.(diveId, tripId ?? 0, e.clientX, e.clientY);
  };

  const handleTripRightClick = (tripId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTripContextMenu?.(tripId, e.clientX, e.clientY);
  };

  const diveItemProps = {
    selectedDiveId,
    bulkEditMode,
    selectedDiveIds,
    settings,
    onDiveClick: handleDiveClick,
    onDiveRightClick: handleDiveRightClick,
    onToggleDiveSelection,
  };

  // Drag and drop
  const [activeDrag, setActiveDrag] = useState<Dive | null>(null);
  const { invalidateTripCache, loadDivesForTrip } = useDataStore();
  const isDragEnabled = sidebarGroupMode === 'trips' && !bulkEditMode;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dive = event.active.data.current?.dive as Dive | undefined;
    if (dive) setActiveDrag(dive);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dive = active.data.current?.dive as Dive | undefined;
    const targetTripId = over.data.current?.tripId as number | undefined;
    if (!dive || !targetTripId || dive.trip_id === targetTripId) return;

    try {
      await invoke('move_dive_to_trip', { diveId: dive.id, newTripId: targetTripId });
      // Invalidate caches for both source and target trips
      if (dive.trip_id != null) {
        invalidateTripCache(dive.trip_id);
      }
      invalidateTripCache(targetTripId);
      // Reload dives for the currently selected trip
      if (selectedTripId) {
        await loadDivesForTrip(selectedTripId);
      }
      // Also invalidate allDives cache
      useDataStore.setState({ allDives: null });
    } catch (error) {
      logger.error('Failed to move dive:', error);
    }
  }, [invalidateTripCache, loadDivesForTrip, selectedTripId]);

  // Tab reorder via pointer events (HTML5 drag unreliable in Tauri)
  const dragTabRef = useRef<SidebarGroupMode | null>(null);
  const [draggingTab, setDraggingTab] = useState<SidebarGroupMode | null>(null);
  const dragStartX = useRef(0);

  const handleTabPointerDown = (e: React.PointerEvent, mode: SidebarGroupMode) => {
    dragStartX.current = e.clientX;
    dragTabRef.current = mode;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleTabPointerMove = (e: React.PointerEvent, _currentMode: SidebarGroupMode) => {
    if (!dragTabRef.current) return;
    // Require 4px movement to start drag
    if (!draggingTab && Math.abs(e.clientX - dragStartX.current) < 4) return;
    if (!draggingTab) setDraggingTab(dragTabRef.current);

    // Find which tab we're hovering over
    const tabsContainer = (e.target as HTMLElement).closest('.sidebar-tabs');
    if (!tabsContainer) return;
    const tabs = Array.from(tabsContainer.querySelectorAll('.sidebar-tab'));
    for (let i = 0; i < tabs.length; i++) {
      const rect = tabs[i].getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        const targetMode = sidebarTabOrder[i];
        if (targetMode && targetMode !== dragTabRef.current) {
          const newOrder = [...sidebarTabOrder];
          const dragIdx = newOrder.indexOf(dragTabRef.current!);
          const targetIdx = newOrder.indexOf(targetMode);
          if (dragIdx !== -1 && targetIdx !== -1) {
            newOrder.splice(dragIdx, 1);
            newOrder.splice(targetIdx, 0, dragTabRef.current!);
            setSidebarTabOrder(newOrder);
          }
        }
        break;
      }
    }
  };

  const handleTabPointerUp = (e: React.PointerEvent) => {
    if (dragTabRef.current && !draggingTab) {
      // Was a click, not a drag — handled by onClick
    }
    dragTabRef.current = null;
    setDraggingTab(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Compute timeline numbers dynamically
  const timelineNumberMap = useMemo(() => {
    if (sidebarGroupMode !== 'timeline' || !allDives) return new Map<number, number>();
    const map = new Map<number, number>();
    // Sort all dives chronologically (ascending) for numbering
    const sorted = [...allDives].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    
    const counters = new Map<string, number>();
    for (const dive of sorted) {
      const d = new Date(dive.date);
      let key: string;
      if (timelineNumberBy === 'day') {
        key = dive.date; // YYYY-MM-DD
      } else if (timelineNumberBy === 'month') {
        key = `${getYear(d)}-${getMonth(d)}`;
      } else {
        key = String(getYear(d));
      }
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      map.set(dive.id, count);
    }
    return map;
  }, [sidebarGroupMode, allDives, timelineNumberBy]);

  // Collapsed sidebar view
  if (isCollapsed) {
    return (
      <aside className="sidebar sidebar-collapsed" style={{ width: 48 }}>
        <div className="sidebar-collapsed-content">
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title="Expand sidebar"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
          {sidebarGroupMode === 'trips' && trips.map((trip) => (
            <button
              key={trip.id}
              className={`sidebar-collapsed-item ${selectedTripId === trip.id ? 'selected' : ''}`}
              onClick={() => { onToggleCollapse?.(); onSelectTrip(trip.id); }}
              title={trip.name}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
              </svg>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-header">
        <div className="sidebar-header-left">
          {onToggleCollapse && (
            <button
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              title={`Collapse sidebar (${modKey}+B)`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
              </svg>
            </button>
          )}
          <div className="sidebar-tabs">
            {sidebarTabOrder.map((mode) => (
              <button
                key={mode}
                className={`sidebar-tab ${sidebarGroupMode === mode ? 'active' : ''} ${draggingTab === mode ? 'dragging' : ''}`}
                onClick={() => { if (!draggingTab) setSidebarGroupMode(mode); }}
                onPointerDown={(e) => handleTabPointerDown(e, mode)}
                onPointerMove={(e) => handleTabPointerMove(e, mode)}
                onPointerUp={handleTabPointerUp}
                title={`${GROUP_MODE_LABELS[mode]} (drag to reorder)`}
              >
                {GROUP_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
        {sidebarGroupMode === 'trips' && (
          <button className="sidebar-add-btn" title="New Trip" onClick={onAddTrip}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        )}
        {sidebarGroupMode === 'timeline' && (
          <select
            className="sidebar-number-by-select"
            value={timelineNumberBy}
            onChange={(e) => setTimelineNumberBy(e.target.value as TimelineNumberBy)}
            title="Number dives by"
          >
            <option value="day">By Day</option>
            <option value="month">By Month</option>
            <option value="year">By Year</option>
          </select>
        )}
      </div>
      
      <div className="sidebar-content">
        {/* Trip grouping (default) */}
        {sidebarGroupMode === 'trips' && (
          trips.length === 0 && triplessDives.length === 0 ? (
            <div className="sidebar-empty">
              <p>No trips yet</p>
              <p className="text-muted">Import a dive log to get started</p>
            </div>
          ) : (
            <>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <ul className="trip-list">
                {trips.map((trip) => {
                  const tripDives = divesByTripId.get(trip.id) || [];
                  const isExpanded = selectedTripId === trip.id;
                  
                  return (
                    <DroppableTripItem key={trip.id} tripId={trip.id}>
                      <button
                        className={`trip-button ${isExpanded ? 'expanded' : ''} ${selectedTripId === trip.id && !selectedDiveId ? 'selected' : ''}`}
                        onClick={() => onSelectTrip(isExpanded && !selectedDiveId ? null : trip.id)}
                        onDoubleClick={() => onEditTrip(trip)}
                        onContextMenu={(e) => handleTripRightClick(trip.id, e)}
                        title="Click to expand, double-click to edit, right-click for options"
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
                          {tripDives.map((dive) => (
                            <DraggableDiveItem
                              key={dive.id}
                              dive={dive}
                              isDragEnabled={isDragEnabled}
                              {...diveItemProps}
                            />
                          ))}
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
                    </DroppableTripItem>
                  );
                })}
              </ul>
              <DragOverlay>
                {activeDrag && (
                  <div className="dive-drag-overlay">
                    <svg className="dive-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"/>
                    </svg>
                    <span>{formatDiveName(settings.diveNamePrefix, activeDrag.dive_number)}</span>
                    <span className="dive-depth">{activeDrag.max_depth_m.toFixed(1)}m</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            {/* Individual Dives (tripless) */}
            {triplessDives.length > 0 && (
              <ul className="trip-list" style={{ marginTop: 0 }}>
                <li className="trip-item">
                  <GroupHeader
                    label="Individual Dives"
                    icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"/></svg>}
                    isExpanded={triplessDivesExpanded}
                    isSelected={false}
                    count={triplessDives.length}
                    onClick={() => setTriplessDivesExpanded(!triplessDivesExpanded)}
                  />
                  {triplessDivesExpanded && (
                    <ul className="dive-list">
                      {triplessDives.map((dive) => (
                        <li key={dive.id}>
                          <DiveItem dive={dive} {...diveItemProps} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              </ul>
            )}
            </>
          )
        )}

        {/* Timeline grouping */}
        {sidebarGroupMode === 'timeline' && (
          !allDives ? (
            <div className="sidebar-empty"><p className="text-muted">Loading dives...</p></div>
          ) : allDives.length === 0 ? (
            <div className="sidebar-empty"><p>No dives yet</p></div>
          ) : (
            <ul className="trip-list">
              {timelineGroups?.map(({ year, months }) => {
                const yearKey = `y-${year}`;
                const isYearExpanded = expandedGroups.has(yearKey);
                const totalDives = months.reduce((sum, m) => sum + m.days.reduce((s, d) => s + d.dives.length, 0), 0);

                // "By Year" mode: Year → Dives (flat)
                if (timelineNumberBy === 'year') {
                  const allYearDives = months.flatMap(m => m.days.flatMap(d => d.dives));
                  allYearDives.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
                  return (
                    <li key={yearKey} className="trip-item">
                      <GroupHeader
                        label={String(year)}
                        icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>}
                        isExpanded={isYearExpanded}
                        isSelected={false}
                        count={totalDives}
                        onClick={() => toggleGroup(yearKey)}
                      />
                      {isYearExpanded && (
                        <ul className="dive-list">
                          {allYearDives.map((dive) => (
                            <li key={dive.id}><DiveItem dive={dive} {...diveItemProps} overrideNumber={timelineNumberMap.get(dive.id)} /></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={yearKey} className="trip-item">
                    <GroupHeader
                      label={String(year)}
                      icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>}
                      isExpanded={isYearExpanded}
                      isSelected={false}
                      count={totalDives}
                      onClick={() => toggleGroup(yearKey)}
                    />
                    {isYearExpanded && (
                      <ul className="dive-list" style={{ paddingLeft: 16 }}>
                        {months.map(({ month, days }) => {
                          const monthKey = `m-${year}-${month}`;
                          const isMonthExpanded = expandedGroups.has(monthKey);
                          const monthDiveCount = days.reduce((s, d) => s + d.dives.length, 0);

                          // "By Month" mode: Year → Month → Dives (flat within month)
                          if (timelineNumberBy === 'month') {
                            const allMonthDives = days.flatMap(d => d.dives);
                            allMonthDives.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
                            return (
                              <li key={monthKey} className="trip-item">
                                <GroupHeader
                                  label={MONTH_NAMES[month]}
                                  sublabel={`${monthDiveCount} dive${monthDiveCount !== 1 ? 's' : ''}`}
                                  icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>}
                                  isExpanded={isMonthExpanded}
                                  isSelected={false}
                                  count={monthDiveCount}
                                  onClick={() => toggleGroup(monthKey)}
                                />
                                {isMonthExpanded && (
                                  <ul className="dive-list">
                                    {allMonthDives.map((dive) => (
                                      <li key={dive.id}><DiveItem dive={dive} {...diveItemProps} overrideNumber={timelineNumberMap.get(dive.id)} /></li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            );
                          }

                          // "By Day" mode: Year → Month → Day → Dives
                          return (
                            <li key={monthKey} className="trip-item">
                              <GroupHeader
                                label={MONTH_NAMES[month]}
                                sublabel={`${monthDiveCount} dive${monthDiveCount !== 1 ? 's' : ''}`}
                                icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>}
                                isExpanded={isMonthExpanded}
                                isSelected={false}
                                count={monthDiveCount}
                                onClick={() => toggleGroup(monthKey)}
                              />
                              {isMonthExpanded && (
                                <ul className="dive-list" style={{ paddingLeft: 16 }}>
                                  {days.map(({ day, dives: dayDives }) => {
                                    const dayKey = `d-${year}-${month}-${day}`;
                                    const isDayExpanded = expandedGroups.has(dayKey);
                                    return (
                                      <li key={dayKey} className="trip-item">
                                        <GroupHeader
                                          label={`${MONTH_NAMES[month].slice(0, 3)} ${day}`}
                                          sublabel={`${dayDives.length} dive${dayDives.length !== 1 ? 's' : ''}`}
                                          icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>}
                                          isExpanded={isDayExpanded}
                                          isSelected={false}
                                          count={dayDives.length}
                                          onClick={() => toggleGroup(dayKey)}
                                        />
                                        {isDayExpanded && (
                                          <ul className="dive-list">
                                            {dayDives.map((dive) => (
                                              <li key={dive.id}><DiveItem dive={dive} {...diveItemProps} overrideNumber={timelineNumberMap.get(dive.id)} /></li>
                                            ))}
                                          </ul>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}

        {/* Location grouping */}
        {sidebarGroupMode === 'location' && (
          !allDives ? (
            <div className="sidebar-empty"><p className="text-muted">Loading dives...</p></div>
          ) : allDives.length === 0 ? (
            <div className="sidebar-empty"><p>No dives yet</p></div>
          ) : (
            <ul className="trip-list">
              {locationGroups?.map(({ location, dives: locDives }) => {
                const locKey = `loc-${location}`;
                const isExpanded = expandedGroups.has(locKey);
                return (
                  <li key={locKey} className="trip-item">
                    <GroupHeader
                      label={location}
                      icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>}
                      isExpanded={isExpanded}
                      isSelected={false}
                      count={locDives.length}
                      onClick={() => toggleGroup(locKey)}
                    />
                    {isExpanded && (
                      <ul className="dive-list">
                        {locDives.map((dive) => (
                          <li key={dive.id}><DiveItem dive={dive} {...diveItemProps} /></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}

        {/* Type grouping */}
        {sidebarGroupMode === 'type' && (
          !allDives ? (
            <div className="sidebar-empty"><p className="text-muted">Loading dives...</p></div>
          ) : allDives.length === 0 ? (
            <div className="sidebar-empty"><p>No dives yet</p></div>
          ) : (
            <ul className="trip-list">
              {typeGroups?.map(({ type, dives: typeDives }) => {
                const typeKey = `type-${type}`;
                const isExpanded = expandedGroups.has(typeKey);
                return (
                  <li key={typeKey} className="trip-item">
                    <GroupHeader
                      label={type}
                      icon={<svg className="trip-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"/></svg>}
                      isExpanded={isExpanded}
                      isSelected={false}
                      count={typeDives.length}
                      onClick={() => toggleGroup(typeKey)}
                    />
                    {isExpanded && (
                      <ul className="dive-list">
                        {typeDives.map((dive) => (
                          <li key={dive.id}><DiveItem dive={dive} {...diveItemProps} /></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </aside>
  );
}
