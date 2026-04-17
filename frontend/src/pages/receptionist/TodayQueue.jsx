// TodayQueue.jsx — Today's appointment queue
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI } from '../../api/services';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage, formatDate, getStatusBadge } from '../../utils/helpers';
import { RefreshCw, Ban, CheckCircle, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

export function TodayQueue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await receptionAPI.getTodayAppointments();
      setAppointments(data.data || data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const handleCancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await receptionAPI.cancelAppointment(id);
      toast.success('Appointment cancelled.');
      fetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const handleComplete = async (id) => {
    try {
      await receptionAPI.completeAppointment(id);
      toast.success('Appointment marked as completed.');
      fetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's Queue</h1>
          <p className="text-sm text-gray-500 mt-1">{appointments.length} appointments today</p>
        </div>
        <button onClick={fetch} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['Token', 'Appointment Code', 'Patient', 'Phone', 'Status', 'Billing', 'Actions'].map((h) => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {appointments.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No appointments for today.</td></tr>
              ) : appointments.map((apt) => (
                <tr key={apt.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                      {apt.token_no}
                    </span>
                  </td>
                  <td className="table-cell font-mono text-xs text-blue-600">{apt.appointment_code}</td>
                  <td className="table-cell">
                    <p className="font-medium">{apt.patient?.full_name}</p>
                    <p className="text-xs text-gray-400">{apt.patient?.patient_code}</p>
                  </td>
                  <td className="table-cell">{apt.patient?.phone}</td>
                  <td className="table-cell"><span className={getStatusBadge(apt.status)}>{apt.status}</span></td>
                  <td className="table-cell">
                    <div>
                      <span className={getStatusBadge(apt.billing?.payment_status)}>
                        {apt.billing?.payment_status || '—'}
                      </span>
                      {apt.billing?.bill_no && (
                        <p className="text-xs font-mono text-gray-400 mt-0.5">{apt.billing.bill_no}</p>
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1.5">
                      {apt.status === 'BOOKED' && (
                        <button onClick={() => handleCancel(apt.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Cancel">
                          <Ban size={14} />
                        </button>
                      )}
                      {apt.status === 'IN_PROGRESS' && (
                        <button onClick={() => handleComplete(apt.id)}
                          className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Mark Complete">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {apt.billing?.id && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await receptionAPI.printBillPdf(apt.billing.id);
                              const blob = new Blob([res.data], { type: 'application/pdf' });
                              const url  = window.URL.createObjectURL(blob);
                              window.open(url, '_blank');
                              setTimeout(() => window.URL.revokeObjectURL(url), 10000);
                            } catch (e) { toast.error('Could not load bill PDF.'); }
                          }}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Print Bill">
                          <Printer size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── PatientList ──────────────────────────────────────────────────────────────
import Modal from '../../components/shared/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const EMPTY = { full_name: '', dob: '', gender: '', phone: '', address: '', blood_group: '' };

// FIX #2: keyboard-smash detector
const hasKeyboardSmash = (str) => {
  const s = str.replace(/\s/g, '').toLowerCase();
  if (s.length > 3 && new Set(s).size === 1) return true;
  if (s.length >= 5 && /^[a-z]+$/.test(s) && !/[aeiou]/.test(s)) return true;
  return false;
};

// FIX #1: real-time field validators
const validatePatientField = (name, value) => {
  switch (name) {
    case 'full_name':
      if (!value.trim()) return 'Full name is required.';
      if (value.trim().length < 2) return 'Full name must be at least 2 characters.';
      if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'Full name can only contain letters.';
      if (hasKeyboardSmash(value)) return 'Full name appears to be invalid.';
      return '';
    // FIX #11: 10 digits starting with 6,7,8,9
    // FIX #7: No duplicate check — family members may share numbers
    case 'phone':
      if (!value.trim()) return 'Phone number is required.';
      if (!/^[6-9]\d{9}$/.test(value.trim()))
        return 'Enter a valid 10-digit number starting with 6, 7, 8, or 9.';
      return '';
    case 'gender':
      if (!value) return 'Gender is required.';
      return '';
    case 'dob':
      if (value) {
        const today = new Date();
        const dob   = new Date(value);
        if (dob > today) return 'Date of birth cannot be in the future.';
        const age = (today - dob) / (365.25 * 24 * 3600 * 1000);
        if (age > 120) return 'Invalid date of birth.';
      }
      return '';
    case 'address':
      if (value && value.length > 500) return 'Address cannot exceed 500 characters.';
      return '';
    default:
      return '';
  }
};

export function PatientList() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState({ open: false, mode: 'create', data: null });
  const [form,     setForm]     = useState(EMPTY);
  const [errors,   setErrors]   = useState({});
  const [touched,  setTouched]  = useState({});
  const [saving,   setSaving]   = useState(false);

  const fetchPatients = async (q = '') => {
    setLoading(true);
    try {
      const { data } = await receptionAPI.getPatients(q);
      setPatients(data.data || data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPatients(); }, []);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    fetchPatients(e.target.value);
  };

  const open = (mode, p = null) => {
    setForm(p
      ? { full_name: p.full_name, dob: p.dob || '', gender: p.gender, phone: p.phone, address: p.address || '', blood_group: p.blood_group || '' }
      : EMPTY);
    setErrors({});
    setTouched({});
    setModal({ open: true, mode, data: p });
  };

  // FIX #1: validate on every keystroke
  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setTouched(t => ({ ...t, [field]: true }));
    setErrors(e => ({ ...e, [field]: validatePatientField(field, value) }));
  };

  const validateAll = () => {
    const e = {};
    ['full_name', 'phone', 'gender', 'dob', 'address'].forEach(f => {
      const err = validatePatientField(f, form[f] || '');
      if (err) e[f] = err;
    });
    return e;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const allErrors = validateAll();
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setTouched({ full_name: true, phone: true, gender: true, dob: true, address: true });
      toast.error('Please fix the errors before submitting.');
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        const { data } = await receptionAPI.createPatient(form);
        const newPatient = data.data || data;
        toast.success('Patient registered successfully.');
        setModal({ open: false });
        fetchPatients(search);
        // FIX #5: Auto-navigate to book appointment with the new patient pre-selected
        navigate('/reception/book', { state: { preselectedPatient: newPatient } });
      } else {
        await receptionAPI.updatePatient(modal.data.id, form);
        toast.success('Patient updated.');
        setModal({ open: false });
        fetchPatients(search);
      }
    } catch (err) {
      const errs = err.response?.data?.errors || err.response?.data || {};
      if (typeof errs === 'object') {
        setErrors(errs);
      }
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const handleDelete = async (p) => {
    if (!confirm(`Deactivate patient ${p.full_name}?`)) return;
    try {
      await receptionAPI.deletePatient(p.id);
      toast.success('Patient deactivated.');
      fetchPatients(search);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const getErr = (f) => (touched[f] ? errors[f] : '');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="text-sm text-gray-500 mt-1">{patients.length} patients registered</p>
        </div>
        <button onClick={() => open('create')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Register Patient
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-9" placeholder="Search by name or phone..."
          value={search} onChange={handleSearch} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['Code', 'Name', 'Gender', 'Age', 'Blood Group', 'Phone', 'Actions'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {patients.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No patients found.</td></tr>
              ) : patients.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs text-blue-600">{p.patient_code}</td>
                  <td className="table-cell">
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-xs text-gray-400">{formatDate(p.dob)}</p>
                  </td>
                  <td className="table-cell">{p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other'}</td>
                  <td className="table-cell">{p.age != null ? p.age : '—'}</td>
                  <td className="table-cell">
                    {p.blood_group
                      ? <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>{p.blood_group}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="table-cell">{p.phone}</td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => open('edit', p)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false })}
        title={modal.mode === 'create' ? 'Register Patient' : 'Edit Patient'}>
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          <div>
            <label className="label">Full Name *</label>
            <input className={`input-field ${getErr('full_name') ? 'border-red-400' : ''}`}
              value={form.full_name}
              onChange={e => handleChange('full_name', e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, full_name: true }))} />
            {getErr('full_name') && <p className="text-red-500 text-xs mt-1">{getErr('full_name')}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Gender *</label>
              <select className={`input-field ${getErr('gender') ? 'border-red-400' : ''}`}
                value={form.gender}
                onChange={e => handleChange('gender', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, gender: true }))}>
                <option value="">Select gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
              {getErr('gender') && <p className="text-red-500 text-xs mt-1">{getErr('gender')}</p>}
            </div>
            <div>
              <label className="label">Blood Group</label>
              <select className="input-field" value={form.blood_group}
                onChange={e => handleChange('blood_group', e.target.value)}>
                <option value="">Select blood group</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <input type="date" className={`input-field ${getErr('dob') ? 'border-red-400' : ''}`}
                value={form.dob}
                onChange={e => handleChange('dob', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, dob: true }))} />
              {getErr('dob') && <p className="text-red-500 text-xs mt-1">{getErr('dob')}</p>}
            </div>
            <div>
              <label className="label">Age (auto-calculated)</label>
              <div className="input-field flex items-center" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
                {form.dob ? (() => {
                  const today    = new Date();
                  today.setHours(0,0,0,0);
                  const dob      = new Date(form.dob + 'T00:00:00');
                  const deltaDays = Math.floor((today - dob) / 86400000);
                  if (deltaDays < 0) return 'Invalid date';
                  // Under 31 days — show days
                  if (deltaDays < 31) return `${deltaDays} day${deltaDays !== 1 ? 's' : ''}`;
                  // Under 24 months — show months
                  let months = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
                  if (today.getDate() < dob.getDate()) months--;
                  if (months < 24) return `${months} month${months !== 1 ? 's' : ''}`;
                  // 2 years and above — show years
                  let years = today.getFullYear() - dob.getFullYear();
                  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) years--;
                  return `${years} year${years !== 1 ? 's' : ''}`;
                })() : '— (fill date of birth)'}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Phone * <span className="text-gray-400 font-normal text-xs">(10 digits, starts with 6-9)</span></label>
            <input className={`input-field ${getErr('phone') ? 'border-red-400' : ''}`}
              value={form.phone} maxLength={10}
              onChange={e => handleChange('phone', e.target.value.replace(/\D/g, ''))}
              onBlur={() => setTouched(t => ({ ...t, phone: true }))}
              placeholder="9876543210" />
            {getErr('phone') && <p className="text-red-500 text-xs mt-1">{getErr('phone')}</p>}
            {/* FIX #7: Note that multiple family members with the same number is allowed */}
            <p className="text-xs text-gray-400 mt-1">Family members may share a phone number.</p>
          </div>

          <div>
            <label className="label">Address</label>
            <textarea className={`input-field ${getErr('address') ? 'border-red-400' : ''}`} rows={2}
              value={form.address}
              onChange={e => handleChange('address', e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, address: true }))} />
            {getErr('address') && <p className="text-red-500 text-xs mt-1">{getErr('address')}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setModal({ open: false })} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : modal.mode === 'create' ? 'Register & Book Appointment' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TodayQueue;