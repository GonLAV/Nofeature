import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Swords, Play, Trophy, TrendingUp, TrendingDown, Minus, AlertCircle, Clock, CheckCircle, XCircle } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

type Difficulty = 'easy' | 'medium' | 'hard';
type Trend = 'improving' | 'declining' | 'stable' | 'insufficient_data';

interface Session {
  id: string;
  title: string;
  difficulty: Difficulty;
  status: 'active' | 'completed' | 'abandoned';
  score: number | null;
  started_at: string;
  completed_at: string | null;
  created_by_name: string;
  turns: number;
}

interface ResilienceData {
  score: number | null;
  trend: Trend;
  completedSessions: number;
  avgScore: number | null;
  recentSessions: Session[];
}

const difficultyColor: Record<Difficulty, string> = {
  easy:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard:   'bg-red-100 text-red-700',
};

const statusIcon = (status: string) => {
  if (status === 'completed') return <CheckCircle size={14} className="text-green-600" />;
  if (status === 'abandoned') return <XCircle size={14} className="text-gray-400" />;
  return <Clock size={14} className="text-blue-500" />;
};

const scoreBadge = (score: number | null) => {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-bold text-sm ${color}`}>{score}/100</span>;
};

const trendLabel = (trend: Trend) => {
  const map: Record<Trend, { label: string; icon: React.ReactNode; color: string }> = {
    improving:         { label: 'Improving', icon: <TrendingUp size={14} />, color: 'text-green-600' },
    declining:         { label: 'Declining', icon: <TrendingDown size={14} />, color: 'text-red-600' },
    stable:            { label: 'Stable',    icon: <Minus size={14} />,       color: 'text-gray-500' },
    insufficient_data: { label: 'Not enough data yet', icon: <AlertCircle size={14} />, color: 'text-gray-400' },
  };
  const t = map[trend];
  return <span className={`flex items-center gap-1 text-xs ${t.color}`}>{t.icon}{t.label}</span>;
};

export default function Rehearsal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [starting, setStarting] = useState(false);

  const { data: scoreData } = useQuery<{ data: ResilienceData }>({
    queryKey: ['rehearsal-score'],
    queryFn: () => api.get('/rehearsal/score').then(r => r.data),
  });

  const { data: sessionsData, isLoading } = useQuery<{ data: Session[] }>({
    queryKey: ['rehearsal-sessions'],
    queryFn: () => api.get('/rehearsal/sessions').then(r => r.data),
  });

  const startMutation = useMutation({
    mutationFn: (diff: Difficulty) => api.post('/rehearsal/sessions', { difficulty: diff }),
    onMutate: () => setStarting(true),
    onSuccess: (res) => {
      const sessionId = res.data?.data?.session?.id;
      queryClient.invalidateQueries({ queryKey: ['rehearsal-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['rehearsal-score'] });
      toast.success('Drill started — good luck!');
      navigate(`/rehearsal/${sessionId}`);
    },
    onError: () => {
      toast.error('Failed to start drill');
      setStarting(false);
    },
    onSettled: () => setStarting(false),
  });

  const resilience = scoreData?.data;
  const sessions = sessionsData?.data ?? [];
  const activeSessions = sessions.filter(s => s.status === 'active');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords size={22} className="text-red-600" />
            Chaos Rehearsal
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered incident war games — train before production trains you.
          </p>
        </div>
      </div>

      {/* Resilience Score Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 bg-white border rounded-xl p-5 flex flex-col items-center justify-center">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Team Resilience Score</div>
          {resilience?.score !== null && resilience?.score !== undefined ? (
            <>
              <div className={`text-5xl font-black ${
                resilience.score >= 75 ? 'text-green-600' :
                resilience.score >= 50 ? 'text-yellow-500' : 'text-red-600'
              }`}>
                {resilience.score}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">out of 100</div>
              <div className="mt-2">{trendLabel(resilience.trend)}</div>
            </>
          ) : (
            <div className="text-center text-gray-400 text-sm py-2">
              <Trophy size={28} className="mx-auto mb-2 opacity-30" />
              Complete a drill to earn your first score
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5 flex flex-col gap-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Stats</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Drills completed</span>
              <span className="font-medium">{resilience?.completedSessions ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Average score</span>
              <span className="font-medium">{resilience?.avgScore !== null && resilience?.avgScore !== undefined ? `${resilience.avgScore}/100` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Active drills</span>
              <span className="font-medium">{activeSessions.length}</span>
            </div>
          </div>
        </div>

        {/* Start Drill Card */}
        <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-xl p-5 flex flex-col gap-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Start New Drill</div>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize
                  ${difficulty === d
                    ? 'border-red-500 bg-red-600 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-red-300'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            {difficulty === 'easy' && 'Clear signals, 3-4 targeted commands to root cause.'}
            {difficulty === 'medium' && 'Some noise and red herrings. Expert SRE territory.'}
            {difficulty === 'hard' && 'Cascading failures, misleading signals. Veteran only.'}
          </div>
          <button
            onClick={() => startMutation.mutate(difficulty)}
            disabled={starting}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            <Play size={14} />
            {starting ? 'Generating scenario…' : 'Start Drill'}
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Active Drills</h2>
          <div className="space-y-2">
            {activeSessions.map(s => (
              <div
                key={s.id}
                onClick={() => navigate(`/rehearsal/${s.id}`)}
                className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-blue-100 transition-colors"
              >
                <Clock size={14} className="text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.title}</div>
                  <div className="text-xs text-gray-500">{s.turns} turns taken · started {new Date(s.started_at).toLocaleTimeString()}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${difficultyColor[s.difficulty]}`}>
                  {s.difficulty}
                </span>
                <span className="text-xs text-blue-600 font-semibold shrink-0">Resume →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session History */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Drill History</h2>
        {isLoading ? (
          <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
        ) : sessions.filter(s => s.status !== 'active').length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">
            <Swords size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No completed drills yet.</p>
            <p className="text-xs mt-1">Start your first drill above to build team resilience.</p>
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-gray-500 font-semibold">
                  <th className="text-left px-4 py-3">Scenario</th>
                  <th className="text-left px-4 py-3">Difficulty</th>
                  <th className="text-left px-4 py-3">By</th>
                  <th className="text-left px-4 py-3">Turns</th>
                  <th className="text-left px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.filter(s => s.status !== 'active').map(s => (
                  <tr
                    key={s.id}
                    onClick={() => s.status === 'completed' && navigate(`/rehearsal/${s.id}`)}
                    className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${s.status === 'completed' ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium max-w-xs truncate">{s.title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${difficultyColor[s.difficulty]}`}>
                        {s.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.created_by_name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.turns}</td>
                    <td className="px-4 py-3">{scoreBadge(s.score)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(s.started_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        {statusIcon(s.status)}
                        <span className="capitalize text-xs text-gray-500">{s.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
