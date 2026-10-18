// MoQ のテスト用に、サーバー鍵と参加証付きの封筒を作る。
import { issueCert, type CertBody } from "../../src/shared/cert";
import { exportPublicKey, generateKeyPair } from "../../src/shared/crypto";
import { EnvelopeVerifier, seal } from "../../src/shared/envelope";

export const ROOM = "123456";
export const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

export async function makeIdentities() {
  const server = await generateKeyPair();
  const serverPub = await exportPublicKey(server.publicKey);
  const mk = async (pid: string, role: CertBody["role"]) => {
    const kp = await generateKeyPair();
    const cert = await issueCert(server.privateKey, {
      room: ROOM,
      pid,
      name: pid,
      role,
      pubkey: await exportPublicKey(kp.publicKey),
      iat: 0,
      exp: 2000,
    });
    /** 参加証付きの封筒をバイト列にする（body.pid は自分）。 */
    const frame = async (body: Record<string, unknown>) =>
      enc(await seal({ pid, ...body }, kp.privateKey, cert));
    return { kp, cert, frame };
  };
  const verifier = () => new EnvelopeVerifier(serverPub, ROOM, () => 1000);
  return { mk, verifier, server, serverPub };
}
