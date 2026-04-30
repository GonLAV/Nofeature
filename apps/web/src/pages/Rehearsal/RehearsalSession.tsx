import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Swords, Send, CheckCircle2, XCircle, AlertTriangle,
  ChevronLeft, Terminal, Trophy, TrendingUp, Info,
  Lightbulb, Clock
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'system' | 'responder';
  content: string;
  created_at: string;
}

interface Scenario {
  title: string;
  affectedService: string;
  failureType: string;
  hiddenRootCause?: string;
}

interface ScoringDetails {
  correctDiagnosis: boolean;
  mitigationQuality: 'none' | 'partial' | 'correct';
  communicationScore: number;
  speedScore: number;
  diagnosisScore: number;
  mitigationScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

interface Session {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'active' | 'completed' | 'abandoned';
  score: number | null;
  scoring_details: ScoringDetails | null;
  scenario: Scenario;
  messages: Message[];
  started_at: string;
  completed_at: string | null;
  created_by_name: string;
}

const difficultyColor = { easy: 'text-green-600 bg-green-50', medium: 'text-yellow-600 bg-yellow-50', hard: 'text-red-600 bg-red-50' };

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="font-mono text-xs text-gray-500">{m}m {s.toString().padStart(2, '0')}s</span>;
}

function ScoreReveal({ score, details }: { score: number; details: ScoringDetails }) {
  const color = score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-500' : 'text-red-600';
  const breakdown = [
    { label: 'Speed', value: details.speedScore },
    { label: 'Diagnosis', value: details.diagnosisScore },
    { label: 'Mitigation', value: details.mitigationScore },
    { label: 'Communication', value: details.communicationScore },
  ];

  return (
    <div className="border-t pt-4 mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <Trophy size={20} className="text-yellow-500" />
        <span className="font-semibold text-gray-800">Drill Complete</span>
        <span className={`text-2xl font-black ml-auto ${color}`}>{score}/100</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {breakdown.map(b => (
          <div key={b.label} className="bg-gray-50 rounded-lg p-2 text-center">
            <div className={`text-lg font-bold ${b.value >= 18 ? 'text-green-600' : b.value >= 12 ? 'text-yellow-500' : 'text-red-500'}`}>
              {b.value}
            </div>
            <div className="text-xs text-gray-400">{b.label}</div>
          </div>
        ))}
      </div>

      <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
        {details.feedback}
      </div>

      {details.strengths.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1"><TrendingUp size={12} /> Strengths</div>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {details.strengths.map((s, i) => <li key={i} className="flex gap-1.5"><CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />{s}</li>)}
          </ul>
        </div>
      )}

      {details.improvements.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-orange-600 mb-1 flex items-center gap-1"><AlertTriangle size={12} /> To improve</div>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {details.improvements.map((s, i) => <li key={i} className="flex gap-1.5"><Info size={11} className="text-orange-400 mt-0.5 shrink-0" />{s}</li>)}
          </ul>
        </div>
      )}

      {details.correctDiagnosis !== undefined && (
        <div className="flex gap-3 text-xs">
          <span className={`flex items-center gap-1 ${details.correctDiagnosis ? 'text-green-600' : 'text-red-500'}`}>
            {details.correctDiagnosis ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            Root cause: {details.correctDiagnosis ? 'Correct' : 'Missed'}
          </span>
          <span className={`flex items-center gap-1 ${
            details.mitigationQuality === 'correct' ? 'text-green-600' :
            details.mitigationQuality === 'partial' ? 'text-yellow-600' : 'text-red-500'
          }`}>
            {details.mitigationQuality === 'correct' ? <CheckCircle2 size={12} /> :
             details.mitigationQuality === 'partial' ? <AlertTriangle size={12} /> : <XCircle size={12} />}
            Fix: {details.mitigationQuality}
          </span>
        </div>
      )}
    </div>
  );
}

export default function RehearsalSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [localScore, setLocalScore] = useState<{ score: number; details: ScoringDetails } | null>(null);

  const { data, isLoading } = useQuery<{ data: Session }>({
    queryKey: ['rehearsal-session', id],
    queryFn: () => api.get(`/rehearsal/sessions/${id}`).then(r => r.data),
    refetchInterval: false,
  });

  const session = data?.data;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  const respondMutation = useMutation({
    mutationFn: (message: string) => api.post(`/rehearsal/sessions/${id}/respond`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rehearsal-session', id] });
      setInput('');
    },
    onError: () => toast.error('Failed to send message'),
  });

  const concludeMutation = useMutation({
    mutationFn: (resolution: string) => api.post(`/rehearsal/sessions/${id}/conclude`, { resolution }),
    onSuccess: (res) => {
      const result = res.data?.data;
      setLocalScore(result);
      setConcluding(false);
      setResolutionText('');
      queryClient.invalidateQueries({ queryKey: ['rehearsal-session', id] });
      queryClient.invalidateQueries({ queryKey: ['rehearsal-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['rehearsal-score'] });
    },
    onError: () => { toast.error('Failed to score session'); setConcluding(false); },
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || respondMutation.isPending) return;
    respondMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConclude = () => {
    const r = resolutionText.trim();
    if (r.length < 10) { toast.error('Please describe what you did to resolve the incident'); return; }
    concludeMutation.mutate(r);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading drill…</div>
  );
  if (!session) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Session not found.</div>
  );

  const isActive = session.status === 'active';
  const scoreToShow = localScore ?? (session.score !== null && session.scoring_details ? { score: session.score, details: session.scoring_details } : null);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <button onClick={() => navigate('/rehearsal')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-3">
            <ChevronLeft size={14} /> Back to Rehearsals
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Swords size={16} className="text-red-600" />
            <span className="font-semibold text-sm truncate">{session.title}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${difficultyColor[session.difficulty]}`}>
            {session.difficulty}
          </span>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Scenario Info</div>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div><span className="text-gray-400">Service:</span> {session.scenario.affectedService}</div>
              <div><span className="text-gray-400">Type:</span> {session.scenario.failureType}</div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">Elapsed:</span>
                {isActive ? <ElapsedTimer startedAt={session.started_at} /> : (
                  session.completed_at ?
                    <span className="font-mono text-xs text-gray-500">
                      {Math.round((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 60000)}m
                    </span> : '—'
                )}
              </div>
              {!isActive && session.scenario.hiddenRootCause && (
                <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded text-orange-700 text-xs">
                  <div className="font-semibold mb-0.5">Root Cause (revealed)</div>
                  {session.scenario.hiddenRootCause}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Commands to try</div>
            <ul className="text-xs text-gray-500 space-y-0.5">
              {[
                'kubectl get pods -n <ns>',
                'kubectl logs <pod> --tail=50',
                'kubectl top pods',
                'curl -I https://api/health',
                'ps aux | grep <service>',
                'df -h',
                'netstat -tulpn',
                'hint',
              ].map(cmd => (
                <li key={cmd}
                  onClick={() => { if (isActive) { setInput(cmd); inputRef.current?.focus(); }}}
                  className={`font-mono bg-gray-50 rounded px-2 py-1 border border-gray-100 ${isActive ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                >
                  {cmd}
                </li>
              ))}
            </ul>
          </div>

          {isActive && (
            <div className="p-2.5 bg-yellow-50 border border-yellow-100 rounded text-xs text-yellow-800">
              <Lightbulb size={11} className="inline mr-1" />
              When you've fixed the issue, click <strong>Declare Resolved</strong> below.
            </div>
          )}

          {scoreToShow && (
            <ScoreReveal score={scoreToShow.score} details={scoreToShow.details} />
          )}
        </div>

        {isActive && !concluding && (
          <div className="p-4 border-t">
            <button
              onClick={() => setConcluding(true)}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              <CheckCircle2 size={13} /> Declare Resolved
            </button>
          </div>
        )}
      </aside>

      {/* Chat Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Status bar */}
        <div className="bg-white border-b px-5 py-2.5 flex items-center gap-3">
          <Terminal size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700 flex-1">{session.title}</span>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
            isActive ? 'bg-blue-50 text-blue-600' :
            session.status === 'completed' ? 'bg-green-50 text-green-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            {isActive ? <><Clock size={10} /> Active</> :
             session.status === 'completed' ? <><CheckCircle2 size={10} /> Completed</> :
             <><XCircle size={10} /> Abandoned</>}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {session.messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'responder' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm ${
                msg.role === 'responder'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border text-gray-800 rounded-bl-sm shadow-sm'
              }`}>
                {msg.role === 'system' ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content}</pre>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
                <div className={`text-xs mt-1.5 ${msg.role === 'responder' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {respondMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-xl px-4 py-3 text-sm text-gray-400 shadow-sm animate-pulse">
                System processing…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Conclude overlay */}
        {concluding && (
          <div className="border-t bg-green-50 px-5 py-4 space-y-2">
            <div className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Declare Resolution
            </div>
            <textarea
              value={resolutionText}
              onChange={e => setResolutionText(e.target.value)}
              placeholder="Describe what you identified as the root cause and what actions you took to resolve it…"
              rows={3}
              className="w-full text-sm border border-green-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleConclude}
                disabled={concludeMutation.isPending}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
              >
                <Trophy size={13} /> {concludeMutation.isPending ? 'Scoring…' : 'Submit & Score'}
              </button>
              <button onClick={() => { setConcluding(false); setResolutionText(''); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        {isActive && !concluding && (
          <div className="border-t bg-white px-5 py-3">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Run a command, check metrics, or describe an action… (Enter to send)"
                rows={2}
                className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none font-mono"
                disabled={respondMutation.isPending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || respondMutation.isPending}
                className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40 transition-colors"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              The AI is playing your production system. Investigate freely — type <code className="bg-gray-100 px-1 rounded">hint</code> for a clue.
            </p>
          </div>
        )}

        {!isActive && (
          <div className="border-t bg-gray-50 px-5 py-3 text-center text-sm text-gray-400">
            This drill has ended.{' '}
            <button onClick={() => navigate('/rehearsal')} className="text-red-600 hover:underline font-medium">
              Start a new drill →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
