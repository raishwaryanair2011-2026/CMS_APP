import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Sidebar({ links, roleName, roleColor }) {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const colorMap = {
    admin:       'from-blue-600 to-blue-800',
    receptionist:'from-purple-600 to-purple-800',
    doctor:      'from-teal-600 to-teal-800',
    pharmacy:    'from-amber-600 to-amber-800',
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-100 flex flex-col shadow-sm">
      {/* Logo / Role header */}
      <div className={`bg-gradient-to-br ${colorMap[roleColor] || colorMap.admin} p-6`}>
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white/70 text-xs">CMS Hospital</p>
            <p className="text-white font-semibold text-sm">{roleName} Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="sidebar-link sidebar-link-inactive w-full text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}