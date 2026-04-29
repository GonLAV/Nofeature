import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Zap, LayoutDashboard, BarChart2, LogOut, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Logged out');
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="p-1.5 bg-red-600 rounded-lg"><Zap size={16} className="text-white" /></div>
          <span className="font-semibold text-sm">War Room AI</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/" end className={navClass}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
          <NavLink to="/analytics" className={navClass}>
            <BarChart2 size={16} /> Analytics
          </NavLink>
        </nav>
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 px-2 py-1 mb-2">
            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.name}</div>
              <div className="text-xs text-gray-400 truncate">{user?.role}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
