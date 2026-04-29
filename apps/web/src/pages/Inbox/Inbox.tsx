import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Inbox, AtSign, UserCog, Eye, ListChecks, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface InboxItem {
  id: string;
  kind: 'mention' | 'assigned' | 'watching' | 'action';
  ref_id?: string;
  incident_id: string;
  incident_title: string;
  severity?: string;
  actor_name?: string;
  summary: string;
  read: boolean;
  created_at: string;
}

const ICONS: Record<string, any> = {
  mention: AtSign,
  assigned: UserCog,
  watching: Eye,
  action: ListChecks,
};

const KIND_LABEL: Record<string, string> = {
  mention: 'Mention',
  assigned: 'Assigned to me',
  watching: 'Watching',
  action: 'Action item',
};

const SEV_COLOR: Record<string, string> = {
  P1: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  P2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  P3: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  P4: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function InboxPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: InboxItem[]; summary: any }>({
    queryKey: ['inbox'],
    queryFn: () => api.get('/inbox?limit=100').then(r => r.data),
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/mentions/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['mentions'] });
      qc.invalidateQueries({ queryKey: ['mentions-count'] });
      toast.success('All mentions marked read');
    },
  });

  const items = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Inbox className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold dark:text-white">Inbox</h1>
        {summary && (
          <span className="text-sm text-gray-500">
            {summary.total} items · {summary.unread} unread
          </span>
        )}
        <button
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
        >
          <CheckCheck className="w-4 h-4" /> Mark mentions read
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {!isLoading && items.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500">
          You're all caught up.
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {items.map(item => {
          const Icon = ICONS[item.kind] || Inbox;
          return (
            <Link
              key={item.id}
              to={`/incidents/${item.incident_id}`}
              className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${
                item.read ? '' : 'bg-blue-50/50 dark:bg-blue-900/10'
              }`}
            >
              <div className={`mt-0.5 p-1.5 rounded ${item.read ? 'bg-gray-100 dark:bg-gray-700' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                <Icon className={`w-4 h-4 ${item.read ? 'text-gray-500' : 'text-blue-600 dark:text-blue-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {KIND_LABEL[item.kind]}
                  </span>
                  {item.severity && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${SEV_COLOR[item.severity] || ''}`}>
                      {item.severity}
                    </span>
                  )}
                  {!item.read && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm font-semibold dark:text-white truncate mt-0.5">
                  {item.incident_title}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {item.actor_name && <span className="font-medium">{item.actor_name}: </span>}
                  {item.summary}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
