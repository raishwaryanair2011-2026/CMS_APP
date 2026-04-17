import { useState, useEffect, useCallback } from 'react';
import { pharmacyAPI } from '../../api/services';
import api from '../../api/axios';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import { RefreshCw, FlaskConical, Printer, Download, CheckCircle, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PendingQueue() {
  const [pending,     setPending]     = useState([]);
  const [completedRx, setCompletedRx] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [batches,     setBatches]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState({ open: false, item: null });
  const [form,        setForm]        = useState({ medicine_batch: '', quantity_dispensed: '' });
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, meRes] = await Promise.all([
        pharmacyAPI.getPendingPrescriptions(),
        api.get('/api/v1/auth/me/'),
      ]);
      setPending(pRes.data.data || pRes.data);
      setCurrentUser(meRes.data.data || meRes.data);

      // Fetch prescriptions where ALL in-clinic medicines are dispensed
      try {
        const completedRes = await api.get('/api/v1/doctor/completed-prescriptions/');
        const raw = completedRes.data.data || [];
        const mapped = raw.map(c => ({
          id:                 c.prescription_id,
          appointment_code:   c.appointment_code,
          patient_name:       c.patient_name,
          inclinic_total:     c.inclinic_total,
          inclinic_dispensed: c.inclinic_dispensed,
          outside_count:      c.outside_count || 0,
          bill_ready:         c.bill_ready,
          medicines:          c.medicines || [],
        }));
        setCompletedRx(mapped);
      } catch (err) {
        console.error('Completed prescriptions fetch error:', err.response?.status, err.message);
        setCompletedRx([]);
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openDispense = async (item) => {
    setForm({ medicine_batch: '', quantity_dispensed: item.quantity });
    setErrors({});
    try {
      const { data } = await pharmacyAPI.getBatches({ medicine: item.medicine, is_active: true });
      setBatches(data.data || data);
    } catch (_) { setBatches([]); }
    setModal({ open: true, item });
  };

  const handleDispense = async (e) => {
    e.preventDefault();
    if (!currentUser?.staff_id) {
      toast.error('Could not determine your staff ID. Contact admin.');
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await pharmacyAPI.dispense({
        medicine_prescription: modal.item.id,
        medicine_batch:        parseInt(form.medicine_batch),
        quantity_dispensed:    parseInt(form.quantity_dispensed),
        dispensed_by:          currentUser.staff_id,
      });
      toast.success('Medicine dispensed successfully.');
      setModal({ open: false, item: null });
      fetchAll();
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const handlePharmacyBillPdf = async (prescriptionId, aptCode, mode) => {
    const key = `${prescriptionId}-${mode}`;
    setPdfLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = mode === 'print'
        ? await pharmacyAPI.printPharmacyBillPdf(prescriptionId)
        : await pharmacyAPI.downloadPharmacyBillPdf(prescriptionId);
      const blob     = new Blob([res.data], { type: 'application/pdf' });
      const url      = window.URL.createObjectURL(blob);
      const filename = `pharmacy_bill_${aptCode || prescriptionId}.pdf`;
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
      toast.error('Could not generate pharmacy bill PDF.');
    } finally { setPdfLoading(prev => ({ ...prev, [key]: false })); }
  };

  const getErr = (f) => errors[f]?.[0] || null;

  // Group pending medicines by appointment for display
  const pendingByAppointment = pending.reduce((acc, item) => {
    const key = item.appointment_code || item.id;
    if (!acc[key]) acc[key] = { appointment_code: item.appointment_code, patient_name: item.patient_name, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pharmacy Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pending.length} medicine{pending.length !== 1 ? 's' : ''} pending dispense
          </p>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <span className="text-sm text-gray-500">
              Dispensing as: <strong>{currentUser.first_name} {currentUser.last_name}</strong> ({currentUser.staff_code})
            </span>
          )}
          <button onClick={fetchAll} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* ── PENDING MEDICINES TABLE ─────────────────────────────── */}
          <div className="mb-8">
            <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FlaskConical size={16} className="text-blue-500" />
              Pending Dispense
            </h2>
            <div className="card p-0 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Patient', 'Appointment', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Qty', 'Action'].map(h => (
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pending.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                        All in-clinic medicines have been dispensed.
                      </td>
                    </tr>
                  ) : pending.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="table-cell"><p className="font-medium text-sm">{item.patient_name}</p></td>
                      <td className="table-cell font-mono text-xs text-blue-600">{item.appointment_code}</td>
                      <td className="table-cell font-medium text-gray-900">{item.medicine_name}</td>
                      <td className="table-cell text-sm">{item.dosage}</td>
                      <td className="table-cell text-sm font-mono">{item.frequency}</td>
                      <td className="table-cell text-sm">{item.duration}</td>
                      <td className="table-cell font-bold text-gray-800">{item.quantity}</td>
                      <td className="table-cell">
                        <button onClick={() => openDispense(item)}
                          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                          <FlaskConical size={12} /> Dispense
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── READY FOR BILLING ───────────────────────────────────── */}
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              Ready for Billing
            </h2>
            {/* <p className="text-sm text-gray-400 mb-3">
              Pharmacy bill is generated only after all in-clinic medicines for a consultation are dispensed.
              Medicines marked "Buy Outside" are excluded from this check.
            </p> */}

            {completedRx.length === 0 ? (
              <div className="card text-center py-8" style={{ background: '#f9fafb', border: '1px dashed #e5e7eb' }}>
                <p className="text-sm text-gray-400">
                  No bills ready yet. Bills appear here once all in-clinic medicines for a consultation are dispensed.
                </p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Appointment', 'Patient', 'In-Clinic Medicines', 'Outside Clinic', 'Status', 'Bill'].map(h => (
                        <th key={h} className="table-header">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {completedRx.map(rx => {
                      const aptCode  = rx.appointment_code || '—';
                      const printKey = `${rx.id}-print`;
                      const dlKey    = `${rx.id}-download`;
                      return (
                        <tr key={rx.id} className="hover:bg-gray-50">
                          <td className="table-cell font-mono text-xs text-blue-600">{aptCode}</td>
                          <td className="table-cell font-medium text-sm">{rx.patient_name || '—'}</td>
                          <td className="table-cell text-sm text-gray-700">
                            <span className="flex items-center gap-1">
                              <CheckCircle size={12} className="text-green-500" />
                              {rx.inclinic_dispensed}/{rx.inclinic_total} dispensed
                            </span>
                          </td>
                          <td className="table-cell text-sm">
                            {rx.outside_count > 0 ? (
                              <span className="flex items-center gap-1 text-amber-700">
                                <ShoppingBag size={12} />
                                {rx.outside_count} to buy outside
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="table-cell">
                            <span className="badge-success flex items-center gap-1 w-fit">
                              <CheckCircle size={10} /> Bill Ready
                            </span>
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handlePharmacyBillPdf(rx.id, aptCode, 'print')}
                                disabled={pdfLoading[printKey]}
                                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1e40af', border: '0.5px solid #bfdbfe', opacity: pdfLoading[printKey] ? 0.6 : 1 }}>
                                {pdfLoading[printKey]
                                  ? <div className="w-3 h-3 animate-spin rounded-full border border-blue-300 border-t-blue-700" />
                                  : <Printer size={11} />}
                                Print Bill
                              </button>
                              <button
                                onClick={() => handlePharmacyBillPdf(rx.id, aptCode, 'download')}
                                disabled={pdfLoading[dlKey]}
                                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: '#f9fafb', color: '#374151', border: '0.5px solid #e5e7eb', opacity: pdfLoading[dlKey] ? 0.6 : 1 }}>
                                {pdfLoading[dlKey]
                                  ? <div className="w-3 h-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                                  : <Download size={11} />}
                                Save PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Dispense Modal */}
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false })} title="Dispense Medicine">
        {modal.item && (
          <form onSubmit={handleDispense} className="space-y-4">
            <div className="rounded-lg p-4 border" style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
              <p className="font-semibold text-amber-800">{modal.item.medicine_name}</p>
              <p className="text-sm text-amber-600 mt-1">
                {modal.item.dosage} · <span className="font-mono">{modal.item.frequency}</span> · {modal.item.duration}
              </p>
              <p className="text-sm text-amber-700 mt-1">Prescribed qty: <strong>{modal.item.quantity}</strong></p>
              <p className="text-sm text-amber-600">Patient: <strong>{modal.item.patient_name}</strong></p>
            </div>

            <div className="rounded-lg p-3 text-sm" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
              <p className="text-green-700">
                Dispensing as: <strong>{currentUser?.first_name} {currentUser?.last_name}</strong> ({currentUser?.staff_code})
              </p>
            </div>

            <div>
              <label className="label">Select Batch *</label>
              <select className={`input-field ${getErr('medicine_batch') ? 'border-red-400' : ''}`}
                value={form.medicine_batch}
                onChange={e => setForm({ ...form, medicine_batch: e.target.value })}>
                <option value="">Select a batch</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.batch_no} — Stock: {b.stock_level} — Exp: {b.expiry_date}
                  </option>
                ))}
              </select>
              {batches.length === 0 && (
                <p className="text-amber-600 text-xs mt-1">No active batches available for this medicine.</p>
              )}
              {getErr('medicine_batch') && <p className="text-red-500 text-xs mt-1">{getErr('medicine_batch')}</p>}
            </div>

            <div>
              <label className="label">Quantity to Dispense *</label>
              <input type="number" className={`input-field ${getErr('quantity_dispensed') ? 'border-red-400' : ''}`}
                value={form.quantity_dispensed} min={1} max={modal.item.quantity}
                onChange={e => setForm({ ...form, quantity_dispensed: e.target.value })} />
              {getErr('quantity_dispensed') && <p className="text-red-500 text-xs mt-1">{getErr('quantity_dispensed')}</p>}
            </div>

            {errors.non_field_errors && <p className="text-red-500 text-sm">{errors.non_field_errors[0]}</p>}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setModal({ open: false })} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <FlaskConical size={14} />}
                {saving ? 'Dispensing...' : 'Confirm Dispense'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}