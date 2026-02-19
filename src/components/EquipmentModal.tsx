import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { logger } from '../utils/logger';
import type { EquipmentCategory, EquipmentWithCategory, EquipmentSet, EquipmentSetWithItems } from '../types';
import './EquipmentModal.css';

interface EquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'equipment' | 'sets';
type SetType = 'dive' | 'camera';
type CategoryTypeFilter = 'all' | 'dive' | 'camera';

// Helper to get display name for equipment (name or brand+model fallback)
function getEquipmentDisplayName(item: { name?: string; brand?: string; model?: string }): string {
  if (item.name) return item.name;
  const parts = [item.brand, item.model].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed Equipment';
}

export function EquipmentModal({ isOpen, onClose }: EquipmentModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('equipment');
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [equipment, setEquipment] = useState<EquipmentWithCategory[]>([]);
  const [sets, setSets] = useState<EquipmentSet[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [selectedCategoryType, setSelectedCategoryType] = useState<CategoryTypeFilter>('all');
  const [selectedSetType, setSelectedSetType] = useState<SetType>('dive');
  
  // Equipment form state
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentWithCategory | null>(null);
  const [equipmentForm, setEquipmentForm] = useState({
    category_id: 0,
    name: '',
    brand: '',
    model: '',
    serial_number: '',
    purchase_date: '',
    notes: '',
    is_retired: false,
  });
  
  // Set form state
  const [showSetForm, setShowSetForm] = useState(false);
  const [editingSet, setEditingSet] = useState<EquipmentSetWithItems | null>(null);
  const [savingSet, setSavingSet] = useState(false);
  const [setForm, setSetForm] = useState({
    name: '',
    description: '',
    set_type: 'dive' as SetType,
    is_default: false,
    equipment_ids: [] as number[],
  });

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [cats, equip, allSets] = await Promise.all([
        invoke<EquipmentCategory[]>('get_equipment_categories'),
        invoke<EquipmentWithCategory[]>('get_all_equipment'),
        invoke<EquipmentSet[]>('get_equipment_sets'),
      ]);
      setCategories(cats);
      setEquipment(equip);
      setSets(allSets);
      
      // Set default category for new equipment
      if (cats.length > 0 && equipmentForm.category_id === 0) {
        setEquipmentForm(prev => ({ ...prev, category_id: cats[0].id }));
      }
    } catch (error) {
      logger.error('Failed to load equipment data:', error);
    }
  };

  // Equipment CRUD operations
  const handleSaveEquipment = async () => {
    try {
      if (editingEquipment) {
        await invoke('update_equipment', {
          id: editingEquipment.id,
          categoryId: equipmentForm.category_id,
          name: equipmentForm.name,
          brand: equipmentForm.brand || null,
          model: equipmentForm.model || null,
          serialNumber: equipmentForm.serial_number || null,
          purchaseDate: equipmentForm.purchase_date || null,
          notes: equipmentForm.notes || null,
          isRetired: equipmentForm.is_retired,
        });
      } else {
        await invoke('create_equipment', {
          categoryId: equipmentForm.category_id,
          name: equipmentForm.name,
          brand: equipmentForm.brand || null,
          model: equipmentForm.model || null,
          serialNumber: equipmentForm.serial_number || null,
          purchaseDate: equipmentForm.purchase_date || null,
          notes: equipmentForm.notes || null,
        });
      }
      
      resetEquipmentForm();
      loadData();
    } catch (error) {
      logger.error('Failed to save equipment:', error);
    }
  };

  const handleEditEquipment = (item: EquipmentWithCategory) => {
    setEditingEquipment(item);
    setEquipmentForm({
      category_id: item.category_id,
      name: item.name || '',
      brand: item.brand || '',
      model: item.model || '',
      serial_number: item.serial_number || '',
      purchase_date: item.purchase_date || '',
      notes: item.notes || '',
      is_retired: item.is_retired,
    });
    setShowEquipmentForm(true);
  };

  const handleDeleteEquipment = async (item: EquipmentWithCategory) => {
    const confirmed = await confirm(
      `Are you sure you want to delete "${getEquipmentDisplayName(item)}"? This will remove it from all equipment sets.`,
      { title: 'Delete Equipment', kind: 'warning' }
    );
    
    if (confirmed) {
      try {
        await invoke('delete_equipment', { id: item.id });
        loadData();
      } catch (error) {
        logger.error('Failed to delete equipment:', error);
      }
    }
  };

  const resetEquipmentForm = () => {
    setShowEquipmentForm(false);
    setEditingEquipment(null);
    setEquipmentForm({
      category_id: categories.length > 0 ? categories[0].id : 0,
      name: '',
      brand: '',
      model: '',
      serial_number: '',
      purchase_date: '',
      notes: '',
      is_retired: false,
    });
  };

  // Equipment Set CRUD operations
  const handleSaveSet = async () => {
    console.log('handleSaveSet called, savingSet:', savingSet, 'editingSet:', editingSet);
    if (savingSet) return; // Prevent double-clicks
    setSavingSet(true);
    
    try {
      if (editingSet) {
        console.log('Updating existing set:', editingSet.id);
        await invoke('update_equipment_set', {
          id: editingSet.id,
          name: setForm.name,
          description: setForm.description || null,
          setType: setForm.set_type,
          isDefault: setForm.is_default,
        });
        console.log('Set updated, now updating items:', setForm.equipment_ids);
        await invoke('set_equipment_set_items', {
          setId: editingSet.id,
          equipmentIds: setForm.equipment_ids,
        });
        console.log('Items updated');
      } else {
        console.log('Creating new set');
        const newSetId = await invoke<number>('create_equipment_set', {
          name: setForm.name,
          description: setForm.description || null,
          setType: setForm.set_type,
          isDefault: setForm.is_default,
        });
        console.log('New set created with id:', newSetId);
        if (setForm.equipment_ids.length > 0) {
          await invoke('set_equipment_set_items', {
            setId: newSetId,
            equipmentIds: setForm.equipment_ids,
          });
          console.log('Items added to new set');
        }
      }
      
      console.log('Reloading data...');
      await loadData();
      console.log('Data reloaded, resetting form...');
      resetSetForm();
      console.log('Form reset complete');
    } catch (error) {
      console.error('handleSaveSet error:', error);
      logger.error('Failed to save equipment set:', error);
    } finally {
      setSavingSet(false);
    }
  };

  const handleEditSet = async (set: EquipmentSet) => {
    console.log('handleEditSet called with:', set);
    try {
      const fullSet = await invoke<EquipmentSetWithItems | null>('get_equipment_set_with_items', { id: set.id });
      console.log('fullSet response:', fullSet);
      if (fullSet) {
        setEditingSet(fullSet);
        setSetForm({
          name: fullSet.name,
          description: fullSet.description || '',
          set_type: fullSet.set_type as SetType,
          is_default: fullSet.is_default,
          equipment_ids: fullSet.items.map(i => i.id),
        });
        setShowSetForm(true);
      } else {
        console.error('fullSet was null/undefined');
      }
    } catch (error) {
      console.error('handleEditSet error:', error);
      logger.error('Failed to load equipment set:', error);
    }
  };

  const handleDeleteSet = async (set: EquipmentSet) => {
    console.log('handleDeleteSet called with:', set);
    const confirmed = await confirm(
      `Are you sure you want to delete the "${set.name}" equipment set?`,
      { title: 'Delete Equipment Set', kind: 'warning' }
    );
    
    console.log('Delete confirmed:', confirmed);
    if (confirmed) {
      try {
        console.log('Calling delete_equipment_set with id:', set.id);
        await invoke('delete_equipment_set', { id: set.id });
        console.log('Delete successful, reloading data...');
        await loadData();
        console.log('Data reloaded');
      } catch (error) {
        console.error('handleDeleteSet error:', error);
        logger.error('Failed to delete equipment set:', error);
      }
    }
  };

  const resetSetForm = () => {
    setShowSetForm(false);
    setEditingSet(null);
    setSetForm({
      name: '',
      description: '',
      set_type: selectedSetType,
      is_default: false,
      equipment_ids: [],
    });
  };

  const toggleEquipmentInSet = (equipId: number) => {
    setSetForm(prev => ({
      ...prev,
      equipment_ids: prev.equipment_ids.includes(equipId)
        ? prev.equipment_ids.filter(id => id !== equipId)
        : [...prev.equipment_ids, equipId],
    }));
  };

  // Filter categories by type
  const filteredCategories = selectedCategoryType === 'all'
    ? categories
    : categories.filter(c => c.category_type === selectedCategoryType || c.category_type === 'both');

  // Filter equipment by category and type
  const filteredEquipment = equipment.filter(e => {
    // Filter by category type first
    if (selectedCategoryType !== 'all') {
      if (e.category_type !== selectedCategoryType && e.category_type !== 'both') {
        return false;
      }
    }
    // Then filter by specific category
    if (selectedCategory !== 'all' && e.category_id !== selectedCategory) {
      return false;
    }
    return true;
  });

  // Filter sets by type
  const filteredSets = sets.filter(s => s.set_type === selectedSetType);

  // Group equipment by category for display in set editor - FILTERED by set type
  const equipmentByCategory = categories
    .filter(cat => {
      // For set editor, only show categories matching the set type (or 'both')
      const setType = editingSet ? editingSet.set_type : setForm.set_type;
      return cat.category_type === setType || cat.category_type === 'both';
    })
    .map(cat => ({
      category: cat,
      items: equipment.filter(e => e.category_id === cat.id && !e.is_retired),
    }))
    .filter(g => g.items.length > 0);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl equipment-modal">
        <div className="modal-header">
          <h2>Equipment Catalogue</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="equipment-tabs">
          <button
            className={`equipment-tab ${activeTab === 'equipment' ? 'active' : ''}`}
            onClick={() => setActiveTab('equipment')}
          >
            My Equipment
          </button>
          <button
            className={`equipment-tab ${activeTab === 'sets' ? 'active' : ''}`}
            onClick={() => setActiveTab('sets')}
          >
            Equipment Sets
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'equipment' && !showEquipmentForm && (
            <div className="equipment-list-view">
              <div className="equipment-toolbar">
                <div className="category-type-filter">
                  <button
                    className={`type-filter-btn ${selectedCategoryType === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCategoryType('all')}
                  >
                    All
                  </button>
                  <button
                    className={`type-filter-btn ${selectedCategoryType === 'dive' ? 'active' : ''}`}
                    onClick={() => setSelectedCategoryType('dive')}
                  >
                    🤿 Dive
                  </button>
                  <button
                    className={`type-filter-btn ${selectedCategoryType === 'camera' ? 'active' : ''}`}
                    onClick={() => setSelectedCategoryType('camera')}
                  >
                    📷 Camera
                  </button>
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  className="category-filter"
                >
                  <option value="all">All Categories</option>
                  {filteredCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowEquipmentForm(true)}
                >
                  + Add Equipment
                </button>
              </div>

              {filteredEquipment.length === 0 ? (
                <div className="empty-state">
                  <p>No equipment found. Add your gear to get started!</p>
                </div>
              ) : (
                <div className="equipment-compact-list">
                  {filteredEquipment.map(item => (
                    <div 
                      key={item.id} 
                      className={`equipment-row ${item.is_retired ? 'retired' : ''}`}
                    >
                      <span className="equipment-row-icon">
                        {categories.find(c => c.id === item.category_id)?.icon}
                      </span>
                      <div className="equipment-row-info">
                        <span className="equipment-row-name">{getEquipmentDisplayName(item)}</span>
                        <span className="equipment-row-category">{item.category_name}</span>
                      </div>
                      {item.serial_number && (
                        <span className="equipment-row-serial">S/N: {item.serial_number}</span>
                      )}
                      {item.is_retired && <span className="retired-badge">Retired</span>}
                      <div className="equipment-row-actions">
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEditEquipment(item)}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteEquipment(item)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'equipment' && showEquipmentForm && (
            <div className="equipment-form-view">
              <h3>{editingEquipment ? 'Edit Equipment' : 'Add Equipment'}</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    value={equipmentForm.category_id}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, category_id: parseInt(e.target.value) }))}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Name <span className="label-hint">(optional - defaults to Brand Model)</span></label>
                  <input
                    type="text"
                    value={equipmentForm.name}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Primary Camera, Main BCD"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Brand</label>
                  <input
                    type="text"
                    value={equipmentForm.brand}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="e.g., Suunto, Sony, Scubapro"
                  />
                </div>
                <div className="form-group">
                  <label>Model</label>
                  <input
                    type="text"
                    value={equipmentForm.model}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="e.g., D5, A7R V, Hydros Pro"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Serial Number</label>
                  <input
                    type="text"
                    value={equipmentForm.serial_number}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, serial_number: e.target.value }))}
                    placeholder="For insurance/warranty"
                  />
                </div>
                <div className="form-group">
                  <label>Purchase Date</label>
                  <input
                    type="date"
                    value={equipmentForm.purchase_date}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={equipmentForm.notes}
                  onChange={(e) => setEquipmentForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Service history, modifications, etc."
                  rows={3}
                />
              </div>

              {editingEquipment && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={equipmentForm.is_retired}
                      onChange={(e) => setEquipmentForm(prev => ({ ...prev, is_retired: e.target.checked }))}
                    />
                    <span>Retired (no longer in use)</span>
                  </label>
                </div>
              )}

              <div className="form-actions">
                <button className="btn btn-secondary" onClick={resetEquipmentForm}>
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveEquipment}
                  disabled={!equipmentForm.name.trim() && !equipmentForm.brand.trim() && !equipmentForm.model.trim()}
                >
                  {editingEquipment ? 'Save Changes' : 'Add Equipment'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sets' && !showSetForm && (
            <div className="sets-list-view">
              <div className="equipment-toolbar">
                <div className="set-type-toggle">
                  <button
                    className={`toggle-btn ${selectedSetType === 'dive' ? 'active' : ''}`}
                    onClick={() => setSelectedSetType('dive')}
                  >
                    🤿 Dive Gear
                  </button>
                  <button
                    className={`toggle-btn ${selectedSetType === 'camera' ? 'active' : ''}`}
                    onClick={() => setSelectedSetType('camera')}
                  >
                    📷 Camera Gear
                  </button>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setSetForm(prev => ({ ...prev, set_type: selectedSetType }));
                    setShowSetForm(true);
                  }}
                >
                  + Create Set
                </button>
              </div>

              {filteredSets.length === 0 ? (
                <div className="empty-state">
                  <p>No {selectedSetType} equipment sets. Create a set to group your gear!</p>
                </div>
              ) : (
                <div className="sets-grid">
                  {filteredSets.map(set => (
                    <div key={set.id} className="set-card">
                      <div className="set-card-header">
                        <h4 className="set-name">
                          {set.name}
                          {set.is_default && <span className="default-badge">Default</span>}
                        </h4>
                      </div>
                      {set.description && (
                        <p className="set-description">{set.description}</p>
                      )}
                      <div className="set-card-actions">
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEditSet(set)}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteSet(set)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'sets' && showSetForm && (
            <div className="set-form-view">
              <h3>{editingSet ? 'Edit Equipment Set' : 'Create Equipment Set'}</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Set Name *</label>
                  <input
                    type="text"
                    value={setForm.name}
                    onChange={(e) => setSetForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Tropical Setup, Cold Water Kit"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={setForm.set_type}
                    onChange={(e) => setSetForm(prev => ({ ...prev, set_type: e.target.value as SetType }))}
                  >
                    <option value="dive">🤿 Dive Gear</option>
                    <option value="camera">📷 Camera Gear</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Description</label>
                  <input
                    type="text"
                    value={setForm.description}
                    onChange={(e) => setSetForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                  />
                </div>
                <div className="form-group">
                  <label className="checkbox-label" style={{ marginTop: '24px' }}>
                    <input
                      type="checkbox"
                      checked={setForm.is_default}
                      onChange={(e) => setSetForm(prev => ({ ...prev, is_default: e.target.checked }))}
                    />
                    <span>Set as default</span>
                  </label>
                </div>
              </div>

              <div className="equipment-dual-panel">
                <div className="equipment-panel available-panel">
                  <div className="panel-header">Available Equipment</div>
                  <div className="panel-content">
                    {equipmentByCategory.map(({ category, items }) => {
                      const availableItems = items.filter(item => !setForm.equipment_ids.includes(item.id));
                      if (availableItems.length === 0) return null;
                      return (
                        <div key={category.id} className="equipment-category-section">
                          <div className="category-label">{category.icon} {category.name}</div>
                          <div className="equipment-tiles">
                            {availableItems.map(item => (
                              <div
                                key={item.id}
                                className="equipment-tile"
                                onClick={() => toggleEquipmentInSet(item.id)}
                                title="Click to add to set"
                              >
                                <span className="tile-name">{getEquipmentDisplayName(item)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {equipmentByCategory.every(({ items }) => items.every(item => setForm.equipment_ids.includes(item.id))) && (
                      <p className="empty-hint">All equipment added to set</p>
                    )}
                  </div>
                </div>
                
                <div className="panel-divider">
                  <span className="divider-arrow">→</span>
                </div>
                
                <div className="equipment-panel selected-panel">
                  <div className="panel-header">In This Set ({setForm.equipment_ids.length})</div>
                  <div className="panel-content">
                    {equipmentByCategory.map(({ category, items }) => {
                      const selectedItems = items.filter(item => setForm.equipment_ids.includes(item.id));
                      if (selectedItems.length === 0) return null;
                      return (
                        <div key={category.id} className="equipment-category-section">
                          <div className="category-label">{category.icon} {category.name}</div>
                          <div className="equipment-tiles">
                            {selectedItems.map(item => (
                              <div
                                key={item.id}
                                className="equipment-tile selected"
                                onClick={() => toggleEquipmentInSet(item.id)}
                                title="Click to remove from set"
                              >
                                <span className="tile-name">{getEquipmentDisplayName(item)}</span>
                                <span className="tile-remove">×</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {setForm.equipment_ids.length === 0 && (
                      <p className="empty-hint">Click equipment on the left to add</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn btn-secondary" onClick={resetSetForm} disabled={savingSet}>
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveSet}
                  disabled={!setForm.name.trim() || savingSet}
                >
                  {savingSet ? 'Saving...' : (editingSet ? 'Save Changes' : 'Create Set')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
