import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { DiveMapPoint } from '../types';
import './MapView.css';

interface MapViewProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDive?: (tripId: number, diveId: number) => void;
}

export function MapView({ isOpen, onClose, onSelectDive }: MapViewProps) {
  const [divePoints, setDivePoints] = useState<DiveMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

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
          <h4>${point.location || `Dive #${point.dive_number}`}</h4>
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
