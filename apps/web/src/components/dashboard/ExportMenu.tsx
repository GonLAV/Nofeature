import { useState } from 'react';
import { Download, FileText, FileJson } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth.store';
import type { IncidentFilter } from './SavedFiltersBar';

interface Props { filter: IncidentFilter }

const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

function buildUrl(filter: IncidentFilter, format: 'csv' | 'json'): string {
  const p = new URLSearchParams();
  p.set('format', format);
  if (filter.search) p.set('search', filter.search);
  if (filter.status?.length) p.set('status', filter.status.join(','));
  if (filter.severity?.length) p.set('severity', filter.severity.join(','));
  return `${apiBase}/incidents/export?${p.toString()}`;
}

export default function ExportMenu({ filter }: Props) {
  const [open, setOpen] = useState(false);
  const token = useAuthStore((s) => s.accessToken);

  const download = async (format: 'csv' | 'json') => {
    setOpen(false);
    try {
      const res = await fetch(buildUrl(filter, format), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `incidents-${stamp}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm text-gray-700"
        title="Export current view"
      >
        <Download size={14} /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-40 bg-white border rounded-lg shadow-lg z-20 py-1 text-sm">
            <button
              onClick={() => download('csv')}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <FileText size={14} className="text-gray-500" /> CSV
            </button>
            <button
              onClick={() => download('json')}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <FileJson size={14} className="text-gray-500" /> JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
