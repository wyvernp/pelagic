import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Statistics, SpeciesCount, CameraStat, YearlyStat } from '../types';
import './StatisticsModal.css';

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId = 'overview' | 'species' | 'cameras' | 'yearly';

export function StatisticsModal({ isOpen, onClose }: StatisticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [stats, setStats] = useState<Statistics | null>(null);
  const [speciesCounts, setSpeciesCounts] = useState<SpeciesCount[]>([]);
  const [cameraStats, setCameraStats] = useState<CameraStat[]>([]);
  const [yearlyStats, setYearlyStats] = useState<YearlyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadAllStats();
    }
  }, [isOpen]);

  const loadAllStats = async () => {
    setLoading(true);
    try {
      const [statsData, speciesData, cameraData, yearlyData] = await Promise.all([
        invoke<Statistics>('get_statistics'),
        invoke<SpeciesCount[]>('get_species_with_counts'),
        invoke<CameraStat[]>('get_camera_stats'),
        invoke<YearlyStat[]>('get_yearly_stats'),
      ]);
      setStats(statsData);
      setSpeciesCounts(speciesData);
      setCameraStats(cameraData);
      setYearlyStats(yearlyData);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDepth = (meters?: number): string => {
    if (meters === undefined || meters === null) return '-';
    return `${meters.toFixed(1)}m`;
  };

  const formatTemp = (celsius?: number): string => {
    if (celsius === undefined || celsius === null) return '-';
    return `${celsius.toFixed(1)}°C`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal statistics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Statistics</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="stats-tabs">
          <button
            className={`stats-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`stats-tab ${activeTab === 'species' ? 'active' : ''}`}
            onClick={() => setActiveTab('species')}
          >
            Species
          </button>
          <button
            className={`stats-tab ${activeTab === 'cameras' ? 'active' : ''}`}
            onClick={() => setActiveTab('cameras')}
          >
            Cameras
          </button>
          <button
            className={`stats-tab ${activeTab === 'yearly' ? 'active' : ''}`}
            onClick={() => setActiveTab('yearly')}
          >
            By Year
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="stats-loading">Loading statistics...</div>
          ) : (
            <>
              {activeTab === 'overview' && stats && (
                <div className="stats-overview">
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_trips}</div>
                      <div className="stat-label">Trips</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_dives}</div>
                      <div className="stat-label">Dives</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{formatDuration(stats.total_bottom_time_seconds)}</div>
                      <div className="stat-label">Total Bottom Time</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_photos.toLocaleString()}</div>
                      <div className="stat-label">Photos</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_species}</div>
                      <div className="stat-label">Species Tagged</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.photos_with_species.toLocaleString()}</div>
                      <div className="stat-label">Photos with Species</div>
                    </div>
                  </div>

                  <h3 className="stats-section-title">Dive Records</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{formatDepth(stats.deepest_dive_m)}</div>
                      <div className="stat-label">Deepest Dive</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{formatDepth(stats.avg_depth_m)}</div>
                      <div className="stat-label">Average Depth</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{formatTemp(stats.coldest_water_c)}</div>
                      <div className="stat-label">Coldest Water</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{formatTemp(stats.warmest_water_c)}</div>
                      <div className="stat-label">Warmest Water</div>
                    </div>
                  </div>

                  <h3 className="stats-section-title">Photo Stats</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{stats.rated_photos.toLocaleString()}</div>
                      <div className="stat-label">Rated Photos</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">
                        {stats.total_photos > 0 
                          ? `${Math.round((stats.photos_with_species / stats.total_photos) * 100)}%`
                          : '0%'}
                      </div>
                      <div className="stat-label">Tagged Rate</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'species' && (
                <div className="stats-species">
                  {speciesCounts.length === 0 ? (
                    <p className="stats-empty">No species tagged yet</p>
                  ) : (
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Species</th>
                          <th>Scientific Name</th>
                          <th>Category</th>
                          <th>Photos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {speciesCounts.map((species) => (
                          <tr key={species.id}>
                            <td className="species-name">{species.name}</td>
                            <td className="species-scientific">{species.scientific_name || '-'}</td>
                            <td>{species.category || '-'}</td>
                            <td className="count">{species.photo_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'cameras' && (
                <div className="stats-cameras">
                  {cameraStats.length === 0 ? (
                    <p className="stats-empty">No camera data available</p>
                  ) : (
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Camera</th>
                          <th>Photos</th>
                          <th>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cameraStats.map((camera, i) => {
                          const totalPhotos = cameraStats.reduce((sum, c) => sum + c.photo_count, 0);
                          const percentage = totalPhotos > 0 
                            ? Math.round((camera.photo_count / totalPhotos) * 100) 
                            : 0;
                          return (
                            <tr key={i}>
                              <td>{camera.camera_model}</td>
                              <td className="count">{camera.photo_count.toLocaleString()}</td>
                              <td className="percentage">{percentage}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'yearly' && (
                <div className="stats-yearly">
                  {yearlyStats.length === 0 ? (
                    <p className="stats-empty">No dive data available</p>
                  ) : (
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Year</th>
                          <th>Dives</th>
                          <th>Bottom Time</th>
                          <th>Avg Depth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearlyStats.map((year) => (
                          <tr key={year.year}>
                            <td className="year">{year.year}</td>
                            <td className="count">{year.dive_count}</td>
                            <td>{formatDuration(year.total_time_seconds)}</td>
                            <td>{formatDepth(year.avg_depth_m)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
