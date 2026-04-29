import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';

interface Incident {
  id: string;
  title: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  status: string;
  affected_systems?: string[];
  created_at: string;
  resolved_at?: string;
}

interface StatusData {
  tenant: { name: string; slug: string };
  overall: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  uptime_90d: number;
  active_incidents: Incident[];
  recent_incidents: Incident[];
  updated_at: string;
}

const overallMeta = {
  operational:    { label: 'All systems operational', color: 'bg-green-500',   text: 'text-green-700',   bg: 'bg-green-50',   icon: '🟢' },
  degraded:       { label: 'Minor service disruption', color: 'bg-yellow-500', text: 'text-yellow-700',  bg: 'bg-yellow-50',  icon: '🟡' },
  partial_outage: { label: 'Partial outage',           color: 'bg-orange-500', text: 'text-orange-700',  bg: 'bg-orange-50',  icon: '🟠' },
  major_outage:   { label: 'Major outage',             color: 'bg-red-500',    text: 'text-red-700',     bg: 'bg-red-50',     icon: '🔴' },
};

const sevColor = {
  P1: 'bg-red-100 text-red-700 border-red-200',
  P2: 'bg-orange-100 text-orange-700 border-orange-200',
  P3: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  P4: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function StatusPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
      const res = await axios.get(`${apiBase}/public/status/${slug}`);
      setData(res.data.data);
      setError(null);
    } catch {
      setError('Status page not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-800">Status page not found</h1>
        <p className="text-gray-500 mt-2">Check the URL and try again.</p>
      </div>
    );
  }

  const meta = overallMeta[data.overall];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{data.tenant.name}</h1>
            <p className="text-sm text-gray-500">Status Page</p>
          </div>
          <div className="text-xs text-gray-400">
            Updated {formatDistanceToNow(new Date(data.updated_at), { addSuffix: true })}
          </div>
        </header>

        <div className={`rounded-xl border ${meta.bg} ${meta.text} p-6 flex items-center gap-4 mb-8`}>
          <span className={`w-3 h-3 rounded-full ${meta.color} animate-pulse`} />
          <div>
            <div className="text-xl font-semibold">{meta.icon} {meta.label}</div>
            <div className="text-sm opacity-80">90-day uptime: <strong>{data.uptime_90d.toFixed(2)}%</strong></div>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Incidents</h2>
          {data.active_incidents.length === 0 ? (
            <div className="text-gray-500 bg-white border rounded-lg p-6 text-center">
              No active incidents. Everything is running smoothly. ✨
            </div>
          ) : (
            <ul className="space-y-3">
              {data.active_incidents.map((i) => (
                <li key={i.id} className="bg-white border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${sevColor[i.severity]}`}>{i.severity}</span>
                        <span className="text-xs text-gray-500 uppercase">{i.status}</span>
                      </div>
                      <h3 className="font-semibold mt-1 text-gray-900">{i.title}</h3>
                      {i.affected_systems && i.affected_systems.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">Affected: {i.affected_systems.join(', ')}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Past Incidents (90 days)</h2>
          {data.recent_incidents.length === 0 ? (
            <div className="text-gray-500 bg-white border rounded-lg p-6 text-center">No incidents in the past 90 days.</div>
          ) : (
            <ul className="space-y-2">
              {data.recent_incidents.map((i) => (
                <li key={i.id} className="bg-white border rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${sevColor[i.severity]}`}>{i.severity}</span>
                    <span className="text-sm text-gray-800">{i.title}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="text-center text-xs text-gray-400 mt-12">
          <SubscribeBox slug={slug!} />
          <div className="mt-6">Powered by Incident War Room AI</div>
        </footer>
      </div>
    </div>
  );
}

function SubscribeBox({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
      const r = await axios.post(`${apiBase}/public/status/${slug}/subscribe`, { email });
      setState('ok');
      setMsg(r.data?.data?.already_confirmed ? 'You are already subscribed.' : 'Check your email to confirm.');
      setEmail('');
    } catch (e: any) {
      setState('err');
      setMsg(e?.response?.data?.error || 'Failed to subscribe');
    }
  };

  return (
    <div className="bg-white border rounded-lg p-5 text-left">
      <h3 className="font-semibold text-gray-900 text-sm">Subscribe to updates</h3>
      <p className="text-xs text-gray-500 mt-1">Get notified by email when incidents open or resolve.</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
        >
          Subscribe
        </button>
      </form>
      {msg && (
        <p className={`text-xs mt-2 ${state === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>
      )}
    </div>
  );
}
