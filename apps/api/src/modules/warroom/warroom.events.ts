import { EventEmitter } from 'events';
import { Response } from 'express';

export type WREventType =
  | 'incident_updated'
  | 'timeline_entry'
  | 'message'
  | 'ai_token'
  | 'ai_complete'
  | 'presence';

export interface WREvent {
  type: WREventType;
  payload: unknown;
}

class WarRoomEventBus extends EventEmitter {}

export const warRoomBus = new WarRoomEventBus();
warRoomBus.setMaxListeners(2000);

export function channelKey(incidentId: string): string {
  return `incident:${incidentId}`;
}

export function publish(incidentId: string, event: WREvent): void {
  warRoomBus.emit(channelKey(incidentId), event);
}

export function subscribe(
  incidentId: string,
  res: Response,
): () => void {
  const key = channelKey(incidentId);

  const send = (event: WREvent) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // client disconnected — cleanup happens in the returned unsubscribe fn
    }
  };

  warRoomBus.on(key, send);

  return () => warRoomBus.off(key, send);
}
