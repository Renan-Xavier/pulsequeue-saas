export interface RealtimeEventPayload {
  type:
    | "ticket.created"
    | "ticket.updated"
    | "ticket.called"
    | "webhook.processed"
    | "ping";
  organizationId: string;
  timestamp: string;
  summary: string;
  entityId?: string;
}

type Listener = (event: RealtimeEventPayload) => void;

const globalBus = globalThis as typeof globalThis & {
  __pulseQueueListeners?: Map<string, Set<Listener>>;
};

function getListenersMap(): Map<string, Set<Listener>> {
  if (!globalBus.__pulseQueueListeners) {
    globalBus.__pulseQueueListeners = new Map<string, Set<Listener>>();
  }
  return globalBus.__pulseQueueListeners;
}

/**
 * Subscribes a live SSE client to tenant-scoped events and returns an unsubscribe callback.
 */
export function subscribeOrganizationEvents(
  organizationId: string,
  listener: Listener
): () => void {
  const map = getListenersMap();
  let set = map.get(organizationId);
  if (!set) {
    set = new Set<Listener>();
    map.set(organizationId, set);
  }
  set.add(listener);

  return () => {
    const current = map.get(organizationId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      map.delete(organizationId);
    }
  };
}

/**
 * Publishes an instant in-instance event to all open browser tabs connected via SSE
 * for the given tenant organization.
 */
export function publishOrganizationEvent(event: RealtimeEventPayload): void {
  const listeners = getListenersMap().get(event.organizationId);
  if (!listeners) return;

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Listener cleanup happens on stream close
    }
  }
}
