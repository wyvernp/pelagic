import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { Trip, Dive, Statistics } from '../types';
import './StatsBar.css';

interface StatsBarProps {
  trip?: Trip | null;
  dives?: Dive[];
}

interface TripStats {
  dive_count: number;
  total_bottom_time: number;
  deepest_dive: number;
  photo_count: number;
  species_count: number;
}

export function StatsBar({ trip, dives = [] }: StatsBarProps) {
  const [globalStats, setGlobalStats] = useState<Statistics | null>(null);
  const [tripStats, setTripStats] = useState<TripStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    
    const loadStats = async () => {
      setLoading(true);
      setError(false);
      try {
        if (trip) {
          // Calculate trip-specific stats from dives
          const dive_count = dives.length;
          const total_bottom_time = dives.reduce((sum, d) => sum + d.duration_seconds, 0);
          const deepest_dive = dives.length > 0 ? Math.max(...dives.map(d => d.max_depth_m)) : 0;
          
          // Get photo count for this trip (ALL photos, not just unassigned)
          let photo_count = 0;
          try {
            const allPhotos = await invoke<{ id: number }[]>('get_all_photos_for_trip', { tripId: trip.id });
            if (!cancelled) photo_count = allPhotos.length;
          } catch {
            // Command might not exist yet, that's ok
          }
          
          // Get species count for this trip
          let species_count = 0;
          try {
            const speciesResult = await invoke<number>('get_trip_species_count', { tripId: trip.id });
            if (!cancelled) species_count = speciesResult;
          } catch {
            // Command might not exist yet, that's ok
          }
          
          if (!cancelled) {
            setTripStats({
              dive_count,
              total_bottom_time,
              deepest_dive,
              photo_count,
              species_count,
            });
            setGlobalStats(null);
          }
        } else {
          // Load global stats
          const stats = await invoke<Statistics>('get_statistics');
          if (!cancelled) {
            setGlobalStats(stats);
            setTripStats(null);
          }
        }
      } catch (error) {
        logger.error('Failed to load stats:', error);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStats();
    
    return () => { cancelled = true; };
  }, [trip?.id, dives.length]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading || error) {
    return null;
  }

  // Trip stats view
  if (tripStats && trip) {
    return (
      <div className="stats-bar">
        <div className="stats-bar-item">
          <span className="stats-bar-icon">🤿</span>
          <span className="stats-bar-value">{tripStats.dive_count}</span>
          <span className="stats-bar-label">Dives</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">⏱️</span>
          <span className="stats-bar-value">{formatDuration(tripStats.total_bottom_time)}</span>
          <span className="stats-bar-label">Bottom Time</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">⬇️</span>
          <span className="stats-bar-value">{tripStats.deepest_dive.toFixed(1)}m</span>
          <span className="stats-bar-label">Deepest</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">📷</span>
          <span className="stats-bar-value">{tripStats.photo_count.toLocaleString()}</span>
          <span className="stats-bar-label">Photos</span>
        </div>
        {tripStats.species_count > 0 && (
          <div className="stats-bar-item">
            <span className="stats-bar-icon">🐠</span>
            <span className="stats-bar-value">{tripStats.species_count}</span>
            <span className="stats-bar-label">Species</span>
          </div>
        )}
      </div>
    );
  }

  // Global stats view (home page)
  if (globalStats) {
    return (
      <div className="stats-bar stats-bar-global">
        <div className="stats-bar-item">
          <span className="stats-bar-icon">🌴</span>
          <span className="stats-bar-value">{globalStats.total_trips}</span>
          <span className="stats-bar-label">Trips</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">🤿</span>
          <span className="stats-bar-value">{globalStats.total_dives}</span>
          <span className="stats-bar-label">Dives</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">⏱️</span>
          <span className="stats-bar-value">{formatDuration(globalStats.total_bottom_time_seconds)}</span>
          <span className="stats-bar-label">Bottom Time</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">📷</span>
          <span className="stats-bar-value">{globalStats.total_photos.toLocaleString()}</span>
          <span className="stats-bar-label">Photos</span>
        </div>
        <div className="stats-bar-item">
          <span className="stats-bar-icon">🐠</span>
          <span className="stats-bar-value">{globalStats.total_species}</span>
          <span className="stats-bar-label">Species</span>
        </div>
        {globalStats.deepest_dive_m && (
          <div className="stats-bar-item">
            <span className="stats-bar-icon">⬇️</span>
            <span className="stats-bar-value">{globalStats.deepest_dive_m.toFixed(1)}m</span>
            <span className="stats-bar-label">Deepest</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}
