import { useState, useEffect } from 'react';
import { adminAPI } from '../../api/services';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const DAYS = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];

// ─── Doctor List ──────────────────────────────────────────────────────────────
export function DoctorList() {
  const [doctors, setDoctors] = useState([]);
  const [specs,   setSpecs]   = useState([]);
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState({ open:false, mode:'create', data:null });
  const [form,    setForm]    = useState({ staff:'', specialization:'', consultation_fee:'', max_patient_per_day:20 });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [errors,  setErrors]  = useState({});
  const [saving,  setSaving]  = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [d, s, st] = await Promise.all([
        adminAPI.getDoctors(),
        adminAPI.getSpecializations(),
        adminAPI.getStaff(),
      ]);
      setDoctors(d.data.data || d.data);
      setSpecs(s.data.data   || s.data);
      setStaff(st.data.data  || st.data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const open = (mode, doc = null) => {
    setForm(doc ? {
      staff: doc.staff, specialization: doc.specialization,
      consultation_fee: doc.consultation_fee, max_patient_per_day: doc.max_patient_per_day,
    } : { staff:'', specialization:'', consultation_fee:'', max_patient_per_day:20 });
    setErrors({});
    setImageFile(null);
    setImagePreview(doc?.profile_image || null);
    setModal({ open:true, mode, data:doc });
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // Client-side validation — show all required field errors immediately
    const fieldErrors = {};
    if (!form.staff)            fieldErrors.staff            = ['Please select a staff member.'];
    if (!form.specialization)   fieldErrors.specialization   = ['Please select a specialization.'];
    if (!form.consultation_fee) fieldErrors.consultation_fee = ['Consultation fee is required.'];
    if (!form.max_patient_per_day) fieldErrors.max_patient_per_day = ['Max patients per day is required.'];
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      toast.error('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === 'create') {
        // Step 1 — always create with plain JSON first
        const { data: created } = await adminAPI.createDoctor(form);
        const newId = created.data?.doctor_profile_id || created.doctor_profile_id;

        // Step 2 — if image selected, upload separately via PATCH
        if (imageFile && newId) {
          const fd = new FormData();
          fd.append('profile_image', imageFile);
          await adminAPI.updateDoctorImage(newId, fd);
        }
      } else {
        // Edit — image changed: send FormData, otherwise plain JSON
        if (imageFile) {
          const fd = new FormData();
          Object.entries(form).forEach(([k, v]) => fd.append(k, v));
          fd.append('profile_image', imageFile);
          await adminAPI.updateDoctorImage(modal.data.doctor_profile_id, fd);
        } else {
          await adminAPI.updateDoctor(modal.data.doctor_profile_id, form);
        }
      }
      toast.success(`Doctor profile ${modal.mode === 'create' ? 'created' : 'updated'}.`);
      setModal({ open:false });
      setImageFile(null);
      fetchAll();
    } catch (err) {
      const data = err.response?.data || {};
      const errs = data.errors || data;
      if (typeof errs === 'object' && !Array.isArray(errs)) setErrors(errs);
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const handleDelete = async (doc) => {
    if (!confirm('Delete this doctor profile?')) return;
    try {
      await adminAPI.deleteDoctor(doc.doctor_profile_id);
      toast.success('Doctor profile deleted.');
      fetchAll();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const getErr = (f) => errors[f]?.[0] || null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctor Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">{doctors.length} doctors registered</p>
        </div>
        <button onClick={() => open('create')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Doctor Profile
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['', 'Code', 'Doctor', 'Specialization', 'Fee', 'Max Patients/Day', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {doctors.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No doctor profiles found.</td></tr>
              ) : doctors.map((doc) => (
                <tr key={doc.doctor_profile_id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    {doc.profile_image ? (
                      <img src={doc.profile_image} alt="" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover' }} />
                    ) : (
                      <div style={{ width:34, height:34, borderRadius:'50%', background:'#f0fdfa', color:'#0f766e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600 }}>
                        {doc.staff_details?.user?.first_name?.[0] || 'D'}
                      </div>
                    )}
                  </td>
                  <td className="table-cell font-mono text-xs text-blue-600">{doc.doctor_code}</td>
                  <td className="table-cell">
                    <p className="font-medium">{doc.staff_details?.user?.first_name} {doc.staff_details?.user?.last_name}</p>
                    <p className="text-xs text-gray-400">{doc.staff_details?.user?.email}</p>
                  </td>
                  <td className="table-cell">{specs.find((s) => s.specialization_id === doc.specialization)?.name || '—'}</td>
                  <td className="table-cell">₹{Number(doc.consultation_fee).toLocaleString('en-IN')}</td>
                  <td className="table-cell">{doc.max_patient_per_day}</td>
                  <td className="table-cell">
                    <span className={doc.is_active ? 'badge-success' : 'badge-danger'}>
                      {doc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => open('edit', doc)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(doc)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open:false })}
        title={modal.mode === 'create' ? 'Add Doctor Profile' : 'Edit Doctor Profile'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Staff Member *</label>
            <select className={`input-field ${getErr('staff') ? 'border-red-400' : ''}`}
              value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })}>
              <option value="">Select staff member</option>
              {staff
                .filter((s) => s.role_display === 'Doctor' || s.role === 'Doctor')
                .map((s) => (
                  <option key={s.staff_id} value={s.staff_id}>
                    {s.user.first_name} {s.user.last_name} — {s.staff_code}
                  </option>
                ))
              }
            </select>
            {getErr('staff') && <p className="text-red-500 text-xs mt-1">{getErr('staff')}</p>}
          </div>
          <div>
            <label className="label">Specialization *</label>
            <select className={`input-field ${getErr('specialization') ? 'border-red-400' : ''}`}
              value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })}>
              <option value="">Select specialization</option>
              {specs.map((s) => (
                <option key={s.specialization_id} value={s.specialization_id}>{s.name}</option>
              ))}
            </select>
            {getErr('specialization') && <p className="text-red-500 text-xs mt-1">{getErr('specialization')}</p>}
          </div>
          <div>
            <label className="label">Profile Image (optional)</label>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {imagePreview && (
                <img src={imagePreview} alt="preview" style={{ width:56, height:56, borderRadius:'50%', objectFit:'cover', border:'2px solid #e5e7eb' }} />
              )}
              <div style={{ flex:1 }}>
                <input type="file" accept="image/*" className="input-field" style={{ padding:'6px 12px' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-1">JPG, PNG or WEBP. Will be shown on the hospital homepage.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Consultation Fee (₹) *</label>
              <input type="number" className={`input-field ${getErr('consultation_fee') ? 'border-red-400' : ''}`}
                value={form.consultation_fee}
                onChange={(e) => setForm({ ...form, consultation_fee: e.target.value })} />
              {getErr('consultation_fee') && <p className="text-red-500 text-xs mt-1">{getErr('consultation_fee')}</p>}
            </div>
            <div>
              <label className="label">Max Patients/Day *</label>
              <input type="number" className="input-field"
                value={form.max_patient_per_day} min={1} max={50}
                onChange={(e) => setForm({ ...form, max_patient_per_day: e.target.value })} />
            </div>
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

// ─── Schedule List ────────────────────────────────────────────────────────────
export function ScheduleList() {
  const [schedules, setSchedules] = useState([]);
  const [doctors,   setDoctors]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState({ open:false, mode:'create', data:null });
  const [form,      setForm]      = useState({ doctor:'', day_of_week:'MONDAY', start_time:'', end_time:'' });
  const [errors,    setErrors]    = useState({});
  const [saving,    setSaving]    = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sc, dc] = await Promise.all([adminAPI.getSchedules(), adminAPI.getDoctors()]);
      setSchedules(sc.data.data || sc.data);
      setDoctors(dc.data.data   || dc.data);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const open = (mode, s = null) => {
    setForm(s ? { doctor: s.doctor, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time }
               : { doctor:'', day_of_week:'MONDAY', start_time:'', end_time:'' });
    setErrors({});
    setModal({ open:true, mode, data:s });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === 'create') await adminAPI.createSchedule(form);
      else await adminAPI.updateSchedule(modal.data.schedule_id, form);
      toast.success(`Schedule ${modal.mode === 'create' ? 'created' : 'updated'}.`);
      setModal({ open:false });
      fetchAll();
    } catch (err) {
      const d = err.response?.data || {};
      setErrors(d.errors || d);
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const handleDelete = async (s) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await adminAPI.deleteSchedule(s.schedule_id);
      toast.success('Schedule deleted.');
      fetchAll();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const getDoctorName = (id) => {
    const doc = doctors.find((d) => d.doctor_profile_id === id);
    return doc ? `${doc.staff_details?.user?.first_name} ${doc.staff_details?.user?.last_name} (${doc.doctor_code})` : '—';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctor Schedules</h1>
          <p className="text-sm text-gray-500 mt-1">{schedules.length} schedules configured</p>
        </div>
        <button onClick={() => open('create')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Schedule
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['Doctor','Day','Start Time','End Time','Status','Actions'].map((h) => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schedules.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No schedules found.</td></tr>
              ) : schedules.map((s) => (
                <tr key={s.schedule_id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{getDoctorName(s.doctor)}</td>
                  <td className="table-cell"><span className="badge-info">{s.day_of_week}</span></td>
                  <td className="table-cell">{s.start_time}</td>
                  <td className="table-cell">{s.end_time}</td>
                  <td className="table-cell">
                    <span className={s.is_active ? 'badge-success' : 'badge-danger'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => open('edit', s)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open:false })}
        title={modal.mode === 'create' ? 'Add Schedule' : 'Edit Schedule'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Doctor *</label>
            <select className={`input-field ${errors.doctor ? 'border-red-400' : ''}`}
              value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })}>
              <option value="">Select doctor</option>
              {doctors.map((d) => (
                <option key={d.doctor_profile_id} value={d.doctor_profile_id}>
                  {d.staff_details?.user?.first_name} {d.staff_details?.user?.last_name} — {d.doctor_code}
                </option>
              ))}
            </select>
            {errors.doctor && <p className="text-red-500 text-xs mt-1">{errors.doctor[0]}</p>}
          </div>
          <div>
            <label className="label">Day of Week *</label>
            <select className="input-field" value={form.day_of_week}
              onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Time *</label>
              <input type="time" className={`input-field ${errors.start_time ? 'border-red-400' : ''}`}
                value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input type="time" className={`input-field ${errors.end_time ? 'border-red-400' : ''}`}
                value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
          {errors.non_field_errors && (
            <p className="text-red-500 text-xs">{errors.non_field_errors[0]}</p>
          )}
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

export default DoctorList;