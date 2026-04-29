import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Share2, Plus, Copy, Trash2, Eye, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface ShareLink {
  id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  created_by_name: string | null;
}

const EXPIRY_OPTIONS = [
  { hours: 1,    label: '1 hour' },
  { hours: 24,   label: '1 day' },
  { hours: 168,  label: '7 days' },
  { hours: 720,  label: '30 days' },
  { hours: 0,    label: 'No expiration' },
];

export default function ShareLinksPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [hours, setHours] = useState<number>(24);

  const { data: links = [] } = useQuery<ShareLink[]>({
    queryKey: ['share-links', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/share-links`).then(r => r.data.data),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/incidents/${incidentId}/share-links`, {
        expires_in_hours: hours > 0 ? hours : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share-links', incidentId] });
      toast.success('Share link created');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => api.delete(`/incidents/${incidentId}/share-links/${linkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share-links', incidentId] });
      toast.success('Link revoked');
    },
  });

  const buildUrl = (token: string) => `${window.location.origin}/share/${token}`;
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildUrl(token));
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const linkStatus = (l: ShareLink): { label: string; cls: string } => {
    if (l.revoked_at) return { label: 'Revoked', cls: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
    if (l.expires_at && new Date(l.expires_at).getTime() < Date.now()) {
      return { label: 'Expired', cls: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
    }
    return { label: 'Active', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Share2 size={16} /> Public Share Links
          {links.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">({links.length})</span>
          )}
        </h3>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Expires after
          </label>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full mt-0.5 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {EXPIRY_OPTIONS.map(o => (
              <option key={o.hours} value={o.hours}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          <Plus size={12} /> Create link
        </button>
      </div>

      {links.length === 0 ? (
        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
          No share links yet. Anyone with a generated link can view a read-only snapshot of this incident.
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => {
            const status = linkStatus(l);
            const isActive = status.label === 'Active';
            return (
              <li
                key={l.id}
                className="text-xs p-2 rounded border border-gray-200 dark:border-gray-700 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  <code className="flex-1 truncate text-gray-700 dark:text-gray-300 font-mono text-[11px]">
                    {buildUrl(l.token)}
                  </code>
                  {isActive && (
                    <button
                      onClick={() => copy(l.token)}
                      className="text-gray-500 hover:text-blue-600"
                      title="Copy link"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                  {!l.revoked_at && (
                    <button
                      onClick={() => {
                        if (confirm('Revoke this link? It will stop working immediately.')) revoke.mutate(l.id);
                      }}
                      className="text-gray-500 hover:text-red-500"
                      title="Revoke"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Eye size={10} /> {l.view_count} view{l.view_count === 1 ? '' : 's'}
                  </span>
                  {l.expires_at && (
                    <span className="flex items-center gap-1" title={new Date(l.expires_at).toLocaleString()}>
                      <Clock size={10} />
                      {new Date(l.expires_at).getTime() < Date.now() ? 'expired ' : 'expires '}
                      {formatDistanceToNow(new Date(l.expires_at), { addSuffix: true })}
                    </span>
                  )}
                  {!l.expires_at && !l.revoked_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> never expires
                    </span>
                  )}
                  <span>created {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                  {l.created_by_name && <span>by {l.created_by_name}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
