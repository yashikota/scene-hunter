import { describe, expect, it } from 'vite-plus/test';
import { cleanupExpiredRelays } from '../../src/server/services/cleanup';
import type { RelayApi } from '../../src/server/relay';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const MIN = 60_000;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function fakeRelay(
  relays: { uid: string; name: string; created: string }[],
  failUids: string[] = [],
) {
  const deleted: string[] = [];
  const api: RelayApi = {
    create: async () => {
      throw new Error('not used');
    },
    delete: async (uid) => {
      if (failUids.includes(uid)) throw new Error(`HTTP 500 for ${uid}`);
      deleted.push(uid);
    },
    list: async () => relays,
  };
  return { api, deleted };
}

describe('cleanupExpiredRelays', () => {
  it('deletes an sh- relay older than 12 hours', async () => {
    const { api, deleted } = fakeRelay([
      { uid: 'u-old', name: 'sh-111111', created: iso(12 * 60 * MIN + MIN) },
    ]);
    expect(await cleanupExpiredRelays(api, NOW)).toEqual(['u-old']);
    expect(deleted).toEqual(['u-old']);
  });

  it('keeps an sh- relay that is only 11 hours old', async () => {
    const { api, deleted } = fakeRelay([
      { uid: 'u-new', name: 'sh-222222', created: iso(11 * 60 * MIN) },
    ]);
    expect(await cleanupExpiredRelays(api, NOW)).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('never deletes a relay whose name lacks the sh- prefix', async () => {
    const { api, deleted } = fakeRelay([
      { uid: 'u-other', name: 'other-333333', created: iso(24 * 60 * MIN) },
      { uid: 'u-sh-mid', name: 'x-sh-444444', created: iso(24 * 60 * MIN) },
    ]);
    expect(await cleanupExpiredRelays(api, NOW)).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('honors a custom maxAgeMs', async () => {
    const { api } = fakeRelay([{ uid: 'u-1', name: 'sh-555555', created: iso(2 * MIN) }]);
    expect(await cleanupExpiredRelays(api, NOW, MIN)).toEqual(['u-1']);
  });

  it('keeps going when one delete fails and returns only the uids actually deleted', async () => {
    const { api, deleted } = fakeRelay(
      [
        { uid: 'u-a', name: 'sh-aaaaaa', created: iso(13 * 60 * MIN) },
        { uid: 'u-b', name: 'sh-bbbbbb', created: iso(13 * 60 * MIN) },
        { uid: 'u-c', name: 'sh-cccccc', created: iso(13 * 60 * MIN) },
      ],
      ['u-b'],
    );
    expect(await cleanupExpiredRelays(api, NOW)).toEqual(['u-a', 'u-c']);
    expect(deleted).toEqual(['u-a', 'u-c']);
  });
});
