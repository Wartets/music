// SharedWorker script for tab synchronization
// Broadcasts messages between connected ports

interface TabMessage {
    type: string;
    payload?: any;
}

interface SharedWorkerConnectEvent extends Event {
    ports: MessagePort[];
}

const ports: MessagePort[] = [];

const sharedScope = globalThis as unknown as {
    onconnect: ((e: SharedWorkerConnectEvent) => void) | null;
};

sharedScope.onconnect = (e: SharedWorkerConnectEvent) => {
    const port = e.ports[0] as MessagePort;
    ports.push(port);

    port.onmessage = (ev: MessageEvent<TabMessage>) => {
        const msg = ev.data;
        // Broadcast to all other ports
        for (const p of ports) {
            if (p === port) continue;
            try {
                p.postMessage(msg);
            } catch {
                // ignore
            }
        }
    };

    port.start?.();
};

