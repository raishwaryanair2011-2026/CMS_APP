// SpecializationList.jsx
import { useState, useEffect } from 'react';
import { adminAPI } from '../../api/services';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export function SpecializationList() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState({ open:false, mode:'create', data:null });
  const [name,    setName]    = useState('');
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const fetch = async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getSpecializations();
      setItems(data.data || data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const open = (mode, item = null) => {
    setName(item?.name || '');
    setError('');
    setModal({ open:true, mode, data:item });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      if (modal.mode === 'create') await adminAPI.createSpecialization({ name });
      else await adminAPI.updateSpecialization(modal.data.specialization_id, { name });
      toast.success(`Specialization ${modal.mode === 'create' ? 'created' : 'updated'}.`);
      setModal({ open:false });
      fetch();
    } catch (err) {
      const d = err.response?.data?.errors;
      setError(d?.name?.[0] || getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await adminAPI.deleteSpecialization(item.specialization_id);
      toast.success('Specialization deleted.');
      fetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Specializations</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} specializations</p>
        </div>
        <button onClick={() => open('create')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Specialization
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-9" placeholder="Search specializations..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.specialization_id} className="card flex items-center justify-between">
              <span className="font-medium text-gray-900">{item.name}</span>
              <div className="flex gap-2">
                <button onClick={() => open('edit', item)}
                  className="p-1.5 rounded hover:bg-blue-50 text-blue-600">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(item)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-400 text-sm col-span-3 text-center py-8">No specializations found.</p>
          )}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open:false })}
        title={modal.mode === 'create' ? 'Add Specialization' : 'Edit Specialization'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Specialization Name *</label>
            <input className={`input-field ${error ? 'border-red-400' : ''}`}
              value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. Cardiology" />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setModal({ open:false })} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : modal.mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SpecializationList;