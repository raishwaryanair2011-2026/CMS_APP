import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/shared/ProtectedRoute';

// Pages
import Home from './pages/Home';

// Admin
import AdminDashboard     from './pages/admin/AdminDashboard';
import AdminOverview      from './pages/admin/AdminOverview';
import StaffList          from './pages/admin/StaffList';
import DoctorList         from './pages/admin/DoctorList';
import SpecializationList from './pages/admin/SpecializationList';
import ScheduleList       from './pages/admin/ScheduleList';

// Receptionist
import ReceptionDashboard from './pages/receptionist/ReceptionDashboard';
import PatientList        from './pages/receptionist/PatientList';
import BookAppointment    from './pages/receptionist/BookAppointment';
import TodayQueue         from './pages/receptionist/TodayQueue';
import BillingList        from './pages/receptionist/BillingList';

// Doctor
import DoctorDashboard    from './pages/doctor/DoctorDashboard';
import TodayPatients      from './pages/doctor/TodayPatients';
import ConsultationForm   from './pages/doctor/ConsultationForm';
import PatientHistory     from './pages/doctor/PatientHistory';
import PatientSearch      from './pages/doctor/PatientSearch';

// Pharmacy
import PharmacyDashboard  from './pages/pharmacy/PharmacyDashboard';
import PendingQueue       from './pages/pharmacy/PendingQueue';
import MedicineList       from './pages/pharmacy/MedicineList';
import BatchList          from './pages/pharmacy/BatchList';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '10px', fontSize: '14px' },
            success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }>
            <Route index element={<AdminOverview />} />
            <Route path="staff"           element={<StaffList />} />
            <Route path="doctors"         element={<DoctorList />} />
            <Route path="specializations" element={<SpecializationList />} />
            <Route path="schedules"       element={<ScheduleList />} />
          </Route>

          {/* Receptionist routes */}
          <Route path="/reception" element={
            <ProtectedRoute allowedRoles={['Receptionist', 'Admin']}>
              <ReceptionDashboard />
            </ProtectedRoute>
          }>
            <Route index element={<TodayQueue />} />
            <Route path="queue"    element={<TodayQueue />} />
            <Route path="patients" element={<PatientList />} />
            <Route path="book"     element={<BookAppointment />} />
            <Route path="billing"  element={<BillingList />} />
          </Route>

          {/* Doctor routes */}
          <Route path="/doctor" element={
            <ProtectedRoute allowedRoles={['Doctor']}>
              <DoctorDashboard />
            </ProtectedRoute>
          }>
            <Route index element={<TodayPatients />} />
            <Route path="patients"              element={<TodayPatients />} />
            <Route path="search"                element={<PatientSearch />} />
            <Route path="history/:patientId"   element={<PatientHistory />} />
            <Route path="consultation/:appointmentId" element={<ConsultationForm />} />
          </Route>

          {/* Pharmacy routes */}
          <Route path="/pharmacy" element={
            <ProtectedRoute allowedRoles={['Pharmacist', 'Admin']}>
              <PharmacyDashboard />
            </ProtectedRoute>
          }>
            <Route index element={<PendingQueue />} />
            <Route path="queue"     element={<PendingQueue />} />
            <Route path="medicines" element={<MedicineList />} />
            <Route path="batches"   element={<BatchList />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}