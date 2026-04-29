import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, X } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

interface TagItem { id: string; name: string; color: string }

export default function TagsPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: allTags = [] } = useQuery<TagItem[]>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags').then(r => r.data.data),
  });

  const { data: incTags = [] } = useQuery<TagItem[]>({
    queryKey: ['incident-tags', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/tags`).then(r => r.data.data),
  });

  const setTags = useMutation({
    mutationFn: (tagIds: string[]) => api.put(`/incidents/${incidentId}/tags`, { tag_ids: tagIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident-tags', incidentId] }),
  });

  const createTag = useMutation({
    mutationFn: () => api.post('/tags', { name: newName }).then(r => r.data.data),
    onSuccess: (newTag: TagItem) => {
      setNewName('');
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ['tags'] });
      const ids = [...incTags.map(t => t.id), newTag.id];
      setTags.mutate(ids);
    },
    onError: () => toast.error('Failed'),
  });

  const toggle = (tag: TagItem) => {
    const ids = incTags.find(t => t.id === tag.id)
      ? incTags.filter(t => t.id !== tag.id).map(t => t.id)
      : [...incTags.map(t => t.id), tag.id];
    setTags.mutate(ids);
  };

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Tag size={14}/> Tags
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {incTags.map(t => (
          <span key={t.id} className="text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 text-white"
            style={{ backgroundColor: t.color }}>
            {t.name}
            <button onClick={() => toggle(t)} className="hover:bg-black/20 rounded-full">
              <X size={10}/>
            </button>
          </span>
        ))}
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs px-2 py-1 border border-dashed rounded-full hover:bg-gray-50">
          <Plus size={11} className="inline"/> Add
        </button>
      </div>

      {showAdd && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="flex flex-wrap gap-1.5">
            {allTags.filter(t => !incTags.find(it => it.id === t.id)).map(t => (
              <button key={t.id} onClick={() => toggle(t)}
                className="text-xs px-2 py-1 rounded-full text-white hover:opacity-80"
                style={{ backgroundColor: t.color }}>
                + {t.name}
              </button>
            ))}
            {allTags.filter(t => !incTags.find(it => it.id === t.id)).length === 0 && (
              <span className="text-xs text-gray-400">All tags applied.</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New tag name"
              className="flex-1 border rounded px-2 py-1 text-xs"
            />
            <button
              disabled={!newName.trim() || createTag.isPending}
              onClick={() => createTag.mutate()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2 py-1 rounded text-xs">
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
