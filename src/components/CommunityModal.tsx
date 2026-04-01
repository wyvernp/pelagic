import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import './CommunityModal.css';

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

interface SiteSpeciesSummary {
  species_name: string;
  scientific_name: string | null;
  category: string | null;
  sighting_count: number;
  last_seen: string | null;
  min_depth: number | null;
  max_depth: number | null;
}

interface CommunityStats {
  total_sites: number;
  total_observations: number;
  total_species: number;
}

interface CommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommunityModal({ isOpen, onClose }: CommunityModalProps) {
  const [communitySites, setCommunitySites] = useState<CommunityDiveSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<CommunityDiveSite | null>(null);
  const [speciesSummary, setSpeciesSummary] = useState<SiteSpeciesSummary[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sites, statsResult] = await Promise.all([
        invoke<CommunityDiveSite[]>('community_get_dive_sites'),
        invoke<CommunityStats>('community_get_stats'),
      ]);
      setCommunitySites(sites);
      setStats(statsResult);
    } catch (err) {
      setError(String(err));
      logger.error('Failed to load community data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen, loadData]);

  const handleSelectSite = async (site: CommunityDiveSite) => {
    setSelectedSite(site);
    if (site.id) {
      try {
        const summary = await invoke<SiteSpeciesSummary[]>('community_get_site_species_summary', { diveSiteId: site.id });
        setSpeciesSummary(summary);
      } catch {
        setSpeciesSummary([]);
      }
    }
  };

  const filteredSites = searchQuery
    ? communitySites.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.country && s.country.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.region && s.region.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : communitySites;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal community-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Community</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {stats && (
          <div className="community-stats-bar">
            <span>{stats.total_sites} dive sites</span>
            <span>{stats.total_observations} observations</span>
            <span>{stats.total_species} species</span>
          </div>
        )}

        <div className="modal-body community-body">
          {error && <div className="community-error">{error}</div>}

          <input
            type="text"
            className="community-search"
            placeholder="Search dive sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {loading ? (
            <div className="community-loading">Loading community data...</div>
          ) : (
            <div className="community-browse-layout">
              <div className="community-sites-list">
                {filteredSites.length === 0 ? (
                  <div className="community-empty">
                    {searchQuery ? 'No sites match your search' : 'No community dive sites yet. Enable sharing in Settings to contribute!'}
                  </div>
                ) : (
                  filteredSites.map((site) => (
                    <div
                      key={site.id}
                      className={`community-site-item ${selectedSite?.id === site.id ? 'selected' : ''}`}
                      onClick={() => handleSelectSite(site)}
                    >
                      <div className="community-site-name">{site.name}</div>
                      <div className="community-site-meta">
                        {[site.country, site.region].filter(Boolean).join(', ') || `${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}`}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedSite && (
                <div className="community-site-detail">
                  <h3>{selectedSite.name}</h3>
                  <div className="community-site-info">
                    <span>{selectedSite.lat.toFixed(4)}, {selectedSite.lon.toFixed(4)}</span>
                    {selectedSite.country && <span>{selectedSite.country}{selectedSite.region ? `, ${selectedSite.region}` : ''}</span>}
                    {selectedSite.max_depth && <span>{selectedSite.max_depth}m max depth</span>}
                    {selectedSite.description && <p>{selectedSite.description}</p>}
                  </div>

                  <h4>Species observed ({speciesSummary.length})</h4>
                  {speciesSummary.length === 0 ? (
                    <div className="community-empty">No species observations yet for this site.</div>
                  ) : (
                    <div className="community-species-list">
                      {speciesSummary.map((sp, i) => (
                        <div key={i} className="community-species-item">
                          <div className="community-species-name">
                            {sp.species_name}
                            {sp.scientific_name && <span className="community-species-sci"> ({sp.scientific_name})</span>}
                          </div>
                          <div className="community-species-meta">
                            {sp.sighting_count} sighting{sp.sighting_count !== 1 ? 's' : ''}
                            {sp.last_seen && <> &middot; Last seen {sp.last_seen}</>}
                            {sp.min_depth != null && sp.max_depth != null && (
                              <> &middot; {sp.min_depth === sp.max_depth ? `${sp.min_depth}m` : `${sp.min_depth}-${sp.max_depth}m`}</>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
