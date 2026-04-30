import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Zap, LayoutDashboard, BarChart2, LogOut, BookOpen, Users, ScrollText, Calendar, FileText, Plug, CalendarClock, Bell, Settings as SettingsIcon, Sparkles, Sun, Moon, Search, LayoutGrid, Server, Inbox as InboxIcon, Handshake, Target, Dna } from 'lucide-react';
import { useThemeStore } from '../../store/theme.store';
import MentionsBell from './MentionsBell';
import CommandPalette from './CommandPalette';
import { useAuthStore } from '../../store/auth.store';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';

function InboxNavLink() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
    }`;
  const { data } = useQuery({
    queryKey: ['inbox-count'],
    queryFn: () => api.get('/inbox/count').then(r => r.data?.data),
    refetchInterval: 30000,
  });
  const count = data?.total ?? 0;
  return (
    <NavLink to="/inbox" className={navClass}>
      <InboxIcon size={16} /> Inbox
      {count > 0 && (
        <span className="ml-auto px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">{count}</span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
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
          <NavLink to="/runbooks" className={navClass}>
            <BookOpen size={16} /> Runbooks
          </NavLink>
          <NavLink to="/team" className={navClass}>
            <Users size={16} /> Team
          </NavLink>
          <NavLink to="/audit" className={navClass}>
            <ScrollText size={16} /> Audit Log
          </NavLink>
          <NavLink to="/analytics" className={navClass}>
            <BarChart2 size={16} /> Analytics
          </NavLink>
          <NavLink to="/digest" className={navClass}>
            <Sparkles size={16} /> Weekly Digest
          </NavLink>
          <NavLink to="/templates" className={navClass}>
            <FileText size={16} /> Templates
          </NavLink>
          <NavLink to="/maintenance" className={navClass}>
            <Calendar size={16} /> Maintenance
          </NavLink>
          <NavLink to="/integrations" className={navClass}>
            <Plug size={16} /> Integrations
          </NavLink>
          <NavLink to="/oncall" className={navClass}>
            <CalendarClock size={16} /> On-Call
          </NavLink>
          <NavLink to="/escalations" className={navClass}>
            <Bell size={16} /> Escalations
          </NavLink>
          <NavLink to="/search" className={navClass}>
            <Search size={16} /> Search
          </NavLink>
          <NavLink to="/postmortems" className={navClass}>
            <FileText size={16} /> Postmortems
          </NavLink>
          <NavLink to="/promises" className={navClass}>
            <Handshake size={16} /> Promises
          </NavLink>
          <NavLink to="/calibration" className={navClass}>
            <Target size={16} /> Calibration
          </NavLink>
          <NavLink to="/dna" className={navClass}>
            <Dna size={16} /> Failure DNA
          </NavLink>
          <NavLink to="/board" className={navClass}>
            <LayoutGrid size={16} /> Board
          </NavLink>
          <NavLink to="/services" className={navClass}>
            <Server size={16} /> Services
          </NavLink>
          <InboxNavLink />
          <NavLink to="/settings" className={navClass}>
            <SettingsIcon size={16} /> Settings
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
            <MentionsBell />
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            <LogOut size={14} /> Sign out
          </button>
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors mt-1">
            {theme === 'dark' ? <Sun size={12}/> : <Moon size={12}/>} {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
