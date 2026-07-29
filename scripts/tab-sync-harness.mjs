/**
 * Minimal tab-sync harness using BroadcastChannel to simulate two tabs.
 * Run with: npm run test:tabsync
 */

import { BroadcastChannel } from 'node:worker_threads';

const CHANNEL = 'music-library-tab-sync-harness';

const tabA = new BroadcastChannel(CHANNEL);
const tabB = new BroadcastChannel(CHANNEL);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const receivedByA = [];
const receivedByB = [];

tabA.onmessage = (ev) => {
    receivedByA.push(ev.data);
};

tabB.onmessage = (ev) => {
    receivedByB.push(ev.data);
};

try {
    tabA.postMessage({ type: 'playbackState', origin: 'tabA', payload: { trackId: 'abc12345', isPlaying: true } });
    tabB.postMessage({ type: 'persistence-updated', origin: 'tabB', payload: { sections: ['preferences'] } });

    await wait(80);

    assert(receivedByB.some((m) => m?.type === 'playbackState' && m?.origin === 'tabA'), 'Tab B did not receive playbackState from Tab A');
    assert(receivedByA.some((m) => m?.type === 'persistence-updated' && m?.origin === 'tabB'), 'Tab A did not receive persistence-updated from Tab B');

    console.log('tab-sync harness passed');
    console.log(`A received: ${receivedByA.length} message(s)`);
    console.log(`B received: ${receivedByB.length} message(s)`);
} catch (error) {
    console.error('tab-sync harness failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    tabA.close();
    tabB.close();
}
