import { useEffect, useState, useCallback, useRef } from 'react';
import { ws } from '../lib/ws';
import type { WSEvent, FeedItem } from '../lib/types';
import { nextFeedId, formatTime } from '../lib/utils';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

const MAX_EVENTS = 50;

function wsEventToFeed(evt: WSEvent): FeedItem | null {
  switch (evt.type) {
    case 'user_check':
      return {
        id: nextFeedId(),
        type: 'check',
        user: evt.userName ?? 'Unknown',
        detail: `Checking ${evt.model ?? ''}`,
        time: evt.timestamp,
      };
    case 'user_blocked':
      return {
        id: nextFeedId(),
        type: 'blocked',
        user: evt.userName ?? 'Unknown',
        detail: `Blocked on ${evt.model ?? ''}${evt.reason ? ': ' + evt.reason.split('\n')[0] : ''}`,
        time: evt.timestamp,
      };
    case 'user_counted':
      return {
        id: nextFeedId(),
        type: 'counted',
        user: evt.userName ?? 'Unknown',
        detail: `${evt.model ?? ''} (+${evt.creditCost ?? 0} credits)`,
        time: evt.timestamp,
      };
    case 'user_status_change':
    case 'user_killed':
      return {
        id: nextFeedId(),
        type: 'status',
        user: evt.userName ?? 'Unknown',
        detail: `${evt.oldStatus ?? '?'} -> ${evt.newStatus ?? '?'}`,
        time: evt.timestamp,
      };
    case 'user_status':
      return {
        id: nextFeedId(),
        type: 'check',
        user: evt.userName ?? 'Unknown',
        detail: `Session start (${evt.model ?? ''})`,
        time: evt.timestamp,
      };
    default:
      return null;
  }
}

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ws.isConnected() ? 'connected' : 'disconnected'
  );
  const [events, setEvents] = useState<FeedItem[]>([]);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const unsubState = ws.onStateChange((state) => {
      setConnectionState(state);
    });

    const unsubEvent = ws.onEvent((event) => {
      setLastEvent(event);
      const feed = wsEventToFeed(event);
      if (feed) {
        setEvents((prev) => {
          const next = [feed, ...prev];
          if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
          return next;
        });
      }
    });

    return () => {
      unsubState();
      unsubEvent();
    };
  }, []);

  const connect = useCallback(() => ws.connect(), []);
  const disconnect = useCallback(() => ws.disconnect(), []);

  return {
    connectionState,
    events,
    lastEvent,
    connect,
    disconnect,
    setEvents,
  };
}

export { wsEventToFeed, formatTime };
