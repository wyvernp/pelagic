import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { logger } from '../utils/logger';
import type { PhotoArchivePreview, PhotoArchiveProgress, PhotoArchiveResult, PhotoArchiveScope } from '../types';
import './AddTripModal.css';
import './PhotoArchiveModal.css';

interface PhotoArchiveModalProps {
  isOpen: boolean;
  scope?: PhotoArchiveScope | null;
  title?: string;
  onClose: () => void;
  onArchiveComplete: () => void;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function progressLabel(progress: PhotoArchiveProgress | null): string {
  if (!progress) return '';
  const phase = progress.phase.replace(/-/g, ' ');
  const file = progress.filename ? `: ${progress.filename}` : '';
  return `${phase} ${progress.current}/${progress.total}${file}`;
}

export function PhotoArchiveModal({
  isOpen,
  scope,
  title = 'Archive Photos',
  onClose,
  onArchiveComplete,
}: PhotoArchiveModalProps) {
  const [destinationRoot, setDestinationRoot] = useState('');
  const [preview, setPreview] = useState<PhotoArchivePreview | null>(null);
  const [progress, setProgress] = useState<PhotoArchiveProgress | null>(null);
  const [result, setResult] = useState<PhotoArchiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [moveRaws, setMoveRaws] = useState(true);
  const [proxyQuality, setProxyQuality] = useState(92);
  const [proxyMaxDimension, setProxyMaxDimension] = useState(6000);

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setProgress(null);
      setResult(null);
      setError(null);
      setLoadingPreview(false);
      setArchiving(false);
    }
  }, [isOpen]);

  const invokeArgs = useMemo(() => ({
    scopeType: scope?.scopeType,
    scopeId: scope?.scopeId ?? null,
    photoIds: scope?.photoIds ?? null,
  }), [scope]);

  const loadPreview = useCallback(async (root = destinationRoot) => {
    if (!scope || !root) return;
    setLoadingPreview(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await invoke<PhotoArchivePreview>('preview_photo_archive', {
        ...invokeArgs,
        destinationRoot: root,
      });
      setPreview(nextPreview);
    } catch (err) {
      logger.error('Failed to preview archive:', err);
      setError(String(err));
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [destinationRoot, invokeArgs, scope]);

  const handleChooseDestination = async () => {
    try {
      const selected = await open({
        title: 'Choose Archive Destination',
        directory: true,
        multiple: false,
      });
      if (typeof selected === 'string') {
        setDestinationRoot(selected);
        await loadPreview(selected);
      }
    } catch (err) {
      logger.error('Failed to choose archive destination:', err);
      setError(String(err));
    }
  };

  const handleArchive = async () => {
    if (!scope || !destinationRoot || !preview) return;
    setArchiving(true);
    setError(null);
    setResult(null);
    setProgress(null);

    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<PhotoArchiveProgress>('photo-archive-progress', (event) => {
        setProgress(event.payload);
      });

      const archiveResult = await invoke<PhotoArchiveResult>('archive_photos', {
        ...invokeArgs,
        destinationRoot,
        moveRaws,
        proxyQuality,
        proxyMaxDimension,
      });
      setResult(archiveResult);
      onArchiveComplete();
      await loadPreview(destinationRoot);
    } catch (err) {
      logger.error('Failed to archive photos:', err);
      setError(String(err));
    } finally {
      unlisten?.();
      setArchiving(false);
      setProgress(null);
    }
  };

  if (!isOpen || !scope) return null;

  const readyCount = preview?.online_raw_count ?? 0;
  const readyBytes = preview?.files
    .filter((file) => file.status === 'ready')
    .reduce((sum, file) => sum + file.file_size_bytes, 0) ?? 0;
  const readyProxyEstimate = Math.round(readyBytes * 0.12);
  const destinationProblem = preview?.destination && (!preview.destination.available || !preview.destination.writable);
  const archiveDisabled = archiving || loadingPreview || !preview || destinationProblem || readyCount === 0;
  const estimatedSaved = preview && moveRaws
    ? Math.max(0, readyBytes - readyProxyEstimate)
    : 0;

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && !archiving && onClose()}>
      <div className="modal modal-xl photo-archive-modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} disabled={archiving}>×</button>
        </div>

        <div className="modal-body photo-archive-body">
          {error && <div className="error-banner">{error}</div>}

          <div className="archive-destination-row">
            <div className="archive-destination-main">
              <span className="archive-label">Archive destination</span>
              <span className="archive-path">{destinationRoot || 'No destination selected'}</span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={handleChooseDestination} disabled={archiving}>
              Choose Folder
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => loadPreview()} disabled={!destinationRoot || loadingPreview || archiving}>
              {loadingPreview ? 'Checking...' : 'Refresh'}
            </button>
          </div>

          {preview && (
            <>
              <div className="archive-summary-grid">
                <div className="archive-summary-item">
                  <span className="archive-summary-value">{preview.online_raw_count}</span>
                  <span className="archive-summary-label">RAWs ready</span>
                </div>
                <div className="archive-summary-item">
                  <span className="archive-summary-value">{formatBytes(preview.total_raw_bytes)}</span>
                  <span className="archive-summary-label">RAW size</span>
                </div>
                <div className="archive-summary-item">
                  <span className="archive-summary-value">{formatBytes(readyProxyEstimate)}</span>
                  <span className="archive-summary-label">Proxy estimate</span>
                </div>
                <div className="archive-summary-item">
                  <span className="archive-summary-value">{formatBytes(estimatedSaved)}</span>
                  <span className="archive-summary-label">Estimated saved</span>
                </div>
              </div>

              <div className={`archive-destination-status ${destinationProblem ? 'warning' : 'ok'}`}>
                <span>{preview.destination.destination_kind.replace('_', ' ')}</span>
                <span>{preview.destination.writable ? 'Writable' : 'Not writable'}</span>
                {preview.destination.warning && <span>{preview.destination.warning}</span>}
              </div>

              {preview.warnings.length > 0 && (
                <div className="archive-warning-list">
                  {preview.warnings.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                </div>
              )}

              <div className="archive-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={moveRaws}
                    onChange={(event) => setMoveRaws(event.target.checked)}
                    disabled={archiving}
                  />
                  <span>Remove local RAWs after verified archive copy</span>
                </label>
                <label>
                  JPEG quality
                  <input
                    type="number"
                    min={60}
                    max={100}
                    value={proxyQuality}
                    onChange={(event) => setProxyQuality(Number(event.target.value))}
                    disabled={archiving}
                  />
                </label>
                <label>
                  Max proxy edge
                  <select
                    value={proxyMaxDimension}
                    onChange={(event) => setProxyMaxDimension(Number(event.target.value))}
                    disabled={archiving}
                  >
                    <option value={2048}>2048 px</option>
                    <option value={4096}>4096 px</option>
                    <option value={6000}>6000 px</option>
                    <option value={0}>Full size</option>
                  </select>
                </label>
              </div>

              <div className="archive-file-list">
                {preview.files.slice(0, 8).map((file) => (
                  <div key={file.photo_id} className={`archive-file-row ${file.status}`}>
                    <span>{file.filename}</span>
                    <span>{file.status.replace('_', ' ')}</span>
                    <span>{formatBytes(file.file_size_bytes)}</span>
                  </div>
                ))}
                {preview.files.length > 8 && (
                  <div className="archive-file-row muted">
                    <span>+ {preview.files.length - 8} more</span>
                  </div>
                )}
              </div>
            </>
          )}

          {archiving && (
            <div className="archive-progress">
              <div className="loading-spinner" />
              <span>{progressLabel(progress) || 'Starting archive...'}</span>
            </div>
          )}

          {result && (
            <div className={`archive-result ${result.failed_count > 0 ? 'warning' : 'success'}`}>
              <p>
                Archived {result.archived_count} RAW{result.archived_count === 1 ? '' : 's'}; saved {formatBytes(result.bytes_saved)}.
              </p>
              {result.errors.slice(0, 4).map((item, index) => <p key={index}>{item}</p>)}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="modal-footer-right">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={archiving}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={handleArchive} disabled={archiveDisabled}>
              {archiving ? 'Archiving...' : 'Archive RAWs'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
