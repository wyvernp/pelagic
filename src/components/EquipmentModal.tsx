import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { EquipmentCategory, EquipmentWithCategory, EquipmentSet, EquipmentSetWithItems } from '../types';
import './EquipmentModal.css';

interface EquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'equipment' | 'sets';
type SetType = 'dive' | 'camera';

export function EquipmentModal({ isOpen, onClose }: EquipmentModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('equipment');
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [equipment, setEquipment] = useState<EquipmentWithCategory[]>([]);
  const [sets, setSets] = useState<EquipmentSet[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
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
      console.error('Failed to load equipment data:', error);
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
      console.error('Failed to save equipment:', error);
    }
  };

  const handleEditEquipment = (item: EquipmentWithCategory) => {
    setEditingEquipment(item);
    setEquipmentForm({
      category_id: item.category_id,
      name: item.name,
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
      `Are you sure you want to delete "${item.name}"? This will remove it from all equipment sets.`,
      { title: 'Delete Equipment', kind: 'warning' }
    );
    
    if (confirmed) {
      try {
        await invoke('delete_equipment', { id: item.id });
        loadData();
      } catch (error) {
        console.error('Failed to delete equipment:', error);
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
    try {
      if (editingSet) {
        await invoke('update_equipment_set', {
          id: editingSet.id,
          name: setForm.name,
          description: setForm.description || null,
          setType: setForm.set_type,
          isDefault: setForm.is_default,
        });
        await invoke('set_equipment_set_items', {
          setId: editingSet.id,
          equipmentIds: setForm.equipment_ids,
        });
      } else {
        const newSetId = await invoke<number>('create_equipment_set', {
          name: setForm.name,
          description: setForm.description || null,
          setType: setForm.set_type,
          isDefault: setForm.is_default,
        });
        if (setForm.equipment_ids.length > 0) {
          await invoke('set_equipment_set_items', {
            setId: newSetId,
            equipmentIds: setForm.equipment_ids,
          });
        }
      }
      
      resetSetForm();
      loadData();
    } catch (error) {
      console.error('Failed to save equipment set:', error);
    }
  };

  const handleEditSet = async (set: EquipmentSet) => {
    try {
      const fullSet = await invoke<EquipmentSetWithItems | null>('get_equipment_set_with_items', { id: set.id });
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
      }
    } catch (error) {
      console.error('Failed to load equipment set:', error);
    }
  };

  const handleDeleteSet = async (set: EquipmentSet) => {
    const confirmed = await confirm(
      `Are you sure you want to delete the "${set.name}" equipment set?`,
      { title: 'Delete Equipment Set', kind: 'warning' }
    );
    
    if (confirmed) {
      try {
        await invoke('delete_equipment_set', { id: set.id });
        loadData();
      } catch (error) {
        console.error('Failed to delete equipment set:', error);
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

  // Filter equipment by category
  const filteredEquipment = selectedCategory === 'all'
    ? equipment
    : equipment.filter(e => e.category_id === selectedCategory);

  // Filter sets by type
  const filteredSets = sets.filter(s => s.set_type === selectedSetType);

  // Group equipment by category for display in set editor
  const equipmentByCategory = categories.map(cat => ({
    category: cat,
    items: equipment.filter(e => e.category_id === cat.id && !e.is_retired),
  })).filter(g => g.items.length > 0);

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
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  className="category-filter"
                >
                  <option value="all">All Categories</option>
                  {categories.map(cat => (
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
                <div className="equipment-grid">
                  {filteredEquipment.map(item => (
                    <div 
                      key={item.id} 
                      className={`equipment-card ${item.is_retired ? 'retired' : ''}`}
                    >
                      <div className="equipment-card-header">
                        <span className="equipment-category-badge">
                          {categories.find(c => c.id === item.category_id)?.icon} {item.category_name}
                        </span>
                        {item.is_retired && <span className="retired-badge">Retired</span>}
                      </div>
                      <h4 className="equipment-name">{item.name}</h4>
                      {(item.brand || item.model) && (
                        <p className="equipment-brand">
                          {[item.brand, item.model].filter(Boolean).join(' ')}
                        </p>
                      )}
                      {item.serial_number && (
                        <p className="equipment-serial">S/N: {item.serial_number}</p>
                      )}
                      <div className="equipment-card-actions">
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
                  <label>Name *</label>
                  <input
                    type="text"
                    value={equipmentForm.name}
                    onChange={(e) => setEquipmentForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Primary Camera, Main BCD"
                    required
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
                  disabled={!equipmentForm.name.trim()}
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

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={setForm.description}
                  onChange={(e) => setSetForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={setForm.is_default}
                    onChange={(e) => setSetForm(prev => ({ ...prev, is_default: e.target.checked }))}
                  />
                  <span>Set as default for new dives</span>
                </label>
              </div>

              <div className="form-group">
                <label>Equipment in this Set</label>
                <div className="equipment-selector">
                  {equipmentByCategory.map(({ category, items }) => (
                    <div key={category.id} className="category-group">
                      <h5 className="category-header">{category.icon} {category.name}</h5>
                      <div className="category-items">
                        {items.map(item => (
                          <label key={item.id} className="equipment-checkbox">
                            <input
                              type="checkbox"
                              checked={setForm.equipment_ids.includes(item.id)}
                              onChange={() => toggleEquipmentInSet(item.id)}
                            />
                            <span className="equipment-checkbox-label">
                              <span className="equipment-checkbox-name">{item.name}</span>
                              {(item.brand || item.model) && (
                                <span className="equipment-checkbox-detail">
                                  {[item.brand, item.model].filter(Boolean).join(' ')}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {equipmentByCategory.length === 0 && (
                    <p className="empty-hint">Add equipment first to include it in sets.</p>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button className="btn btn-secondary" onClick={resetSetForm}>
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveSet}
                  disabled={!setForm.name.trim()}
                >
                  {editingSet ? 'Save Changes' : 'Create Set'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
