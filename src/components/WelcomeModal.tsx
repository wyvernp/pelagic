import { useState } from 'react';
import './WelcomeModal.css';

interface WelcomeModalProps {
  isOpen: boolean;
  onComplete: (diveNamePrefix: string) => void;
}

const PRESET_OPTIONS = [
  { prefix: 'Dive', language: 'English' },
  { prefix: 'Plongée', language: 'French' },
  { prefix: 'Tauchgang', language: 'German' },
  { prefix: 'Buceo', language: 'Spanish' },
  { prefix: 'Duik', language: 'Dutch' },
  { prefix: 'Immersione', language: 'Italian' },
  { prefix: '', language: 'Number only' },
];

export function WelcomeModal({ isOpen, onComplete }: WelcomeModalProps) {
  const [selectedPrefix, setSelectedPrefix] = useState('Dive');
  const [customPrefix, setCustomPrefix] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  if (!isOpen) return null;

  const effectivePrefix = useCustom ? customPrefix : selectedPrefix;

  const handlePresetClick = (prefix: string) => {
    setSelectedPrefix(prefix);
    setUseCustom(false);
  };

  const handleCustomFocus = () => {
    setUseCustom(true);
  };

  const handleComplete = () => {
    const prefix = useCustom ? customPrefix.trim() : selectedPrefix;
    onComplete(prefix);
  };

  return (
    <div className="welcome-modal-overlay">
      <div className="welcome-modal">
        <div className="welcome-header">
          <div className="welcome-logo">🤿</div>
          <h1>Welcome to Pelagic</h1>
          <p>Your dive photo management companion</p>
        </div>

        <div className="welcome-body">
          <div className="welcome-section">
            <h3>How would you like to name your dives?</h3>
            <p>
              Choose how your dives will be labeled throughout the app. 
              You can change this later in Settings.
            </p>

            <div className="dive-prefix-options">
              {PRESET_OPTIONS.map((option) => (
                <button
                  key={option.language}
                  className={`prefix-option ${!useCustom && selectedPrefix === option.prefix ? 'selected' : ''}`}
                  onClick={() => handlePresetClick(option.prefix)}
                >
                  <span className="prefix-name">{option.prefix ? `${option.prefix} 1` : '1'}</span>
                  <span className="prefix-language">{option.language}</span>
                </button>
              ))}
            </div>

            <div className="custom-prefix-input">
              <input
                type="text"
                placeholder="Or enter a custom prefix..."
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                onFocus={handleCustomFocus}
              />
            </div>

            <div className="preview-box">
              <span>
                Your dives will appear as: <strong>{effectivePrefix ? `${effectivePrefix} 1` : '1'}</strong>, <strong>{effectivePrefix ? `${effectivePrefix} 2` : '2'}</strong>, <strong>{effectivePrefix ? `${effectivePrefix} 3` : '3'}</strong>...
              </span>
            </div>
          </div>
        </div>

        <div className="welcome-footer">
          <button className="btn btn-primary" onClick={handleComplete}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
