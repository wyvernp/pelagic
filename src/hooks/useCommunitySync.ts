import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import { useSettings } from '../components/SettingsModal';

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

  // Check if sharing is enabled and user is signed in
  const checkEnabled = useCallback(async (): Promise<boolean> => {
    if (!settings.communitySharing) return false;
    try {
      const token = await invoke<string | null>('get_secure_setting', { key: 'community_access_token' });
      return !!token;
    } catch {
      return false;
    }
  }, [settings.communitySharing]);

  // Sync all user-created dive sites to community (idempotent — duplicates rejected by Supabase)
  const syncAllDiveSites = useCallback(async () => {
    try {
      const sites = await invoke<DiveSite[]>('get_dive_sites');
      const userSites = sites.filter(s => s.is_user_created);
      if (userSites.length === 0) return;

      let synced = 0;
      for (const site of userSites) {
        try {
          await invoke('community_submit_dive_site', {
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
          synced++;
        } catch {
          // Likely duplicate or network issue — skip silently
        }
      }
      if (synced > 0) {
        logger.info(`Community sync: shared ${synced} dive sites`);
      }
    } catch (err) {
      logger.error('Community sync failed:', err);
    }
  }, []);

  // Sync a single dive site (call after creating one)
  const syncDiveSite = useCallback(async (name: string, lat: number, lon: number) => {
    if (!isEnabledRef.current) return;
    try {
      await invoke('community_submit_dive_site', {
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
      logger.info(`Community sync: shared site "${name}"`);
    } catch {
      // Duplicate or network — silent
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
  // Fetches species tags from the dive's photos, then submits each as an observation
  const syncDiveObservations = useCallback(async (dive: DiveContext, photoIds: number[]) => {
    if (!isEnabledRef.current) return;
    if (!dive.dive_site_id) return; // Can't submit without a community site

    // Get the community dive sites to find the matching Supabase site ID
    // We need to match local dive_site_id to community site by name/coords
    try {
      const localSite = await invoke<{ id: number; name: string; lat: number; lon: number } | null>('get_dive_site', { id: dive.dive_site_id });
      if (!localSite) return;

      // Find matching community site
      const communitySites = await invoke<Array<{ id: string; name: string; lat: number; lon: number }>>('community_get_nearby_dive_sites', {
        lat: localSite.lat,
        lon: localSite.lon,
        radiusKm: 0.5,
      });
      if (communitySites.length === 0) return;

      const communitySiteId = communitySites[0].id;

      // Get species tags for these photos
      for (const photoId of photoIds) {
        try {
          const tags = await invoke<SpeciesTag[]>('get_species_tags_for_photo', { photoId });
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
            } catch {
              // Duplicate or network — skip
            }
          }
        } catch {
          // Failed to get tags for photo
        }
      }
      logger.info(`Community sync: synced observations for dive ${dive.date}`);
    } catch (err) {
      logger.error('Community sync: failed to sync observations:', err);
    }
  }, []);

  // Run on app startup: sync all sites if enabled
  useEffect(() => {
    if (hasSyncedRef.current) return;

    const doStartupSync = async () => {
      const enabled = await checkEnabled();
      isEnabledRef.current = enabled;
      if (!enabled) return;

      hasSyncedRef.current = true;
      logger.info('Community sync: startup sync starting...');
      await syncAllDiveSites();
      logger.info('Community sync: startup sync complete');
    };

    doStartupSync();
  }, [checkEnabled, syncAllDiveSites]);

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
    isEnabled: settings.communitySharing,
  };
}
