import { expect, test, type Page } from '@playwright/test';
import { closeAll, createRoom, expectLobbyCount, joinByCode, newPerson } from './helpers';

// なりすまし：部屋の moqUrl を知る第三者が、GM の次の epoch（gm/{epoch + 1}）に「解散」のイベントを流す。
// 自分の鍵で署名したもの（GM の参加証を付けたもの、自分で作った GM の参加証を付けたもの）には、
// プレイヤーは従わない。最後に、同じ道で本物の GM の鍵で署名したものを流し、プレイヤーに届く道であることを確かめる
// （届いていないから従わなかった、という空振りでないことの確認）。
//
// 封筒の作り方とフレームの形はアプリのモジュール（void dev が配る /src/...）をそのまま使う。

interface StoredMe {
  pid: string;
  cert: unknown;
  privateKey: string;
  moqUrl: string;
}

async function readGm(page: Page, code: string): Promise<StoredMe & { epoch: number }> {
  return page.evaluate((c) => {
    const me = JSON.parse(sessionStorage.getItem(`sh:me:${c}`) ?? 'null');
    const link = JSON.parse(localStorage.getItem(`sh:gmlink:${c}`) ?? 'null');
    return { ...me, epoch: link?.epoch ?? 0 };
  }, code);
}

/** 第三者のページで、gm/{epoch} の state と events を publish し始める。 */
async function startForger(page: Page, moqUrl: string, epoch: number): Promise<void> {
  await page.evaluate(
    async ({ moqUrl, epoch }) => {
      const load = (p: string) => import(/* @vite-ignore */ p);
      const { MoqSession, createMoqNetConnector } = await load('/src/client/moq/session.ts');
      const paths = await load('/src/client/moq/paths.ts');
      const session = new MoqSession(moqUrl, createMoqNetConnector());
      await session.start();
      (window as unknown as { __forge: unknown }).__forge = {
        session,
        state: session.publish(paths.gmPath(epoch), paths.STATE_TRACK),
        events: session.publish(paths.gmPath(epoch), paths.EVENTS_TRACK),
      };
    },
    { moqUrl, epoch },
  );
}

/**
 * 封筒を作って state（スナップショット）と events に流す。
 * privateKey を省けば第三者自身の鍵で署名する。fakeGmCert なら、自分で署名した GM の参加証を付ける。
 */
async function forge(
  page: Page,
  o: { body: Record<string, unknown>; cert?: unknown; privateKey?: string; fakeGmCert?: string },
): Promise<void> {
  await page.evaluate(async ({ body, cert, privateKey, fakeGmCert }) => {
    const load = (p: string) => import(/* @vite-ignore */ p);
    const crypto = await load('/src/shared/crypto.ts');
    const { seal } = await load('/src/shared/envelope.ts');
    const { encodeFrame } = await load('/src/client/game/wire.ts');
    let key: CryptoKey;
    if (privateKey) {
      key = await crypto.importPrivateKey(privateKey);
    } else {
      const pair = await crypto.generateKeyPair();
      key = pair.privateKey;
      if (fakeGmCert) {
        const now = Math.floor(Date.now() / 1000);
        const certBody = {
          room: fakeGmCert,
          pid: body.pid,
          name: 'forger',
          role: 'gm',
          pubkey: await crypto.exportPublicKey(pair.publicKey),
          iat: now,
          exp: now + 3600,
        };
        cert = { body: certBody, sig: await crypto.sign(key, { typ: 'cert', body: certBody }) };
      }
    }
    const frame = encodeFrame(await seal(body, key, cert));
    const f = (
      window as unknown as {
        __forge: {
          state: { snapshot(b: Uint8Array): void };
          events: { write(b: Uint8Array): void };
        };
      }
    ).__forge;
    f.state.snapshot(frame);
    f.events.write(frame);
  }, o);
}

/** 購読のやり直しは最大 2 秒おき。届いて処理されるのに十分な時間を待つ。 */
const SETTLE_MS = 4000;

test('第三者が自分の鍵で署名した GM のイベントには、プレイヤーは従わない', async ({ browser }) => {
  const gm = await newPerson(browser, 'ジーエム');
  const alice = await newPerson(browser, 'アリス');
  const bob = await newPerson(browser, 'ボブ');
  const forger = await newPerson(browser, 'forger');
  try {
    const code = await createRoom(gm);
    await joinByCode(alice, code);
    await joinByCode(bob, code);
    await expectLobbyCount(gm, 3);

    const real = await readGm(gm.page, code);
    expect(real.epoch).toBeGreaterThan(0);
    const epoch = real.epoch + 1;
    // 第三者はアプリと同じオリジンのページから Relay につなぐ（Chrome の Local Network Access のため）
    await forger.page.goto('/');
    await startForger(forger.page, real.moqUrl, epoch);

    const dissolved = (seq: number, pid = real.pid) => ({ pid, seq, epoch, type: 'dissolved' });

    // 1. 本物の GM の pid と参加証を付け、第三者の鍵で署名したもの（署名が参加証の公開鍵に合わない）
    await forge(forger.page, { body: dissolved(100_000), cert: real.cert });
    await forger.page.waitForTimeout(SETTLE_MS);
    // 2. 自分で署名した GM の参加証を付け、別の pid を名乗るもの（参加証がサーバーの鍵で署名されておらず、
    //    pid も従っている GM と違う。どちらで捨てられたかまでは区別しない）
    await forge(forger.page, { body: dissolved(100_001, 'forger-pid'), fakeGmCert: code });
    await forger.page.waitForTimeout(SETTLE_MS);

    for (const p of [alice, bob]) {
      await expect(p.page.getByText('GM の開始を待っています')).toBeVisible();
      await expect(p.page.getByText('部屋は解散しました')).toHaveCount(0);
    }
    await expect(gm.page.getByRole('button', { name: 'ゲームを始める' })).toBeEnabled();

    // GM が途中で作り直されて（再読み込みや dev の HMR で）epoch が進むと、第三者の gm/{epoch} は GM 本人と
    // ぶつかり、下の対照が意味をなさなくなる。そうなっていないことを先に確かめる。
    expect((await readGm(gm.page, code)).epoch, 'GM の epoch が途中で変わった').toBe(real.epoch);

    // 対照：同じ道で、本物の GM の鍵で署名したものなら従う
    await forge(forger.page, { body: dissolved(100_002), privateKey: real.privateKey });
    for (const p of [alice, bob]) {
      await expect(p.page.getByText('部屋は解散しました')).toBeVisible();
    }
  } finally {
    await closeAll([gm, alice, bob, forger]);
  }
});
