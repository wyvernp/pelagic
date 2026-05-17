import { useState } from 'react';
import './AddTripModal.css';

interface DeletePhotosConfirmModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: (deleteFromDisk: boolean) => void;
  onCancel: () => void;
}

export function DeletePhotosConfirmModal({
  isOpen,
  message,
  onConfirm,
  onCancel,
}: DeletePhotosConfirmModalProps) {
  const [deleteFromDisk, setDeleteFromDisk] = useState(false);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const handleConfirm = () => {
    const val = deleteFromDisk;
    setDeleteFromDisk(false);
    onConfirm(val);
  };

  const handleCancel = () => {
    setDeleteFromDisk(false);
    onCancel();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>Delete Photo{message.includes('photos') ? 's' : ''}</h2>
          <button className="modal-close" onClick={handleCancel}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 20, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{message}</p>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={deleteFromDisk}
              onChange={(e) => setDeleteFromDisk(e.target.checked)}
            />
            <span>Also delete original file{message.includes('photos') ? 's' : ''} from disk</span>
          </label>
        </div>
        <div className="modal-footer">
          <div className="modal-footer-right">
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirm}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
