import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import { useSettings } from './SettingsModal';
import { formatDiveName } from '../utils/diveNames';
import type { DiveMapPoint, NearbySighting } from '../types';
import './MapView.css';

interface MapViewProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDive?: (tripId: number, diveId: number) => void;
}

export function MapView({ isOpen, onClose, onSelectDive }: MapViewProps) {
  const settings = useSettings();
  const [divePoints, setDivePoints] = useState<DiveMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMegafauna, setShowMegafauna] = useState(false);
  const [megafaunaSightings, setMegafaunaSightings] = useState<NearbySighting[]>([]);
  const [loadingSightings, setLoadingSightings] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const megafaunaLayerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadDivePoints();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && divePoints.length > 0 && mapContainerRef.current && !mapRef.current) {
      initializeMap();
    }
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, divePoints]);

  // Load megafauna sightings when toggled on
  useEffect(() => {
    if (!showMegafauna || !mapRef.current || divePoints.length === 0) {
      // Remove layer if toggled off
      if (megafaunaLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(megafaunaLayerRef.current);
        megafaunaLayerRef.current = null;
      }
      return;
    }

    const loadMegafauna = async () => {
      setLoadingSightings(true);
      try {
        // Use center of dive points as reference
        const centerLat = divePoints.reduce((sum, p) => sum + p.latitude, 0) / divePoints.length;
        const centerLon = divePoints.reduce((sum, p) => sum + p.longitude, 0) / divePoints.length;
        
        const sightings = await invoke<NearbySighting[]>('get_megafauna_sightings', {
          lat: centerLat,
          lon: centerLon,
          radiusDeg: 3.0,
          limit: 300,
        });
        setMegafaunaSightings(sightings);
        
        // Add markers to map
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (await import('leaflet')) as any;
        
        if (megafaunaLayerRef.current) {
          mapRef.current.removeLayer(megafaunaLayerRef.current);
        }
        
        const layerGroup = L.layerGroup();
        
        const speciesIcons: Record<string, string> = {
          'Rhincodon typus': '🦈',
          'Mobula alfredi': '🐙',    // reef manta
          'Mobula birostris': '🐙',   // giant manta
        };

        sightings.forEach((s: NearbySighting) => {
          if (s.latitude == null || s.longitude == null) return;
          const icon = speciesIcons[s.scientific_name || ''] || '📍';
          const marker = L.marker([s.latitude, s.longitude], {
            icon: L.divIcon({
              className: 'megafauna-marker',
              html: `<div class="megafauna-marker-icon">${icon}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 24],
              popupAnchor: [0, -24],
            }),
          });
          
          const dateStr = s.date ? new Date(s.date).toLocaleDateString() : 'Unknown date';
          marker.bindPopup(`
            <div class="dive-popup">
              <h4>${s.scientific_name || 'Unknown species'}</h4>
              <p>📅 ${dateStr}</p>
              <p>Source: ${s.source.toUpperCase()}</p>
            </div>
          `);
          
          layerGroup.addLayer(marker);
        });
        
        layerGroup.addTo(mapRef.current);
        megafaunaLayerRef.current = layerGroup;

        // Handle link clicks in popups
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapRef.current.on('popupopen', (e: any) => {
          const popup = e.popup.getElement();
          if (popup) {
            const link = popup.querySelector('.megafauna-link');
            if (link) {
              link.addEventListener('click', (evt: Event) => {
                evt.preventDefault();
                const url = (evt.target as HTMLElement).getAttribute('data-url');
                if (url) invoke('open_url', { url });
              });
            }
          }
        });
        
      } catch (err) {
        logger.error('Failed to load megafauna sightings:', err);
      } finally {
        setLoadingSightings(false);
      }
    };

    loadMegafauna();
  }, [showMegafauna, divePoints]);

  const loadDivePoints = async () => {
    setLoading(true);
    setError(null);
    try {
      const points = await invoke<DiveMapPoint[]>('get_dive_map_points');
      setDivePoints(points);
    } catch (err) {
      logger.error('Failed to load dive points:', err);
      setError('Failed to load dive locations');
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = async () => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Dynamically import Leaflet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (await import('leaflet')) as any;
    await import('leaflet/dist/leaflet.css');

    // Fix default marker icon issue with bundlers
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    // Create custom dive marker icon
    const diveIcon = L.divIcon({
      className: 'dive-marker',
      html: `<div class="dive-marker-icon">🤿</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });

    // Calculate bounds from dive points
    const bounds = L.latLngBounds(
      divePoints.map(p => [p.latitude, p.longitude] as [number, number])
    );

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    });

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Fit map to bounds with padding
    if (divePoints.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      // Default world view
      map.setView([0, 0], 2);
    }

    // Add markers for each dive
    divePoints.forEach(point => {
      const marker = L.marker([point.latitude, point.longitude], { icon: diveIcon })
        .addTo(map);
      
      // Create popup content
      const popupContent = `
        <div class="dive-popup">
          <h4>${point.location || formatDiveName(settings.diveNamePrefix, point.dive_number)}</h4>
          <p class="dive-popup-trip">${point.trip_name}</p>
          <div class="dive-popup-details">
            <span>📅 ${new Date(point.date).toLocaleDateString()}</span>
            <span>📏 ${point.max_depth_m.toFixed(1)}m</span>
          </div>
          <button class="dive-popup-btn" data-trip="${point.trip_id}" data-dive="${point.dive_id}">
            View Dive →
          </button>
        </div>
      `;
      
      marker.bindPopup(popupContent);
    });

    // Handle popup button clicks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('popupopen', (e: any) => {
      const popup = e.popup.getElement();
      if (popup) {
        const btn = popup.querySelector('.dive-popup-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            const tripId = parseInt(btn.getAttribute('data-trip') || '0');
            const diveId = parseInt(btn.getAttribute('data-dive') || '0');
            if (onSelectDive && tripId && diveId) {
              onSelectDive(tripId, diveId);
              onClose();
            }
          });
        }
      }
    });

    mapRef.current = map;
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="map-view-overlay" onClick={handleBackdropClick}>
      <div className="map-view-modal">
        <div className="map-view-header">
          <h2>🗺️ Dive Map</h2>
          <span className="map-view-count">
            {divePoints.length} dive{divePoints.length !== 1 ? 's' : ''} with GPS coordinates
          </span>
          <button
            className={`btn btn-secondary btn-small ${showMegafauna ? 'active' : ''}`}
            onClick={() => setShowMegafauna(!showMegafauna)}
            disabled={loadingSightings || divePoints.length === 0}
            title="Toggle whale shark & manta ray sightings from GBIF/OBIS"
            style={{ marginLeft: 'auto', marginRight: '8px' }}
          >
            {loadingSightings ? '⏳' : '🦈'} Megafauna {showMegafauna ? 'ON' : 'OFF'}
            {megafaunaSightings.length > 0 && showMegafauna && ` (${megafaunaSightings.length})`}
          </button>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="map-view-body">
          {loading && (
            <div className="map-view-loading">
              <div className="spinner"></div>
              <p>Loading dive locations...</p>
            </div>
          )}
          
          {error && (
            <div className="map-view-error">
              <p>{error}</p>
              <button onClick={loadDivePoints}>Retry</button>
            </div>
          )}
          
          {!loading && !error && divePoints.length === 0 && (
            <div className="map-view-empty">
              <p>📍 No dive locations yet</p>
              <p className="map-view-empty-hint">
                Add GPS coordinates to your dives by editing them in the dive details panel.
              </p>
            </div>
          )}
          
          <div 
            ref={mapContainerRef} 
            className="map-container"
            style={{ display: loading || error || divePoints.length === 0 ? 'none' : 'block' }}
          />
        </div>
      </div>
    </div>
  );
}
