import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import { useCommunityAuth } from '../hooks/useCommunityAuth';
import { CommunityMap } from './CommunityMap';
import './CommunityModal.css';

// ── Types ───────────────────────────────────────────────────────────────────

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

interface PaginatedDiveSites {
  sites: CommunityDiveSite[];
  total: number;
  offset: number;
  limit: number;
}

interface CommunityObservation {
  id: string | null;
  dive_site_id: string | null;
  species_name: string;
  scientific_name: string | null;
  category: string | null;
  depth: number | null;
  observed_date: string;
  submitted_by: string | null;
  created_at: string | null;
}

interface PaginatedObservations {
  observations: CommunityObservation[];
  total: number;
  offset: number;
  limit: number;
}

interface SiteContributorInfo {
  contributor_count: number;
  observation_count: number;
}

interface CommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabName = 'discover' | 'browse' | 'contribute';
type SpeciesSort = 'count' | 'recent' | 'alpha';

// ── Component ───────────────────────────────────────────────────────────────

export function CommunityModal({ isOpen, onClose }: CommunityModalProps) {
  const auth = useCommunityAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabName>('discover');

  // Site data
  const [allSites, setAllSites] = useState<CommunityDiveSite[]>([]);
  const [sitesTotal, setSitesTotal] = useState(0);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected site detail
  const [selectedSite, setSelectedSite] = useState<CommunityDiveSite | null>(null);
  const [speciesSummary, setSpeciesSummary] = useState<SiteSpeciesSummary[]>([]);
  const [speciesSort, setSpeciesSort] = useState<SpeciesSort>('count');
  const [contributorInfo, setContributorInfo] = useState<SiteContributorInfo | null>(null);
  const [recentObservations, setRecentObservations] = useState<CommunityObservation[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Map state
  const [highlightedSiteId, setHighlightedSiteId] = useState<string | null>(null);

  // Contribute state
  const [contributeMode, setContributeMode] = useState<'site' | 'observation'>('site');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteLat, setNewSiteLat] = useState('');
  const [newSiteLon, setNewSiteLon] = useState('');
  const [newSiteCountry, setNewSiteCountry] = useState('');
  const [newSiteRegion, setNewSiteRegion] = useState('');
  const [newSiteMaxDepth, setNewSiteMaxDepth] = useState('');
  const [newSiteDescription, setNewSiteDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Observation form
  const [obsSiteId, setObsSiteId] = useState('');
  const [obsSpecies, setObsSpecies] = useState('');
  const [obsScientificName, setObsScientificName] = useState('');
  const [obsCategory, setObsCategory] = useState('');
  const [obsDepth, setObsDepth] = useState('');
  const [obsDate, setObsDate] = useState(new Date().toISOString().split('T')[0]);
  const [speciesAutocomplete, setSpeciesAutocomplete] = useState<string[]>([]);
  const [showSpeciesDropdown, setShowSpeciesDropdown] = useState(false);

  // Browse pagination
  const [browseOffset, setBrowseOffset] = useState(0);
  const BROWSE_LIMIT = 50;

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadSites = useCallback(async (search?: string, offset = 0) => {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const [result, statsResult] = await Promise.all([
        invoke<PaginatedDiveSites>('community_get_dive_sites_paginated', {
          offset,
          limit: BROWSE_LIMIT,
          search: search || null,
        }),
        invoke<CommunityStats>('community_get_stats'),
      ]);
      if (offset === 0) {
        setAllSites(result.sites);
      } else {
        setAllSites(prev => [...prev, ...result.sites]);
      }
      setSitesTotal(result.total);
      setStats(statsResult);
    } catch (err) {
      setSitesError(String(err));
      logger.error('Failed to load community sites:', err);
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedSite(null);
    setSpeciesSummary([]);
    setContributorInfo(null);
    setRecentObservations([]);
    loadSites();
    auth.checkAuth();
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setBrowseOffset(0);
      loadSites(searchQuery, 0);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, isOpen]);

  // Load species autocomplete once for contribute tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'contribute') return;
    invoke<string[]>('community_get_distinct_species')
      .then(setSpeciesAutocomplete)
      .catch(() => {});
  }, [isOpen, activeTab]);

  // ── Site Detail ───────────────────────────────────────────────────────────

  const handleSelectSite = useCallback(async (site: CommunityDiveSite) => {
    setSelectedSite(site);
    if (!site.id) return;
    setDetailLoading(true);
    try {
      const [summary, info, obsResult] = await Promise.all([
        invoke<SiteSpeciesSummary[]>('community_get_site_species_summary', { diveSiteId: site.id }),
        invoke<SiteContributorInfo>('community_get_site_contributor_info', { diveSiteId: site.id }),
        invoke<PaginatedObservations>('community_get_site_observations_paginated', {
          diveSiteId: site.id,
          offset: 0,
          limit: 10,
        }),
      ]);
      setSpeciesSummary(summary);
      setContributorInfo(info);
      setRecentObservations(obsResult.observations);
    } catch {
      setSpeciesSummary([]);
      setContributorInfo(null);
      setRecentObservations([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Sorted species ────────────────────────────────────────────────────────

  const sortedSpecies = useMemo(() => {
    const sorted = [...speciesSummary];
    switch (speciesSort) {
      case 'count':
        sorted.sort((a, b) => b.sighting_count - a.sighting_count);
        break;
      case 'recent':
        sorted.sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));
        break;
      case 'alpha':
        sorted.sort((a, b) => a.species_name.localeCompare(b.species_name));
        break;
    }
    return sorted;
  }, [speciesSummary, speciesSort]);

  // Group species by category
  const speciesByCategory = useMemo(() => {
    const groups = new Map<string, SiteSpeciesSummary[]>();
    for (const sp of sortedSpecies) {
      const cat = sp.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(sp);
    }
    return groups;
  }, [sortedSpecies]);

  // ── Contribute Handlers ───────────────────────────────────────────────────

  const handleSubmitSite = async () => {
    if (!newSiteName.trim() || !newSiteLat || !newSiteLon) {
      setSubmitError('Name, latitude, and longitude are required');
      return;
    }
    const lat = parseFloat(newSiteLat);
    const lon = parseFloat(newSiteLon);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setSubmitError('Latitude must be between -90 and 90');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setSubmitError('Longitude must be between -180 and 180');
      return;
    }
    const maxDepth = newSiteMaxDepth ? parseFloat(newSiteMaxDepth) : null;
    if (maxDepth !== null && (isNaN(maxDepth) || maxDepth < 0 || maxDepth > 400)) {
      setSubmitError('Max depth must be between 0 and 400 meters');
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const result = await invoke<CommunityDiveSite>('community_submit_dive_site', {
        site: {
          id: null,
          name: newSiteName.trim(),
          lat,
          lon,
          country: newSiteCountry.trim() || null,
          region: newSiteRegion.trim() || null,
          max_depth: maxDepth,
          description: newSiteDescription.trim() || null,
          submitted_by: null,
          created_at: null,
        }
      });
      setSubmitSuccess(`Dive site "${result.name}" submitted successfully!`);
      setNewSiteName('');
      setNewSiteLat('');
      setNewSiteLon('');
      setNewSiteCountry('');
      setNewSiteRegion('');
      setNewSiteMaxDepth('');
      setNewSiteDescription('');
      // Refresh sites list
      loadSites(searchQuery, 0);
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSubmitObservation = async () => {
    if (!obsSiteId || !obsSpecies.trim() || !obsDate) {
      setSubmitError('Dive site, species name, and date are required');
      return;
    }
    const depth = obsDepth ? parseFloat(obsDepth) : null;
    if (depth !== null && (isNaN(depth) || depth < 0 || depth > 400)) {
      setSubmitError('Depth must be between 0 and 400 meters');
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      await invoke<CommunityObservation>('community_submit_observation', {
        observation: {
          id: null,
          dive_site_id: obsSiteId,
          species_name: obsSpecies.trim(),
          scientific_name: obsScientificName.trim() || null,
          category: obsCategory || null,
          depth,
          observed_date: obsDate,
          submitted_by: null,
          created_at: null,
        }
      });
      setSubmitSuccess(`Observation of "${obsSpecies.trim()}" submitted!`);
      setObsSpecies('');
      setObsScientificName('');
      setObsCategory('');
      setObsDepth('');
    } catch (err) {
      const errStr = String(err);
      if (errStr === 'duplicate') {
        setSubmitSuccess('This observation was already recorded.');
      } else {
        setSubmitError(errStr);
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleLoadMore = () => {
    const newOffset = browseOffset + BROWSE_LIMIT;
    setBrowseOffset(newOffset);
    loadSites(searchQuery, newOffset);
  };

  // Filtered autocomplete for species input
  const filteredSpeciesAutocomplete = obsSpecies.length >= 2
    ? speciesAutocomplete.filter(s => s.toLowerCase().includes(obsSpecies.toLowerCase())).slice(0, 8)
    : [];

  // ── Depth bar helper ──────────────────────────────────────────────────────

  const maxOverallDepth = useMemo(() => {
    return Math.max(40, ...speciesSummary.map(s => s.max_depth ?? 0));
  }, [speciesSummary]);

  if (!isOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal community-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2>🌊 Community</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="community-stats-bar">
            <span><strong>{stats.total_sites}</strong> dive sites</span>
            <span><strong>{stats.total_observations}</strong> observations</span>
            <span><strong>{stats.total_species}</strong> species</span>
            {auth.isSignedIn && (
              <span className="community-stats-user">
                Signed in as <strong>{auth.user}</strong>
                <button className="community-signout-link" onClick={auth.signOut}>Sign out</button>
              </span>
            )}
          </div>
        )}

        {/* Auth banner when not signed in */}
        {!auth.isSignedIn && (
          <div className="community-auth-banner">
            <span className="community-auth-prompt">Sign in to contribute dive sites &amp; observations</span>
            <div className="community-auth-form">
              <input
                type="email"
                placeholder="Email"
                value={auth.email}
                onChange={(e) => auth.setEmail(e.target.value)}
                className="community-auth-input"
              />
              <input
                type="password"
                placeholder="Password"
                value={auth.password}
                onChange={(e) => auth.setPassword(e.target.value)}
                className="community-auth-input"
              />
              <button
                className="btn btn-primary btn-small"
                onClick={auth.signIn}
                disabled={auth.loading || !auth.email || !auth.password}
              >
                {auth.loading ? 'Working...' : 'Sign In'}
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={auth.signUp}
                disabled={auth.loading || !auth.email || !auth.password}
              >
                Sign Up
              </button>
            </div>
            {auth.error && <div className="community-auth-error">{auth.error}</div>}
          </div>
        )}

        {/* Tabs */}
        <div className="community-tabs">
          <button
            className={`community-tab ${activeTab === 'discover' ? 'active' : ''}`}
            onClick={() => setActiveTab('discover')}
          >
            🗺️ Discover
          </button>
          <button
            className={`community-tab ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            📋 Browse
          </button>
          <button
            className={`community-tab ${activeTab === 'contribute' ? 'active' : ''}`}
            onClick={() => setActiveTab('contribute')}
            disabled={!auth.isSignedIn}
            title={!auth.isSignedIn ? 'Sign in to contribute' : ''}
          >
            ➕ Contribute
          </button>
        </div>

        {/* Body */}
        <div className="community-body">

          {/* ═══ DISCOVER TAB ═══ */}
          {activeTab === 'discover' && (
            <div className="community-discover">
              <div className="community-discover-layout">
                {/* Map */}
                <div className="community-discover-map">
                  <CommunityMap
                    sites={allSites}
                    selectedSiteId={selectedSite?.id ?? null}
                    onSelectSite={handleSelectSite}
                    highlightedSiteId={highlightedSiteId}
                  />
                </div>

                {/* Side panel */}
                <div className="community-discover-panel">
                  <input
                    type="text"
                    className="community-search"
                    placeholder="Search dive sites..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />

                  {sitesLoading && allSites.length === 0 ? (
                    <div className="community-loading">
                      <div className="community-skeleton">
                        <div className="skeleton-line" />
                        <div className="skeleton-line short" />
                        <div className="skeleton-line" />
                        <div className="skeleton-line short" />
                      </div>
                    </div>
                  ) : sitesError ? (
                    <div className="community-error">
                      {sitesError}
                      <button className="btn btn-small btn-secondary" onClick={() => loadSites()}>Retry</button>
                    </div>
                  ) : allSites.length === 0 ? (
                    <div className="community-empty">
                      {searchQuery ? 'No sites match your search' : 'No community dive sites yet'}
                    </div>
                  ) : (
                    <div className="community-sites-list">
                      {allSites.map((site) => (
                        <div
                          key={site.id}
                          className={`community-site-item ${selectedSite?.id === site.id ? 'selected' : ''}`}
                          onClick={() => handleSelectSite(site)}
                          onMouseEnter={() => setHighlightedSiteId(site.id)}
                          onMouseLeave={() => setHighlightedSiteId(null)}
                        >
                          <div className="community-site-name">{site.name}</div>
                          <div className="community-site-meta">
                            {[site.country, site.region].filter(Boolean).join(', ') || `${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}`}
                          </div>
                        </div>
                      ))}
                      {allSites.length < sitesTotal && (
                        <button className="community-load-more" onClick={handleLoadMore} disabled={sitesLoading}>
                          {sitesLoading ? 'Loading...' : `Load more (${allSites.length}/${sitesTotal})`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Selected site detail in discover panel */}
                  {selectedSite && (
                    <div className="community-site-detail compact">
                      <h3>{selectedSite.name}</h3>
                      <div className="community-site-info">
                        <span>📍 {selectedSite.lat.toFixed(4)}, {selectedSite.lon.toFixed(4)}</span>
                        {selectedSite.country && <span>🌍 {selectedSite.country}{selectedSite.region ? `, ${selectedSite.region}` : ''}</span>}
                        {selectedSite.max_depth != null && <span>📏 {selectedSite.max_depth}m max depth</span>}
                        {contributorInfo && <span>👥 {contributorInfo.contributor_count} contributor{contributorInfo.contributor_count !== 1 ? 's' : ''} · {contributorInfo.observation_count} observations</span>}
                        {selectedSite.created_at && <span>📅 Added {new Date(selectedSite.created_at).toLocaleDateString()}</span>}
                      </div>
                      {selectedSite.description && <p className="community-site-description">{selectedSite.description}</p>}
                      <button className="btn btn-small btn-secondary" onClick={() => setActiveTab('browse')}>
                        Full details →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ BROWSE TAB ═══ */}
          {activeTab === 'browse' && (
            <div className="community-browse">
              <input
                type="text"
                className="community-search"
                placeholder="Search dive sites by name, country, or region..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {sitesError && <div className="community-error">{sitesError} <button className="btn btn-small btn-secondary" onClick={() => loadSites()}>Retry</button></div>}

              <div className="community-browse-layout">
                {/* Sites list */}
                <div className="community-sites-list">
                  {sitesLoading && allSites.length === 0 ? (
                    <div className="community-loading">
                      <div className="community-skeleton">
                        <div className="skeleton-line" />
                        <div className="skeleton-line short" />
                        <div className="skeleton-line" />
                        <div className="skeleton-line short" />
                        <div className="skeleton-line" />
                      </div>
                    </div>
                  ) : allSites.length === 0 ? (
                    <div className="community-empty">
                      {searchQuery ? 'No sites match your search' : 'No community dive sites yet. Enable sharing in Settings to contribute!'}
                    </div>
                  ) : (
                    <>
                      <div className="community-sites-count">{sitesTotal} site{sitesTotal !== 1 ? 's' : ''}</div>
                      {allSites.map((site) => (
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
                      ))}
                      {allSites.length < sitesTotal && (
                        <button className="community-load-more" onClick={handleLoadMore} disabled={sitesLoading}>
                          {sitesLoading ? 'Loading...' : `Load more (${allSites.length}/${sitesTotal})`}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Detail panel */}
                {selectedSite ? (
                  <div className="community-site-detail">
                    <h3>{selectedSite.name}</h3>
                    <div className="community-site-info">
                      <span>📍 {selectedSite.lat.toFixed(4)}, {selectedSite.lon.toFixed(4)}</span>
                      {selectedSite.country && <span>🌍 {selectedSite.country}{selectedSite.region ? `, ${selectedSite.region}` : ''}</span>}
                      {selectedSite.max_depth != null && <span>📏 {selectedSite.max_depth}m max depth</span>}
                      {contributorInfo && (
                        <span>👥 {contributorInfo.contributor_count} contributor{contributorInfo.contributor_count !== 1 ? 's' : ''} · {contributorInfo.observation_count} observation{contributorInfo.observation_count !== 1 ? 's' : ''}</span>
                      )}
                      {selectedSite.created_at && <span>📅 Added {new Date(selectedSite.created_at).toLocaleDateString()}</span>}
                    </div>
                    {selectedSite.description && <p className="community-site-description">{selectedSite.description}</p>}

                    {detailLoading ? (
                      <div className="community-loading">
                        <div className="community-skeleton">
                          <div className="skeleton-line" />
                          <div className="skeleton-line short" />
                          <div className="skeleton-line" />
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Species section */}
                        <div className="community-species-header">
                          <h4>Species observed ({speciesSummary.length})</h4>
                          <div className="community-species-sort">
                            <button className={speciesSort === 'count' ? 'active' : ''} onClick={() => setSpeciesSort('count')}>Most seen</button>
                            <button className={speciesSort === 'recent' ? 'active' : ''} onClick={() => setSpeciesSort('recent')}>Recent</button>
                            <button className={speciesSort === 'alpha' ? 'active' : ''} onClick={() => setSpeciesSort('alpha')}>A-Z</button>
                          </div>
                        </div>

                        {speciesSummary.length === 0 ? (
                          <div className="community-empty">No species observations yet for this site.</div>
                        ) : (
                          <div className="community-species-list">
                            {Array.from(speciesByCategory.entries()).map(([category, species]) => (
                              <div key={category} className="community-species-group">
                                <div className="community-species-category">{category}</div>
                                {species.map((sp, i) => (
                                  <div key={i} className="community-species-item">
                                    <div className="community-species-info">
                                      <div className="community-species-name">
                                        {sp.species_name}
                                        {sp.scientific_name && <span className="community-species-sci"> ({sp.scientific_name})</span>}
                                      </div>
                                      <div className="community-species-meta">
                                        {sp.sighting_count} sighting{sp.sighting_count !== 1 ? 's' : ''}
                                        {sp.last_seen && <> · Last seen {sp.last_seen}</>}
                                      </div>
                                    </div>
                                    {sp.min_depth != null && sp.max_depth != null && (
                                      <div className="community-depth-bar-wrapper" title={`${sp.min_depth}-${sp.max_depth}m`}>
                                        <div
                                          className="community-depth-bar"
                                          style={{
                                            left: `${(sp.min_depth / maxOverallDepth) * 100}%`,
                                            width: `${Math.max(4, ((sp.max_depth - sp.min_depth) / maxOverallDepth) * 100)}%`,
                                          }}
                                        />
                                        <span className="community-depth-label">{sp.min_depth === sp.max_depth ? `${sp.min_depth}m` : `${sp.min_depth}-${sp.max_depth}m`}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Recent activity */}
                        {recentObservations.length > 0 && (
                          <>
                            <h4>Recent activity</h4>
                            <div className="community-recent-list">
                              {recentObservations.map((obs, i) => (
                                <div key={i} className="community-recent-item">
                                  <span className="community-recent-species">{obs.species_name}</span>
                                  <span className="community-recent-meta">
                                    {obs.observed_date}
                                    {obs.depth != null && <> · {obs.depth}m</>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="community-site-detail community-empty-detail">
                    <p>Select a dive site to see details</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ CONTRIBUTE TAB ═══ */}
          {activeTab === 'contribute' && auth.isSignedIn && (
            <div className="community-contribute">
              <div className="community-contribute-toggle">
                <button
                  className={`btn btn-small ${contributeMode === 'site' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setContributeMode('site'); setSubmitError(null); setSubmitSuccess(null); }}
                >
                  🏝️ Add Dive Site
                </button>
                <button
                  className={`btn btn-small ${contributeMode === 'observation' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setContributeMode('observation'); setSubmitError(null); setSubmitSuccess(null); }}
                >
                  🐠 Add Observation
                </button>
              </div>

              {submitError && <div className="community-error">{submitError}</div>}
              {submitSuccess && <div className="community-success">{submitSuccess}</div>}

              {contributeMode === 'site' && (
                <div className="community-form">
                  <label>
                    <span>Site Name *</span>
                    <input type="text" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="e.g. Blue Corner" maxLength={255} />
                  </label>
                  <div className="community-form-row">
                    <label>
                      <span>Latitude *</span>
                      <input type="number" step="any" value={newSiteLat} onChange={(e) => setNewSiteLat(e.target.value)} placeholder="-90 to 90" min={-90} max={90} />
                    </label>
                    <label>
                      <span>Longitude *</span>
                      <input type="number" step="any" value={newSiteLon} onChange={(e) => setNewSiteLon(e.target.value)} placeholder="-180 to 180" min={-180} max={180} />
                    </label>
                  </div>
                  <div className="community-form-row">
                    <label>
                      <span>Country</span>
                      <input type="text" value={newSiteCountry} onChange={(e) => setNewSiteCountry(e.target.value)} placeholder="e.g. Indonesia" maxLength={100} />
                    </label>
                    <label>
                      <span>Region</span>
                      <input type="text" value={newSiteRegion} onChange={(e) => setNewSiteRegion(e.target.value)} placeholder="e.g. Raja Ampat" maxLength={100} />
                    </label>
                  </div>
                  <div className="community-form-row">
                    <label>
                      <span>Max Depth (m)</span>
                      <input type="number" step="0.1" value={newSiteMaxDepth} onChange={(e) => setNewSiteMaxDepth(e.target.value)} placeholder="e.g. 30" min={0} max={400} />
                    </label>
                  </div>
                  <label>
                    <span>Description</span>
                    <input type="text" value={newSiteDescription} onChange={(e) => setNewSiteDescription(e.target.value)} placeholder="Brief description of the site" maxLength={500} />
                  </label>
                  <button className="btn btn-primary" onClick={handleSubmitSite} disabled={submitLoading || !newSiteName.trim() || !newSiteLat || !newSiteLon}>
                    {submitLoading ? 'Submitting...' : 'Submit Dive Site'}
                  </button>
                </div>
              )}

              {contributeMode === 'observation' && (
                <div className="community-form">
                  <label>
                    <span>Dive Site *</span>
                    <select value={obsSiteId} onChange={(e) => setObsSiteId(e.target.value)}>
                      <option value="">Select a dive site...</option>
                      {allSites.map((site) => (
                        <option key={site.id} value={site.id || ''}>
                          {site.name} {site.country ? `(${site.country})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="community-autocomplete-wrapper">
                    <span>Species Name *</span>
                    <input
                      type="text"
                      value={obsSpecies}
                      onChange={(e) => { setObsSpecies(e.target.value); setShowSpeciesDropdown(true); }}
                      onFocus={() => setShowSpeciesDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSpeciesDropdown(false), 200)}
                      placeholder="e.g. Whale Shark"
                      maxLength={255}
                    />
                    {showSpeciesDropdown && filteredSpeciesAutocomplete.length > 0 && (
                      <div className="community-autocomplete-dropdown">
                        {filteredSpeciesAutocomplete.map((sp) => (
                          <div
                            key={sp}
                            className="community-autocomplete-item"
                            onMouseDown={() => { setObsSpecies(sp); setShowSpeciesDropdown(false); }}
                          >
                            {sp}
                          </div>
                        ))}
                      </div>
                    )}
                  </label>
                  <div className="community-form-row">
                    <label>
                      <span>Scientific Name</span>
                      <input type="text" value={obsScientificName} onChange={(e) => setObsScientificName(e.target.value)} placeholder="e.g. Rhincodon typus" maxLength={255} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select value={obsCategory} onChange={(e) => setObsCategory(e.target.value)}>
                        <option value="">Select...</option>
                        <option value="Fish">Fish</option>
                        <option value="Coral">Coral</option>
                        <option value="Invertebrate">Invertebrate</option>
                        <option value="Mammal">Mammal</option>
                        <option value="Reptile">Reptile</option>
                        <option value="Shark">Shark</option>
                        <option value="Ray">Ray</option>
                        <option value="Cephalopod">Cephalopod</option>
                        <option value="Crustacean">Crustacean</option>
                        <option value="Nudibranch">Nudibranch</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                  </div>
                  <div className="community-form-row">
                    <label>
                      <span>Depth (m)</span>
                      <input type="number" step="0.1" value={obsDepth} onChange={(e) => setObsDepth(e.target.value)} placeholder="e.g. 18" min={0} max={400} />
                    </label>
                    <label>
                      <span>Date *</span>
                      <input type="date" value={obsDate} onChange={(e) => setObsDate(e.target.value)} />
                    </label>
                  </div>
                  <button className="btn btn-primary" onClick={handleSubmitObservation} disabled={submitLoading || !obsSiteId || !obsSpecies.trim() || !obsDate}>
                    {submitLoading ? 'Submitting...' : 'Submit Observation'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
