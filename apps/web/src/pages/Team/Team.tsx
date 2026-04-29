import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, UserPlus, Shield, ChevronDown, Trash2,
  Copy, Check, X, Crown, Eye, Briefcase, UserCog,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../../store/auth.store';
import api from '../../lib/api';

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const ROLES = ['admin', 'manager', 'member', 'viewer'] as const;
type Role = (typeof ROLES)[number];

const ROLE_META: Record<Role, { label: string; color: string; Icon: React.ElementType; desc: string }> = {
  admin:   { label: 'Admin',   color: 'bg-red-100 text-red-700',    Icon: Shield,   desc: 'Manage users, delete incidents' },
  manager: { label: 'Manager', color: 'bg-orange-100 text-orange-700', Icon: Crown, desc: 'Assign commanders, all CRUD' },
  member:  { label: 'Member',  color: 'bg-blue-100 text-blue-700',   Icon: Briefcase, desc: 'Create & update incidents' },
  viewer:  { label: 'Viewer',  color: 'bg-gray-100 text-gray-600',   Icon: Eye,      desc: 'Read-only access' },
};

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role as Role];
  if (!meta) return <span className="text-xs text-gray-400">{role}</span>;
  const { label, color, Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      <Icon size={10} /> {label}
    </span>
  );
}

function Avatar({ name, active }: { name: string; active: boolean }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className={`relative flex-shrink-0`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
        active ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white' : 'bg-gray-200 text-gray-400'
      }`}>
        {initials}
      </div>
      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
        active ? 'bg-green-400' : 'bg-gray-300'
      }`} />
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', name: '', role: 'member' as Role });
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () => api.post<{ data: { tempPassword: string; name: string } }>('/users/invite', form).then(r => r.data.data),
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success(`${data.name} added to the team`);
    },
    onError: () => toast.error('Failed to invite user — email may already exist'),
  });

  const copy = () => {
    navigator.clipboard.writeText(
      `Login: ${form.email}\nTemp password: ${tempPassword}\nChange it on first login.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <UserPlus size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold">Invite team member</h2>
              <p className="text-xs text-gray-500">They'll receive a temporary password</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {!tempPassword ? (
          <div className="p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Full name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Work email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jane@acme.com"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(r => {
                  const { label, Icon, desc, color } = ROLE_META[r];
                  const selected = form.role === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setForm(f => ({ ...f, role: r }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${selected ? color : 'bg-gray-100 text-gray-600'}`}>
                        <Icon size={10} /> {label}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={!form.email || !form.name || inviteMutation.isPending}
              className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {inviteMutation.isPending ? 'Inviting…' : 'Send invite'}
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-1">
              <Check size={24} className="text-green-500 mx-auto" />
              <p className="font-medium text-green-800">Invite created!</p>
              <p className="text-sm text-green-600">Share these credentials with {form.name}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="font-medium">{form.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Temp password:</span>
                <span className="font-bold text-blue-700">{tempPassword}</span>
              </div>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
              This password is shown once. Ask them to change it on first login.
            </p>
            <div className="flex gap-3">
              <button
                onClick={copy}
                className="flex-1 flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy credentials'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Team() {
  const currentUser = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['team'],
    queryFn: () => api.get<{ data: Member[] }>('/users').then(r => r.data.data),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/users/${id}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/users/${id}`, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Member status updated');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setConfirmRemove(null);
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });

  const canManage = ['admin', 'owner'].includes(currentUser?.role ?? '');

  const active   = members.filter(m => m.is_active);
  const inactive = members.filter(m => !m.is_active);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users size={22} /> Team
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {active.length} active member{active.length !== 1 ? 's' : ''}
            {inactive.length > 0 && ` · ${inactive.length} inactive`}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus size={15} /> Invite member
          </button>
        )}
      </div>

      {/* Role legend */}
      <div className="bg-white rounded-xl border p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Role permissions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ROLES.map(r => {
            const { label, desc, color, Icon } = ROLE_META[r];
            return (
              <div key={r} className="space-y-1">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
                  <Icon size={10} /> {label}
                </span>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">Loading team…</div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {members.map(member => {
            const isMe = member.id === currentUser?.id;
            const meta = ROLE_META[member.role as Role];
            return (
              <div key={member.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${!member.is_active ? 'opacity-50' : ''}`}>
                <Avatar name={member.name} active={member.is_active} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{member.name}</span>
                    {isMe && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">You</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{member.email}</div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:block">
                    {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                  </span>

                  {/* Role selector */}
                  {canManage && !isMe ? (
                    <div className="relative">
                      <select
                        value={member.role}
                        onChange={e => roleMutation.mutate({ id: member.id, role: e.target.value })}
                        className={`appearance-none text-xs font-medium px-2.5 py-1 pr-6 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300 ${meta?.color ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{ROLE_META[r].label}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  ) : (
                    <RoleBadge role={member.role} />
                  )}

                  {/* Deactivate / reactivate */}
                  {canManage && !isMe && (
                    <button
                      onClick={() => toggleMutation.mutate({ id: member.id, is_active: !member.is_active })}
                      title={member.is_active ? 'Deactivate' : 'Reactivate'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        member.is_active
                          ? 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'
                          : 'text-gray-400 hover:bg-green-50 hover:text-green-600'
                      }`}
                    >
                      <UserCog size={15} />
                    </button>
                  )}

                  {/* Remove */}
                  {canManage && !isMe && (
                    confirmRemove === member.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => removeMutation.mutate(member.id)}
                          className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg font-medium transition-colors"
                        >
                          Confirm
                        </button>
                        <button onClick={() => setConfirmRemove(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(member.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove member"
                      >
                        <Trash2 size={15} />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="p-10 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p>No team members yet. Invite someone to get started.</p>
            </div>
          )}
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

      {/* Remove confirmation handled inline above */}
    </div>
  );
}
