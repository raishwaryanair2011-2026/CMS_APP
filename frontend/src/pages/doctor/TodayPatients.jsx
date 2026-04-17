import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI, doctorAPI } from '../../api/services';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage, getStatusBadge } from '../../utils/helpers';
import { RefreshCw, Stethoscope, CheckCircle, Users, Clock, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';

function StatCard({ icon: Icon, value, label, bg, textColor, iconColor }) {
  return (
    <div style={{
      background: bg, borderRadius: 12,
      border: '0.5px solid var(--color-border-tertiary)',
      padding: '1rem 1.25rem',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: 'white', display: 'flex', alignItems: 'center',
        justifyContent: 'center', border: '0.5px solid var(--color-border-tertiary)',
      }}>
        <Icon size={20} color={iconColor} />
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 500, color: textColor, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 12, color: textColor, opacity: 0.7, marginTop: 3 }}>{label}</p>
      </div>
    </div>
  );
}

export default function TodayPatients() {
  const [appointments, setAppointments] = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const navigate = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [aptsRes, statsRes] = await Promise.all([
        receptionAPI.getTodayAppointments(),
        doctorAPI.getDashboard(),
      ]);
      setAppointments(aptsRes.data.data  || aptsRes.data);
      setStats(statsRes.data.data        || null);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const statusOrder = { BOOKED: 0, IN_PROGRESS: 1, COMPLETED: 2, CANCELLED: 3 };
  const sorted = [...appointments].sort(
    (a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || a.token_no - b.token_no
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* ── Stats ── */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: 12, marginBottom: '1.5rem',
        }}>
          <StatCard icon={Users}       value={stats.today_total}         label="Today's patients"
            bg="#f0fdfa" textColor="#0f766e" iconColor="#14b8a6" />
          <StatCard icon={Clock}       value={stats.today_pending}        label="Pending"
            bg="#fffbeb" textColor="#92400e" iconColor="#f59e0b" />
          <StatCard icon={CheckCircle} value={stats.today_completed}      label="Completed today"
            bg="#f0fdf4" textColor="#166534" iconColor="#22c55e" />
          {/* <StatCard icon={BarChart2}   value={stats.total_consultations}  label="All-time total"
            bg="#eff6ff" textColor="#1e40af" iconColor="#3b82f6" /> */}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's Patients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {appointments.filter(a => ['BOOKED','IN_PROGRESS'].includes(a.status)).length} waiting
          </p>
        </div>
        <button onClick={fetchAll} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* ── Patient cards ── */}
      {sorted.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm">No appointments today.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((apt) => {
            const borderColor =
              apt.status === 'IN_PROGRESS' ? '#f59e0b' :
              apt.status === 'COMPLETED'   ? '#22c55e' :
              apt.status === 'CANCELLED'   ? '#ef4444' : '#3b82f6';
            return (
              <div key={apt.id} className="card hover:shadow-md transition-all"
                style={{ borderLeft: `4px solid ${borderColor}` }}>

                {/* Token + status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: '#eff6ff', color: '#1e40af',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14,
                    }}>{apt.token_no}</span>
                    <span className="font-mono text-xs text-gray-400">{apt.appointment_code}</span>
                  </div>
                  <span className={getStatusBadge(apt.status)}>
                    {apt.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Patient info */}
                <h3 className="font-semibold text-gray-900 mb-0.5">{apt.patient?.full_name}</h3>
                <p className="text-xs text-gray-400 mb-0.5">{apt.patient?.patient_code}</p>
                <p className="text-xs text-gray-500 mb-3">{apt.patient?.phone}</p>

                {/* Billing + history link */}
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs ${getStatusBadge(apt.billing?.payment_status)}`}>
                    Fee: {apt.billing?.payment_status || '—'}
                  </span>
                  {apt.patient?.id && (
                    <button
                      onClick={() => navigate(`/doctor/history/${apt.patient.id}`)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Past history →
                    </button>
                  )}
                </div>

                {/* Action button */}
                {(apt.status === 'BOOKED' || apt.status === 'IN_PROGRESS') && (
                  <button
                    onClick={() => navigate(`/doctor/consultation/${apt.id}`)}
                    className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
                  >
                    <Stethoscope size={14} />
                    {apt.status === 'BOOKED' ? 'Start Consultation' : 'Continue'}
                  </button>
                )}
                {apt.status === 'COMPLETED' && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <CheckCircle size={16} />
                      <span>Completed</span>
                    </div>
                    <button
                      onClick={() => navigate(`/doctor/consultation/${apt.id}`)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}