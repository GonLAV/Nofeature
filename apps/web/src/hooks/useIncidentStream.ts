import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';

export type WREventType =
  | 'incident_updated'
  | 'timeline_entry'
  | 'message'
  | 'ai_token'
  | 'ai_complete'
  | 'presence'
  | 'error';

export interface WREvent {
  type: WREventType;
  payload?: unknown;
  text?: string;
}

type Handler = (event: WREvent) => void;

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export function useIncidentStream(incidentId: string, onEvent: Handler) {
  const token = useAuthStore(s => s.accessToken);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!token || !incidentId) return;
    if (esRef.current) esRef.current.close();

    const url = `${API_BASE}/warroom/incidents/${incidentId}/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: WREvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch {
        // malformed frame — ignore
      }
    };

    es.onerror = () => {
      // Browser auto-reconnects for EventSource; close + reopen after 3 s on hard error
      es.close();
      setTimeout(connect, 3000);
    };
  }, [token, incidentId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
