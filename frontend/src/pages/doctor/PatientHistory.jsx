import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../api/services';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage, formatDate } from '../../utils/helpers';
import { ArrowLeft, ChevronDown, ChevronUp, Printer, Download, Pill } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PatientHistory() {
  const { patientId } = useParams();
  const navigate      = useNavigate();

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState({});
  const [pdfLoading, setPdfLoading] = useState({});

  useEffect(() => {
    doctorAPI.getPatientHistory(patientId)
      .then(({ data: res }) => setData(res.data || res))
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [patientId]);

  const toggleExpand = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handlePdf = async (consultation, mode) => {
    setPdfLoading((prev) => ({ ...prev, [`${consultation.id}-${mode}`]: true }));
    try {
      const res = mode === 'print'
        ? await doctorAPI.printPrescriptionPdf(consultation.id)
        : await doctorAPI.downloadPrescriptionPdf(consultation.id);
      const blob     = new Blob([res.data], { type: 'application/pdf' });
      const url      = window.URL.createObjectURL(blob);
      const filename = `prescription_${consultation.appointment_code}.pdf`;
      if (mode === 'print') {
        const tab = window.open(url, '_blank');
        if (!tab) toast.error('Pop-up blocked. Please allow pop-ups.');
      } else {
        const a    = document.createElement('a');
        a.href     = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast.success(`Downloaded ${filename}`);
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toast.error('Could not load prescription PDF.');
    } finally {
      setPdfLoading((prev) => ({ ...prev, [`${consultation.id}-${mode}`]: false }));
    }
  };

  if (loading) return <LoadingSpinner fullscreen />;
  if (!data)   return (
    <div className="card text-center py-12">
      <p className="text-gray-400">No data found for this patient.</p>
    </div>
  );

  const { patient, consultations, total } = data;

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button onClick={() => navigate('/doctor/patients')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm">
        <ArrowLeft size={16} /> Back to patients
      </button>

      {/* Patient info */}
      <div className="card mb-6" style={{ borderLeft: '4px solid #0f766e' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{patient.full_name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {patient.patient_code} · {patient.phone}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span>{patient.gender}</span>
              {patient.dob && <span>DOB: {formatDate(patient.dob)}</span>}
            </div>
          </div>
          <div style={{
            background: '#f0fdfa', border: '0.5px solid #99f6e4',
            borderRadius: 8, padding: '6px 14px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 22, fontWeight: 500, color: '#0f766e', lineHeight: 1 }}>{total}</p>
            <p style={{ fontSize: 11, color: '#0f766e', opacity: 0.7 }}>total visits</p>
          </div>
        </div>
      </div>

      {/* Consultations timeline */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Consultation History</h2>

      {consultations.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-400 text-sm">No consultations on record.</p>
        </div>
      ) : consultations.map((c) => (
        <div key={c.id} className="card mb-3" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Header — always visible */}
          <div
            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
            style={{ padding: '14px 16px' }}
            onClick={() => toggleExpand(c.id)}
          >
            <div className="flex items-center gap-3">
              {/* Date badge */}
              <div style={{
                background: '#f0fdfa', border: '0.5px solid #99f6e4',
                borderRadius: 8, padding: '4px 10px', textAlign: 'center', flexShrink: 0,
              }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#0f766e' }}>
                  {formatDate(c.appointment_date)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {c.diagnosis || 'No diagnosis recorded'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.prescription?.medicines?.length || 0} medicine(s) prescribed
                  {c.appointment_status === 'COMPLETED' &&
                    <span className="ml-2 text-green-600">· Completed</span>
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* PDF buttons — only if prescription exists */}
              {c.prescription && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePdf(c, 'print'); }}
                    disabled={pdfLoading[`${c.id}-print`]}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11,
                      fontWeight: 500, cursor: 'pointer',
                      background: '#eff6ff', color: '#1e40af',
                      border: '0.5px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title="Print prescription"
                  >
                    {pdfLoading[`${c.id}-print`]
                      ? <div className="w-3 h-3 animate-spin rounded-full border border-blue-300 border-t-blue-600" />
                      : <Printer size={11} />
                    }
                    Print
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePdf(c, 'download'); }}
                    disabled={pdfLoading[`${c.id}-download`]}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11,
                      fontWeight: 500, cursor: 'pointer',
                      background: 'var(--color-background-secondary)',
                      color: 'var(--color-text-secondary)',
                      border: '0.5px solid var(--color-border-secondary)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title="Download prescription"
                  >
                    {pdfLoading[`${c.id}-download`]
                      ? <div className="w-3 h-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                      : <Download size={11} />
                    }
                    Save
                  </button>
                </>
              )}
              {expanded[c.id]
                ? <ChevronUp size={16} className="text-gray-400" />
                : <ChevronDown size={16} className="text-gray-400" />
              }
            </div>
          </div>

          {/* Expanded detail */}
          {expanded[c.id] && (
            <div style={{
              borderTop: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-secondary)',
              padding: '14px 16px',
            }}>
              {/* Symptoms + diagnosis */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Symptoms</p>
                  <p className="text-sm text-gray-700">{c.symptoms || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Diagnosis</p>
                  <p className="text-sm text-gray-700">{c.diagnosis || '—'}</p>
                </div>
              </div>
              {c.notes && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1">Doctor's notes</p>
                  <p className="text-sm text-gray-700">{c.notes}</p>
                </div>
              )}

              {/* Medicines */}
              {c.prescription?.medicines?.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                    <Pill size={11} /> Medicines prescribed
                  </p>
                  <div className="space-y-1.5">
                    {c.prescription.medicines.map((m) => (
                      <div key={m.id}
                        className="flex items-center gap-3 text-sm"
                        style={{
                          background: 'white', borderRadius: 6, padding: '6px 10px',
                          border: '0.5px solid var(--color-border-tertiary)',
                        }}>
                        <span className="font-medium text-gray-800 min-w-[120px]">{m.medicine_name}</span>
                        <span className="text-gray-500">{m.dosage}</span>
                        <span className="text-gray-500">{m.frequency}</span>
                        <span className="text-gray-500">{m.duration}</span>
                        <span className="text-gray-400 ml-auto">Qty: {m.quantity}</span>
                        {m.is_dispensed && (
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 999,
                            background: '#d1fae5', color: '#065f46', fontWeight: 500,
                          }}>Dispensed</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No medicines in this prescription.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}