import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Clock, ShieldCheck, Megaphone } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface SharePayload {
  incident: {
    id: string;
    incident_number?: number | null;
    title: string;
    description: string | null;
    severity: string;
    status: string;
    created_at: string;
    acknowledged_at: string | null;
    resolved_at: string | null;
    affected_systems: string[] | null;
    tenant_name: string;
  };
  status_updates: Array<{ id: string; status: string; body: string; posted_at: string }>;
  timeline: Array<{ event_type: string; description: string; created_at: string }>;
  expires_at: string | null;
}

const SEV_COLOR: Record<string, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-yellow-500 text-gray-900',
  P4: 'bg-blue-500 text-white',
};

const STATUS_COLOR: Record<string, string> = {
  open:          'bg-red-100 text-red-800',
  investigating: 'bg-amber-100 text-amber-800',
  monitoring:    'bg-purple-100 text-purple-800',
  resolved:      'bg-green-100 text-green-800',
  closed:        'bg-gray-200 text-gray-700',
};

const UPDATE_COLOR: Record<string, string> = {
  investigating: 'bg-amber-100 text-amber-800 border-amber-300',
  identified:    'bg-blue-100 text-blue-800 border-blue-300',
  monitoring:    'bg-purple-100 text-purple-800 border-purple-300',
  update:        'bg-gray-100 text-gray-800 border-gray-300',
  resolved:      'bg-green-100 text-green-800 border-green-300',
};

const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

export default function SharedIncident() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/public/share/${token}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `Error ${r.status}`);
        return body;
      })
      .then((body) => { if (!cancelled) setData(body.data); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load'); });
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-6 text-center space-y-3">
          <AlertCircle className="mx-auto text-red-500" size={32} />
          <h1 className="text-lg font-semibold text-gray-900">Link unavailable</h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  const i = data.incident;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={20} />
            <span className="text-sm font-semibold">{i.tenant_name}</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
            Read-only shared view
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${SEV_COLOR[i.severity] || 'bg-gray-200'}`}>
              {i.severity}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[i.status] || ''}`}>
              {i.status}
            </span>
            {i.incident_number != null && (
              <span className="text-xs text-gray-500">#{i.incident_number}</span>
            )}
          </div>
          <h1 className="text-xl font-semibold">{i.title}</h1>
          {i.description && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{i.description}</p>
          )}
          {i.affected_systems && i.affected_systems.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {i.affected_systems.map((s, idx) => (
                <span key={idx} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                  {s}
                </span>
              ))}
            </div>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 text-xs border-t border-gray-100">
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{format(new Date(i.created_at), 'PP p')}</dd>
            </div>
            {i.acknowledged_at && (
              <div>
                <dt className="text-gray-500">Acknowledged</dt>
                <dd className="text-gray-900">{format(new Date(i.acknowledged_at), 'PP p')}</dd>
              </div>
            )}
            {i.resolved_at && (
              <div>
                <dt className="text-gray-500">Resolved</dt>
                <dd className="text-gray-900">{format(new Date(i.resolved_at), 'PP p')}</dd>
              </div>
            )}
          </dl>
        </section>

        {data.status_updates.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Megaphone size={14} /> Status updates
            </h2>
            <ul className="space-y-2">
              {data.status_updates.map((u) => (
                <li
                  key={u.id}
                  className={`bg-white rounded-lg border p-3 ${UPDATE_COLOR[u.status]?.split(' ').slice(2).join(' ') || 'border-gray-200'}`}
                >
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${UPDATE_COLOR[u.status] || ''}`}>
                      {u.status}
                    </span>
                    <span className="text-gray-500" title={new Date(u.posted_at).toLocaleString()}>
                      {formatDistanceToNow(new Date(u.posted_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{u.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.timeline.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock size={14} /> Timeline
            </h2>
            <ol className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {data.timeline.map((t, idx) => (
                <li key={idx} className="p-3 text-xs flex gap-3">
                  <span className="text-gray-500 whitespace-nowrap" title={new Date(t.created_at).toLocaleString()}>
                    {format(new Date(t.created_at), 'MMM d HH:mm')}
                  </span>
                  <span className="text-[10px] uppercase font-mono text-gray-500">{t.event_type}</span>
                  <span className="flex-1 text-gray-800">{t.description}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="text-[11px] text-gray-500 text-center py-4">
          {data.expires_at
            ? <>This link expires {formatDistanceToNow(new Date(data.expires_at), { addSuffix: true })}.</>
            : <>Powered by Incident War Room.</>}
        </footer>
      </main>
    </div>
  );
}
