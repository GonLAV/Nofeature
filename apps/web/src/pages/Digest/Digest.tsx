import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import api from '../../lib/api';

interface Digest {
  stats: { created: number; resolved: number; p1: number; p2: number };
  report: string;
}

function renderMarkdown(md: string): string {
  // very small markdown → html (headings, lists, bold, line breaks)
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>');
}

export default function Digest() {
  const { data, isLoading } = useQuery<Digest>({
    queryKey: ['ai-digest'],
    queryFn: () => api.get('/ai/digest').then(r => r.data.data),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <Sparkles size={20} className="text-purple-500"/> Weekly AI Digest
      </h1>

      {isLoading && <p className="text-sm text-gray-400">Generating digest…</p>}

      {data && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Created" value={data.stats.created}/>
            <Stat label="Resolved" value={data.stats.resolved}/>
            <Stat label="P1" value={data.stats.p1} highlight={data.stats.p1 > 0}/>
            <Stat label="P2" value={data.stats.p2}/>
          </div>
          <div className="bg-white border rounded-xl p-5 prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(data.report) }}/>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${highlight ? 'border-red-300 bg-red-50' : ''}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
