import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirmDialog } from '../utils/dialogs';
import { logger } from '../utils/logger';
import type { Dive } from '../types';
import './BatchOperationsModal.css';

interface BatchOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPhotoIds: number[];
  currentDiveId: number | null;
  dives: Dive[];
  onOperationComplete: () => void;
}

type Operation = 'move' | 'rating' | 'delete';

export function BatchOperationsModal({
  isOpen,
  onClose,
  selectedPhotoIds,
  currentDiveId,
  dives,
  onOperationComplete,
}: BatchOperationsModalProps) {
  const [operation, setOperation] = useState<Operation>('move');
  const [targetDiveId, setTargetDiveId] = useState<number | string>('');
  const [bulkRating, setBulkRating] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setTargetDiveId('');
      setBulkRating(0);
    }
  }, [isOpen]);

  const handleMovePhotos = async () => {
    if (targetDiveId === '') {
      setResult('Please select a destination dive');
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const diveId = targetDiveId === 'trip' ? null : Number(targetDiveId);
      const count = await invoke<number>('move_photos_to_dive', {
        photoIds: selectedPhotoIds,
        diveId,
      });
      setResult(`Successfully moved ${count} photo${count !== 1 ? 's' : ''}`);
      onOperationComplete();
    } catch (error) {
      logger.error('Failed to move photos:', error);
      setResult(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkRating = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      await invoke('update_photos_rating', {
        photoIds: selectedPhotoIds,
        rating: bulkRating,
      });
      setResult(`Successfully rated ${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? 's' : ''}`);
      onOperationComplete();
    } catch (error) {
      logger.error('Failed to rate photos:', error);
      setResult(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirmDialog(
      'Delete Photos',
      `Are you sure you want to delete ${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? 's' : ''}?\n\nThis will remove them from the database but NOT delete the original files.`,
      { okLabel: 'Delete', kind: 'warning' }
    );

    if (!confirmed) return;

    setIsProcessing(true);
    setResult(null);

    try {
      await invoke('delete_photos', { photoIds: selectedPhotoIds });
      setResult(`Successfully deleted ${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? 's' : ''}`);
      onOperationComplete();
      onClose();
    } catch (error) {
      logger.error('Failed to delete photos:', error);
      setResult(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    switch (operation) {
      case 'move':
        handleMovePhotos();
        break;
      case 'rating':
        handleBulkRating();
        break;
      case 'delete':
        handleBulkDelete();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal batch-modal" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-modal-title"
      >
        <div className="modal-header">
          <h2 id="batch-modal-title">Batch Operations</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="batch-selection-info">
            <span className="batch-count">{selectedPhotoIds.length}</span>
            <span>photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected</span>
          </div>

          <div className="batch-operations">
            <label className={`batch-operation ${operation === 'move' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="operation"
                checked={operation === 'move'}
                onChange={() => setOperation('move')}
              />
              <span className="operation-icon">📦</span>
              <span className="operation-label">Move to Dive</span>
            </label>

            <label className={`batch-operation ${operation === 'rating' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="operation"
                checked={operation === 'rating'}
                onChange={() => setOperation('rating')}
              />
              <span className="operation-icon">⭐</span>
              <span className="operation-label">Set Rating</span>
            </label>

            <label className={`batch-operation ${operation === 'delete' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="operation"
                checked={operation === 'delete'}
                onChange={() => setOperation('delete')}
              />
              <span className="operation-icon">🗑️</span>
              <span className="operation-label">Delete</span>
            </label>
          </div>

          {operation === 'move' && (
            <div className="batch-options">
              <label className="batch-option-label">Move to:</label>
              <select
                className="batch-select"
                value={targetDiveId}
                onChange={(e) => setTargetDiveId(e.target.value)}
              >
                <option value="">Select destination...</option>
                <option value="trip">Trip level (no dive)</option>
                {dives
                  .filter((d) => d.id !== currentDiveId)
                  .map((dive) => (
                    <option key={dive.id} value={dive.id}>
                      Dive #{dive.dive_number} - {dive.location || dive.date}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {operation === 'rating' && (
            <div className="batch-options">
              <label className="batch-option-label">Set rating to:</label>
              <div className="batch-rating">
                {[0, 1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    className={`rating-btn ${bulkRating === rating ? 'selected' : ''}`}
                    onClick={() => setBulkRating(rating)}
                  >
                    {rating === 0 ? 'None' : '⭐'.repeat(rating)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {operation === 'delete' && (
            <div className="batch-options">
              <p className="batch-warning">
                ⚠️ This will remove the photos from the database. Original files will not be deleted from disk.
              </p>
            </div>
          )}

          {result && (
            <div className={`batch-result ${result.startsWith('Error') ? 'error' : 'success'}`}>
              {result}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${operation === 'delete' ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleApply}
            disabled={isProcessing || selectedPhotoIds.length === 0}
          >
            {isProcessing ? 'Processing...' : operation === 'delete' ? 'Delete' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
