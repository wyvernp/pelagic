import { useEffect, useRef, useCallback } from 'react';
import './CommunityMap.css';

interface CommunityDiveSite {
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  country: string | null;
  region: string | null;
  max_depth: number | null;
  description: string | null;
  submitted_by: string | null;
  created_at: string | null;
}

interface CommunityMapProps {
  sites: CommunityDiveSite[];
  selectedSiteId: string | null;
  onSelectSite: (site: CommunityDiveSite) => void;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  highlightedSiteId?: string | null;
}

export function CommunityMap({ sites, selectedSiteId, onSelectSite, onBoundsChange, highlightedSiteId }: CommunityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const sitesRef = useRef<CommunityDiveSite[]>([]);
  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;

  const initializeMap = useCallback(async () => {
    if (!mapContainerRef.current || mapRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (await import('leaflet')) as any;
    await import('leaflet/dist/leaflet.css');

    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Default world view
    map.setView([20, 0], 2);

    // Notify parent of bounds changes for viewport filtering
    if (onBoundsChange) {
      const emitBounds = () => {
        const bounds = map.getBounds();
        onBoundsChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        });
      };
      map.on('moveend', emitBounds);
      map.on('zoomend', emitBounds);
      // Emit initial bounds after map settles
      setTimeout(emitBounds, 100);
    }

    mapRef.current = map;
  }, [onBoundsChange]);

  // Initialize map on mount
  useEffect(() => {
    initializeMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initializeMap]);

  // Update markers when sites change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMarkers = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      // Remove old markers
      markersRef.current.forEach((marker) => {
        map.removeLayer(marker);
      });
      markersRef.current.clear();

      const siteIcon = L.divIcon({
        className: 'community-map-marker',
        html: `<div class="community-map-marker-icon">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      const selectedIcon = L.divIcon({
        className: 'community-map-marker selected',
        html: `<div class="community-map-marker-icon selected">📍</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      sites.forEach((site) => {
        if (!site.id) return;
        const isSelected = site.id === selectedSiteId;
        const marker = L.marker([site.lat, site.lon], {
          icon: isSelected ? selectedIcon : siteIcon,
          zIndexOffset: isSelected ? 1000 : 0,
        }).addTo(map);

        const location = [site.country, site.region].filter(Boolean).join(', ');
        marker.bindPopup(`
          <div class="community-map-popup">
            <h4>${site.name}</h4>
            ${location ? `<p class="community-map-popup-location">${location}</p>` : ''}
            ${site.max_depth ? `<p>📏 ${site.max_depth}m max depth</p>` : ''}
            <button class="community-map-popup-btn" data-site-id="${site.id}">View Details →</button>
          </div>
        `);

        marker.on('click', () => {
          onSelectSiteRef.current(site);
        });

        markersRef.current.set(site.id, marker);
      });

      // Handle popup button clicks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('popupopen', (e: any) => {
        const popup = e.popup.getElement();
        if (popup) {
          const btn = popup.querySelector('.community-map-popup-btn');
          if (btn) {
            btn.addEventListener('click', () => {
              const siteId = btn.getAttribute('data-site-id');
              const site = sites.find(s => s.id === siteId);
              if (site) onSelectSiteRef.current(site);
            });
          }
        }
      });

      // Fit bounds if we have sites and this is the initial load
      if (sites.length > 0 && sitesRef.current.length === 0) {
        const bounds = L.latLngBounds(
          sites.map(s => [s.lat, s.lon] as [number, number])
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
      }
      sitesRef.current = sites;
    };

    updateMarkers();
  }, [sites, selectedSiteId]);

  // Pan to highlighted site
  useEffect(() => {
    if (!highlightedSiteId || !mapRef.current) return;
    const marker = markersRef.current.get(highlightedSiteId);
    if (marker) {
      mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 8), { animate: true });
      marker.openPopup();
    }
  }, [highlightedSiteId]);

  return (
    <div className="community-map-wrapper">
      <div ref={mapContainerRef} className="community-map-container" />
    </div>
  );
}
