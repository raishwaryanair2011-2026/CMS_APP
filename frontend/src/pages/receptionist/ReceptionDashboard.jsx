import { Outlet } from 'react-router-dom';
import Sidebar from '../../components/shared/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { Users, CalendarPlus, List, Receipt, LayoutDashboard } from 'lucide-react';

const links = [
  { to: '/reception/queue',    icon: List,         label: "Patient Queue" },
  { to: '/reception/patients', icon: Users,        label: 'Patients' },
  { to: '/reception/book',     icon: CalendarPlus, label: 'Book Appointment' },
  { to: '/reception/billing',  icon: Receipt,      label: 'Billing' },
];

export default function ReceptionDashboard() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar links={links} roleName="Receptionist" roleColor="receptionist" />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">Receptionist Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs text-gray-400">{user?.role}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.first_name?.[0] || 'R'}
            </div>
          </div>
        </header>
        <main className="flex-1 p-6"><Outlet /></main>
      </div>
    </div>
  );
}