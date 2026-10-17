import { describe, expect, it } from 'vite-plus/test';
import { exportPublicKey, generateKeyPair } from '../../src/shared/crypto';
import { issueCert, type CertBody } from '../../src/shared/cert';
import { EnvelopeVerifier, seal } from '../../src/shared/envelope';

async function setup() {
  const server = await generateKeyPair();
  const serverPub = await exportPublicKey(server.publicKey);
  const mk = async (pid: string, role: CertBody['role'] = 'player', exp = 2000) => {
    const kp = await generateKeyPair();
    const cert = await issueCert(server.privateKey, {
      room: '123456',
      pid,
      name: pid,
      role,
      pubkey: await exportPublicKey(kp.publicKey),
      iat: 0,
      exp,
    });
    return { kp, cert };
  };
  return { server, serverPub, mk, verifier: () => new EnvelopeVerifier(serverPub, '123456', () => 1000) };
}

describe('envelope', () => {
  it('accepts signed body, rejects pid mismatch and forged sig', async () => {
    const { mk, verifier } = await setup();
    const alice = await mk('alice');
    const bob = await mk('bob');
    const v = verifier();
    const ok = await v.open(await seal({ pid: 'alice', t: 'x' }, alice.kp.privateKey, alice.cert));
    expect(ok?.body.pid).toBe('alice');
    expect(ok?.cert.body.pid).toBe('alice');
    // alice の参加証で bob を名乗る
    expect(await v.open(await seal({ pid: 'bob' }, alice.kp.privateKey, alice.cert))).toBeNull();
    // alice の参加証だが bob の鍵で署名
    expect(await v.open(await seal({ pid: 'alice' }, bob.kp.privateKey, alice.cert))).toBeNull();
    // body 改ざん
    const e = await seal({ pid: 'alice', n: 1 }, alice.kp.privateKey, alice.cert);
    expect(await v.open({ ...e, body: { ...e.body, n: 2 } })).toBeNull();
  });

  it('accepts envelope without cert after the cert was seen once', async () => {
    const { mk, verifier } = await setup();
    const alice = await mk('alice');
    const v = verifier();
    const bare = await seal({ pid: 'alice' }, alice.kp.privateKey);
    expect(await v.open(bare)).toBeNull();
    expect(await v.open(await seal({ pid: 'alice' }, alice.kp.privateKey, alice.cert))).not.toBeNull();
    expect((await v.open(bare))?.cert).toEqual(alice.cert);
    expect(v.certOf('alice')).toEqual(alice.cert);
    expect(v.certOf('bob')).toBeUndefined();
  });

  it('rejects expired, foreign-room and foreign-server certs; bad cert does not replace good one', async () => {
    const { mk, verifier, server } = await setup();
    const expired = await mk('alice', 'player', 500);
    expect(await verifier().open(await seal({ pid: 'alice' }, expired.kp.privateKey, expired.cert))).toBeNull();

    const kp = await generateKeyPair();
    const other = await generateKeyPair();
    const forged = await issueCert(other.privateKey, {
      room: '123456', pid: 'alice', name: 'a', role: 'gm', pubkey: await exportPublicKey(kp.publicKey), iat: 0, exp: 2000,
    });
    const alice = await mk('alice');
    const v = verifier();
    await v.open(await seal({ pid: 'alice' }, alice.kp.privateKey, alice.cert));
    expect(await v.open(await seal({ pid: 'alice' }, kp.privateKey, forged))).toBeNull();
    expect(v.certOf('alice')).toEqual(alice.cert);

    const wrongRoom = await issueCert(server.privateKey, { ...alice.cert.body, room: '999999' });
    expect(await verifier().open(await seal({ pid: 'alice' }, alice.kp.privateKey, wrongRoom))).toBeNull();
  });

  it('never throws on malformed input', async () => {
    const { verifier } = await setup();
    const v = verifier();
    for (const bad of [null, undefined, 1, 'x', {}, { body: null, sig: 1 }, { body: { pid: 'a' }, sig: 'zz', cert: 5 }]) {
      expect(await v.open(bad as never)).toBeNull();
    }
  });

  it('cert-less envelope: pid must match remembered one, and remembered cert expires', async () => {
    const { mk, serverPub } = await setup();
    let now = 1000;
    const v = new EnvelopeVerifier(serverPub, '123456', () => now);
    const alice = await mk('alice');
    const bob = await mk('bob');
    await v.open(await seal({ pid: 'alice' }, alice.kp.privateKey, alice.cert));
    // bob は未記憶なので cert なしは null。alice の鍵で bob の pid を名乗っても null
    expect(await v.open(await seal({ pid: 'bob' }, alice.kp.privateKey))).toBeNull();
    expect(await v.open(await seal({ pid: 'bob' }, bob.kp.privateKey))).toBeNull();
    expect(await v.open(await seal({ pid: 'alice' }, alice.kp.privateKey))).not.toBeNull();
    now = 2000;
    expect(await v.open(await seal({ pid: 'alice' }, alice.kp.privateKey))).toBeNull();
  });
});
