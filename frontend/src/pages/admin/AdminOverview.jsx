import { useState, useEffect } from 'react';
import { adminAPI } from '../../api/services';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { getErrorMessage } from '../../utils/helpers';
import { Users, Stethoscope, BookOpen, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_CONFIG = {
  Admin:        { bar: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700'     },
  Doctor:       { bar: 'bg-green-500',  badge: 'bg-green-50 text-green-700'   },
  Receptionist: { bar: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700' },
  Pharmacist:   { bar: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700' },
  'No Role':    { bar: 'bg-gray-400',   badge: 'bg-gray-50 text-gray-600'     },
};

export default function AdminOverview() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [staffRes, docRes, specRes, schRes] = await Promise.all([
          adminAPI.getStaff(),
          adminAPI.getDoctors(),
          adminAPI.getSpecializations(),
          adminAPI.getSchedules(),
        ]);

        const staff     = staffRes.data?.data  || staffRes.data  || [];
        const doctors   = docRes.data?.data    || docRes.data    || [];
        const specs     = specRes.data?.data   || specRes.data   || [];
        const schedules = schRes.data?.data    || schRes.data    || [];

        const activeStaff     = staff.filter((s) => s.is_active && !s.is_deleted).length;
        const inactiveStaff   = staff.filter((s) => !s.is_active && !s.is_deleted).length;
        const totalDoctors    = doctors.filter((d) => !d.is_deleted).length;
        const activeDoctors   = doctors.filter((d) => d.is_active && !d.is_deleted).length;
        const inactiveDoctors = doctors.filter((d) => !d.is_active && !d.is_deleted).length;
        const activeSchedules = schedules.filter((s) => s.is_active && !s.is_deleted).length;

        const roleCounts = staff.reduce((acc, s) => {
          const role = s.role_display || s.role || 'No Role';
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        }, {});

        setStats({
          totalStaff:     staff.filter((s) => !s.is_deleted).length,
          activeStaff,
          inactiveStaff,
          totalDoctors,
          activeDoctors,
          inactiveDoctors,
          totalSpecs:     specs.filter((s) => !s.is_deleted).length,
          totalSchedules: schedules.filter((s) => !s.is_deleted).length,
          activeSchedules,
          roleCounts,
          recentStaff:    [...staff].filter((s) => !s.is_deleted).reverse().slice(0, 5),
          recentDoctors:  [...doctors].filter((d) => !d.is_deleted).reverse().slice(0, 5),
        });
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats)  return null;

  const STAT_CARDS = [
    {
      label: 'Total Staff',
      value: stats.totalStaff,
      sub:   `${stats.activeStaff} active · ${stats.inactiveStaff} inactive`,
      icon:  <Users size={22} />,
      bg: 'bg-blue-50', iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
      valueColor: 'text-blue-700', border: 'border-blue-100',
    },
    {
      label: 'Total Doctors',
      value: stats.totalDoctors,
      sub:   `${stats.activeDoctors} active · ${stats.inactiveDoctors} inactive`,
      icon:  <Stethoscope size={22} />,
      bg: 'bg-green-50', iconBg: 'bg-green-100', iconColor: 'text-green-600',
      valueColor: 'text-green-700', border: 'border-green-100',
    },
    {
      label: 'Specializations',
      value: stats.totalSpecs,
      sub:   'registered',
      icon:  <BookOpen size={22} />,
      bg: 'bg-purple-50', iconBg: 'bg-purple-100', iconColor: 'text-purple-600',
      valueColor: 'text-purple-700', border: 'border-purple-100',
    },
    {
      label: 'Schedules',
      value: stats.totalSchedules,
      sub:   `${stats.activeSchedules} active`,
      icon:  <Calendar size={22} />,
      bg: 'bg-orange-50', iconBg: 'bg-orange-100', iconColor: 'text-orange-500',
      valueColor: 'text-orange-600', border: 'border-orange-100',
    },
  ];

  const ACTIVE_RATES = [
    { label: 'Staff',     active: stats.activeStaff,     total: stats.totalStaff,     bar: 'bg-blue-500',   ring: 'bg-blue-100',   text: 'text-blue-600'   },
    { label: 'Doctors',   active: stats.activeDoctors,   total: stats.totalDoctors,   bar: 'bg-green-500',  ring: 'bg-green-100',  text: 'text-green-600'  },
    { label: 'Schedules', active: stats.activeSchedules, total: stats.totalSchedules, bar: 'bg-orange-400', ring: 'bg-orange-100', text: 'text-orange-500' },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <p className="text-sm text-gray-400 mt-1">Overview of your clinic management system</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map((c) => (
          <div key={c.label}
            className={`${c.bg} border ${c.border} rounded-xl p-5 flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {c.label}
              </span>
              <div className={`${c.iconBg} ${c.iconColor} p-2 rounded-lg`}>
                {c.icon}
              </div>
            </div>
            <div>
              <p className={`text-3xl font-bold ${c.valueColor}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* Staff by role */}
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Staff by role</h3>
          {Object.keys(stats.roleCounts).length === 0 ? (
            <p className="text-xs text-gray-400">No staff registered yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(stats.roleCounts).map(([role, count]) => {
                const pct = stats.totalStaff
                  ? Math.round((count / stats.totalStaff) * 100) : 0;
                const cfg = ROLE_CONFIG[role] || ROLE_CONFIG['No Role'];
                return (
                  <div key={role} className="flex items-center gap-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full min-w-[100px] text-center ${cfg.badge}`}>
                      {role}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className={`${cfg.bar} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 min-w-[70px] text-right">
                      {count} · {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Active rate</h3>
          <div className="space-y-5">
            {ACTIVE_RATES.map(({ label, active, total, bar, ring, text }) => {
              const pct = total ? Math.round((active / total) * 100) : 0;
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className={`${ring} rounded-full w-10 h-10 flex items-center justify-center shrink-0`}>
                    <span className={`text-xs font-bold ${text}`}>{pct}%</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{label}</span>
                      <span className="text-gray-400">{active}/{total}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`${bar} h-1.5 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Recent staff */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent staff</h3>
          {stats.recentStaff.length === 0 ? (
            <p className="text-xs text-gray-400">No staff registered yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentStaff.map((s) => {
                const role = s.role_display || s.role || 'No Role';
                const cfg  = ROLE_CONFIG[role] || ROLE_CONFIG['No Role'];
                return (
                  <div key={s.staff_id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                      {s.user?.first_name?.[0]}{s.user?.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {s.user?.first_name} {s.user?.last_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{s.user?.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.badge}`}>
                      {role}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent doctors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent doctors</h3>
          {stats.recentDoctors.length === 0 ? (
            <p className="text-xs text-gray-400">No doctors registered yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentDoctors.map((d) => (
                <div key={d.doctor_profile_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-600 shrink-0">
                    {d.staff_details?.user?.first_name?.[0]}
                    {d.staff_details?.user?.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      Dr. {d.staff_details?.user?.first_name} {d.staff_details?.user?.last_name}
                    </p>
                    <p className="text-xs text-gray-400">{d.doctor_code}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    d.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}