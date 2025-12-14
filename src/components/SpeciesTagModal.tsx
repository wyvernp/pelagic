import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { SpeciesTag } from '../types';
import './AddTripModal.css';
import './SpeciesTagModal.css';

interface SpeciesTagModalProps {
  isOpen: boolean;
  selectedPhotoIds: number[];
  onClose: () => void;
  onTagsAdded: () => void;
}

export function SpeciesTagModal({
  isOpen,
  selectedPhotoIds,
  onClose,
  onTagsAdded,
}: SpeciesTagModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpeciesTag[]>([]);
  const [allTags, setAllTags] = useState<SpeciesTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState('');
  const [newTagScientific, setNewTagScientific] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all tags when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAllTags();
      setSearchQuery('');
      setShowCreateNew(false);
      // Focus input after a short delay
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
      const tags = await invoke<SpeciesTag[]>('get_all_species_tags');
      setAllTags(tags);
      setSearchResults(tags);
    } catch (error) {
      logger.error('Failed to load species tags:', error);
    }
  };

  const searchTags = async (query: string) => {
    try {
      const tags = await invoke<SpeciesTag[]>('search_species_tags', { query });
      setSearchResults(tags);
      // Show create option if no exact match
      const exactMatch = tags.some(t => 
        t.name.toLowerCase() === query.toLowerCase()
      );
      setShowCreateNew(!exactMatch && query.length > 1);
    } catch (error) {
      logger.error('Failed to search species tags:', error);
    }
  };

  const handleSelectTag = async (tag: SpeciesTag) => {
    if (selectedPhotoIds.length === 0) return;
    
    setIsLoading(true);
    try {
      await invoke('add_species_tag_to_photos', {
        photoIds: selectedPhotoIds,
        speciesTagId: tag.id,
      });
      onTagsAdded();
    } catch (error) {
      logger.error('Failed to add species tag:', error);
      alert('Failed to add species tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newTagName.trim() || selectedPhotoIds.length === 0) return;
    
    setIsLoading(true);
    try {
      const tagId = await invoke<number>('get_or_create_species_tag', {
        name: newTagName.trim(),
        category: newTagCategory.trim() || null,
        scientificName: newTagScientific.trim() || null,
      });
      
      await invoke('add_species_tag_to_photos', {
        photoIds: selectedPhotoIds,
        speciesTagId: tagId,
      });
      
      onTagsAdded();
      onClose();
    } catch (error) {
      logger.error('Failed to create and add species tag:', error);
      alert('Failed to create species tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!searchQuery.trim() || selectedPhotoIds.length === 0) return;
    
    setIsLoading(true);
    try {
      const tagId = await invoke<number>('get_or_create_species_tag', {
        name: searchQuery.trim(),
        category: null,
        scientificName: null,
      });
      
      await invoke('add_species_tag_to_photos', {
        photoIds: selectedPhotoIds,
        speciesTagId: tagId,
      });
      
      onTagsAdded();
      onClose();
    } catch (error) {
      logger.error('Failed to create and add species tag:', error);
      alert('Failed to create species tag: ' + error);
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
          <h2>Tag Species</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="tag-info">
            Adding species tag to <strong>{selectedPhotoIds.length}</strong> photo{selectedPhotoIds.length !== 1 ? 's' : ''}
          </p>

          <div className="search-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search or type new species name..."
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
                <span className="tag-icon">🐠</span>
                <div className="tag-details">
                  <span className="tag-name">{tag.name}</span>
                  {tag.scientific_name && (
                    <span className="tag-scientific">{tag.scientific_name}</span>
                  )}
                </div>
                {tag.category && (
                  <span className="tag-category">{tag.category}</span>
                )}
              </button>
            ))}
            
            {searchResults.length === 0 && !showCreateNew && searchQuery && (
              <div className="no-results">
                No species found matching "{searchQuery}"
              </div>
            )}
            
            {searchResults.length === 0 && !searchQuery && (
              <div className="no-results">
                No species tags yet. Start typing to create one!
              </div>
            )}
          </div>

          {/* Advanced create form - collapsible */}
          <details className="create-form-details">
            <summary>Create with details...</summary>
            <div className="create-form">
              <div className="form-group">
                <label>Common Name *</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., Clownfish"
                />
              </div>
              <div className="form-group">
                <label>Scientific Name</label>
                <input
                  type="text"
                  value={newTagScientific}
                  onChange={(e) => setNewTagScientific(e.target.value)}
                  placeholder="e.g., Amphiprioninae"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  value={newTagCategory}
                  onChange={(e) => setNewTagCategory(e.target.value)}
                  placeholder="e.g., Fish, Invertebrate, Coral"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleCreateAndAdd}
                disabled={!newTagName.trim() || isLoading}
              >
                Create & Add to Photos
              </button>
            </div>
          </details>
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
