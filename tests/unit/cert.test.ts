import { describe, expect, it } from 'vite-plus/test';
import {
  canonicalJson,
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  sha256Hex,
  sign,
  verify,
} from '../../src/shared/crypto';
import {
  issueCert,
  issueTransfer,
  verifyCert,
  verifyTransfer,
  type CertBody,
} from '../../src/shared/cert';

const body = (o: Partial<CertBody> = {}): CertBody => ({
  room: '123456',
  pid: 'p1',
  name: 'alice',
  role: 'player',
  pubkey: 'AAAA',
  iat: 0,
  exp: 2000,
  ...o,
});

describe('canonicalJson', () => {
  it('sorts keys', () =>
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}'));
});

describe('crypto', () => {
  it('sign/verify round trip and key export/import', async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    expect(pub).toMatch(/^[A-Za-z0-9_-]+$/);
    const priv2 = await importPrivateKey(await exportPrivateKey(kp.privateKey));
    await importPublicKey(pub);
    const sig = await sign(priv2, { x: 1, y: 'あ' });
    expect(await verify(pub, { y: 'あ', x: 1 }, sig)).toBe(true);
    expect(await verify(pub, { x: 2, y: 'あ' }, sig)).toBe(false);
    expect(await verify('not a key', { x: 1 }, sig)).toBe(false);
  });
  it('sha256Hex', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('cert', () => {
  it('valid cert verifies; tampered, wrong room, expired do not', async () => {
    const server = await generateKeyPair();
    const pub = await exportPublicKey(server.publicKey);
    const cert = await issueCert(server.privateKey, body({ room: '123456', exp: 2000 }));
    expect(await verifyCert(pub, cert, '123456', 1000)).toBe(true);
    expect(await verifyCert(pub, { ...cert, body: { ...cert.body, role: 'gm' } }, '123456', 1000)).toBe(false);
    expect(await verifyCert(pub, cert, '654321', 1000)).toBe(false);
    expect(await verifyCert(pub, cert, '123456', 2001)).toBe(false);
    expect(await verifyCert(pub, cert, '123456', 2000)).toBe(false);
  });
  it('tolerates 60s clock skew before iat only', async () => {
    const server = await generateKeyPair();
    const pub = await exportPublicKey(server.publicKey);
    const cert = await issueCert(server.privateKey, body({ iat: 1000, exp: 5000 }));
    expect(await verifyCert(pub, cert, '123456', 940)).toBe(true);
    expect(await verifyCert(pub, cert, '123456', 939)).toBe(false);
  });
  it('rejects cert signed by another server key and malformed input', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const cert = await issueCert(a.privateKey, body());
    expect(await verifyCert(await exportPublicKey(b.publicKey), cert, '123456', 1000)).toBe(false);
    expect(await verifyCert('bad', cert, '123456', 1000)).toBe(false);
    expect(await verifyCert(await exportPublicKey(a.publicKey), null as never, '123456', 1000)).toBe(false);
  });
  it('transfer cert verifies with same rules', async () => {
    const server = await generateKeyPair();
    const pub = await exportPublicKey(server.publicKey);
    const t = await issueTransfer(server.privateKey, { room: '123456', from: 'p1', to: 'p2', iat: 0, exp: 2000 });
    expect(await verifyTransfer(pub, t, '123456', 1000)).toBe(true);
    expect(await verifyTransfer(pub, { ...t, body: { ...t.body, to: 'p3' } }, '123456', 1000)).toBe(false);
    expect(await verifyTransfer(pub, t, '000000', 1000)).toBe(false);
    expect(await verifyTransfer(pub, t, '123456', 2001)).toBe(false);
  });
  it('cert and transfer cert are not interchangeable', async () => {
    const server = await generateKeyPair();
    const pub = await exportPublicKey(server.publicKey);
    const cert = await issueCert(server.privateKey, body());
    const t = await issueTransfer(server.privateKey, { room: '123456', from: 'p1', to: 'p2', iat: 0, exp: 2000 });
    expect(await verifyTransfer(pub, cert as never, '123456', 1000)).toBe(false);
    expect(await verifyCert(pub, t as never, '123456', 1000)).toBe(false);
    // 形が合っていても typ が違えば署名が通らない
    const asTransfer = { body: { room: '123456', from: 'p1', to: 'p2', iat: 0, exp: 2000 }, sig: cert.sig };
    expect(await verifyTransfer(pub, asTransfer, '123456', 1000)).toBe(false);
  });
  it('rejects malformed bodies', async () => {
    const server = await generateKeyPair();
    const pub = await exportPublicKey(server.publicKey);
    const bads: unknown[] = [
      body({ role: 'admin' as never }),
      body({ iat: NaN }),
      body({ exp: '2000' as never }),
      body({ name: 1 as never }),
      body({ exp: Infinity }),
    ];
    for (const b of bads) {
      const c = await issueCert(server.privateKey, b as CertBody).catch(() => ({ body: b as CertBody, sig: 'AAAA' }));
      expect(await verifyCert(pub, c, '123456', 1000)).toBe(false);
    }
    const t = await issueTransfer(server.privateKey, { room: '123456', from: 'p1', to: 2 as never, iat: 0, exp: 2000 });
    expect(await verifyTransfer(pub, { ...t, body: { ...t.body, to: 'p2', exp: NaN } }, '123456', 1000)).toBe(false);
    expect(await verifyTransfer(pub, t, '123456', 1000)).toBe(false);
  });
});

describe('canonicalJson unsupported types', () => {
  it('sign throws and verify returns false', async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    const good = await sign(kp.privateKey, { a: 1 });
    for (const v of [undefined, () => 1, Symbol('x'), 1n, new Date(0), [undefined], NaN, { a: new Date(0) }]) {
      await expect(sign(kp.privateKey, v)).rejects.toThrow();
      expect(await verify(pub, v, good)).toBe(false);
    }
    await expect(sign(kp.privateKey, { a: () => 1 })).rejects.toThrow();
  });
});
