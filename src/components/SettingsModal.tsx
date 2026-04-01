import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { logger } from '../utils/logger';
import { useUIStore } from '../stores/uiStore';
import type { ImageEditor } from '../types';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface AppSettings {
  thumbnailSize: 'small' | 'medium' | 'large';
  showFilenames: boolean;
  showRatings: boolean;
  // geminiApiKey is now stored securely via Tauri, not in localStorage
  defaultImageEditor: string; // Path to default editor, empty = system default
  diveNamePrefix: string; // Prefix for dive names, e.g., "Dive", "#", ".", etc.
  hasCompletedWelcome: boolean; // Whether user has completed the welcome setup
  hasCompletedSetup: boolean; // Whether user has completed the setup wizard
  communitySharing: boolean; // Whether user has opted in to community data sharing
}

const DEFAULT_SETTINGS: AppSettings = {
  thumbnailSize: 'medium',
  showFilenames: true,
  showRatings: true,
  defaultImageEditor: '',
  diveNamePrefix: 'Dive',
  hasCompletedWelcome: false,
  hasCompletedSetup: false,
  communitySharing: false,
};

// Format dive name based on prefix type
function formatDivePreview(prefix: string, num: number): string {
  if (!prefix) return String(num);
  if (prefix === '#') return `#${num}`;
  if (prefix === '.') return `${num}.`;
  return `${prefix} ${num}`;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<string | null>(null);
  const [detectedEditors, setDetectedEditors] = useState<ImageEditor[]>([]);
  const [loadingEditors, setLoadingEditors] = useState(false);
  const [inatUsername, setInatUsername] = useState<string | null>(null);
  const [inatConnecting, setInatConnecting] = useState(false);
  const [inatClientId, setInatClientId] = useState('');
  const [inatClientSecret, setInatClientSecret] = useState('');
  const [inatError, setInatError] = useState<string | null>(null);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const [communityEmail, setCommunityEmail] = useState('');
  const [communityPassword, setCommunityPassword] = useState('');
  const [communityUser, setCommunityUser] = useState<string | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityStats, setCommunityStats] = useState<{ total_sites: number; total_observations: number; total_species: number } | null>(null);
  
  const resetTour = useUIStore((state) => state.resetTour);

  const openExternalUrl = async (url: string) => {
    try {
      await invoke('open_url', { url });
    } catch (error) {
      logger.error('Failed to open URL:', error);
    }
  };

  useEffect(() => {
    // Load settings from localStorage
    const stored = localStorage.getItem('pelagic-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Extract geminiApiKey if it exists in old localStorage (for migration)
        const { geminiApiKey: oldApiKey, ...otherSettings } = parsed;
        setSettings({ ...DEFAULT_SETTINGS, ...otherSettings });
        
        // Migrate API key from localStorage to secure storage if present
        if (oldApiKey) {
          invoke('set_secure_setting', { key: 'geminiApiKey', value: oldApiKey })
            .then(() => {
              setGeminiApiKey(oldApiKey);
              // Remove API key from localStorage after successful migration
              const cleanSettings = { ...DEFAULT_SETTINGS, ...otherSettings };
              localStorage.setItem('pelagic-settings', JSON.stringify(cleanSettings));
              logger.info('Migrated API key to secure storage');
            })
            .catch((error) => {
              logger.error('Failed to migrate API key to secure storage:', error);
              // Still show the key in the UI so user doesn't lose it
              setGeminiApiKey(oldApiKey);
            });
        }
      } catch {
        // Use defaults if parse fails
      }
    }
    
    // Load API key from secure storage
    if (isOpen) {
      invoke<string | null>('get_secure_setting', { key: 'geminiApiKey' })
        .then((key) => {
          if (key) {
            setGeminiApiKey(key);
          }
        })
        .catch((error) => {
          logger.error('Failed to load API key from secure storage:', error);
        });
      
      // Detect installed editors when modal opens
      setLoadingEditors(true);
      invoke<ImageEditor[]>('detect_image_editors')
        .then((editors) => {
          setDetectedEditors(editors);
        })
        .catch((error) => {
          logger.error('Failed to detect image editors:', error);
        })
        .finally(() => {
          setLoadingEditors(false);
        });

      // Load iNaturalist connection state
      invoke<string | null>('inat_get_username')
        .then((username) => setInatUsername(username))
        .catch(() => setInatUsername(null));
      
      // Load iNat client credentials
      invoke<string | null>('get_secure_setting', { key: 'inatClientId' })
        .then((val) => setInatClientId(val || ''))
        .catch(() => {});
      invoke<string | null>('get_secure_setting', { key: 'inatClientSecret' })
        .then((val) => setInatClientSecret(val || ''))
        .catch(() => {});

      // Load community account state
      invoke<string | null>('get_secure_setting', { key: 'community_email' })
        .then((email) => setCommunityUser(email))
        .catch(() => setCommunityUser(null));
      
      // Load community stats
      invoke<{ total_sites: number; total_observations: number; total_species: number }>('community_get_stats')
        .then((stats) => setCommunityStats(stats))
        .catch(() => {});
    }
  }, [isOpen]);

  const handleCommunitySignUp = async () => {
    if (!communityEmail || !communityPassword) return;
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const result = await invoke<{ access_token: string; refresh_token: string; user: { email: string | null } }>('community_sign_up', { email: communityEmail, password: communityPassword });
      await invoke('set_secure_setting', { key: 'community_access_token', value: result.access_token });
      await invoke('set_secure_setting', { key: 'community_refresh_token', value: result.refresh_token });
      await invoke('set_secure_setting', { key: 'community_email', value: communityEmail });
      setCommunityUser(communityEmail);
      setCommunityPassword('');
    } catch (error) {
      setCommunityError(String(error));
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleCommunitySignIn = async () => {
    if (!communityEmail || !communityPassword) return;
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const result = await invoke<{ access_token: string; refresh_token: string; user: { email: string | null } }>('community_sign_in', { email: communityEmail, password: communityPassword });
      await invoke('set_secure_setting', { key: 'community_access_token', value: result.access_token });
      await invoke('set_secure_setting', { key: 'community_refresh_token', value: result.refresh_token });
      await invoke('set_secure_setting', { key: 'community_email', value: communityEmail });
      setCommunityUser(communityEmail);
      setCommunityPassword('');
    } catch (error) {
      setCommunityError(String(error));
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleCommunitySignOut = async () => {
    await invoke('set_secure_setting', { key: 'community_access_token', value: '' });
    await invoke('set_secure_setting', { key: 'community_refresh_token', value: '' });
    await invoke('set_secure_setting', { key: 'community_email', value: '' });
    setCommunityUser(null);
    setCommunityEmail('');
    setCommunityError(null);
  };

  const handleRescanAllExif = async () => {
    setRescanning(true);
    setRescanResult(null);
    try {
      const count = await invoke<number>('rescan_all_exif');
      setRescanResult(`✓ Rescanned EXIF data for ${count} photos`);
    } catch (error) {
      logger.error('Failed to rescan EXIF:', error);
      setRescanResult(`✗ Error: ${error}`);
    } finally {
      setRescanning(false);
    }
  };


  const handleImportDiveSites = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'CSV Files',
          extensions: ['csv']
        }]
      });

      if (selected) {
        setRescanning(true);
        setRescanResult(null);
        try {
          const count = await invoke<number>('import_dive_sites_csv', { csvPath: selected });
          setRescanResult(`✓ Imported ${count} dive sites`);
        } catch (error) {
          logger.error('Failed to import dive sites:', error);
          setRescanResult(`✗ Error: ${error}`);
        } finally {
          setRescanning(false);
        }
      }
    } catch (error) {
      logger.error('Failed to select CSV file:', error);
      setRescanResult(`✗ Error: ${error}`);
    }
  };

  const handleBrowseEditor = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Executable Files',
          extensions: ['exe', 'app', '']
        }]
      });

      if (selected) {
        handleChange('defaultImageEditor', selected);
      }
    } catch (error) {
      logger.error('Failed to select editor:', error);
    }
  };

  const handleEditorChange = (value: string) => {
    handleChange('defaultImageEditor', value);
  };

  // Get display name for current editor
  const getEditorDisplayName = (path: string): string => {
    if (!path) return 'System Default';
    const editor = detectedEditors.find(e => e.path === path);
    if (editor) return editor.name;
    // Extract filename from path for custom editors
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  };

  const handleSave = async () => {
    // Save non-sensitive settings to localStorage
    localStorage.setItem('pelagic-settings', JSON.stringify(settings));
    
    // Save API key to secure storage
    try {
      await invoke('set_secure_setting', { key: 'geminiApiKey', value: geminiApiKey });
    } catch (error) {
      logger.error('Failed to save API key to secure storage:', error);
    }

    // Save iNaturalist client credentials
    try {
      await invoke('set_secure_setting', { key: 'inatClientId', value: inatClientId });
      await invoke('set_secure_setting', { key: 'inatClientSecret', value: inatClientSecret });
    } catch (error) {
      logger.error('Failed to save iNat credentials:', error);
    }
    
    // Dispatch a custom event so useSettings hook can update in the same window
    window.dispatchEvent(new CustomEvent('pelagic-settings-changed'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleInatConnect = async () => {
    if (!inatClientId || !inatClientSecret) {
      setInatError('Please enter your iNaturalist Client ID and Secret first.');
      return;
    }
    setInatConnecting(true);
    setInatError(null);
    try {
      // Save credentials before starting flow
      await invoke('set_secure_setting', { key: 'inatClientId', value: inatClientId });
      await invoke('set_secure_setting', { key: 'inatClientSecret', value: inatClientSecret });

      const authUrl = await invoke<string>('inat_get_auth_url');
      await invoke('open_url', { url: authUrl });

      // Wait for callback (up to 120s)
      const username = await invoke<string>('inat_complete_auth');
      setInatUsername(username);
    } catch (error) {
      logger.error('iNaturalist connection failed:', error);
      setInatError(String(error));
    } finally {
      setInatConnecting(false);
    }
  };

  const handleInatDisconnect = async () => {
    try {
      await invoke('inat_disconnect');
      setInatUsername(null);
    } catch (error) {
      logger.error('Failed to disconnect iNaturalist:', error);
    }
  };

  const handleCreateBackup = async () => {
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const destPath = await save({
        title: 'Save Backup',
        defaultPath: `pelagic-backup-${timestamp}.zip`,
        filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      });
      if (!destPath) return;

      setBackupInProgress(true);
      setBackupResult(null);

      const result = await invoke<{ path: string; size_bytes: number; thumbnail_count: number }>('create_backup', { destPath });
      const sizeMb = (result.size_bytes / (1024 * 1024)).toFixed(1);
      setBackupResult(`✓ Backup saved (${sizeMb} MB, ${result.thumbnail_count} thumbnails)`);
    } catch (error) {
      logger.error('Backup failed:', error);
      setBackupResult(`✗ Backup failed: ${error}`);
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const zipPath = await open({
        title: 'Select Backup to Restore',
        multiple: false,
        filters: [{ name: 'Pelagic Backup', extensions: ['zip'] }],
      });
      if (!zipPath) return;

      // Read manifest to show confirmation
      const manifest = await invoke<{ app_version: string; created_at: string; db_size_bytes: number; thumbnail_count: number }>(
        'read_backup_manifest', { zipPath }
      );

      const date = new Date(manifest.created_at).toLocaleDateString();
      const sizeMb = (manifest.db_size_bytes / (1024 * 1024)).toFixed(1);
      const confirmed = window.confirm(
        `Restore from backup?\n\n` +
        `Created: ${date}\n` +
        `App version: ${manifest.app_version}\n` +
        `Database size: ${sizeMb} MB\n` +
        `Thumbnails: ${manifest.thumbnail_count}\n\n` +
        `⚠ This will replace your current database. A safety copy (.bak) will be kept.\n` +
        `The app will need to restart after restoring.`
      );
      if (!confirmed) return;

      setRestoreInProgress(true);
      setRestoreResult(null);

      const result = await invoke<{ thumbnails_restored: number }>('restore_backup', { zipPath });
      setRestoreResult(`✓ Restored successfully (${result.thumbnails_restored} thumbnails). Please restart the app.`);
    } catch (error) {
      logger.error('Restore failed:', error);
      setRestoreResult(`✗ Restore failed: ${error}`);
    } finally {
      setRestoreInProgress(false);
    }
  };

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3 className="settings-section-title">Display</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Thumbnail Size</span>
                <span className="setting-desc">Size of photo thumbnails in the grid</span>
              </label>
              <select
                className="setting-select"
                value={settings.thumbnailSize}
                onChange={(e) => handleChange('thumbnailSize', e.target.value as AppSettings['thumbnailSize'])}
              >
                <option value="small">Small (120px)</option>
                <option value="medium">Medium (180px)</option>
                <option value="large">Large (240px)</option>
              </select>
            </div>

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Show Filenames</span>
                <span className="setting-desc">Display filename below thumbnails</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.showFilenames}
                  onChange={(e) => handleChange('showFilenames', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Show Ratings</span>
                <span className="setting-desc">Display star ratings on thumbnails</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.showRatings}
                  onChange={(e) => handleChange('showRatings', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Dive Naming</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Dive Name Prefix</span>
                <span className="setting-desc">How to label your dives (e.g., "Dive 1", "1.", "#1")</span>
              </label>
              <select
                className="setting-select"
                value={['Dive', '#', 'No.', '.', ''].includes(settings.diveNamePrefix) ? settings.diveNamePrefix : '_custom'}
                onChange={(e) => {
                  if (e.target.value === '_custom') {
                    // Set to a placeholder to show the custom input field
                    handleChange('diveNamePrefix', 'Custom');
                  } else {
                    handleChange('diveNamePrefix', e.target.value);
                  }
                }}
              >
                <option value="Dive">Dive 1, Dive 2...</option>
                <option value="#">#1, #2...</option>
                <option value="No.">No. 1, No. 2...</option>
                <option value=".">1., 2., 3....</option>
                <option value="">1, 2, 3...</option>
                <option value="_custom">Custom...</option>
              </select>
            </div>

            {!['Dive', '#', 'No.', '.', ''].includes(settings.diveNamePrefix) && (
              <div className="setting-row">
                <label className="setting-label">
                  <span className="setting-name">Custom Prefix</span>
                  <span className="setting-desc">Enter your own dive name prefix</span>
                </label>
                <input
                  type="text"
                  className="setting-input"
                  value={settings.diveNamePrefix}
                  onChange={(e) => handleChange('diveNamePrefix', e.target.value)}
                  placeholder="Enter prefix..."
                />
              </div>
            )}

            <div className="setting-hint">
              Preview: <strong>{formatDivePreview(settings.diveNamePrefix, 1)}</strong>, <strong>{formatDivePreview(settings.diveNamePrefix, 2)}</strong>, etc.
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Maintenance</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Rescan EXIF Data</span>
                <span className="setting-desc">Re-read camera metadata (aperture, ISO, etc.) from all photos</span>
              </label>
              <button 
                className="btn btn-secondary"
                onClick={handleRescanAllExif}
                disabled={rescanning}
              >
                {rescanning ? 'Rescanning...' : 'Rescan All'}
              </button>
            </div>
            {rescanResult && (
              <div className={`rescan-result ${rescanResult.startsWith('✓') ? 'success' : 'error'}`}>
                {rescanResult}
              </div>
            )}


          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Backup & Restore</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Create Backup</span>
                <span className="setting-desc">Export your database and thumbnails to a zip file. Photo originals are not included.</span>
              </label>
              <button 
                className="btn btn-secondary"
                onClick={handleCreateBackup}
                disabled={backupInProgress || restoreInProgress}
              >
                {backupInProgress ? 'Backing up...' : 'Backup'}
              </button>
            </div>
            {backupResult && (
              <div className={`rescan-result ${backupResult.startsWith('✓') ? 'success' : 'error'}`}>
                {backupResult}
              </div>
            )}

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Restore from Backup</span>
                <span className="setting-desc">Replace your current database with a previous backup. The app will restart.</span>
              </label>
              <button 
                className="btn btn-secondary"
                onClick={handleRestoreBackup}
                disabled={backupInProgress || restoreInProgress}
              >
                {restoreInProgress ? 'Restoring...' : 'Restore'}
              </button>
            </div>
            {restoreResult && (
              <div className={`rescan-result ${restoreResult.startsWith('✓') ? 'success' : 'error'}`}>
                {restoreResult}
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Dive Sites</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Import Dive Sites</span>
                <span className="setting-desc">Import dive site locations from CSV file (name, lat, lon)</span>
              </label>
              <button 
                className="btn btn-secondary"
                onClick={handleImportDiveSites}
                disabled={rescanning}
              >
                Import CSV
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">External Editor</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Default Image Editor</span>
                <span className="setting-desc">Choose an application to open photos for editing</span>
              </label>
              <div className="setting-editor-controls">
                <select
                  className="setting-select"
                  value={settings.defaultImageEditor}
                  onChange={(e) => handleEditorChange(e.target.value)}
                  disabled={loadingEditors}
                >
                  <option value="">System Default</option>
                  {detectedEditors.map((editor) => (
                    <option key={editor.path} value={editor.path}>
                      {editor.name}
                    </option>
                  ))}
                  {settings.defaultImageEditor && !detectedEditors.find(e => e.path === settings.defaultImageEditor) && (
                    <option value={settings.defaultImageEditor}>
                      {getEditorDisplayName(settings.defaultImageEditor)}
                    </option>
                  )}
                </select>
                <button 
                  className="btn btn-secondary btn-small"
                  onClick={handleBrowseEditor}
                  title="Browse for editor..."
                >
                  Browse...
                </button>
              </div>
            </div>
            {loadingEditors && (
              <div className="setting-hint">Detecting installed editors...</div>
            )}
            {!loadingEditors && detectedEditors.length === 0 && (
              <div className="setting-hint">No common image editors detected. Use Browse to select one.</div>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">AI Species Identification</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Google Gemini API Key</span>
                <span className="setting-desc">Required for AI-powered species identification. Get yours at <a href="#" onClick={(e) => { e.preventDefault(); openExternalUrl('https://aistudio.google.com/apikey'); }}>Google AI Studio</a></span>
              </label>
              <input
                type="password"
                className="setting-input"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Enter API key..."
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Citizen Science</h3>
            <p className="setting-desc" style={{ marginBottom: '12px' }}>
              Connect to iNaturalist to submit marine species sightings. GBIF and OBIS enrichment data is fetched automatically for all species tags.
            </p>

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">iNaturalist Client ID</span>
                <span className="setting-desc">From your <a href="#" onClick={(e) => { e.preventDefault(); openExternalUrl('https://www.inaturalist.org/oauth/applications'); }}>iNaturalist app settings</a></span>
              </label>
              <input
                type="text"
                className="setting-input"
                value={inatClientId}
                onChange={(e) => setInatClientId(e.target.value)}
                placeholder="Your app Client ID..."
              />
            </div>

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">iNaturalist Client Secret</span>
                <span className="setting-desc">Keep this confidential</span>
              </label>
              <input
                type="password"
                className="setting-input"
                value={inatClientSecret}
                onChange={(e) => setInatClientSecret(e.target.value)}
                placeholder="Your app Client Secret..."
              />
            </div>

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">iNaturalist Account</span>
                <span className="setting-desc">
                  {inatUsername 
                    ? <>Connected as <strong>{inatUsername}</strong></>
                    : 'Not connected'}
                </span>
              </label>
              {inatUsername ? (
                <button className="btn btn-secondary" onClick={handleInatDisconnect}>
                  Disconnect
                </button>
              ) : (
                <button 
                  className="btn btn-primary" 
                  onClick={handleInatConnect}
                  disabled={inatConnecting || !inatClientId || !inatClientSecret}
                >
                  {inatConnecting ? 'Waiting for auth...' : 'Connect'}
                </button>
              )}
            </div>
            {inatError && (
              <div className="rescan-result error">{inatError}</div>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Community</h3>
            <p className="setting-desc" style={{ marginBottom: '12px' }}>
              Contribute your dive sites and species observations to a shared community database. When enabled, your data syncs automatically — no manual steps needed.
            </p>

            {communityStats && (
              <div className="setting-row" style={{ justifyContent: 'flex-start', gap: '24px', marginBottom: '8px' }}>
                <span className="setting-desc"><strong>{communityStats.total_sites}</strong> dive sites</span>
                <span className="setting-desc"><strong>{communityStats.total_observations}</strong> observations</span>
                <span className="setting-desc"><strong>{communityStats.total_species}</strong> species</span>
              </div>
            )}

            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Community Sharing</span>
                <span className="setting-desc">
                  {settings.communitySharing
                    ? 'Your dive sites and species sightings sync automatically'
                    : 'Enable to share your dive data with the community'}
                </span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.communitySharing}
                  onChange={(e) => handleChange('communitySharing', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {settings.communitySharing && (
              <>
                {communityUser ? (
                  <div className="setting-row">
                    <label className="setting-label">
                      <span className="setting-name">Community Account</span>
                      <span className="setting-desc">Signed in as <strong>{communityUser}</strong>. Data syncs on app start and when you create dive sites or tag species.</span>
                    </label>
                    <button className="btn btn-secondary" onClick={handleCommunitySignOut}>
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="setting-desc" style={{ marginBottom: '8px' }}>
                      Create an account or sign in to start sharing. Your email is only used for authentication.
                    </p>
                    <div className="setting-row">
                      <label className="setting-label">
                        <span className="setting-name">Email</span>
                      </label>
                      <input
                        type="email"
                        className="setting-input"
                        value={communityEmail}
                        onChange={(e) => setCommunityEmail(e.target.value)}
                        placeholder="your@email.com"
                      />
                    </div>
                    <div className="setting-row">
                      <label className="setting-label">
                        <span className="setting-name">Password</span>
                      </label>
                      <input
                        type="password"
                        className="setting-input"
                        value={communityPassword}
                        onChange={(e) => setCommunityPassword(e.target.value)}
                        placeholder="Password (min 6 chars)"
                      />
                    </div>
                    <div className="setting-row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={handleCommunitySignUp}
                        disabled={communityLoading || !communityEmail || communityPassword.length < 6}
                      >
                        {communityLoading ? 'Working...' : 'Sign Up'}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleCommunitySignIn}
                        disabled={communityLoading || !communityEmail || !communityPassword}
                      >
                        {communityLoading ? 'Working...' : 'Sign In'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {communityError && (
              <div className="rescan-result error">{communityError}</div>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Help</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">App Tutorial</span>
                <span className="setting-desc">Restart the walkthrough tour to learn about Pelagic's features</span>
              </label>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  resetTour();
                  onClose();
                }}
              >
                🎓 Restart Tutorial
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">About</h3>
            <div className="about-info">
              <p><strong>Pelagic</strong> - Dive Photo Manager</p>
              <p className="version">Version 0.2.10</p>
              <p className="credits">Built with Tauri + React</p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook to use settings throughout the app
export function useSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Initialize from localStorage immediately
    const stored = localStorage.getItem('pelagic-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Remove geminiApiKey from parsed settings (it's now stored securely)
        const { geminiApiKey: _, ...cleanSettings } = parsed;
        return { ...DEFAULT_SETTINGS, ...cleanSettings };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    const loadSettings = () => {
      const stored = localStorage.getItem('pelagic-settings');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Remove geminiApiKey from parsed settings (it's now stored securely)
          const { geminiApiKey: _, ...cleanSettings } = parsed;
          setSettings({ ...DEFAULT_SETTINGS, ...cleanSettings });
        } catch {
          // Use defaults
        }
      }
    };

    // Listen for storage changes from other windows
    window.addEventListener('storage', loadSettings);
    // Listen for custom event from same window
    window.addEventListener('pelagic-settings-changed', loadSettings);
    
    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('pelagic-settings-changed', loadSettings);
    };
  }, []);

  return settings;
}

// Hook to get the Gemini API key from secure storage
// Returns { apiKey, loading, error } - components should check loading state
export function useGeminiApiKey(): { apiKey: string; loading: boolean; error: string | null } {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        setLoading(true);
        setError(null);
        const key = await invoke<string | null>('get_secure_setting', { key: 'geminiApiKey' });
        setApiKey(key || '');
      } catch (err) {
        setError(String(err));
        logger.error('Failed to load API key from secure storage:', err);
      } finally {
        setLoading(false);
      }
    };

    loadApiKey();

    // Listen for settings changes to reload API key
    const handleSettingsChanged = () => {
      loadApiKey();
    };

    window.addEventListener('pelagic-settings-changed', handleSettingsChanged);
    
    return () => {
      window.removeEventListener('pelagic-settings-changed', handleSettingsChanged);
    };
  }, []);

  return { apiKey, loading, error };
}
