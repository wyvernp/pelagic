import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface AppSettings {
  thumbnailSize: 'small' | 'medium' | 'large';
  showFilenames: boolean;
  showRatings: boolean;
  geminiApiKey: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  thumbnailSize: 'medium',
  showFilenames: true,
  showRatings: true,
  geminiApiKey: '',
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<string | null>(null);

  useEffect(() => {
    // Load settings from localStorage
    const stored = localStorage.getItem('pelagic-settings');
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch {
        // Use defaults if parse fails
      }
    }
  }, [isOpen]);

  const handleRescanAllExif = async () => {
    setRescanning(true);
    setRescanResult(null);
    try {
      const count = await invoke<number>('rescan_all_exif');
      setRescanResult(`✓ Rescanned EXIF data for ${count} photos`);
    } catch (error) {
      console.error('Failed to rescan EXIF:', error);
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
          console.error('Failed to import dive sites:', error);
          setRescanResult(`✗ Error: ${error}`);
        } finally {
          setRescanning(false);
        }
      }
    } catch (error) {
      console.error('Failed to select CSV file:', error);
      setRescanResult(`✗ Error: ${error}`);
    }
  };

  const handleSave = () => {
    localStorage.setItem('pelagic-settings', JSON.stringify(settings));
    // Dispatch a custom event so useSettings hook can update in the same window
    window.dispatchEvent(new CustomEvent('pelagic-settings-changed'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <h3 className="settings-section-title">AI Species Identification</h3>
            
            <div className="setting-row">
              <label className="setting-label">
                <span className="setting-name">Google Gemini API Key</span>
                <span className="setting-desc">Required for AI-powered species identification. Get yours at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></span>
              </label>
              <input
                type="password"
                className="setting-input"
                value={settings.geminiApiKey}
                onChange={(e) => handleChange('geminiApiKey', e.target.value)}
                placeholder="Enter API key..."
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">About</h3>
            <div className="about-info">
              <p><strong>Pelagic</strong> - Dive Photo Manager</p>
              <p className="version">Version 0.1.0</p>
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
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
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
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
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
