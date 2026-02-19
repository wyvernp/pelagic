import './MigrationScreen.css';

export interface MigrationProgress {
  step: string;
  current_version: number;
  target_version: number;
}

interface MigrationScreenProps {
  progress: MigrationProgress;
}

export function MigrationScreen({ progress }: MigrationScreenProps) {
  return (
    <div className="migration-overlay">
      <div className="migration-content">
        <div className="migration-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <h2 className="migration-title">Updating Database</h2>
        <p className="migration-description">
          Please wait while we update your database to the latest version.
        </p>
        <div className="migration-progress">
          <div className="migration-spinner"></div>
          <span className="migration-step">{progress.step}</span>
        </div>
        <div className="migration-version">
          Version {progress.current_version} → {progress.target_version}
        </div>
      </div>
    </div>
  );
}
