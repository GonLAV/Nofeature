import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

interface Prefs {
  email_on_assigned: boolean;
  email_on_p1: boolean;
  email_on_status_change: boolean;
  digest_weekly: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export default function NotificationPrefs() {
  const qc = useQueryClient();
  const { data } = useQuery<Prefs>({
    queryKey: ['notif-prefs'],
    queryFn: () => api.get('/notification-prefs').then(r => r.data.data),
  });

  const save = useMutation({
    mutationFn: (p: Partial<Prefs>) => api.put('/notification-prefs', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-prefs'] });
      toast.success('Saved');
    },
  });

  if (!data) return null;

  return (
    <div className="bg-white border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Bell size={16}/> My Notifications</h2>
      <p className="text-xs text-gray-500">Email notification preferences.</p>

      <div className="space-y-2">
        {([
          ['email_on_assigned', 'Email me when assigned as commander'],
          ['email_on_p1', 'Email me on every P1 incident'],
          ['email_on_status_change', 'Email me on status changes for my incidents'],
          ['digest_weekly', 'Email me the weekly digest'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox"
              defaultChecked={data[key]}
              onChange={(e) => save.mutate({ [key]: e.target.checked })}/>
            {label}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <label className="text-sm">
          <span className="text-xs text-gray-500 block">Quiet hours start</span>
          <input type="time" className="w-full border rounded px-3 py-2 text-sm"
            defaultValue={data.quiet_hours_start ?? ''}
            onBlur={(e) => save.mutate({ quiet_hours_start: e.target.value || null })}/>
        </label>
        <label className="text-sm">
          <span className="text-xs text-gray-500 block">Quiet hours end</span>
          <input type="time" className="w-full border rounded px-3 py-2 text-sm"
            defaultValue={data.quiet_hours_end ?? ''}
            onBlur={(e) => save.mutate({ quiet_hours_end: e.target.value || null })}/>
        </label>
      </div>
      <p className="text-xs text-gray-400">Quiet hours suppress non-P1 emails (P1 always pages).</p>
    </div>
  );
}
