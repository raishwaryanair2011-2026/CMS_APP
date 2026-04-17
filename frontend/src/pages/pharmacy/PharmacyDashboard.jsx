// PharmacyDashboard.jsx
import { Outlet } from 'react-router-dom';
import Sidebar from '../../components/shared/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { ClipboardList, Pill, Package, LayoutDashboard } from 'lucide-react';

const links = [
  { to: '/pharmacy/queue',     icon: ClipboardList, label: 'Pending Queue' },
  { to: '/pharmacy/medicines', icon: Pill,          label: 'Medicines' },
  { to: '/pharmacy/batches',   icon: Package,       label: 'Stock Batches' },
];

export function PharmacyDashboard() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar links={links} roleName="Pharmacy" roleColor="pharmacy" />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">Pharmacy Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs text-gray-400">{user?.role}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.first_name?.[0] || 'P'}
            </div>
          </div>
        </header>
        <main className="flex-1 p-6"><Outlet /></main>
      </div>
    </div>
  );
}

export default PharmacyDashboard;