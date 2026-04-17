import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../api/services';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import { Plus, Pencil, Trash2, UserCheck, UserX, Shield, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLES   = ['Admin', 'Doctor', 'Pharmacist', 'Receptionist'];
const GENDERS = [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }];

const EMPTY_FORM = {
  user: { username: '', first_name: '', last_name: '', email: '', password: '' },
  gender: '', date_of_birth: '', phone: '', address: '', qualification: '', salary: '', set_role: '',
};

// ─── Validation helpers (FIX #1 — real-time) ─────────────────────────────────

const hasKeyboardSmash = (str) => {
  const s = str.replace(/\s/g, '').toLowerCase();
  if (s.length > 3 && new Set(s).size === 1) return true;
  if (s.length >= 5 && /^[a-z]+$/.test(s) && !/[aeiou]/.test(s)) return true;
  return false;
};

const validateField = (name, value, form) => {
  switch (name) {
    case 'first_name':
      if (!value.trim()) return 'First name is required.';
      if (value.trim().length < 2) return 'First name must be at least 2 characters.';
      if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'First name can only contain letters.';
      if (hasKeyboardSmash(value)) return 'First name appears to be invalid.';
      return '';
    case 'last_name':
      // Last name is optional — a person may have no last name
      if (!value || !value.trim()) return '';
      if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'Last name can only contain letters.';
      if (hasKeyboardSmash(value)) return 'Last name appears to be invalid.';
      return '';
    case 'username':
      if (!value.trim()) return 'Username is required.';
      if (value.trim().length < 3) return 'Username must be at least 3 characters.';
      if (!/^[a-zA-Z0-9_]+$/.test(value.trim())) return 'Letters, numbers and underscores only.';
      return '';
    case 'email':
      if (!value.trim()) return 'Email is required.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())) return 'Enter a valid email address.';
      return '';
    case 'password':
      if (!value) return ''; // password optional on edit
      if (value.length < 6) return 'Password must be at least 6 characters.';
      if (/^\d+$/.test(value)) return 'Password cannot be entirely numeric.';
      if (/^[a-zA-Z]+$/.test(value)) return 'Password must include a number or special character.';
      return '';
    // FIX #11: 10 digits starting with 6,7,8,9
    case 'phone':
      if (!value.trim()) return 'Phone number is required.';
      if (!/^[6-9]\d{9}$/.test(value.trim())) return 'Enter a valid 10-digit number starting with 6, 7, 8, or 9.';
      return '';
    case 'gender':
      if (!value) return 'Gender is required.';
      return '';
    case 'date_of_birth': {
      if (!value) return 'Date of birth is required.';
      const today = new Date();
      const dob   = new Date(value);
      if (dob >= today) return 'Date of birth must be in the past.';
      let age = today.getFullYear() - dob.getFullYear();
      if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
      if (age < 21) return 'Staff must be at least 21 years old.';
      if (age > 60) return 'Staff cannot be older than 60 years.';
      return '';
    }
    case 'address':
      if (!value.trim()) return 'Address is required.';
      if (value.trim().length < 5) return 'Address must be at least 5 characters.';
      if (hasKeyboardSmash(value)) return 'Address appears to be invalid.';
      return '';
    // FIX #3: Qualification only required / validated when role is Doctor
    case 'qualification': {
      const role = form?.set_role || '';
      if (role !== 'Doctor') return ''; // not required for other roles
      const entries = value.split('\n').map(e => e.trim()).filter(Boolean);
      if (entries.length === 0) return 'Qualification is required for Doctor role.';
      for (const entry of entries) {
        if (entry.length < 3) return `Each qualification must be at least 3 characters.`;
        if (/^\d+$/.test(entry)) return 'Qualification cannot be numeric only.';
        if (hasKeyboardSmash(entry)) return 'Qualification entry appears to be invalid.';
      }
      return '';
    }
    case 'salary':
      if (value === '' || value === null || value === undefined) return 'Salary is required.';
      if (Number(value) <= 0) return 'Salary must be greater than zero.';
      if (Number(value) > 1000000) return 'Salary cannot exceed 10,00,000.';
      return '';
    default:
      return '';
  }
};

export default function StaffList() {
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState({ open: false, mode: 'create', data: null });
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [errors,  setErrors]  = useState({});
  const [touched, setTouched] = useState({});
  const [saving,  setSaving]  = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getStaff();
      setStaff(data.data || data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStaff(); }, []);

  const open = (mode, s = null) => {
    if (s) {
      setForm({
        user: { username: s.user.username, first_name: s.user.first_name, last_name: s.user.last_name, email: s.user.email, password: '' },
        gender: s.gender, date_of_birth: s.date_of_birth, phone: s.phone,
        address: s.address, qualification: s.qualification || '', salary: s.salary, set_role: s.role || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
    setTouched({});
    setModal({ open: true, mode, data: s });
  };

  // FIX #1: validate on every change, mark field as touched
  const handleUserChange = (field, value) => {
    const newForm = { ...form, user: { ...form.user, [field]: value } };
    setForm(newForm);
    setTouched(t => ({ ...t, [field]: true }));
    setErrors(e => ({ ...e, [field]: validateField(field, value, newForm) }));
  };

  const handleFormChange = (field, value) => {
    const newForm = { ...form, [field]: value };
    setForm(newForm);
    setTouched(t => ({ ...t, [field]: true }));
    // Re-validate qualification when role changes (FIX #3)
    if (field === 'set_role') {
      setErrors(e => ({ ...e, qualification: validateField('qualification', newForm.qualification, newForm) }));
    }
    setErrors(e => ({ ...e, [field]: validateField(field, value, newForm) }));
  };

  const validateAll = () => {
    const e = {};
    // User fields
    ['username', 'first_name', 'email'].forEach(f => {
      const err = validateField(f, form.user[f] || '', form);
      if (err) e[f] = err;
    });
    if (modal.mode === 'create') {
      const err = validateField('password', form.user.password || '', form);
      if (err) e.password = err;
      if (!form.user.password) e.password = 'Password is required.';
    }
    ['gender', 'date_of_birth', 'phone', 'address', 'qualification', 'salary'].forEach(f => {
      const err = validateField(f, form[f] || '', form);
      if (err) e[f] = err;
    });
    return e;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const allErrors = validateAll();
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // mark all touched
      const allTouched = {};
      Object.keys(allErrors).forEach(k => { allTouched[k] = true; });
      setTouched(allTouched);
      toast.error('Please fix the errors before submitting.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        // FIX #3: qualification sent as newline-separated string; backend splits it
        qualification: form.qualification.trim(),
      };
      if (modal.mode === 'create') {
        await adminAPI.createStaff(payload);
        toast.success('Staff created successfully.');
      } else {
        const updatePayload = { ...payload };
        if (!updatePayload.user.password) delete updatePayload.user.password;
        await adminAPI.updateStaff(modal.data.staff_id, updatePayload);
        toast.success('Staff updated successfully.');
      }
      setModal({ open: false });
      fetchStaff();
    } catch (err) {
      const data = err.response?.data || {};
      const errs = data.errors || data;
      if (typeof errs === 'object') {
        const flat = {};
        Object.entries(errs).forEach(([k, v]) => {
          if (k === 'user' && typeof v === 'object') {
            Object.entries(v).forEach(([uk, uv]) => { flat[uk] = Array.isArray(uv) ? uv[0] : uv; });
          } else {
            flat[k] = Array.isArray(v) ? v[0] : v;
          }
        });
        setErrors(flat);
      }
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete staff member ${s.user.first_name} ${s.user.last_name}?`)) return;
    try {
      await adminAPI.deleteStaff(s.staff_id);
      toast.success('Staff deleted.');
      fetchStaff();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleToggleActive = async (s) => {
    try {
      if (s.is_active) await adminAPI.deactivateStaff(s.staff_id);
      else             await adminAPI.activateStaff(s.staff_id);
      toast.success(`Staff ${s.is_active ? 'deactivated' : 'activated'}.`);
      fetchStaff();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const getErr = (f) => (touched[f] || errors[f]) ? errors[f] : '';

  const filtered = staff.filter(s =>
    `${s.user.first_name} ${s.user.last_name} ${s.user.email} ${s.staff_code}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const isDoctor = form.set_role === 'Doctor';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">{staff.length} staff members</p>
        </div>
        <button onClick={() => open('create')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Staff
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-9" placeholder="Search staff..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['Code','Name','Role','Phone','Gender','Status','Actions'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No staff found.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.staff_id} className="hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs text-blue-600">{s.staff_code}</td>
                  <td className="table-cell">
                    <p className="font-medium">{s.user.first_name} {s.user.last_name}</p>
                    <p className="text-xs text-gray-400">{s.user.email}</p>
                  </td>
                  <td className="table-cell">
                    {s.role ? <span className="badge-info">{s.role}</span> : <span className="text-gray-400 text-xs">No role</span>}
                  </td>
                  <td className="table-cell text-sm">{s.phone}</td>
                  <td className="table-cell text-sm">{s.gender}</td>
                  <td className="table-cell">
                    <span className={s.is_active ? 'badge-success' : 'badge-danger'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1.5">
                      <button onClick={() => open('edit', s)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleToggleActive(s)} className={`p-1.5 rounded ${s.is_active ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600'}`} title={s.is_active ? 'Deactivate' : 'Activate'}>
                        {s.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false })}
        title={modal.mode === 'create' ? 'Add Staff Member' : 'Edit Staff Member'} size="lg">
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input className={`input-field ${getErr('first_name') ? 'border-red-400' : ''}`}
                value={form.user.first_name}
                onChange={e => handleUserChange('first_name', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, first_name: true }))} />
              {getErr('first_name') && <p className="text-red-500 text-xs mt-1">{getErr('first_name')}</p>}
            </div>
            <div>
              <label className="label">Last Name <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
              <input className={`input-field ${getErr('last_name') ? 'border-red-400' : ''}`}
                value={form.user.last_name}
                onChange={e => handleUserChange('last_name', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, last_name: true }))} />
              {getErr('last_name') && <p className="text-red-500 text-xs mt-1">{getErr('last_name')}</p>}
            </div>
          </div>

          {/* Username / Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Username *</label>
              <input className={`input-field ${getErr('username') ? 'border-red-400' : ''}`}
                value={form.user.username}
                onChange={e => handleUserChange('username', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, username: true }))} />
              {getErr('username') && <p className="text-red-500 text-xs mt-1">{getErr('username')}</p>}
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className={`input-field ${getErr('email') ? 'border-red-400' : ''}`}
                value={form.user.email}
                onChange={e => handleUserChange('email', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, email: true }))} />
              {getErr('email') && <p className="text-red-500 text-xs mt-1">{getErr('email')}</p>}
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="label">Password {modal.mode === 'create' ? '*' : '(leave blank to keep current)'}</label>
            <input type="password" className={`input-field ${getErr('password') ? 'border-red-400' : ''}`}
              value={form.user.password}
              onChange={e => handleUserChange('password', e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, password: true }))} />
            {getErr('password') && <p className="text-red-500 text-xs mt-1">{getErr('password')}</p>}
          </div>

          {/* Role / Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Role</label>
              <select className="input-field" value={form.set_role}
                onChange={e => handleFormChange('set_role', e.target.value)}>
                <option value="">Select role</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Gender *</label>
              <select className={`input-field ${getErr('gender') ? 'border-red-400' : ''}`}
                value={form.gender} onChange={e => handleFormChange('gender', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, gender: true }))}>
                <option value="">Select gender</option>
                {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              {getErr('gender') && <p className="text-red-500 text-xs mt-1">{getErr('gender')}</p>}
            </div>
          </div>

          {/* DOB / Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date of Birth *</label>
              <input type="date" className={`input-field ${getErr('date_of_birth') ? 'border-red-400' : ''}`}
                value={form.date_of_birth} onChange={e => handleFormChange('date_of_birth', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, date_of_birth: true }))} />
              {getErr('date_of_birth') && <p className="text-red-500 text-xs mt-1">{getErr('date_of_birth')}</p>}
            </div>
            <div>
              <label className="label">Phone * <span className="text-gray-400 font-normal text-xs">(10 digits, starts with 6-9)</span></label>
              <input className={`input-field ${getErr('phone') ? 'border-red-400' : ''}`}
                value={form.phone} maxLength={10}
                onChange={e => handleFormChange('phone', e.target.value.replace(/\D/g, ''))}
                onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                placeholder="9876543210" />
              {getErr('phone') && <p className="text-red-500 text-xs mt-1">{getErr('phone')}</p>}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="label">Address *</label>
            <textarea rows={2} className={`input-field resize-none ${getErr('address') ? 'border-red-400' : ''}`}
              value={form.address} onChange={e => handleFormChange('address', e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, address: true }))} />
            {getErr('address') && <p className="text-red-500 text-xs mt-1">{getErr('address')}</p>}
          </div>

          {/* FIX #3: Qualification — shown only for Doctor, supports multi-line entries */}
          {isDoctor && (
            <div>
              <label className="label">
                Qualifications * <span className="text-gray-400 font-normal text-xs">(one per line, e.g. MBBS, MD)</span>
              </label>
              <textarea
                rows={3}
                className={`input-field resize-none font-mono text-sm ${getErr('qualification') ? 'border-red-400' : ''}`}
                placeholder={"MBBS\nMD Cardiology\nFRCS"}
                value={form.qualification}
                onChange={e => handleFormChange('qualification', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, qualification: true }))}
              />
              <p className="text-xs text-gray-400 mt-1">Enter each qualification on a new line (no commas needed).</p>
              {getErr('qualification') && <p className="text-red-500 text-xs mt-1">{getErr('qualification')}</p>}
            </div>
          )}

          {/* Salary */}
          <div>
            <label className="label">Salary (₹) *</label>
            <input type="number" className={`input-field ${getErr('salary') ? 'border-red-400' : ''}`}
              value={form.salary} onChange={e => handleFormChange('salary', e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, salary: true }))} />
            {getErr('salary') && <p className="text-red-500 text-xs mt-1">{getErr('salary')}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setModal({ open: false })} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : modal.mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}