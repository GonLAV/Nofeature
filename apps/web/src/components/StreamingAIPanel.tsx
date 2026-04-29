import { useState, useRef, useEffect } from 'react';
import { Zap, User } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

interface Analysis {
  rootCause?: string;
  affectedSystems?: string[];
  immediateActions?: string[];
  whoToPage?: string[];
  estimatedImpact?: string;
  preventionSteps?: string[];
}

interface StreamingAIPanelProps {
  incidentId: string;
  // When SSE broadcasts ai_token / ai_complete from another session this prop is updated
  liveToken?: string | null;
  liveComplete?: Analysis | null;
  // Existing persisted analysis (loaded with the incident)
  savedRootCause?: string | null;
  savedActionItems?: { immediate?: string[]; whoToPage?: string[] } | null;
}

export default function StreamingAIPanel({
  incidentId,
  liveToken,
  liveComplete,
  savedRootCause,
  savedActionItems,
}: StreamingAIPanelProps) {
  const token = useAuthStore(s => s.accessToken);
  const [streaming, setStreaming] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Absorb tokens broadcast by SSE (from another user triggering the analysis)
  useEffect(() => {
    if (liveToken) setBuffer(prev => prev + liveToken);
  }, [liveToken]);

  useEffect(() => {
    if (liveComplete) {
      setAnalysis(liveComplete);
      setBuffer('');
      setStreaming(false);
    }
  }, [liveComplete]);

  const triggerStream = async () => {
    if (streaming || !token) return;
    setStreaming(true);
    setBuffer('');
    setAnalysis(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(
        `${API_BASE}/ai/incidents/${incidentId}/analyze/stream`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          signal: abortRef.current.signal,
        },
      );

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let partial = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });

        const lines = partial.split('\n');
        partial = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'ai_token') {
              setBuffer(prev => prev + event.text);
            } else if (event.type === 'ai_complete') {
              setAnalysis(event.payload as Analysis);
              setBuffer('');
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Streaming error', err);
      }
    } finally {
      setStreaming(false);
    }
  };

  const displayedAnalysis = analysis ?? (savedRootCause ? { rootCause: savedRootCause } : null);
  const displayedActions = analysis?.immediateActions ?? savedActionItems?.immediate;
  const displayedWhoToPage = analysis?.whoToPage ?? savedActionItems?.whoToPage;

  if (!streaming && !buffer && !displayedAnalysis) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-purple-700 font-medium">
        <Zap size={16} />
        <span>AI Analysis</span>
        {streaming && (
          <span className="ml-auto flex items-center gap-1 text-xs text-purple-500 animate-pulse">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400" />
            thinking…
          </span>
        )}
      </div>

      {/* Live streaming buffer */}
      {(streaming || buffer) && !analysis && (
        <pre className="text-xs text-purple-800 whitespace-pre-wrap font-mono leading-relaxed">
          {buffer}
          {streaming && <span className="animate-pulse">▍</span>}
        </pre>
      )}

      {/* Parsed structured result */}
      {displayedAnalysis?.rootCause && (
        <div>
          <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Root Cause</div>
          <p className="text-sm text-purple-900">{displayedAnalysis.rootCause}</p>
        </div>
      )}

      {displayedActions && displayedActions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Immediate Actions</div>
          <ul className="space-y-1">
            {displayedActions.map((a, i) => (
              <li key={i} className="text-sm text-purple-900 flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">→</span> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {displayedWhoToPage && displayedWhoToPage.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Who to Page</div>
          <div className="flex flex-wrap gap-1">
            {displayedWhoToPage.map((r) => (
              <span key={r} className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <User size={10} /> {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Export the trigger function separately so the parent can call it from a button
export function useStreamingAI(incidentId: string) {
  const token = useAuthStore(s => s.accessToken);
  const [streaming, setStreaming] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const trigger = async () => {
    if (streaming || !token) return;
    setStreaming(true);
    setBuffer('');
    setAnalysis(null);

    try {
      const res = await fetch(
        `${API_BASE}/ai/incidents/${incidentId}/analyze/stream`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let partial = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'ai_token') setBuffer(p => p + event.text);
            if (event.type === 'ai_complete') { setAnalysis(event.payload); setBuffer(''); }
          } catch { /* ignore */ }
        }
      }
    } finally {
      setStreaming(false);
    }
  };

  return { trigger, streaming, buffer, analysis };
}
