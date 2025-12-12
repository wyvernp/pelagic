import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GeneralTag } from '../types';
import './AddTripModal.css';
import './SpeciesTagModal.css';

interface GeneralTagModalProps {
  isOpen: boolean;
  selectedPhotoIds: number[];
  onClose: () => void;
  onTagsAdded: () => void;
}

export function GeneralTagModal({
  isOpen,
  selectedPhotoIds,
  onClose,
  onTagsAdded,
}: GeneralTagModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeneralTag[]>([]);
  const [allTags, setAllTags] = useState<GeneralTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all tags when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAllTags();
      setSearchQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search as user types
  useEffect(() => {
    if (searchQuery.length > 0) {
      searchTags(searchQuery);
    } else {
      setSearchResults(allTags);
    }
  }, [searchQuery, allTags]);

  const loadAllTags = async () => {
    try {
      const tags = await invoke<GeneralTag[]>('get_all_general_tags');
      setAllTags(tags);
      setSearchResults(tags);
    } catch (error) {
      console.error('Failed to load general tags:', error);
    }
  };

  const searchTags = async (query: string) => {
    try {
      const tags = await invoke<GeneralTag[]>('search_general_tags', { query });
      setSearchResults(tags);
      // Show create option if no exact match
      const exactMatch = tags.some(t => 
        t.name.toLowerCase() === query.toLowerCase()
      );
      setShowCreateNew(!exactMatch && query.length > 1);
    } catch (error) {
      console.error('Failed to search general tags:', error);
    }
  };

  const handleSelectTag = async (tag: GeneralTag) => {
    if (selectedPhotoIds.length === 0) return;
    
    setIsLoading(true);
    try {
      await invoke('add_general_tag_to_photos', {
        photoIds: selectedPhotoIds,
        generalTagId: tag.id,
      });
      onTagsAdded();
    } catch (error) {
      console.error('Failed to add general tag:', error);
      alert('Failed to add tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!searchQuery.trim() || selectedPhotoIds.length === 0) return;
    
    setIsLoading(true);
    try {
      const tagId = await invoke<number>('get_or_create_general_tag', {
        name: searchQuery.trim(),
      });
      
      await invoke('add_general_tag_to_photos', {
        photoIds: selectedPhotoIds,
        generalTagId: tagId,
      });
      
      // Reload tags
      await loadAllTags();
      setSearchQuery('');
      onTagsAdded();
    } catch (error) {
      console.error('Failed to create and add tag:', error);
      alert('Failed to create tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal species-tag-modal">
        <div className="modal-header">
          <h2>Add Tags</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="tag-info">
            Adding tags to <strong>{selectedPhotoIds.length}</strong> photo{selectedPhotoIds.length !== 1 ? 's' : ''}
          </p>

          <div className="search-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search or type new tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showCreateNew) {
                  handleQuickCreate();
                }
              }}
            />
            <svg className="search-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>

          <div className="tag-list">
            {showCreateNew && (
              <button
                className="tag-item create-new"
                onClick={handleQuickCreate}
                disabled={isLoading}
              >
                <span className="tag-icon">+</span>
                <span className="tag-name">Create "{searchQuery}"</span>
              </button>
            )}
            
            {searchResults.map((tag) => (
              <button
                key={tag.id}
                className="tag-item"
                onClick={() => handleSelectTag(tag)}
                disabled={isLoading}
              >
                <span className="tag-icon">🏷️</span>
                <span className="tag-name">{tag.name}</span>
              </button>
            ))}
            
            {searchResults.length === 0 && !showCreateNew && searchQuery && (
              <div className="no-results">
                No tags found matching "{searchQuery}"
              </div>
            )}
            
            {searchResults.length === 0 && !searchQuery && (
              <div className="no-results">
                No tags yet. Start typing to create one!
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { onTagsAdded(); onClose(); }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
