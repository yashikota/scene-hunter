import type { Cert } from "./cert";
import { verifyCert } from "./cert";
import { sign, verify } from "./crypto";

export interface Envelope<B> {
  cert?: Cert;
  body: B;
  sig: string;
}

export async function seal<B extends { pid: string }>(
  body: B,
  priv: CryptoKey,
  cert?: Cert,
): Promise<Envelope<B>> {
  const sig = await sign(priv, body);
  return cert ? { cert, body, sig } : { body, sig };
}

export class EnvelopeVerifier {
  private readonly certs = new Map<string, Cert>();

  /** `now` は UNIX 秒を返す。 */
  constructor(
    private readonly serverPub: string,
    private readonly room: string,
    private readonly now: () => number,
  ) {}

  certOf(pid: string): Cert | undefined {
    return this.certs.get(pid);
  }

  async open<B extends { pid: string }>(env: Envelope<B>): Promise<{ body: B; cert: Cert } | null> {
    try {
      const { body, sig } = env;
      if (typeof body?.pid !== "string" || typeof sig !== "string") return null;

      let cert: Cert | undefined;
      let fresh = false;
      if (env.cert !== undefined) {
        if (env.cert.body?.pid !== body.pid) return null;
        if (!(await verifyCert(this.serverPub, env.cert, this.room, this.now()))) return null;
        cert = env.cert;
        fresh = true;
      } else {
        cert = this.certs.get(body.pid);
        if (!cert || this.now() >= cert.body.exp) return null;
      }

      if (!(await verify(cert.body.pubkey, body, sig))) return null;
      // 名前を変えると参加証を出し直すので、後から届いた古いフレームの参加証では戻さない
      const known = this.certs.get(body.pid);
      if (fresh && !(known && known.body.iat > cert.body.iat)) this.certs.set(body.pid, cert);
      return { body, cert };
    } catch {
      return null;
    }
  }
}
