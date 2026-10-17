import { describe, expect, it } from 'vite-plus/test';
import { MAX_PHOTO_BYTES, createPresigner, photoKey } from '../../src/server/presign';

const p = createPresigner({ accountId: 'acc', bucket: 'bkt', accessKeyId: 'AK', secretAccessKey: 'SK' });

describe('presigner', () => {
  it('PUT は content-length と content-type を署名し、300 秒で切れる', async () => {
    const u = new URL(await p.put('rooms/123456/g/1/x-y.jpg', 1000));
    expect(u.host).toBe('acc.r2.cloudflarestorage.com');
    expect(u.pathname).toBe('/bkt/rooms/123456/g/1/x-y.jpg');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
  });
  it('GET は 3600 秒で切れる', async () => {
    const u = new URL(await p.get('rooms/123456/g/1/x-y.jpg'));
    expect(u.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(u.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });
  it('photoKey と上限', () => {
    expect(photoKey({ code: '123456', gameId: 'g1', round: 2, pid: 'p', rand: 'r' })).toBe(
      'rooms/123456/g1/2/p-r.jpg',
    );
    expect(MAX_PHOTO_BYTES).toBe(1_048_576);
  });
});
