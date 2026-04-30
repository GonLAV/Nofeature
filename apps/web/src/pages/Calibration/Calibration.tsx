import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Target, TrendingUp, Activity, Sparkles } from 'lucide-react';
import api from '../../lib/api';

interface ReliabilityBin {
  from: number;
  to: number;
  meanConfidence: number;
  accuracy: number;
  count: number;
}

interface CalibrationReport {
  schemaVersion: number;
  total: number;
  brier: number;
  logLoss: number;
  calibrationIndex: number;
  resolution: number;
  bins: ReliabilityBin[];
}

interface LeaderboardEntry {
  userId: string;
  userName: string | null;
  total: number;
  brier: number;
  calibrationIndex: number;
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmt    = (n: number) => n.toFixed(3);

/** Color tier so eyes find the worst (or best) calibration fast. */
const tier = (idx: number) =>
  idx >= 0.85 ? 'text-emerald-400' :
  idx >= 0.70 ? 'text-amber-400'   :
                'text-rose-400';

/**
 * Pure-SVG reliability diagram. Plots stated confidence (x) vs empirical
 * accuracy (y). The diagonal is perfect calibration; bars above it are
 * underconfident, bars below are overconfident.
 */
function ReliabilityChart({ bins }: { bins: ReliabilityBin[] }) {
  const W = 480, H = 320, P = 32;
  const inner = { w: W - 2 * P, h: H - 2 * P };
  const x = (n: number) => P + n * inner.w;
  const y = (n: number) => P + (1 - n) * inner.h;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* axes + diagonal */}
      <rect x={P} y={P} width={inner.w} height={inner.h} fill="transparent" stroke="#27272a" />
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#52525b" strokeDasharray="4 3" />
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={P} x2={x(t)} y2={P + inner.h} stroke="#27272a" />
          <line x1={P}   y1={y(t)} x2={P + inner.w} y2={y(t)} stroke="#27272a" />
        </g>
      ))}

      {/* bars: width proportional to bin width, height to accuracy */}
      {bins.map((b, i) => {
        const left = x(b.from);
        const top = y(b.accuracy);
        const w = (b.to - b.from) * inner.w * 0.85;
        const h = (P + inner.h) - top;
        // Color: closer to diagonal = greener, farther = redder.
        const gap = Math.abs(b.meanConfidence - b.accuracy);
        const fill = gap < 0.05 ? '#10b981' : gap < 0.15 ? '#f59e0b' : '#f43f5e';
        return (
          <g key={i}>
            <rect x={left + 2} y={top} width={w} height={h} fill={fill} opacity={0.7} />
            <circle cx={x(b.meanConfidence)} cy={y(b.accuracy)} r={3} fill="#fff" />
          </g>
        );
      })}

      {/* axis labels */}
      <text x={W / 2} y={H - 6} textAnchor="middle" fill="#a1a1aa" fontSize="11">
        Stated confidence
      </text>
      <text x={10} y={H / 2} textAnchor="middle" fill="#a1a1aa" fontSize="11"
            transform={`rotate(-90 10 ${H / 2})`}>
        Empirical accuracy
      </text>
    </svg>
  );
}

export default function Calibration() {
  const [windowDays, setWindowDays] = useState(180);

  const reportQ = useQuery({
    queryKey: ['calibration', 'report', windowDays],
    queryFn: () =>
      api.get<{ data: CalibrationReport }>(
        `/calibration/report?windowDays=${windowDays}&binCount=10`,
      ).then((r) => r.data.data),
    staleTime: 30_000,
  });

  const leaderboardQ = useQuery({
    queryKey: ['calibration', 'leaderboard', windowDays],
    queryFn: () =>
      api.get<{ data: LeaderboardEntry[] }>(
        `/calibration/leaderboard?windowDays=${windowDays}&binCount=10`,
      ).then((r) => r.data.data),
    staleTime: 60_000,
  });

  const report = reportQ.data;
  const board = leaderboardQ.data ?? [];

  const headline = useMemo(() => {
    if (!report || report.total === 0) {
      return { label: 'No resolved predictions yet', tone: 'text-zinc-400' };
    }
    if (report.calibrationIndex >= 0.9) return { label: 'Sharp & honest', tone: 'text-emerald-400' };
    if (report.calibrationIndex >= 0.75) return { label: 'Reasonably calibrated', tone: 'text-amber-400' };
    return { label: 'Systematically miscalibrated', tone: 'text-rose-400' };
  }, [report]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="text-indigo-400" /> Confidence Calibration
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            How honest are your responders' probability estimates? Lower Brier score is better; higher calibration index is better.
          </p>
        </div>

        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm"
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last year</option>
        </select>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi
          icon={<Sparkles size={16} />}
          label="Calibration index"
          value={report ? fmt(report.calibrationIndex) : '—'}
          tone={report ? tier(report.calibrationIndex) : 'text-zinc-400'}
        />
        <Kpi icon={<TrendingUp size={16} />} label="Brier score"
             value={report ? fmt(report.brier) : '—'}
             hint="0 = perfect, 0.25 = random" />
        <Kpi icon={<Activity size={16} />} label="Resolved predictions"
             value={report ? String(report.total) : '—'} />
        <Kpi icon={<Target size={16} />} label="Verdict"
             value={headline.label} tone={headline.tone} />
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded p-4">
        <h2 className="font-semibold mb-3">Reliability diagram</h2>
        {report && report.bins.length > 0 ? (
          <ReliabilityChart bins={report.bins} />
        ) : (
          <p className="text-sm text-zinc-400">Not enough resolved predictions to plot.</p>
        )}
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded p-4">
        <h2 className="font-semibold mb-3">Per-responder leaderboard</h2>
        <table className="w-full text-sm">
          <thead className="text-zinc-400 text-left">
            <tr>
              <th className="pb-2">Responder</th>
              <th className="pb-2">Resolved</th>
              <th className="pb-2">Brier</th>
              <th className="pb-2">Calibration</th>
            </tr>
          </thead>
          <tbody>
            {board.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-zinc-500">No data yet.</td></tr>
            )}
            {board.map((row) => (
              <tr key={row.userId} className="border-t border-zinc-800">
                <td className="py-2">{row.userName ?? row.userId.slice(0, 8)}</td>
                <td className="py-2">{row.total}</td>
                <td className="py-2">{fmt(row.brier)}</td>
                <td className={`py-2 font-semibold ${tier(row.calibrationIndex)}`}>
                  {fmtPct(row.calibrationIndex)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-4">
      <div className="text-xs text-zinc-400 flex items-center gap-1.5">
        {props.icon}{props.label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${props.tone ?? ''}`}>{props.value}</div>
      {props.hint && <div className="text-[11px] text-zinc-500 mt-1">{props.hint}</div>}
    </div>
  );
}
