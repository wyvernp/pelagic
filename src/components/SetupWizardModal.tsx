import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { logger } from '../utils/logger';
import type { ImageEditor } from '../types';
import type { AppSettings } from './SettingsModal';
import './SetupWizardModal.css';

interface SetupWizardModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const TOTAL_STEPS = 5;

const PREFIX_OPTIONS = [
  { prefix: 'Dive', label: 'Dive 1', desc: 'English' },
  { prefix: 'Plongée', label: 'Plongée 1', desc: 'French' },
  { prefix: 'Inmersión', label: 'Inmersión 1', desc: 'Spanish' },
  { prefix: 'Tauchen', label: 'Tauchen 1', desc: 'German' },
  { prefix: '#', label: '#1', desc: 'Hash' },
  { prefix: '', label: '1, 2, 3...', desc: 'Number only' },
];

function formatDivePreview(prefix: string, num: number): string {
  if (!prefix) return String(num);
  if (prefix === '#') return `#${num}`;
  if (prefix === '.') return `${num}.`;
  return `${prefix} ${num}`;
}

export function SetupWizardModal({ isOpen, onComplete }: SetupWizardModalProps) {
  const [step, setStep] = useState(0);

  // Step 0: Storage location
  const [storagePath, setStoragePath] = useState('');
  const [defaultStoragePath, setDefaultStoragePath] = useState('');
  const [storagePathChanged, setStoragePathChanged] = useState(false);

  // Step 1: Dive prefix
  const [selectedPrefix, setSelectedPrefix] = useState('Dive');
  const [customPrefix, setCustomPrefix] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // Step 2: Thumbnail size
  const [thumbnailSize, setThumbnailSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Step 3: Image editor
  const [defaultImageEditor, setDefaultImageEditor] = useState('');
  const [detectedEditors, setDetectedEditors] = useState<ImageEditor[]>([]);
  const [loadingEditors, setLoadingEditors] = useState(false);

  // Step 4: Gemini API key
  const [geminiApiKey, setGeminiApiKey] = useState('');

  // Load initial data when opened
  useEffect(() => {
    if (!isOpen) return;

    // Reset step
    setStep(0);

    // Load current storage path
    invoke<string>('get_storage_path')
      .then((path) => {
        setStoragePath(path);
        setDefaultStoragePath(path);
        setStoragePathChanged(false);
      })
      .catch((err) => {
        logger.error('Failed to get storage path:', err);
      });

    // Load current settings (dive prefix may have been set in welcome modal)
    const stored = localStorage.getItem('pelagic-settings');
    if (stored) {
      try {
        const settings = JSON.parse(stored) as AppSettings;
        if (settings.diveNamePrefix) {
          const isPreset = PREFIX_OPTIONS.some(o => o.prefix === settings.diveNamePrefix);
          if (isPreset) {
            setSelectedPrefix(settings.diveNamePrefix);
            setUseCustom(false);
          } else {
            setCustomPrefix(settings.diveNamePrefix);
            setUseCustom(true);
          }
        }
        if (settings.thumbnailSize) {
          setThumbnailSize(settings.thumbnailSize);
        }
        if (settings.defaultImageEditor) {
          setDefaultImageEditor(settings.defaultImageEditor);
        }
      } catch {
        // ignore
      }
    }

    // Load existing API key
    invoke<string | null>('get_secure_setting', { key: 'geminiApiKey' })
      .then((key) => {
        if (key) setGeminiApiKey(key);
      })
      .catch(() => {});

    // Detect editors
    setLoadingEditors(true);
    invoke<ImageEditor[]>('detect_image_editors')
      .then(setDetectedEditors)
      .catch(() => {})
      .finally(() => setLoadingEditors(false));
  }, [isOpen]);

  const handleBrowseStorage = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose data storage location',
      });
      if (selected && typeof selected === 'string') {
        setStoragePath(selected);
        setStoragePathChanged(selected !== defaultStoragePath);
      }
    } catch (err) {
      logger.error('Failed to browse for storage path:', err);
    }
  }, [defaultStoragePath]);

  const handleBrowseEditor = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Executable Files',
          extensions: ['exe', 'app', ''],
        }],
      });
      if (selected && typeof selected === 'string') {
        setDefaultImageEditor(selected);
      }
    } catch (err) {
      logger.error('Failed to browse for editor:', err);
    }
  }, []);

  const handlePrefixClick = useCallback((prefix: string) => {
    setSelectedPrefix(prefix);
    setUseCustom(false);
  }, []);

  const handleFinish = useCallback(async () => {
    try {
      // 1. Save storage path if changed
      if (storagePathChanged && storagePath !== defaultStoragePath) {
        await invoke('set_storage_path', { path: storagePath });
      }

      // 2. Save all localStorage settings
      const stored = localStorage.getItem('pelagic-settings');
      const settings: AppSettings = stored
        ? { ...JSON.parse(stored) }
        : {
            thumbnailSize: 'medium',
            showFilenames: true,
            showRatings: true,
            defaultImageEditor: '',
            diveNamePrefix: 'Dive',
            hasCompletedWelcome: true,
            hasCompletedSetup: false,
          };

      const effectivePrefix = useCustom ? customPrefix.trim() : selectedPrefix;
      settings.diveNamePrefix = effectivePrefix || 'Dive';
      settings.thumbnailSize = thumbnailSize;
      settings.defaultImageEditor = defaultImageEditor;
      settings.hasCompletedSetup = true;

      localStorage.setItem('pelagic-settings', JSON.stringify(settings));

      // 3. Save API key if provided
      if (geminiApiKey.trim()) {
        await invoke('set_secure_setting', { key: 'geminiApiKey', value: geminiApiKey.trim() });
      }

      // 4. Notify the app that settings changed
      window.dispatchEvent(new Event('pelagic-settings-changed'));

      // 5. Complete
      onComplete();

      // 6. If storage path changed, warn about restart
      if (storagePathChanged && storagePath !== defaultStoragePath) {
        // The new path will take effect on next launch since the DB pool
        // was created at startup with the old path
        alert('Storage location updated. Please restart the app for the change to take full effect.');
      }
    } catch (err) {
      logger.error('Failed to save setup wizard settings:', err);
    }
  }, [
    storagePath, defaultStoragePath, storagePathChanged,
    useCustom, customPrefix, selectedPrefix,
    thumbnailSize, defaultImageEditor, geminiApiKey,
    onComplete,
  ]);

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      await invoke('open_url', { url });
    } catch (error) {
      logger.error('Failed to open URL:', error);
    }
  }, []);

  if (!isOpen) return null;

  const effectivePrefix = useCustom ? customPrefix : selectedPrefix;

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h3 className="setup-step-title">Data Storage Location</h3>
            <p className="setup-step-description">
              Choose where Pelagic stores your database, thumbnails, and cached data.
              The default location works well for most users.
            </p>
            <div className="storage-path-display">
              <div className="storage-path-value">{storagePath || 'Loading...'}</div>
              <button className="btn btn-secondary" onClick={handleBrowseStorage}>
                Browse...
              </button>
            </div>
            {storagePathChanged && (
              <div className="storage-info">
                <strong>Note:</strong> Changing the storage location requires an app restart to take full effect.
                Your existing data at the default location will not be moved automatically.
              </div>
            )}
            <div className="storage-info" style={{ marginTop: 8 }}>
              This folder will contain your dive database and photo thumbnails.
              Original photo files stay wherever they are on your computer.
            </div>
          </>
        );

      case 1:
        return (
          <>
            <h3 className="setup-step-title">Dive Naming</h3>
            <p className="setup-step-description">
              How would you like your dives to be labeled? This sets the prefix used throughout the app.
            </p>
            <div className="setup-prefix-options">
              {PREFIX_OPTIONS.map((option) => (
                <button
                  key={option.desc}
                  className={`setup-prefix-option ${!useCustom && selectedPrefix === option.prefix ? 'selected' : ''}`}
                  onClick={() => handlePrefixClick(option.prefix)}
                >
                  <span className="prefix-name">{option.label}</span>
                  <span className="prefix-desc">{option.desc}</span>
                </button>
              ))}
            </div>
            <div className="setup-custom-input">
              <input
                type="text"
                placeholder="Or type a custom prefix..."
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                onFocus={() => setUseCustom(true)}
              />
            </div>
            <div className="setup-preview-box">
              Your dives will appear as: <strong>{formatDivePreview(effectivePrefix, 1)}</strong>, <strong>{formatDivePreview(effectivePrefix, 2)}</strong>, <strong>{formatDivePreview(effectivePrefix, 3)}</strong>...
            </div>
          </>
        );

      case 2:
        return (
          <>
            <h3 className="setup-step-title">Thumbnail Size</h3>
            <p className="setup-step-description">
              Choose how large photo thumbnails appear in the content grid.
            </p>
            <div className="thumbnail-options">
              {([
                { value: 'small' as const, label: 'Small', size: '120px', px: 50 },
                { value: 'medium' as const, label: 'Medium', size: '180px', px: 70 },
                { value: 'large' as const, label: 'Large', size: '240px', px: 90 },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  className={`thumbnail-option ${thumbnailSize === opt.value ? 'selected' : ''}`}
                  onClick={() => setThumbnailSize(opt.value)}
                >
                  <div
                    className="thumbnail-preview"
                    style={{ width: opt.px, height: opt.px }}
                  >
                    📷
                  </div>
                  <span className="thumbnail-option-label">{opt.label}</span>
                  <span className="thumbnail-option-size">{opt.size}</span>
                </button>
              ))}
            </div>
            <div className="setup-preview-box">
              You can change this anytime in Settings.
            </div>
          </>
        );

      case 3:
        return (
          <>
            <h3 className="setup-step-title">Default Image Editor</h3>
            <p className="setup-step-description">
              Optionally choose an application to open photos for editing.
              If not set, photos will open with your system's default viewer.
            </p>
            <div className="editor-path-display">
              <div className="editor-path-value">
                {defaultImageEditor ? (
                  getEditorDisplayName(defaultImageEditor)
                ) : (
                  <span className="editor-path-placeholder">System Default</span>
                )}
              </div>
              <button className="btn btn-secondary" onClick={handleBrowseEditor}>
                Browse...
              </button>
              {defaultImageEditor && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setDefaultImageEditor('')}
                  title="Clear selection"
                >
                  ✕
                </button>
              )}
            </div>
            {!loadingEditors && detectedEditors.length > 0 && (
              <div className="editor-detected-list">
                <h4>Detected editors:</h4>
                {detectedEditors.map((editor) => (
                  <button
                    key={editor.path}
                    className={`editor-detected-item ${defaultImageEditor === editor.path ? 'selected' : ''}`}
                    onClick={() => setDefaultImageEditor(editor.path)}
                  >
                    <span className="editor-detected-name">{editor.name}</span>
                  </button>
                ))}
              </div>
            )}
            {loadingEditors && (
              <div className="setup-skip-hint">Detecting installed editors...</div>
            )}
            <div className="setup-skip-hint">
              This step is optional. You can always set this later in Settings.
            </div>
          </>
        );

      case 4:
        return (
          <>
            <h3 className="setup-step-title">AI Species Identification</h3>
            <p className="setup-step-description">
              Pelagic can use Google's Gemini AI to automatically identify marine species in your photos.
              This requires a free API key from Google AI Studio.
            </p>
            <div className="api-key-input-group">
              <label>Google Gemini API Key</label>
              <input
                type="password"
                className="setup-input"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Enter API key..."
              />
            </div>
            <a
              className="api-key-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl('https://aistudio.google.com/apikey');
              }}
            >
              Get a free API key from Google AI Studio →
            </a>
            <div className="setup-skip-hint">
              This step is optional. You can always add or change it later in Settings.
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const getEditorDisplayName = (path: string): string => {
    if (!path) return 'System Default';
    const editor = detectedEditors.find(e => e.path === path);
    if (editor) return editor.name;
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard">
        <div className="setup-wizard-header">
          <div className="setup-step-label">Setup — Step {step + 1} of {TOTAL_STEPS}</div>
          <h2>Configure Pelagic</h2>
          <div className="setup-wizard-steps">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div
                  className={`setup-step-dot ${
                    i === step ? 'active' : i < step ? 'completed' : ''
                  }`}
                />
                {i < TOTAL_STEPS - 1 && (
                  <div className={`setup-step-line ${i < step ? 'completed' : ''}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="setup-wizard-body">
          {renderStepContent()}
        </div>

        <div className="setup-wizard-footer">
          <div className="setup-footer-left">
            {step > 0 && (
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            )}
          </div>
          <div className="setup-footer-right">
            {step < TOTAL_STEPS - 1 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
                Next →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleFinish}>
                Finish Setup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
