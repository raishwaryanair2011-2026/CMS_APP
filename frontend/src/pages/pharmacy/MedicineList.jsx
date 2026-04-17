import { useState, useEffect } from 'react';
import { pharmacyAPI } from '../../api/services';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage, formatDate } from '../../utils/helpers';
import { Plus, Pencil, Search, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Medicine List ────────────────────────────────────────────────────────────
const EMPTY_MED = { name:'', generic_name:'', company:'', price:'', category:'', reorder_level:10, is_active:true };

export function MedicineList() {
  const [medicines,   setMedicines]   = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [modal,       setModal]       = useState({ open:false, mode:'create', data:null });
  const [catModal,    setCatModal]    = useState(false);
  const [form,        setForm]        = useState(EMPTY_MED);
  const [catName,     setCatName]     = useState('');
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        pharmacyAPI.getMedicines(),
        pharmacyAPI.getCategories(),
      ]);
      setMedicines(mRes.data.data  || mRes.data);
      setCategories(cRes.data.data || cRes.data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const open = (mode, m = null) => {
    setForm(m ? { name:m.name, generic_name:m.generic_name, company:m.company,
                  price:m.price, category:m.category, reorder_level:m.reorder_level, is_active:m.is_active }
               : EMPTY_MED);
    setErrors({});
    setModal({ open:true, mode, data:m });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === 'create') await pharmacyAPI.createMedicine(form);
      else await pharmacyAPI.updateMedicine(modal.data.id, form);
      toast.success(`Medicine ${modal.mode === 'create' ? 'added' : 'updated'}.`);
      setModal({ open:false });
      fetchAll();
    } catch (err) {
      setErrors((err.response?.data?.errors || err.response?.data || {}));
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      await pharmacyAPI.createCategory({ name: catName });
      toast.success('Category added.');
      setCatModal(false);
      setCatName('');
      fetchAll();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const getErr = (f) => errors[f]?.[0] || null;

  const filtered = medicines.filter((m) =>
    `${m.name} ${m.generic_name} ${m.company}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medicines</h1>
          <p className="text-sm text-gray-500 mt-1">{medicines.length} medicines in catalogue</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal(true)} className="btn-secondary text-sm">+ Category</button>
          <button onClick={() => open('create')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Medicine
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-9" placeholder="Search medicines..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['Name','Generic','Company','Category','Price','Stock','Reorder','Status','Actions'].map((h) => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">No medicines found.</td></tr>
              ) : filtered.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{m.name}</td>
                  <td className="table-cell text-gray-500 text-xs">{m.generic_name}</td>
                  <td className="table-cell text-sm">{m.company}</td>
                  <td className="table-cell text-sm">{m.category_name}</td>
                  <td className="table-cell">₹{Number(m.price).toFixed(2)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      {m.needs_reorder && <AlertTriangle size={12} className="text-amber-500" />}
                      <span className={m.needs_reorder ? 'text-amber-600 font-medium' : ''}>{m.total_stock}</span>
                    </div>
                  </td>
                  <td className="table-cell text-sm">{m.reorder_level}</td>
                  <td className="table-cell">
                    <span className={m.is_active ? 'badge-success' : 'badge-danger'}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <button onClick={() => open('edit', m)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Medicine Modal */}
      <Modal isOpen={modal.open} onClose={() => setModal({ open:false })}
        title={modal.mode === 'create' ? 'Add Medicine' : 'Edit Medicine'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Medicine Name *</label>
              <input className={`input-field ${getErr('name') ? 'border-red-400' : ''}`}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {getErr('name') && <p className="text-red-500 text-xs mt-1">{getErr('name')}</p>}
            </div>
            <div>
              <label className="label">Generic Name *</label>
              <input className={`input-field ${getErr('generic_name') ? 'border-red-400' : ''}`}
                value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} />
              {getErr('generic_name') && <p className="text-red-500 text-xs mt-1">{getErr('generic_name')}</p>}
            </div>
            <div>
              <label className="label">Company *</label>
              <input className={`input-field ${getErr('company') ? 'border-red-400' : ''}`}
                value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              {getErr('company') && <p className="text-red-500 text-xs mt-1">{getErr('company')}</p>}
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input-field" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Price (₹) *</label>
              <input type="number" step="0.01" className={`input-field ${getErr('price') ? 'border-red-400' : ''}`}
                value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              {getErr('price') && <p className="text-red-500 text-xs mt-1">{getErr('price')}</p>}
            </div>
            <div>
              <label className="label">Reorder Level</label>
              <input type="number" className="input-field"
                value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setModal({ open:false })} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : modal.mode === 'create' ? 'Add Medicine' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal isOpen={catModal} onClose={() => setCatModal(false)} title="Add Category">
        <form onSubmit={handleAddCategory} className="space-y-4">
          <div>
            <label className="label">Category Name *</label>
            <input className="input-field" value={catName}
              onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Antibiotics" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setCatModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Add Category</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Batch List ───────────────────────────────────────────────────────────────
const EMPTY_BATCH = { batch_no:'', medicine:'', stock_level:'', purchase_date:'', expiry_date:'' };

export function BatchList() {
  const [batches,    setBatches]    = useState([]);
  const [medicines,  setMedicines]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState({ open:false, data:null });
  const [form,       setForm]       = useState(EMPTY_BATCH);
  const [errors,     setErrors]     = useState({});
  const [saving,     setSaving]     = useState(false);
  const [filter,     setFilter]     = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [bRes, mRes] = await Promise.all([
        pharmacyAPI.getBatches(),
        pharmacyAPI.getMedicines({ is_active: true }),
      ]);
      setBatches(bRes.data.data  || bRes.data);
      setMedicines(mRes.data.data || mRes.data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await pharmacyAPI.createBatch(form);
      toast.success('Batch added successfully.');
      setModal({ open:false });
      fetchAll();
    } catch (err) {
      setErrors((err.response?.data?.errors || err.response?.data || {}));
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const getErr = (f) => errors[f]?.[0] || null;

  const filtered = batches.filter((b) =>
    b.medicine_name?.toLowerCase().includes(filter.toLowerCase()) ||
    b.batch_no.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Batches</h1>
          <p className="text-sm text-gray-500 mt-1">{batches.length} batches in inventory</p>
        </div>
        <button onClick={() => { setForm(EMPTY_BATCH); setErrors({}); setModal({ open:true }); }}
          className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Batch
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-9" placeholder="Search by medicine or batch number..."
          value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['Batch No','Medicine','Stock','Purchase Date','Expiry Date','Status'].map((h) => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No batches found.</td></tr>
              ) : filtered.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs text-blue-600">{b.batch_no}</td>
                  <td className="table-cell">
                    <p className="font-medium">{b.medicine_name}</p>
                    <p className="text-xs text-gray-400">{b.medicine_generic}</p>
                  </td>
                  <td className="table-cell">
                    <span className={b.stock_level === 0 ? 'text-red-600 font-bold' : 'font-medium'}>
                      {b.stock_level}
                    </span>
                  </td>
                  <td className="table-cell">{formatDate(b.purchase_date)}</td>
                  <td className="table-cell">
                    <span className={b.is_expired ? 'text-red-600 font-medium' : ''}>
                      {formatDate(b.expiry_date)}
                    </span>
                  </td>
                  <td className="table-cell">
                    {b.is_expired        ? <span className="badge-danger">Expired</span>      :
                     b.is_out_of_stock   ? <span className="badge-danger">Out of Stock</span> :
                     !b.is_active        ? <span className="badge-gray">Inactive</span>       :
                     <span className="badge-success">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open:false })} title="Add Stock Batch" size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Medicine *</label>
            <select className={`input-field ${getErr('medicine') ? 'border-red-400' : ''}`}
              value={form.medicine} onChange={(e) => setForm({ ...form, medicine: e.target.value })}>
              <option value="">Select medicine</option>
              {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.generic_name})</option>)}
            </select>
            {getErr('medicine') && <p className="text-red-500 text-xs mt-1">{getErr('medicine')}</p>}
          </div>
          <div>
            <label className="label">Batch Number *</label>
            <input className={`input-field ${getErr('batch_no') ? 'border-red-400' : ''}`}
              value={form.batch_no} placeholder="e.g. BATCH-001"
              onChange={(e) => setForm({ ...form, batch_no: e.target.value.toUpperCase() })} />
            {getErr('batch_no') && <p className="text-red-500 text-xs mt-1">{getErr('batch_no')}</p>}
            <p className="text-xs text-gray-400 mt-1">Uppercase letters, numbers, and hyphens only</p>
          </div>
          <div>
            <label className="label">Stock Level *</label>
            <input type="number" className={`input-field ${getErr('stock_level') ? 'border-red-400' : ''}`}
              value={form.stock_level} onChange={(e) => setForm({ ...form, stock_level: e.target.value })} />
            {getErr('stock_level') && <p className="text-red-500 text-xs mt-1">{getErr('stock_level')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Purchase Date *</label>
              <input type="date" className={`input-field ${getErr('purchase_date') ? 'border-red-400' : ''}`}
                value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              {getErr('purchase_date') && <p className="text-red-500 text-xs mt-1">{getErr('purchase_date')}</p>}
            </div>
            <div>
              <label className="label">Expiry Date *</label>
              <input type="date" className={`input-field ${getErr('expiry_date') ? 'border-red-400' : ''}`}
                value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              {getErr('expiry_date') && <p className="text-red-500 text-xs mt-1">{getErr('expiry_date')}</p>}
            </div>
          </div>
          {errors.non_field_errors && (
            <p className="text-red-500 text-sm">{errors.non_field_errors[0]}</p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setModal({ open:false })} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Adding...' : 'Add Batch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default MedicineList;