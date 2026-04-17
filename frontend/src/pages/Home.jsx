import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/services';
import {
  Heart, Activity, Users, Calendar, FlaskConical,
  Pill, Phone, MapPin, Clock, ChevronRight, X, Eye, EyeOff,
  AlertCircle, IndianRupee, Stethoscope,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Role → dashboard mapping ──────────────────────────────────────────────────
// Fixed priority order — Admin always wins over other groups.
const ROLE_HOME = {
  Admin:        '/admin',
  Doctor:       '/doctor',
  Receptionist: '/reception',
  Pharmacist:   '/pharmacy',
};

function getRoleDashboard(role) {
  return ROLE_HOME[role] || '/';
}

// ─── Login Modal ──────────────────────────────────────────────────────────────
function LoginModal({ isOpen, onClose, returnTo }) {
  const { login } = useAuth();

  const [form,      setForm]      = useState({ username: '', password: '' });
  const [loading,   setLoading]   = useState(false);
  const [showPw,    setShowPw]    = useState(false);
  const [fieldErrs, setFieldErrs] = useState({});
  const [serverErr, setServerErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm({ username: '', password: '' });
      setFieldErrs({});
      setServerErr('');
      setShowPw(false);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const clearErr = (field) => {
    setFieldErrs((prev) => ({ ...prev, [field]: '' }));
    setServerErr('');
  };

  const validate = () => {
    const e = {};
    if (!form.username.trim()) e.username = 'Username is required.';
    if (!form.password)        e.password = 'Password is required.';
    setFieldErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerErr('');
    if (!validate()) return;
    setLoading(true);
    try {
      // login() returns user with role from backend (priority-ordered)
      const user = await login(form.username.trim(), form.password);
      toast.success(`Welcome, ${user.first_name || user.username}!`);
      onClose();

      // Use window.location.replace() not navigate().
      // navigate() can race with AuthContext updating — the ProtectedRoute
      // may briefly read null user and redirect to wrong dashboard.
      // window.location.replace() is a hard navigation that runs after the
      // current render cycle, by which time auth state is fully committed.
      const dest = returnTo || getRoleDashboard(user.role);
      window.location.replace(dest);

    } catch (err) {
      const data = err.response?.data;
      let msg = 'Invalid username or password. Please try again.';
      if (data?.errors?.non_field_errors?.[0]) msg = data.errors.non_field_errors[0];
      else if (data?.detail)                    msg = data.detail;
      else if (data?.message)                   msg = data.message;
      setServerErr(msg);
      setForm((f) => ({ ...f, password: '' }));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl z-10 overflow-hidden">

        {/* Header */}
        <div style={{ background: 'linear-gradient(to right, #2563eb, #1e40af)', padding: '1.5rem 2rem' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Heart size={18} color="white" />
                <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500 }}>CMS Hospital</span>
              </div>
              <h2 style={{ color: 'white', fontSize: 22, fontWeight: 500, margin: 0 }}>Staff Login</h2>
              <p style={{ color: '#bfdbfe', fontSize: 13, marginTop: 4 }}>Enter your credentials to continue</p>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
              padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}>
              <X size={18} color="white" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {serverErr && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#dc2626', margin: 0 }}>Login failed</p>
                <p style={{ fontSize: 12, color: '#ef4444', margin: '2px 0 0' }}>{serverErr}</p>
              </div>
            </div>
          )}
          <div>
            <label className="label">Username</label>
            <input type="text" autoComplete="username" autoFocus
              className={`input-field ${fieldErrs.username ? 'border-red-400' : ''}`}
              placeholder="Enter your username" value={form.username} disabled={loading}
              onChange={(e) => { setForm((f) => ({ ...f, username: e.target.value })); clearErr('username'); }}
            />
            {fieldErrs.username && <p className="text-red-500 text-xs mt-1">{fieldErrs.username}</p>}
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} autoComplete="current-password"
                className={`input-field pr-10 ${fieldErrs.password ? 'border-red-400' : ''}`}
                placeholder="Enter your password" value={form.password} disabled={loading}
                onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); clearErr('password'); }}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrs.password && <p className="text-red-500 text-xs mt-1">{fieldErrs.password}</p>}
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in...
              </>
            ) : 'Sign In'}
          </button>
          <p className="text-center text-xs text-gray-400">
            Access is restricted to authorized hospital staff only.
          </p>
        </form>

        <div style={{ padding: '0 2rem 1.5rem', borderTop: '0.5px solid #f3f4f6' }}>
          <p className="text-xs text-gray-400 text-center" style={{ marginBottom: 10, marginTop: 12 }}>
            Available roles
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {['Admin', 'Receptionist', 'Doctor', 'Pharmacist'].map((role) => (
              <span key={role} className="badge-info">{role}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Doctor Card ──────────────────────────────────────────────────────────────
function DoctorCard({ doctor }) {
  const initials = doctor.full_name
    .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ background: 'white', borderRadius: 16, border: '0.5px solid #e5e7eb', overflow: 'hidden', transition: 'box-shadow 0.2s, transform 0.2s' }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      <div style={{ height: 180, background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {doctor.profile_image ? (
          <img src={doctor.profile_image} alt={`Dr. ${doctor.full_name}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />) : null}
        <div style={{ display: doctor.profile_image ? 'none' : 'flex', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', border: '2px solid rgba(255,255,255,0.4)' }}>
          {initials}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', padding: '24px 12px 8px' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', padding: '3px 10px', borderRadius: 999, border: '0.5px solid rgba(255,255,255,0.3)' }}>
            {doctor.specialization}
          </span>
        </div>
      </div>
      <div style={{ padding: '16px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>Dr. {doctor.full_name}</h3>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>{doctor.doctor_code}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
            <IndianRupee size={13} color="#0f766e" />
            <span>Consultation fee: <strong>₹{Number(doctor.consultation_fee).toLocaleString('en-IN')}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
            <Users size={13} color="#0f766e" />
            <span>Max <strong>{doctor.max_patient_per_day}</strong> patients/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat / Service Cards ─────────────────────────────────────────────────────
function StatCard({ icon: Icon, value, label, color }) {
  const colors = { blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', purple: 'bg-purple-50 text-purple-600', amber: 'bg-amber-50 text-amber-600' };
  return (
    <div className="card text-center hover:shadow-md transition-shadow">
      <div className={`inline-flex p-3 rounded-full ${colors[color]} mb-3`}><Icon size={24} /></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ServiceCard({ icon: Icon, title, description, color }) {
  const colors = { blue: 'bg-blue-600', green: 'bg-green-600', purple: 'bg-purple-600', teal: 'bg-teal-600', amber: 'bg-amber-600', red: 'bg-red-600' };
  return (
    <div className="card hover:shadow-md transition-all hover:-translate-y-0.5 group">
      <div className={`${colors[color]} p-3 rounded-xl inline-flex mb-4 group-hover:scale-105 transition-transform`}><Icon size={22} className="text-white" /></div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Main Home Page ───────────────────────────────────────────────────────────
export default function Home() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [doctors,   setDoctors]   = useState([]);

  const { user, loading } = useAuth();
  const navigate           = useNavigate();
  const location           = useLocation();
  const returnTo           = location.state?.from || null;

  // FIX: If already logged in, redirect immediately to the correct dashboard.
  // Must wait for loading=false first — user is null while auth is being checked.
  useEffect(() => {
    if (!loading && user) {
      navigate(getRoleDashboard(user.role), { replace: true });
    }
  }, [user, loading]);

  // Auto-open login if redirected from a protected page
  useEffect(() => {
    if (!loading && !user && returnTo) setLoginOpen(true);
  }, [returnTo, user, loading]);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/v1/admin/doctors/public/')
      .then((res) => res.ok ? res.json() : null)
      .then((json) => setDoctors(json?.data || []))
      .catch(() => {});
  }, []);

  const handleStaffLogin = () => {
    if (user) navigate(getRoleDashboard(user.role));
    else      setLoginOpen(true);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg"><Heart size={20} className="text-white" /></div>
            <div><span className="font-bold text-gray-900">CMS</span><span className="text-blue-600 font-bold"> Hospital</span></div>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {[['Services','#services'],['Doctors','#doctors'],['Departments','#departments'],['Contact','#contact']].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-gray-600 hover:text-blue-600 transition-colors font-medium">{label}</a>
            ))}
          </div>
          <button onClick={handleStaffLogin} className="btn-primary flex items-center gap-2">
            {user ? <><Activity size={16} /> Go to Dashboard</> : <>Staff Login <ChevronRight size={16} /></>}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-6">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Now accepting patients 24/7
            </div>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
              Your Health is Our <span className="text-blue-200"> Top Priority</span>
            </h1>
            <p className="text-lg text-blue-100 mb-8 leading-relaxed">
              CMS Hospital provides world-class healthcare with experienced doctors, modern facilities, and compassionate care for every patient.
            </p>
            <a href="#doctors" className="border border-white/30 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors">
              Meet Our Doctors
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard icon={Users}    value="10,000+" label="Patients Served"      color="blue"   />
          <StatCard icon={Activity} value={doctors.length > 0 ? `${doctors.length}+` : '50+'} label="Expert Doctors" color="green" />
          <StatCard icon={Calendar} value="24/7"    label="Emergency Care"       color="purple" />
          <StatCard icon={Heart}    value="98%"     label="Patient Satisfaction" color="amber"  />
        </div>
      </section>

      {/* Doctors */}
      {doctors.length > 0 && (
        <section id="doctors" className="bg-gray-50 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
                <Stethoscope size={14} /> Our Medical Team
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Meet Our Doctors</h2>
              <p className="text-gray-500 max-w-xl mx-auto">Experienced specialists committed to delivering the highest quality healthcare.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
              {doctors.map((doc) => <DoctorCard key={doc.doctor_code} doctor={doc} />)}
            </div>
          </div>
        </section>
      )}

      {/* Services */}
      <section id="services" className="py-20" style={{ background: doctors.length > 0 ? 'white' : '#f9fafb' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Services</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Comprehensive healthcare services delivered with expertise and compassion.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <ServiceCard icon={Heart}        title="Cardiology"       color="red"    description="Expert cardiac care with advanced diagnostic and treatment facilities." />
            <ServiceCard icon={Activity}     title="General Medicine" color="blue"   description="Comprehensive primary care and preventive health services for all ages." />
            <ServiceCard icon={Users}        title="Pediatrics"       color="green"  description="Specialized care for infants, children, and adolescents by expert pediatricians." />
            <ServiceCard icon={FlaskConical} title="Laboratory"       color="purple" description="State-of-the-art diagnostic lab with quick and accurate test results." />
            <ServiceCard icon={Pill}         title="Pharmacy"         color="amber"  description="24-hour pharmacy with all prescribed medicines and expert pharmacists." />
            <ServiceCard icon={Calendar}     title="Appointments"     color="teal"   description="Easy online appointment booking with your preferred specialist." />
          </div>
        </div>
      </section>

      {/* Departments */}
      <section id="departments" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Departments</h2>
          <p className="text-gray-500">Specialized departments staffed by experienced medical professionals.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['Cardiology','Neurology','Orthopedics','Pediatrics','Dermatology','Ophthalmology','ENT','Oncology'].map((dept) => (
            <div key={dept} className="card text-center hover:shadow-md hover:border-blue-100 transition-all cursor-default">
              <p className="font-medium text-gray-800">{dept}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Contact Us</h2>
            <p className="text-blue-200">We're here for you 24 hours a day, 7 days a week.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white/10 p-4 rounded-full"><Phone size={24} /></div>
              <p className="font-semibold">Emergency</p><p className="text-blue-200">+91 1800-XXX-XXXX</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white/10 p-4 rounded-full"><MapPin size={24} /></div>
              <p className="font-semibold">Location</p><p className="text-blue-200">123 Hospital Road, Chennai, Tamil Nadu</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white/10 p-4 rounded-full"><Clock size={24} /></div>
              <p className="font-semibold">Working Hours</p><p className="text-blue-200">24/7 Emergency — OPD: 8AM to 8PM</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Heart size={16} className="text-blue-400" />
            <span className="text-white font-semibold">CMS Hospital</span>
          </div>
          <p className="text-sm">© 2026 CMS Hospital. All rights reserved.</p>
        </div>
      </footer>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} returnTo={returnTo} />
    </div>
  );
}