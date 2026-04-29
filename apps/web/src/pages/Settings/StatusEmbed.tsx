import { useState } from 'react';
import { Code2, Copy, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function StatusEmbed() {
  const { data: tenant } = useQuery<{ slug: string; name: string }>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get('/tenants/me').then(r => r.data.data),
  });
  const [target, setTarget] = useState('#status-badge');

  const slug = tenant?.slug || 'your-tenant';
  const origin = window.location.origin;
  const apiBase = (import.meta.env.VITE_API_URL || `${origin}/api/v1`).replace(/\/$/, '');

  const scriptSrc = `${apiBase}/public/status/${slug}/embed.js`;
  const snippet = `<div id="${target.replace(/^#/, '')}"></div>\n<script src="${scriptSrc}" data-target="${target}"></script>`;
  const badgeUrl = `${apiBase}/public/status/${slug}/badge.json`;
  const pageUrl = `${origin}/status/${slug}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Code2 className="w-7 h-7 text-purple-600" />
        <h1 className="text-2xl font-bold dark:text-white">Status Embed</h1>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-sm">
        Drop this snippet on any website to display a live status badge. The badge updates every minute and links back to your public status page.
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <label className="block text-sm font-medium dark:text-white">CSS selector for target element</label>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded font-mono text-sm bg-white dark:bg-gray-900 dark:text-white"
        />

        <label className="block text-sm font-medium dark:text-white pt-2">HTML snippet</label>
        <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 text-xs overflow-x-auto dark:text-gray-200">
{snippet}
        </pre>
        <button
          onClick={() => copy(snippet, 'Snippet')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded"
        >
          <Copy className="w-3.5 h-3.5" /> Copy snippet
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
        <h3 className="font-semibold dark:text-white text-sm">Direct URLs</h3>
        <div className="text-sm space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-28">Status page:</span>
            <a href={pageUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate flex items-center gap-1">
              {pageUrl} <ExternalLink className="w-3 h-3" />
            </a>
            <button onClick={() => copy(pageUrl, 'URL')} className="ml-auto text-xs text-gray-500 hover:text-gray-700"><Copy className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-28">Badge JSON:</span>
            <code className="text-xs bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded truncate">{badgeUrl}</code>
            <button onClick={() => copy(badgeUrl, 'URL')} className="ml-auto text-xs text-gray-500 hover:text-gray-700"><Copy className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-28">Embed JS:</span>
            <code className="text-xs bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded truncate">{scriptSrc}</code>
            <button onClick={() => copy(scriptSrc, 'URL')} className="ml-auto text-xs text-gray-500 hover:text-gray-700"><Copy className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold dark:text-white text-sm mb-3">Live preview</h3>
        <div id={target.replace(/^#/, '')}></div>
        <PreviewLoader src={scriptSrc} target={target} />
      </div>
    </div>
  );
}

function PreviewLoader({ src, target }: { src: string; target: string }) {
  // Re-inject the script when target/src change
  if (typeof document !== 'undefined') {
    const id = 'status-embed-preview';
    const old = document.getElementById(id);
    if (old) old.remove();
    setTimeout(() => {
      const s = document.createElement('script');
      s.id = id;
      s.src = src;
      s.setAttribute('data-target', target);
      document.body.appendChild(s);
    }, 100);
  }
  return null;
}
