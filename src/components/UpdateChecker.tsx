import { useState, useEffect, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { logger } from '../utils/logger';
import './UpdateChecker.css';

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  error: string | null;
  update: Update | null;
  progress: number;
}

export function useUpdateChecker() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloading: false,
    error: null,
    update: null,
    progress: 0,
  });

  const checkForUpdate = useCallback(async () => {
    setState(prev => ({ ...prev, checking: true, error: null }));
    try {
      const update = await check();
      if (update) {
        setState(prev => ({ ...prev, checking: false, available: true, update }));
        return true;
      } else {
        setState(prev => ({ ...prev, checking: false, available: false }));
        return false;
      }
    } catch (error) {
      logger.error('Update check failed:', error);
      setState(prev => ({ ...prev, checking: false, error: String(error) }));
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!state.update) return;
    setState(prev => ({ ...prev, downloading: true, error: null, progress: 0 }));
    try {
      let downloaded = 0;
      let contentLength = 0;
      await state.update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setState(prev => ({
                ...prev,
                progress: Math.round((downloaded / contentLength) * 100),
              }));
            }
            break;
          case 'Finished':
            setState(prev => ({ ...prev, progress: 100 }));
            break;
        }
      });
      await relaunch();
    } catch (error) {
      logger.error('Update install failed:', error);
      setState(prev => ({ ...prev, downloading: false, error: String(error) }));
    }
  }, [state.update]);

  const dismiss = useCallback(() => {
    setState({
      checking: false,
      available: false,
      downloading: false,
      error: null,
      update: null,
      progress: 0,
    });
  }, []);

  return { ...state, checkForUpdate, downloadAndInstall, dismiss };
}

export function UpdateChecker({ autoCheck = true }: { autoCheck?: boolean }) {
  const {
    checking,
    available,
    downloading,
    error,
    update,
    progress,
    checkForUpdate,
    downloadAndInstall,
    dismiss,
  } = useUpdateChecker();

  useEffect(() => {
    if (autoCheck) {
      // Check after a short delay so the app loads first
      const timer = setTimeout(() => checkForUpdate(), 3000);
      return () => clearTimeout(timer);
    }
  }, [autoCheck, checkForUpdate]);

  // Don't render anything if no update and not checking
  if (!available && !checking && !error) return null;

  // Checking silently on auto-check
  if (checking && autoCheck) return null;

  return (
    <div className="update-banner">
      {checking && <span className="update-text">Checking for updates...</span>}
      {available && update && !downloading && (
        <>
          <span className="update-text">
            Update available: <strong>v{update.version}</strong>
          </span>
          <button className="btn btn-primary btn-small" onClick={downloadAndInstall}>
            Install Update
          </button>
          <button className="btn btn-secondary btn-small" onClick={dismiss}>
            Later
          </button>
        </>
      )}
      {downloading && (
        <span className="update-text">
          Downloading update... {progress}%
        </span>
      )}
      {error && (
        <>
          <span className="update-text update-error">Update error: {error}</span>
          <button className="btn btn-secondary btn-small" onClick={dismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
