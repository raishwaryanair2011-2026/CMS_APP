import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { receptionAPI, doctorAPI, pharmacyAPI } from '../../api/services';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import { Plus, Trash2, ArrowLeft, CheckCircle, Stethoscope, Pill, Printer, Download, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

// FIX #9: Structured frequency options (N-N-N format)
const FREQUENCY_OPTIONS = [
  { value: '1-0-0',   label: '1-0-0  (Morning only)' },
  { value: '0-1-0',   label: '0-1-0  (Afternoon only)' },
  { value: '0-0-1',   label: '0-0-1  (Night only)' },
  { value: '1-0-1',   label: '1-0-1  (Morning & Night)' },
  { value: '1-1-0',   label: '1-1-0  (Morning & Afternoon)' },
  { value: '0-1-1',   label: '0-1-1  (Afternoon & Night)' },
  { value: '1-1-1',   label: '1-1-1  (Three times a day)' },
  { value: '1-1-1-1', label: '1-1-1-1  (Four times a day)' },
  { value: '0-0-0-1', label: '0-0-0-1  (Bedtime only)' },
  { value: 'SOS',     label: 'SOS  (As needed)' },
];

const EMPTY_MED = { medicine: '', dosage: '', frequency: '', duration: '', quantity: '', buy_outside_clinic: false };

/**
 * Auto-calculate quantity from frequency + duration.
 * frequency: '1-1-1'  → sum of digits = 3 doses/day
 * duration:  '5 days' → extract leading number = 5
 * quantity   = 3 × 5  = 15
 * For 'SOS' frequency or unparseable inputs, returns '' (let doctor fill manually).
 */
const calcQuantity = (frequency, duration) => {
  if (!frequency || !duration) return '';
  if (frequency === 'SOS') return '';

  // Sum the digits in the frequency pattern (e.g. '1-1-1' → 3, '1-0-1' → 2)
  const freqSum = frequency.split('-').reduce((acc, n) => acc + (parseInt(n) || 0), 0);
  if (freqSum === 0) return '';

  // Extract leading integer from duration string (e.g. '5 days' → 5, '2 weeks' → 2)
  const durationMatch = duration.trim().match(/^(\d+)/);
  if (!durationMatch) return '';
  let days = parseInt(durationMatch[1]);

  // Convert weeks/months to days
  const lower = duration.toLowerCase();
  if (lower.includes('week')) days = days * 7;
  else if (lower.includes('month')) days = days * 30;

  return String(freqSum * days);
};

// FIX #1: real-time medicine row validator
const validateMedRow = (row) => {
  const e = {};
  if (!row.medicine) e.medicine = 'Select a medicine.';
  if (!row.dosage?.trim()) e.dosage = 'Dosage is required.';
  if (!row.frequency) e.frequency = 'Frequency is required.';
  if (!row.duration?.trim()) e.duration = 'Duration is required.';
  if (!row.quantity || Number(row.quantity) <= 0) e.quantity = 'Enter a valid quantity.';
  return e;
};

export default function ConsultationForm() {
  const { appointmentId } = useParams();
  const navigate           = useNavigate();

  const [appointment,   setAppointment]   = useState(null);
  const [consultation,  setConsultation]  = useState(null);
  const [prescription,  setPrescription]  = useState(null);
  const [medicines,     setMedicines]     = useState([]);
  const [allMedicines,  setAllMedicines]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [completing,    setCompleting]    = useState(false);
  const [pdfLoading,    setPdfLoading]    = useState({});
  const [errors,        setErrors]        = useState({});
  const [consultForm,   setConsultForm]   = useState({ symptoms: '', diagnosis: '', notes: '' });
  const [consultErrors, setConsultErrors] = useState({});
  const [consultTouched,setConsultTouched]= useState({});
  const [medRows,       setMedRows]       = useState([{ ...EMPTY_MED }]);
  const [medRowErrors,  setMedRowErrors]  = useState([{}]);
  const [deletedMedIds, setDeletedMedIds] = useState([]);

  useEffect(() => {
    if (!appointmentId) return;
    const init = async () => {
      setLoading(true);
      try {
        const [aptRes, medsRes] = await Promise.all([
          receptionAPI.getAppointment(appointmentId),
          pharmacyAPI.getMedicines({ is_active: true }),
        ]);
        const aptData  = aptRes.data?.data  || aptRes.data;
        const medsData = medsRes.data?.data || medsRes.data;
        setAppointment(aptData);
        setAllMedicines(Array.isArray(medsData) ? medsData : []);

        const consultRes = await doctorAPI.getConsultations();
        const allC       = consultRes.data?.data || consultRes.data || [];
        const existing   = allC.find(c => c.appointment === parseInt(appointmentId));
        if (existing) {
          setConsultation(existing);
          setConsultForm({ symptoms: existing.symptoms || '', diagnosis: existing.diagnosis || '', notes: existing.notes || '' });
          if (existing.prescription) {
            setPrescription(existing.prescription);
            setMedicines(existing.prescription.medicines || []);
          }
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally { setLoading(false); }
    };
    init();
  }, [appointmentId]);

  // ── FIX #1: Consultation real-time validation ─────────────────────
  const validateConsultField = (name, value) => {
    if (name === 'symptoms') {
      if (!value.trim()) return 'Symptoms cannot be blank.';
      if (value.trim().length < 3) return 'Symptoms must be at least 3 characters.';
    }
    if (name === 'diagnosis') {
      if (!value.trim()) return 'Diagnosis cannot be blank.';
      if (value.trim().length < 3) return 'Diagnosis must be at least 3 characters.';
    }
    return '';
  };

  const handleConsultChange = (field, value) => {
    setConsultForm(f => ({ ...f, [field]: value }));
    setConsultTouched(t => ({ ...t, [field]: true }));
    setConsultErrors(e => ({ ...e, [field]: validateConsultField(field, value) }));
  };

  // ── Medicine row helpers ───────────────────────────────────────────
  const addMedRow    = () => { setMedRows(r => [...r, { ...EMPTY_MED }]); setMedRowErrors(e => [...e, {}]); };
  const removeMedRow = (i) => { setMedRows(r => r.filter((_, idx) => idx !== i)); setMedRowErrors(e => e.filter((_, idx) => idx !== i)); };

  // FIX #1: validate on each medicine row change
  // Auto-calculate quantity when frequency or duration changes
  const updateMedRow = (i, field, val) => {
    setMedRows(prev => {
      const u = [...prev];
      u[i] = { ...u[i], [field]: val };

      // Auto-fill quantity when frequency or duration is set
      if (field === 'frequency' || field === 'duration') {
        const freq = field === 'frequency' ? val : u[i].frequency;
        const dur  = field === 'duration'  ? val : u[i].duration;
        const auto = calcQuantity(freq, dur);
        if (auto) u[i].quantity = auto;
      }

      const errs = [...medRowErrors];
      errs[i] = validateMedRow(u[i]);
      setMedRowErrors(errs);
      return u;
    });
  };

  // FIX #8: Get stock level for a medicine
  const getMedicineStock = (medicineId) => {
    const med = allMedicines.find(m => String(m.id) === String(medicineId));
    return med ? { total_stock: med.total_stock, needs_reorder: med.needs_reorder, name: med.name } : null;
  };

  const getConsultErr = (f) => (consultTouched[f] ? consultErrors[f] : '');

  // ── Save consultation ──────────────────────────────────────────────
  const handleSaveConsultation = async (e) => {
    e.preventDefault();
    const errs = {};
    ['symptoms', 'diagnosis'].forEach(f => {
      const err = validateConsultField(f, consultForm[f]);
      if (err) errs[f] = err;
    });
    if (Object.keys(errs).length) {
      setConsultErrors(errs);
      setConsultTouched({ symptoms: true, diagnosis: true });
      toast.error('Please fix the errors.');
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      if (consultation) {
        const { data } = await doctorAPI.updateConsultation(consultation.id, consultForm);
        setConsultation(data.data || data);
        toast.success('Consultation updated.');
      } else {
        const { data } = await doctorAPI.createConsultation({ appointment: parseInt(appointmentId), ...consultForm });
        setConsultation(data.data || data);
        toast.success('Consultation created.');
      }
    } catch (err) {
      setErrors(err.response?.data?.errors || err.response?.data || {});
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  // ── Save prescription ──────────────────────────────────────────────
  const handleSavePrescription = async () => {
    if (!consultation) { toast.error('Save consultation first.'); return; }

    const keptMeds = medicines
      .filter(m => !deletedMedIds.includes(m.id) && !m.is_dispensed)
      .map(m => ({
        medicine:            m.medicine,
        dosage:              m.dosage,
        frequency:           m.frequency,
        duration:            m.duration,
        quantity:            m.quantity,
        buy_outside_clinic:  m.buy_outside_clinic || false,
      }));

    // Validate new rows before sending
    const newRowErrors = medRows.map(r => validateMedRow(r));
    const validNewRows = medRows.filter((r, i) => r.medicine && Object.keys(newRowErrors[i]).length === 0);
    setMedRowErrors(newRowErrors);

    const hasIncompleteRows = medRows.some(r =>
      (r.medicine || r.dosage || r.frequency || r.duration || r.quantity) &&
      Object.keys(validateMedRow(r)).length > 0
    );
    if (hasIncompleteRows) {
      toast.error('Please complete or remove incomplete medicine rows.');
      return;
    }

    const newMeds = validNewRows.map(r => ({
      medicine:           parseInt(r.medicine),
      dosage:             r.dosage.trim(),
      frequency:          r.frequency,
      duration:           r.duration.trim(),
      quantity:           parseInt(r.quantity),
      buy_outside_clinic: r.buy_outside_clinic || false,
    }));

    const payload = [...keptMeds, ...newMeds];
    if (payload.length === 0) { toast.error('Add at least one medicine.'); return; }

    setSaving(true);
    try {
      let res;
      if (prescription) {
        res = await doctorAPI.updatePrescription(consultation.id, prescription.id, { medicines: payload });
      } else {
        res = await doctorAPI.createPrescription(consultation.id, { medicines: payload });
      }
      const saved = res.data?.data || res.data;
      setPrescription(saved);
      setMedicines(saved.medicines || []);
      setMedRows([{ ...EMPTY_MED }]);
      setMedRowErrors([{}]);
      setDeletedMedIds([]);
      toast.success('Prescription saved.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  // ── Complete consultation ──────────────────────────────────────────
  const handleComplete = async () => {
    if (!consultation) { toast.error('Save consultation first.'); return; }
    if (!prescription)  { toast.error('Add a prescription before completing.'); return; }
    if (!confirm('Mark this consultation as complete? This cannot be undone.')) return;
    setCompleting(true);
    try {
      await doctorAPI.completeConsultation(consultation.id);
      toast.success('Consultation completed!');
      navigate('/doctor/patients');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally { setCompleting(false); }
  };

  // ── PDF helper ────────────────────────────────────────────────────
  const handlePdf = async (mode) => {
    if (!consultation) return;
    setPdfLoading(prev => ({ ...prev, [mode]: true }));
    try {
      const res = mode === 'print'
        ? await doctorAPI.printPrescriptionPdf(consultation.id)
        : await doctorAPI.downloadPrescriptionPdf(consultation.id);
      const blob     = new Blob([res.data], { type: 'application/pdf' });
      const url      = window.URL.createObjectURL(blob);
      const filename = `prescription_${appointment?.appointment_code || consultation.id}.pdf`;
      if (mode === 'print') {
        const tab = window.open(url, '_blank');
        if (!tab) toast.error('Pop-up blocked. Please allow pop-ups.');
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast.success(`Downloaded ${filename}`);
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toast.error('Could not load prescription PDF.');
    } finally { setPdfLoading(prev => ({ ...prev, [mode]: false })); }
  };

  if (loading) return <LoadingSpinner fullscreen />;

  const isCompleted  = appointment?.status === 'COMPLETED';
  const patientName  = appointment?.patient?.full_name  || '—';
  const patientCode  = appointment?.patient?.patient_code || '';
  const patientPhone = appointment?.patient?.phone || '';
  const tokenNo      = appointment?.token_no || '—';
  const apptCode     = appointment?.appointment_code || '';

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate('/doctor/patients')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm">
        <ArrowLeft size={16} /> Back to patients
      </button>

      {/* Patient card */}
      <div className="card mb-6" style={{ borderLeft: '4px solid #0d9488' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{patientName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{patientCode} · {patientPhone}</p>
            <div className="flex items-center gap-3 mt-2">
              <span style={{ background: '#ccfbf1', color: '#0f766e', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                Token #{tokenNo}
              </span>
              <span className="text-xs text-gray-400 font-mono">{apptCode}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {appointment?.patient?.id && (
              <button onClick={() => navigate(`/doctor/history/${appointment.patient.id}`)} className="text-xs text-blue-600 hover:underline">Past history →</button>
            )}
            {isCompleted && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle size={18} /><span className="font-medium text-sm">Completed</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Consultation Form */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Stethoscope size={18} className="text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">Consultation</h2>
          {consultation && <span className="badge-success ml-2">Saved</span>}
        </div>
        <form onSubmit={handleSaveConsultation} className="space-y-4">
          <div>
            <label className="label">Symptoms *</label>
            <textarea rows={3} className={`input-field resize-none ${getConsultErr('symptoms') ? 'border-red-400' : ''}`}
              placeholder="Describe the patient's symptoms..." value={consultForm.symptoms} disabled={isCompleted}
              onChange={e => handleConsultChange('symptoms', e.target.value)}
              onBlur={() => setConsultTouched(t => ({ ...t, symptoms: true }))} />
            {getConsultErr('symptoms') && <p className="text-red-500 text-xs mt-1">{getConsultErr('symptoms')}</p>}
          </div>
          <div>
            <label className="label">Diagnosis *</label>
            <textarea rows={3} className={`input-field resize-none ${getConsultErr('diagnosis') ? 'border-red-400' : ''}`}
              placeholder="Enter diagnosis..." value={consultForm.diagnosis} disabled={isCompleted}
              onChange={e => handleConsultChange('diagnosis', e.target.value)}
              onBlur={() => setConsultTouched(t => ({ ...t, diagnosis: true }))} />
            {getConsultErr('diagnosis') && <p className="text-red-500 text-xs mt-1">{getConsultErr('diagnosis')}</p>}
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea rows={2} className="input-field resize-none"
              placeholder="Any additional notes..." value={consultForm.notes} disabled={isCompleted}
              onChange={e => handleConsultChange('notes', e.target.value)} />
          </div>
          {!isCompleted && (
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {consultation ? 'Update Consultation' : 'Save Consultation'}
            </button>
          )}
        </form>
      </div>

      {/* Prescription Section */}
      {consultation && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Pill size={18} className="text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">Prescription</h2>
              {prescription && <span className="badge-success ml-2">Saved</span>}
            </div>
            {prescription && (
              <div className="flex items-center gap-2">
                <button onClick={() => handlePdf('print')} disabled={pdfLoading.print}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: '#eff6ff', color: '#1e40af', border: '0.5px solid #bfdbfe', opacity: pdfLoading.print ? 0.6 : 1 }}>
                  {pdfLoading.print ? <div className="w-3 h-3 animate-spin rounded-full border border-blue-300 border-t-blue-600" /> : <Printer size={12} />} Print
                </button>
                <button onClick={() => handlePdf('download')} disabled={pdfLoading.download}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: '#f9fafb', color: '#374151', border: '0.5px solid #e5e7eb', opacity: pdfLoading.download ? 0.6 : 1 }}>
                  {pdfLoading.download ? <div className="w-3 h-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" /> : <Download size={12} />} Save PDF
                </button>
              </div>
            )}
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 70px 110px 36px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
            {['Medicine', 'Dosage', 'Frequency', 'Duration', 'Qty', 'Outside Clinic', ''].map(h => (
              <span key={h} style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{h}</span>
            ))}
          </div>

          <div className="space-y-2 mb-4">
            {/* Saved medicines */}
            {medicines.map(m => {
              const isDeleted = deletedMedIds.includes(m.id);
              return (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 70px 110px 36px',
                  gap: 8, alignItems: 'center',
                  background: isDeleted ? '#fef2f2' : m.buy_outside_clinic ? '#fefce8' : '#f0fdfa',
                  borderRadius: 8, padding: '8px 10px',
                  border: `1px solid ${isDeleted ? '#fecaca' : m.buy_outside_clinic ? '#fef08a' : '#99f6e4'}`,
                  opacity: isDeleted ? 0.6 : 1,
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#134e4a' }}>{m.medicine_name}</span>
                    {m.is_dispensed && <span style={{ marginLeft: 6, fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 999 }}>Dispensed</span>}
                    {/* FIX #8: Low stock badge */}
                    {m.is_low_stock && !m.buy_outside_clinic && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 999 }}>⚠ Low Stock</span>
                    )}
                    {m.buy_outside_clinic && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 999 }}>Buy Outside</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12 }}>{m.dosage}</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.frequency}</span>
                  <span style={{ fontSize: 12 }}>{m.duration}</span>
                  <span style={{ fontSize: 12 }}>×{m.quantity}</span>
                  <span style={{ fontSize: 11, color: m.buy_outside_clinic ? '#92400e' : '#6b7280' }}>
                    {m.buy_outside_clinic ? 'Outside' : 'In-clinic'}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {!isCompleted && !m.is_dispensed && (
                      <button type="button"
                        onClick={() => setDeletedMedIds(prev => isDeleted ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                        style={{ padding: 4, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: '#9ca3af' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* New medicine input rows */}
            {!isCompleted && medRows.map((row, i) => {
              const stockInfo = row.medicine ? getMedicineStock(row.medicine) : null;
              const rowErr    = medRowErrors[i] || {};
              return (
                <div key={`new-${i}`}>
                  {/* FIX #8: Low stock warning inline */}
                  {stockInfo?.needs_reorder && (
                    <div className="flex items-center gap-2 mb-1 text-xs text-amber-700" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 8px' }}>
                      <AlertTriangle size={12} />
                      <strong>{stockInfo.name}</strong> has low stock ({stockInfo.total_stock} units). Patient may need to purchase from outside the clinic.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 70px 110px 36px', gap: 8, alignItems: 'start' }}>
                    <div>
                      <select className={`input-field text-sm ${rowErr.medicine ? 'border-red-400' : ''}`}
                        value={row.medicine} onChange={e => updateMedRow(i, 'medicine', e.target.value)}>
                        <option value="">Select medicine</option>
                        {allMedicines.map(med => (
                          <option key={med.id} value={med.id}>
                            {med.name}{med.needs_reorder ? ' ⚠' : ''}
                          </option>
                        ))}
                      </select>
                      {rowErr.medicine && <p className="text-red-500 text-xs mt-0.5">{rowErr.medicine}</p>}
                    </div>
                    <div>
                      <input className={`input-field text-sm ${rowErr.dosage ? 'border-red-400' : ''}`}
                        placeholder="500mg" value={row.dosage} onChange={e => updateMedRow(i, 'dosage', e.target.value)} />
                      {rowErr.dosage && <p className="text-red-500 text-xs mt-0.5">{rowErr.dosage}</p>}
                    </div>
                    {/* FIX #9: Frequency dropdown with N-N-N options */}
                    <div>
                      <select className={`input-field text-sm ${rowErr.frequency ? 'border-red-400' : ''}`}
                        value={row.frequency} onChange={e => updateMedRow(i, 'frequency', e.target.value)}>
                        <option value="">Select frequency</option>
                        {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {rowErr.frequency && <p className="text-red-500 text-xs mt-0.5">{rowErr.frequency}</p>}
                    </div>
                    <div>
                      <input className={`input-field text-sm ${rowErr.duration ? 'border-red-400' : ''}`}
                        placeholder="5 days" value={row.duration} onChange={e => updateMedRow(i, 'duration', e.target.value)} />
                      {rowErr.duration && <p className="text-red-500 text-xs mt-0.5">{rowErr.duration}</p>}
                    </div>
                    <div>
                      <input type="number" className={`input-field text-sm ${rowErr.quantity ? 'border-red-400' : ''}`}
                        placeholder="Qty" min={1} value={row.quantity} onChange={e => updateMedRow(i, 'quantity', e.target.value)} />
                      {rowErr.quantity && <p className="text-red-500 text-xs mt-0.5">{rowErr.quantity}</p>}
                    </div>
                    {/* FIX #8: Buy outside clinic checkbox */}
                    <div className="flex items-center gap-1 pt-2">
                      <input type="checkbox" id={`outside-${i}`} checked={row.buy_outside_clinic || false}
                        onChange={e => updateMedRow(i, 'buy_outside_clinic', e.target.checked)} />
                      <label htmlFor={`outside-${i}`} className="text-xs text-gray-600 cursor-pointer">Outside</label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
                      {medRows.length > 1 && (
                        <button type="button" onClick={() => removeMedRow(i)}
                          style={{ padding: 4, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: '#9ca3af' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!isCompleted && (
            <div className="flex items-center gap-3 mt-2">
              <button type="button" onClick={addMedRow} className="btn-secondary flex items-center gap-2 text-sm">
                <Plus size={14} /> Add Medicine
              </button>
              <button type="button" onClick={handleSavePrescription} disabled={saving}
                className="btn-primary flex items-center gap-2 text-sm">
                {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                Save Prescription
              </button>
              {deletedMedIds.length > 0 && (
                <span style={{ fontSize: 12, color: '#ef4444' }}>
                  {deletedMedIds.length} medicine{deletedMedIds.length > 1 ? 's' : ''} will be removed on save
                </span>
              )}
            </div>
          )}

          {/* FIX #8: Note about outside-clinic medicines in the prescription */}
          {medicines.some(m => m.buy_outside_clinic) && (
            <div className="mt-3 flex items-start gap-2 text-xs" style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 6, padding: '8px 10px' }}>
              <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-amber-800">
                Some medicines are marked as "Buy Outside Clinic" due to low stock. This will be noted on the prescription PDF and reflected in the pharmacy bill.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Complete button */}
      {consultation && prescription && !isCompleted && (
        <div className="card" style={{ border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-800">Ready to complete?</h3>
              <p className="text-sm text-green-600 mt-1">
                This marks the appointment as COMPLETED and sends the prescription to pharmacy.
              </p>
            </div>
            <button onClick={handleComplete} disabled={completing} className="btn-success flex items-center gap-2">
              <CheckCircle size={16} />
              {completing ? 'Completing...' : 'Complete Consultation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}