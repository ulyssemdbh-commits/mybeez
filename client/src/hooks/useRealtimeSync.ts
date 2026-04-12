/**
 * Realtime Sync Hook — myBeez
 *
 * Connects to SSE endpoint for live checklist updates.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseRealtimeSyncOptions {
  tenantId: string;
  enabled?: boolean;
  onChecklistUpdated?: () => void;
}

export function useRealtimeSync({ tenantId, enabled = true, onChecklistUpdated }: UseRealtimeSyncOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbackRef = useRef(onChecklistUpdated);
  callbackRef.current = onChecklistUpdated;

  useEffect(() => {
    if (!enabled || !tenantId) return;

    const es = new EventSource(`/api/${tenantId}/events`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.addEventListener("checklist_updated", () => {
      callbackRef.current?.();
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [tenantId, enabled]);

  return { connected };
}
