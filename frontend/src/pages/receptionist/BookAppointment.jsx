import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { receptionAPI, adminAPI } from '../../api/services';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import {
  Search, Calendar, Clock, ChevronRight,
  CheckCircle, AlertTriangle, User, Stethoscope,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── timezone-safe date helpers ───────────────────────────────────────────────

const toLocalDateStr = (d) => {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const TODAY    = () => toLocalDateStr(new Date());
const MAX_DATE = () => { const d = new Date(); d.setDate(d.getDate() + 30); return toLocalDateStr(d); };

const DAY_NAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

const getUpcomingDates = (dayName, count = 5) => {
  const targetIdx = DAY_NAMES.indexOf(dayName);
  const results   = [];
  const cursor    = new Date();
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  while (results.length < count && cursor <= limit) {
    if (cursor.getDay() === targetIdx) results.push(toLocalDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
};

const prettyDate = (str) => {
  if (!str) return '';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
};

// ─── step bar ─────────────────────────────────────────────────────────────────

const STEPS = ['Patient', 'Doctor', 'Schedule & Date', 'Time Slot', 'Confirm'];

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-1.5 mb-8 flex-wrap">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600,
              background: current > i+1 ? '#059669' : current === i+1 ? '#2563eb' : '#e5e7eb',
              color: current >= i+1 ? 'white' : '#9ca3af',
            }}>
              {current > i+1 ? '✓' : i+1}
            </div>
            <span style={{
              fontSize: 11, fontWeight: current === i+1 ? 600 : 400,
              color: current === i+1 ? '#111827' : current > i+1 ? '#059669' : '#9ca3af',
            }}>{label}</span>
          </div>
          {i < STEPS.length - 1 && <ChevronRight size={12} style={{ color: '#d1d5db', flexShrink: 0 }} />}
        </div>
      ))}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function BookAppointment() {
  const navigate = useNavigate();
  const location = useLocation();

  const [doctors,     setDoctors]     = useState([]);
  const [schedules,   setSchedules]   = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [step,             setStep]             = useState(1);
  const [selectedPatient,  setSelectedPatient]  = useState(null);
  const [selectedDoctor,   setSelectedDoctor]   = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedDate,     setSelectedDate]     = useState('');
  const [useCustomDate,    setUseCustomDate]    = useState(false);
  const [customDate,       setCustomDate]       = useState('');
  const [slots,            setSlots]            = useState([]);
  const [loadingSlots,     setLoadingSlots]     = useState(false);
  const [selectedSlot,     setSelectedSlot]     = useState(null); // {token_no, slot_time}

  const [patSearch,  setPatSearch]  = useState('');
  const [patResults, setPatResults] = useState([]);
  const [searching,  setSearching]  = useState(false);

  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});
  const [result,  setResult]  = useState(null);

  const activeDate = useCustomDate ? customDate : selectedDate;

  // Load doctors + schedules
  useEffect(() => {
    (async () => {
      setLoadingInit(true);
      try {
        const [dRes, sRes] = await Promise.all([adminAPI.getDoctors(), adminAPI.getSchedules()]);
        setDoctors(dRes.data.data   || dRes.data);
        setSchedules(sRes.data.data || sRes.data);
      } catch (e) { toast.error(getErrorMessage(e)); }
      finally { setLoadingInit(false); }
    })();
  }, []);

  // Pre-select patient from registration flow
  useEffect(() => {
    const pre = location.state?.preselectedPatient;
    if (pre) {
      setSelectedPatient(pre);
      setPatSearch(`${pre.full_name} — ${pre.patient_code}`);
      navigate(location.pathname, { replace: true, state: {} });
      setStep(2);
    }
  }, [location.state]);

  // Fetch slots whenever schedule+date is ready (step 4)
  const fetchSlots = useCallback(async (scheduleId, date) => {
    if (!scheduleId || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const { data } = await receptionAPI.getSlots(scheduleId, date);
      setSlots(data.data?.slots || []);
    } catch (e) {
      toast.error('Could not load time slots. ' + getErrorMessage(e));
    } finally { setLoadingSlots(false); }
  }, []);

  // Patient search
  const handlePatSearch = async (val) => {
    setPatSearch(val);
    setSelectedPatient(null);
    if (val.trim().length < 2) { setPatResults([]); return; }
    setSearching(true);
    try {
      const { data } = await receptionAPI.getPatients(val.trim());
      setPatResults(data.data || data);
    } catch (_) { setPatResults([]); }
    finally { setSearching(false); }
  };

  const selectPatient = (p) => {
    setSelectedPatient(p);
    setPatSearch(`${p.full_name} — ${p.patient_code}`);
    setPatResults([]);
  };

  const doctorSchedules = selectedDoctor
    ? schedules.filter(s => s.doctor === selectedDoctor.doctor_profile_id && s.is_active)
    : [];

  const dateError = (() => {
    if (!activeDate || !selectedSchedule) return null;
    const dayName = DAY_NAMES[new Date(activeDate + 'T00:00:00').getDay()];
    if (dayName !== selectedSchedule.day_of_week)
      return `This date is a ${dayName}. Please pick a ${selectedSchedule.day_of_week}.`;
    return null;
  })();

  const handleBook = async () => {
    if (!selectedPatient || !selectedDoctor || !selectedSchedule || !activeDate || !selectedSlot) return;
    setSaving(true);
    setErrors({});
    try {
      const { data } = await receptionAPI.bookAppointment({
        patient:          selectedPatient.id,
        schedule:         selectedSchedule.schedule_id,
        appointment_date: activeDate,
        slot_time:        selectedSlot.slot_time,
      });
      setResult(data.data || data);
      toast.success('Appointment booked!');
    } catch (err) {
      setErrors(err.response?.data?.errors || err.response?.data || {});
      toast.error(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  const resetAll = () => {
    setStep(1); setSelectedPatient(null); setSelectedDoctor(null);
    setSelectedSchedule(null); setSelectedDate(''); setCustomDate('');
    setUseCustomDate(false); setSlots([]); setSelectedSlot(null);
    setPatSearch(''); setPatResults([]); setErrors({}); setResult(null);
  };

  if (loadingInit) return <LoadingSpinner />;

  // ── Success ──────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Book Appointment</h1>
        <div className="card" style={{ borderLeft: '4px solid #059669', background: '#f0fdf4' }}>
          <div className="flex items-center gap-3 mb-5">
            <CheckCircle size={32} style={{ color: '#059669', flexShrink: 0 }} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Appointment Booked!</h2>
              <p className="text-sm text-gray-500">Collect payment at reception desk.</p>
            </div>
          </div>

          {/* Token hero */}
          <div className="rounded-xl mb-5 p-5 text-center"
            style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
            <p className="text-xs text-green-700 font-semibold mb-1 uppercase tracking-wider">Token Number</p>
            <p className="text-7xl font-bold text-green-700">#{result.token_no}</p>
            <p className="text-sm text-green-700 font-semibold mt-2">{fmtTime(selectedSlot?.slot_time)}</p>
            <p className="text-xs text-green-600 mt-0.5 font-mono">{result.appointment_code}</p>
          </div>

          <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm mb-5">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Patient</p>
              <p className="font-semibold">{result.patient?.full_name || selectedPatient?.full_name}</p>
              <p className="text-xs text-gray-400">{selectedPatient?.patient_code}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Doctor</p>
              <p className="font-semibold">Dr. {selectedDoctor?.staff_details?.user?.first_name} {selectedDoctor?.staff_details?.user?.last_name}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Date</p>
              <p className="font-semibold">{prettyDate(activeDate)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Time Slot</p>
              <p className="font-semibold">{fmtTime(selectedSlot?.slot_time)} – {fmtTime(
                (() => {
                  const [h, m] = selectedSlot.slot_time.split(':').map(Number);
                  const end    = new Date(); end.setHours(h, m + 20, 0, 0);
                  return `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
                })()
              )}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Fee</p>
              <p className="font-semibold text-green-800">₹{Number(selectedDoctor?.consultation_fee).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Billing</p>
              <span className="badge-warning">{result.billing?.payment_status || 'PENDING'}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={resetAll} className="btn-primary flex-1">Book Another</button>
            <button onClick={() => navigate('/reception/queue')} className="btn-secondary flex-1">View Queue</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Book Appointment</h1>
      <p className="text-sm text-gray-500 mb-6">Follow the steps to book a patient appointment.</p>
      <StepBar current={step} />

      {/* ══ STEP 1 — PATIENT ══════════════════════════════════════════════════ */}
      {step === 1 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Select Patient</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Search by name or phone. To register a new patient go to{' '}
            <button onClick={() => navigate('/reception/patients')} className="text-blue-600 hover:underline">
              Patients → Register Patient
            </button>{' '}and they'll be brought here automatically.
          </p>

          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-9" autoFocus
              placeholder="Type patient name or phone number..."
              value={patSearch} onChange={e => handlePatSearch(e.target.value)} />
            {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
          </div>

          {patResults.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-4 max-h-64 overflow-y-auto">
              {patResults.map(p => (
                <button key={p.id} type="button" onClick={() => selectPatient(p)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 flex items-center gap-3">
                  <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>
                    {p.full_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{p.full_name}</p>
                    <p className="text-xs text-gray-400">{p.patient_code} · {p.phone}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {patSearch.length >= 2 && !searching && patResults.length === 0 && !selectedPatient && (
            <div className="text-sm text-gray-400 mb-4 p-3 bg-gray-50 rounded-lg">
              No patients found.{' '}
              <button onClick={() => navigate('/reception/patients')} className="text-blue-600 hover:underline">Register new patient →</button>
            </div>
          )}

          {selectedPatient && (
            <div className="rounded-xl p-4 mb-4 flex items-center justify-between"
              style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#15803d' }}>
                  {selectedPatient.full_name[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-green-900">{selectedPatient.full_name}</p>
                  <p className="text-xs text-green-700">{selectedPatient.patient_code} · {selectedPatient.phone}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedPatient(null); setPatSearch(''); setPatResults([]); }}
                className="text-xs text-green-700 hover:underline">Change</button>
            </div>
          )}

          <button disabled={!selectedPatient} onClick={() => setStep(2)}
            className="btn-primary w-full py-2.5 disabled:opacity-40 disabled:cursor-not-allowed">
            Continue → Select Doctor
          </button>
        </div>
      )}

      {/* ══ STEP 2 — DOCTOR ═══════════════════════════════════════════════════ */}
      {step === 2 && (
        <div>
          <button onClick={() => setStep(1)} className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">← Change patient</button>
          <div className="rounded-lg px-4 py-2 mb-5 inline-flex items-center gap-2"
            style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
            <User size={13} style={{ color: '#15803d' }} />
            <span className="text-sm font-medium text-green-800">{selectedPatient?.full_name}</span>
            <span className="text-xs text-green-600">{selectedPatient?.patient_code}</span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Stethoscope size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Select Doctor</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {doctors.filter(d => d.is_active).map(doc => {
              const docSchedules = schedules.filter(s => s.doctor === doc.doctor_profile_id && s.is_active);
              return (
                <button key={doc.doctor_profile_id}
                  onClick={() => { setSelectedDoctor(doc); setSelectedSchedule(null); setSelectedDate(''); setCustomDate(''); setUseCustomDate(false); setSlots([]); setSelectedSlot(null); setStep(3); }}
                  className="card text-left transition-all hover:shadow-md hover:-translate-y-0.5"
                  style={{ border: '1px solid #e5e7eb', cursor: 'pointer' }}>
                  <div className="flex items-start gap-3">
                    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>
                      {doc.staff_details?.user?.first_name?.[0] || 'D'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">Dr. {doc.staff_details?.user?.first_name} {doc.staff_details?.user?.last_name}</p>
                      <p className="text-xs text-blue-600 mt-0.5">{doc.specialization_name || ''}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-gray-500">₹{Number(doc.consultation_fee).toLocaleString('en-IN')}</span>
                        <span className="text-xs text-gray-400">Max {doc.max_patient_per_day}/day</span>
                        <span className="text-xs text-gray-400">{docSchedules.length} slot{docSchedules.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: '#d1d5db', flexShrink: 0, marginTop: 2 }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ STEP 3 — SCHEDULE + DATE ══════════════════════════════════════════ */}
      {step === 3 && (
        <div>
          <button onClick={() => { setStep(2); setSelectedSchedule(null); setSelectedDate(''); setCustomDate(''); setSlots([]); setSelectedSlot(null); }}
            className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">← Change doctor</button>

          {/* Summary pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            <div className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
              <User size={12} style={{ color: '#15803d' }} />
              <span className="text-xs font-medium text-green-800">{selectedPatient?.full_name}</span>
            </div>
            <div className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <Stethoscope size={12} style={{ color: '#1d4ed8' }} />
              <span className="text-xs font-medium text-blue-800">Dr. {selectedDoctor?.staff_details?.user?.first_name} {selectedDoctor?.staff_details?.user?.last_name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Select Schedule & Date</h2>
          </div>

          {doctorSchedules.length === 0 ? (
            <div className="card" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
              <p className="text-sm text-amber-700">No active schedule slots. Ask admin to add schedules.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {doctorSchedules.map(sch => {
                const isSelected = selectedSchedule?.schedule_id === sch.schedule_id;
                const upcoming   = getUpcomingDates(sch.day_of_week);

                return (
                  <div key={sch.schedule_id} className="card transition-all"
                    style={{ border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb', padding: '14px 16px' }}>
                    <button type="button" className="w-full text-left"
                      onClick={() => { setSelectedSchedule(sch); setSelectedDate(''); setCustomDate(''); setUseCustomDate(false); setSlots([]); setSelectedSlot(null); }}>
                      <div className="flex items-center gap-4">
                        <div style={{ background: isSelected ? '#eff6ff' : '#f9fafb', borderRadius: 10, padding: '8px 14px', textAlign: 'center', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#1d4ed8' : '#374151' }}>{sch.day_of_week.slice(0,3)}</p>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-gray-900">{sch.day_of_week}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock size={11} /> {sch.start_time?.slice(0,5)} – {sch.end_time?.slice(0,5)}
                          </p>
                        </div>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: isSelected ? '6px solid #2563eb' : '2px solid #d1d5db', background: 'white' }} />
                      </div>
                    </button>

                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          Pick a {sch.day_of_week} date
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {upcoming.map(d => {
                            const isChosen = selectedDate === d && !useCustomDate;
                            return (
                              <button key={d} type="button"
                                onClick={() => { setSelectedDate(d); setUseCustomDate(false); setCustomDate(''); setSlots([]); setSelectedSlot(null); }}
                                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: isChosen ? '2px solid #2563eb' : '1px solid #e5e7eb', background: isChosen ? '#eff6ff' : 'white', color: isChosen ? '#1d4ed8' : '#374151', transition: 'all 0.15s' }}>
                                {d === TODAY() ? 'Today' : prettyDate(d)}
                              </button>
                            );
                          })}
                          <button type="button"
                            onClick={() => { setUseCustomDate(true); setSelectedDate(''); setSlots([]); setSelectedSlot(null); }}
                            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: useCustomDate ? '2px solid #2563eb' : '1px solid #e5e7eb', background: useCustomDate ? '#eff6ff' : 'white', color: useCustomDate ? '#1d4ed8' : '#374151' }}>
                            Pick another date…
                          </button>
                        </div>
                        {useCustomDate && (
                          <input type="date" min={TODAY()} max={MAX_DATE()}
                            className={`input-field mt-1 ${customDate && dateError ? 'border-red-400' : ''}`}
                            value={customDate}
                            onChange={e => { setCustomDate(e.target.value); setSlots([]); setSelectedSlot(null); }} />
                        )}
                        {activeDate && dateError && (
                          <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><AlertTriangle size={11}/>{dateError}</p>
                        )}
                        {activeDate && !dateError && (
                          <p className="text-green-700 text-xs mt-2 flex items-center gap-1">
                            <CheckCircle size={11}/><strong>{prettyDate(activeDate)}</strong>&nbsp;·&nbsp;{sch.start_time?.slice(0,5)}–{sch.end_time?.slice(0,5)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            disabled={!selectedSchedule || !activeDate || !!dateError}
            onClick={() => { setStep(4); fetchSlots(selectedSchedule.schedule_id, activeDate); }}
            className="btn-primary w-full py-2.5 mt-5 disabled:opacity-40 disabled:cursor-not-allowed">
            Continue → Choose Time Slot
          </button>
        </div>
      )}

      {/* ══ STEP 4 — TIME SLOT GRID ════════════════════════════════════════════ */}
      {step === 4 && (
        <div>
          <button onClick={() => { setStep(3); setSelectedSlot(null); }}
            className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">← Change date</button>

          {/* Summary pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            <div className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
              <User size={12} style={{ color: '#15803d' }} /><span className="text-xs font-medium text-green-800">{selectedPatient?.full_name}</span>
            </div>
            <div className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <Stethoscope size={12} style={{ color: '#1d4ed8' }} /><span className="text-xs font-medium text-blue-800">Dr. {selectedDoctor?.staff_details?.user?.first_name} {selectedDoctor?.staff_details?.user?.last_name}</span>
            </div>
            <div className="rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5" style={{ background: '#faf5ff', border: '1px solid #d8b4fe' }}>
              <Calendar size={12} style={{ color: '#7c3aed' }} /><span className="text-xs font-medium text-purple-800">{prettyDate(activeDate)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-1">
            <Clock size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Select Time Slot</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Schedule: {selectedSchedule?.start_time?.slice(0,5)} – {selectedSchedule?.end_time?.slice(0,5)} · 20 mins per slot
          </p>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 3, background: '#eff6ff', border: '1px solid #93c5fd', display: 'inline-block' }}></span>Available</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 3, background: '#2563eb', display: 'inline-block' }}></span>Selected</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 3, background: '#fee2e2', border: '1px solid #fca5a5', display: 'inline-block' }}></span>Booked</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 3, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'inline-block' }}></span>Past</span>
          </div>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <span className="text-sm text-gray-500">Loading available slots…</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="card text-center py-8" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
              <p className="text-amber-700 text-sm">No slots available for this date.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
                {slots.map(slot => {
                  const isSelected = selectedSlot?.slot_time === slot.slot_time;
                  const disabled   = slot.is_booked || slot.is_past;

                  let bg, border, color, cursor;
                  if (isSelected) {
                    bg = '#2563eb'; border = '2px solid #1d4ed8'; color = 'white'; cursor = 'pointer';
                  } else if (slot.is_booked) {
                    bg = '#fee2e2'; border = '1px solid #fca5a5'; color = '#9ca3af'; cursor = 'not-allowed';
                  } else if (slot.is_past) {
                    bg = '#f3f4f6'; border = '1px solid #e5e7eb'; color = '#9ca3af'; cursor = 'not-allowed';
                  } else {
                    bg = '#eff6ff'; border = '1px solid #93c5fd'; color = '#1d4ed8'; cursor = 'pointer';
                  }

                  return (
                    <button key={slot.slot_time} type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setSelectedSlot(slot)}
                      style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', background: bg, border, color, cursor, transition: 'all 0.15s', opacity: disabled && !slot.is_booked ? 0.5 : 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{fmtTime(slot.slot_time)}</p>
                      <p style={{ fontSize: 10, opacity: 0.8 }}>
                        Token #{slot.token_no}
                        {slot.is_booked ? ' · Booked' : slot.is_past ? ' · Past' : ''}
                      </p>
                    </button>
                  );
                })}
              </div>

              {selectedSlot && (
                <div className="mb-4 rounded-xl p-3 flex items-center gap-3"
                  style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <CheckCircle size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      {fmtTime(selectedSlot.slot_time)} selected — Token #{selectedSlot.token_no}
                    </p>
                    <p className="text-xs text-blue-600">
                      Patient appointment: {fmtTime(selectedSlot.slot_time)} to {fmtTime(
                        (() => {
                          const [h, m] = selectedSlot.slot_time.split(':').map(Number);
                          const end = new Date(); end.setHours(h, m + 20, 0, 0);
                          return `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
                        })()
                      )}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            disabled={!selectedSlot}
            onClick={() => setStep(5)}
            className="btn-primary w-full py-2.5 disabled:opacity-40 disabled:cursor-not-allowed">
            Continue → Confirm Booking
          </button>
        </div>
      )}

      {/* ══ STEP 5 — CONFIRM ══════════════════════════════════════════════════ */}
      {step === 5 && (
        <div>
          <button onClick={() => setStep(4)} className="text-sm text-blue-600 hover:underline mb-5 flex items-center gap-1">← Change time slot</button>

          <div className="card mb-5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h3 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wider">Booking Summary</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Patient</p>
                <p className="font-semibold text-gray-900">{selectedPatient?.full_name}</p>
                <p className="text-xs text-gray-400">{selectedPatient?.patient_code} · {selectedPatient?.phone}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Doctor</p>
                <p className="font-semibold text-gray-900">Dr. {selectedDoctor?.staff_details?.user?.first_name} {selectedDoctor?.staff_details?.user?.last_name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Date</p>
                <p className="font-semibold text-gray-900">{prettyDate(activeDate)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Time Slot</p>
                <p className="font-semibold text-gray-900">{fmtTime(selectedSlot?.slot_time)}</p>
                <p className="text-xs text-gray-400">{selectedSchedule?.day_of_week}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Token Number</p>
                <p className="text-3xl font-bold text-blue-700">#{selectedSlot?.token_no}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Consultation Fee</p>
                <p className="text-xl font-bold text-green-700">₹{Number(selectedDoctor?.consultation_fee).toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          {Object.keys(errors).length > 0 && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              {errors.slot_time?.[0] || errors.non_field_errors?.[0] || errors.schedule?.[0] || 'Booking failed. Please try again.'}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="btn-secondary flex-1">← Edit</button>
            <button onClick={handleBook} disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {saving ? 'Booking…' : '✓ Confirm Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}