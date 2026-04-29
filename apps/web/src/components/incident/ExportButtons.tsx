import { Download, FileText } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api/v1') as string;

async function downloadAuth(url: string, token: string | null, filename: string) {
  const resp = await fetch(API_BASE + url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) {
    toast.error('Download failed');
    return;
  }
  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function ExportButtons({ incidentId }: { incidentId: string }) {
  const token = useAuthStore((s) => s.accessToken);
  return (
    <div className="flex gap-2">
      <button
        onClick={() => downloadAuth(`/incidents/${incidentId}/export.md`, token, `postmortem-${incidentId}.md`)}
        className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-gray-50">
        <FileText size={12}/> Postmortem .md
      </button>
      <button
        onClick={() => downloadAuth(`/incidents/${incidentId}/timeline.csv`, token, `timeline-${incidentId}.csv`)}
        className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-gray-50">
        <Download size={12}/> Timeline .csv
      </button>
    </div>
  );
}
