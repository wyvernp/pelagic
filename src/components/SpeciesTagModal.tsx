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
  const [categories, setCategories] = useState<string[]>([]);
  const [appliedTagIds, setAppliedTagIds] = useState<Set<number>>(new Set());
  const [categoryPromptTag, setCategoryPromptTag] = useState<SpeciesTag | null>(null);
  const [promptCategory, setPromptCategory] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all tags and categories when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAllTags();
      loadCategories();
      loadAppliedTags();
      setSearchQuery('');
      setShowCreateNew(false);
      setCategoryPromptTag(null);
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, selectedPhotoIds]);

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

  const loadCategories = async () => {
    try {
      const cats = await invoke<string[]>('get_distinct_species_categories');
      setCategories(cats);
    } catch (error) {
      logger.error('Failed to load categories:', error);
    }
  };

  const loadAppliedTags = async () => {
    if (selectedPhotoIds.length === 0) {
      setAppliedTagIds(new Set());
      return;
    }
    try {
      const tags = await invoke<SpeciesTag[]>('get_common_species_tags_for_photos', {
        photoIds: selectedPhotoIds,
      });
      setAppliedTagIds(new Set(tags.map(t => t.id)));
    } catch (error) {
      logger.error('Failed to load applied tags:', error);
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
    
    // Check if tag is already applied - if so, toggle it off
    if (appliedTagIds.has(tag.id)) {
      await handleRemoveTag(tag);
      return;
    }
    
    // If tag has no category, prompt user to assign one
    if (!tag.category) {
      setCategoryPromptTag(tag);
      setPromptCategory('');
      return;
    }
    
    await addTagToPhotos(tag);
  };

  const addTagToPhotos = async (tag: SpeciesTag) => {
    setIsLoading(true);
    try {
      await invoke('add_species_tag_to_photos', {
        photoIds: selectedPhotoIds,
        speciesTagId: tag.id,
      });
      
      // Also add the category as a general tag
      if (tag.category) {
        try {
          const categoryTagId = await invoke<number>('get_or_create_general_tag', {
            name: tag.category.toLowerCase(),
          });
          await invoke('add_general_tag_to_photos', {
            photoIds: selectedPhotoIds,
            generalTagId: categoryTagId,
          });
        } catch (error) {
          logger.error('Failed to add category tag:', error);
        }
      }
      
      // Update applied tags
      setAppliedTagIds(prev => new Set([...prev, tag.id]));
      onTagsAdded();
    } catch (error) {
      logger.error('Failed to add species tag:', error);
      alert('Failed to add species tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTag = async (tag: SpeciesTag) => {
    if (selectedPhotoIds.length === 0) return;
    
    setIsLoading(true);
    try {
      await invoke('remove_species_tag_from_photos', {
        photoIds: selectedPhotoIds,
        speciesTagId: tag.id,
      });
      
      // Update applied tags
      setAppliedTagIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(tag.id);
        return newSet;
      });
      onTagsAdded();
    } catch (error) {
      logger.error('Failed to remove species tag:', error);
      alert('Failed to remove species tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryPromptSubmit = async () => {
    if (!categoryPromptTag) return;
    
    setIsLoading(true);
    try {
      // Update the tag's category
      if (promptCategory) {
        await invoke('update_species_tag_category', {
          speciesTagId: categoryPromptTag.id,
          category: promptCategory,
        });
        
        // Update local state
        categoryPromptTag.category = promptCategory;
        setAllTags(prev => prev.map(t => 
          t.id === categoryPromptTag.id ? { ...t, category: promptCategory } : t
        ));
      }
      
      // Now add the tag to photos
      await addTagToPhotos({ ...categoryPromptTag, category: promptCategory || undefined });
      
      // Clear prompt
      setCategoryPromptTag(null);
      setPromptCategory('');
    } catch (error) {
      logger.error('Failed to update category:', error);
      alert('Failed to update category: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryPromptSkip = async () => {
    if (!categoryPromptTag) return;
    
    // Add tag without updating category
    await addTagToPhotos(categoryPromptTag);
    setCategoryPromptTag(null);
    setPromptCategory('');
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
      
      // Also add the category as a general tag
      if (newTagCategory.trim()) {
        try {
          const categoryTagId = await invoke<number>('get_or_create_general_tag', {
            name: newTagCategory.trim().toLowerCase(),
          });
          await invoke('add_general_tag_to_photos', {
            photoIds: selectedPhotoIds,
            generalTagId: categoryTagId,
          });
        } catch (error) {
          logger.error('Failed to add category tag:', error);
        }
      }
      
      onTagsAdded();
      
      // Reload tags and reset form
      await loadAllTags();
      setNewTagName('');
      setNewTagCategory('');
      setNewTagScientific('');
      setAppliedTagIds(prev => new Set([...prev, tagId]));
    } catch (error) {
      logger.error('Failed to create and add species tag:', error);
      alert('Failed to create species tag: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!searchQuery.trim() || selectedPhotoIds.length === 0) return;
    
    // Pre-fill the detailed form with the search query
    setNewTagName(searchQuery.trim());
    setNewTagCategory('');
    setNewTagScientific('');
    
    // Open the detailed create form
    const details = document.querySelector('.create-form-details') as HTMLDetailsElement;
    if (details) {
      details.open = true;
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Category prompt overlay
  if (categoryPromptTag) {
    return (
      <div className="modal-backdrop" onClick={() => setCategoryPromptTag(null)}>
        <div className="modal species-tag-modal category-prompt-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Classify Species</h2>
            <button className="modal-close" onClick={() => setCategoryPromptTag(null)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          
          <div className="modal-body">
            <p className="category-prompt-info">
              <strong>{categoryPromptTag.name}</strong> doesn't have a category yet. What type of creature is this?
            </p>
            
            <div className="category-select-wrapper">
              <select
                className="category-select"
                value={promptCategory}
                onChange={(e) => setPromptCategory(e.target.value)}
              >
                <option value="">-- Select category --</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              <span className="category-or">or</span>
              
              <input
                type="text"
                className="category-custom-input"
                placeholder="Type new category..."
                value={promptCategory}
                onChange={(e) => setPromptCategory(e.target.value)}
              />
            </div>
          </div>
          
          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleCategoryPromptSkip}
              disabled={isLoading}
            >
              Skip
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handleCategoryPromptSubmit}
              disabled={isLoading}
            >
              {promptCategory ? 'Save & Add Tag' : 'Add Without Category'}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            {appliedTagIds.size > 0 && (
              <span className="applied-count"> • {appliedTagIds.size} tag{appliedTagIds.size !== 1 ? 's' : ''} applied</span>
            )}
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
                className={`tag-item ${appliedTagIds.has(tag.id) ? 'applied' : ''} ${!tag.category ? 'needs-category' : ''}`}
                onClick={() => handleSelectTag(tag)}
                disabled={isLoading}
                title={appliedTagIds.has(tag.id) ? 'Click to remove' : 'Click to add'}
              >
                {appliedTagIds.has(tag.id) && (
                  <span className="tag-checkmark">✓</span>
                )}
                <span className="tag-icon">🐠</span>
                <div className="tag-details">
                  <span className="tag-name">{tag.name}</span>
                  {tag.scientific_name && (
                    <span className="tag-scientific">{tag.scientific_name}</span>
                  )}
                </div>
                {tag.category ? (
                  <span className="tag-category">{tag.category}</span>
                ) : (
                  <span className="tag-category tag-category-missing">?</span>
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
                <div className="category-input-group">
                  <select
                    className="category-select"
                    value={categories.includes(newTagCategory) ? newTagCategory : '_custom'}
                    onChange={(e) => {
                      if (e.target.value !== '_custom') {
                        setNewTagCategory(e.target.value);
                      }
                    }}
                  >
                    <option value="">-- Select category --</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="_custom">+ New category...</option>
                  </select>
                  {(!categories.includes(newTagCategory) && newTagCategory !== '') && (
                    <input
                      type="text"
                      className="category-custom-input"
                      value={newTagCategory}
                      onChange={(e) => setNewTagCategory(e.target.value)}
                      placeholder="e.g., Fish, Invertebrate, Coral"
                    />
                  )}
                </div>
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
