import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import { useSettings } from '../components/SettingsModal';

/** How often to re-sync community data in the background (ms). */
const BACKGROUND_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

interface DiveSite {
  id: number;
  name: string;
  lat: number;
  lon: number;
  is_user_created: boolean;
}

interface SpeciesTag {
  id: number;
  name: string;
  category?: string;
  scientific_name?: string;
}

interface DiveContext {
  dive_site_id?: number;
  date: string;
  max_depth_m: number;
}

/**
 * Hook that handles automatic community sync.
 * - On mount (app start): syncs all user-created dive sites to community
 * - Exposes syncDiveSite() for on-the-fly site sharing
 * - Exposes syncSpeciesObservation() for on-the-fly observation sharing
 * 
 * All operations are fire-and-forget — failures are logged but never block the UI.
 * Only runs when the user has opted in via communitySharing setting AND is signed in.
 */
export function useCommunitySync() {
  const settings = useSettings();
  const hasSyncedRef = useRef(false);
  const isEnabledRef = useRef(false);
  const isSyncingRef = useRef(false);

  // Check if sharing is enabled and user is signed in
  const checkEnabled = useCallback(async (): Promise<boolean> => {
    if (!settings.communitySharing) {
      console.log('[CommunitySync] communitySharing is OFF');
      return false;
    }
    try {
      const token = await invoke<string | null>('get_secure_setting', { key: 'community_access_token' });
      console.log('[CommunitySync] token check:', token ? 'found' : 'NOT FOUND');
      return !!token;
    } catch (err) {
      console.log('[CommunitySync] token check error:', err);
      return false;
    }
  }, [settings.communitySharing]);

  // Sync all user-created dive sites to community (upsert — duplicates merged by Supabase)
  const syncAllDiveSites = useCallback(async () => {
    try {
      const sites = await invoke<DiveSite[]>('get_dive_sites');
      const userSites = sites.filter(s => s.is_user_created && s.name && s.name.trim().length > 0);
      if (userSites.length === 0) return;

      let synced = 0;
      // Map local site IDs to community site IDs for observation syncing
      const siteIdMap = new Map<number, string>();
      for (const site of userSites) {
        try {
          const result = await invoke<{ id: string }>('community_submit_dive_site', {
            site: {
              id: null,
              name: site.name,
              lat: site.lat,
              lon: site.lon,
              country: null,
              region: null,
              max_depth: null,
              description: null,
              submitted_by: null,
            }
          });
          if (result?.id) {
            siteIdMap.set(site.id, result.id);
          }
          synced++;
        } catch (err) {
          console.error(`[CommunitySync] failed to submit site "${site.name}":`, err);
        }
      }
      if (synced > 0) {
        logger.info(`Community sync: shared ${synced} dive sites`);
      }
      return siteIdMap;
    } catch (err) {
      logger.error('Community sync failed:', err);
      return new Map<number, string>();
    }
  }, []);

  // Sync a single dive site (call after creating one). Returns community site ID if successful.
  const syncDiveSite = useCallback(async (name: string, lat: number, lon: number): Promise<string | null> => {
    if (!isEnabledRef.current) return null;
    try {
      const result = await invoke<{ id: string }>('community_submit_dive_site', {
        site: {
          id: null,
          name,
          lat,
          lon,
          country: null,
          region: null,
          max_depth: null,
          description: null,
          submitted_by: null,
        }
      });
      logger.info(`Community sync: shared site "${name}" (${result?.id})`);
      return result?.id || null;
    } catch {
      // Duplicate or network — silent
      return null;
    }
  }, []);

  // Sync a species observation at a dive site
  const syncSpeciesObservation = useCallback(async (params: {
    diveSiteId: string;
    speciesName: string;
    scientificName?: string;
    category?: string;
    depth?: number;
    observedDate: string;
  }) => {
    if (!isEnabledRef.current) return;
    try {
      await invoke('community_submit_observation', {
        observation: {
          id: null,
          dive_site_id: params.diveSiteId,
          species_name: params.speciesName,
          scientific_name: params.scientificName || null,
          category: params.category || null,
          depth: params.depth || null,
          observed_date: params.observedDate,
          submitted_by: null,
          created_at: null,
        }
      });
      logger.info(`Community sync: shared observation "${params.speciesName}"`);
    } catch {
      // Silent failure
    }
  }, []);

  // Sync all species tags for a dive as community observations
  // If communitySiteId is provided, uses it directly; otherwise falls back to geo lookup.
  const syncDiveObservations = useCallback(async (dive: DiveContext, photoIds: number[], communitySiteId?: string | null) => {
    if (!isEnabledRef.current) {
      console.log('[CommunitySync] syncDiveObservations: not enabled, skipping');
      return;
    }
    if (!dive.dive_site_id) {
      console.log('[CommunitySync] syncDiveObservations: no dive_site_id, skipping');
      return;
    }

    console.log('[CommunitySync] syncDiveObservations: starting for', photoIds.length, 'photos, dive_site_id:', dive.dive_site_id, 'communitySiteId:', communitySiteId);

    try {
      // Use provided community site ID, or fall back to geo lookup
      if (!communitySiteId) {
        const localSite = await invoke<{ id: number; name: string; lat: number; lon: number } | null>('get_dive_site', { id: dive.dive_site_id });
        if (!localSite) {
          console.log('[CommunitySync] syncDiveObservations: local site not found for id', dive.dive_site_id);
          return;
        }

        console.log('[CommunitySync] syncDiveObservations: local site:', localSite.name, localSite.lat, localSite.lon);

        const communitySites = await invoke<Array<{ id: string; name: string; lat: number; lon: number }>>('community_get_nearby_dive_sites', {
          lat: localSite.lat,
          lon: localSite.lon,
          radiusKm: 0.5,
        });
        if (communitySites.length === 0) {
          console.log('[CommunitySync] syncDiveObservations: no community sites found nearby', localSite.lat, localSite.lon);
          return;
        }

        communitySiteId = communitySites[0].id;
        console.log('[CommunitySync] syncDiveObservations: matched community site via geo:', communitySiteId, communitySites[0].name);
      } else {
        console.log('[CommunitySync] syncDiveObservations: using provided community site ID:', communitySiteId);
      }

      // Get species tags for these photos
      for (const photoId of photoIds) {
        try {
          const tags = await invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId });
          console.log('[CommunitySync] syncDiveObservations: photo', photoId, 'has', tags.length, 'species tags');
          for (const tag of tags) {
            try {
              await invoke('community_submit_observation', {
                observation: {
                  id: null,
                  dive_site_id: communitySiteId,
                  species_name: tag.name,
                  scientific_name: tag.scientific_name || null,
                  category: tag.category || null,
                  depth: dive.max_depth_m || null,
                  observed_date: dive.date,
                  submitted_by: null,
                  created_at: null,
                }
              });
              console.log('[CommunitySync] syncDiveObservations: submitted observation for', tag.name);
            } catch (err) {
              console.log('[CommunitySync] syncDiveObservations: failed to submit observation for', tag.name, err);
            }
          }
        } catch (err) {
          console.log('[CommunitySync] syncDiveObservations: failed to get tags for photo', photoId, err);
        }
      }
      logger.info(`Community sync: synced observations for dive ${dive.date}`);
    } catch (err) {
      logger.error('Community sync: failed to sync observations:', err);
    }
  }, []);

  // Sync all observations for all dives that have species tags and a community site
  const syncAllObservations = useCallback(async (siteIdMap: Map<number, string>) => {
    if (siteIdMap.size === 0) return;
    try {
      const trips = await invoke<Array<{ id: number }>>('get_trips');
      let totalSynced = 0;

      for (const trip of trips) {
        const dives = await invoke<Array<{ id: number; dive_site_id?: number; date: string; max_depth_m: number }>>('get_dives_for_trip', { tripId: trip.id });
        for (const dive of dives) {
          if (!dive.dive_site_id) continue;
          const communitySiteId = siteIdMap.get(dive.dive_site_id);
          if (!communitySiteId) continue;

          const photos = await invoke<Array<{ id: number }>>('get_photos_for_dive', { diveId: dive.id });
          for (const photo of photos) {
            try {
              const tags = await invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId: photo.id });
              for (const tag of tags) {
                try {
                  await invoke('community_submit_observation', {
                    observation: {
                      id: null,
                      dive_site_id: communitySiteId,
                      species_name: tag.name,
                      scientific_name: tag.scientific_name || null,
                      category: tag.category || null,
                      depth: dive.max_depth_m || null,
                      observed_date: dive.date,
                      submitted_by: null,
                      created_at: null,
                    }
                  });
                  totalSynced++;
                } catch {
                  // Duplicate or network — skip
                }
              }
            } catch {
              // Failed to get tags for photo — skip
            }
          }
        }
      }
      if (totalSynced > 0) {
        logger.info(`Community sync: shared ${totalSynced} observations`);
      }
    } catch (err) {
      logger.error('Community sync: failed to sync observations:', err);
    }
  }, []);

  // Full sync: sites + observations. Guarded against concurrent runs.
  const runFullSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    const enabled = await checkEnabled();
    isEnabledRef.current = enabled;
    if (!enabled) return;

    isSyncingRef.current = true;
    try {
      console.log('[CommunitySync] sync starting...');
      const siteIdMap = await syncAllDiveSites();
      if (siteIdMap && siteIdMap.size > 0) {
        console.log('[CommunitySync] syncing observations...');
        await syncAllObservations(siteIdMap);
      }
      console.log('[CommunitySync] sync complete');
    } finally {
      isSyncingRef.current = false;
    }
  }, [checkEnabled, syncAllDiveSites, syncAllObservations]);

  // Run on app startup then periodically in the background
  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    // Initial sync
    runFullSync();

    // Periodic background sync
    const intervalId = setInterval(() => {
      runFullSync();
    }, BACKGROUND_SYNC_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [runFullSync]);

  // Keep enabled ref in sync with settings changes
  useEffect(() => {
    checkEnabled().then(enabled => {
      isEnabledRef.current = enabled;
    });
  }, [checkEnabled]);

  return {
    syncDiveSite,
    syncSpeciesObservation,
    syncDiveObservations,
    runFullSync,
    isEnabled: settings.communitySharing,
  };
}
