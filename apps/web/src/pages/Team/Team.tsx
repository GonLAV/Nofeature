import { useEffect, useState } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Users, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

const ROLES: TeamMember['role'][] = ['owner', 'admin', 'manager', 'member', 'viewer'];

const roleColor: Record<string, string> = {
  owner:   'bg-purple-100 text-purple-700',
  admin:   'bg-red-100 text-red-700',
  manager: 'bg-blue-100 text-blue-700',
  member:  'bg-gray-100 text-gray-700',
  viewer:  'bg-gray-100 text-gray-500',
};

export default function Team() {
  const me = useAuthStore((s) => s.user);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const canManage = me?.role === 'owner' || me?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setTeam(data.data);
    } catch {
      toast.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRole = async (id: string, role: string) => {
    try {
      await api.patch(`/users/${id}`, { role });
      toast.success('Role updated');
      load();
    } catch {
      toast.error('Failed to update role');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this team member?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('Removed');
      load();
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <span className="ml-auto text-sm text-gray-500">{team.length} member{team.length === 1 ? '' : 's'}</span>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Last login</th>
              {canManage && <th className="text-right px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Loading…</td></tr>
            ) : team.map((m) => (
              <tr key={m.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3 text-gray-600">{m.email}</td>
                <td className="px-4 py-3">
                  {canManage && m.id !== me?.id ? (
                    <select
                      value={m.role}
                      onChange={(e) => updateRole(m.id, e.target.value)}
                      className={`text-xs font-semibold px-2 py-1 rounded ${roleColor[m.role]} border-0`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${roleColor[m.role]}`}>{m.role}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${m.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                    {m.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {m.last_login_at ? new Date(m.last_login_at).toLocaleString() : '—'}
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    {m.id !== me?.id && (
                      <button onClick={() => remove(m.id)} className="text-red-600 hover:bg-red-50 p-1 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        To add a new team member, share the registration link. Self-serve invites coming next.
      </p>
    </div>
  );
}
