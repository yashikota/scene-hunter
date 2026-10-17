import { useRef, useState } from 'react';
import { encodeJpeg, fitWithin, loadImageFile } from '../photo/encode';
import { useCamera } from '../photo/useCamera';
import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { CameraFrame } from '../ui/CameraFrame';
import { Screen } from '../ui/Screen';
import { TopBar } from '../ui/TopBar';
import { useNow } from '../ui/useNow';
import { CameraBlocked } from './CameraBlocked';
import { GM_TURN_SEC, remainingSec } from './turnTime';

export interface GmTurnProps {
  round: number;
  rounds: number;
  /** 撮った（選んだ）写真を出す。失敗は reject する。 */
  onPhoto(blob: Blob): Promise<void>;
}

/** GM のターン：お題の写真をその場で撮るか、撮影済みの写真から選ぶ。60 秒のカウントダウンは目安で、強制はしない。 */
export function GmTurn({ round, rounds, onPhoto }: GmTurnProps) {
  const cam = useCamera();
  const fileRef = useRef<HTMLInputElement>(null);
  const [startedAt] = useState(() => Date.now());
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = cam.state === 'denied' || cam.state === 'unavailable';

  const send = async (make: () => Promise<Blob>, failure: string) => {
    setBusy(true);
    setError(null);
    let blob: Blob;
    try {
      blob = await make();
    } catch {
      setError(failure);
      setBusy(false);
      return;
    }
    try {
      await onPhoto(blob);
      setBusy(false);
    } catch {
      // 送れなかったときは、撮ったあとで止めたカメラを起動し直して撮り直せるようにする。
      setError(m.send_failed());
      cam.retry();
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void send(async () => {
      const bitmap = await loadImageFile(file);
      const { w, h } = fitWithin(bitmap.width, bitmap.height);
      try {
        return await encodeJpeg(bitmap, w, h);
      } finally {
        bitmap.close();
      }
    }, m.photo_unreadable());
  };

  return (
    <>
      <div hidden={blocked}>
        <Screen>
          <TopBar
            left={m.round_label({ round, rounds })}
            right={<span className="sh-badge">{m.gm_turn_badge()}</span>}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h1 className="sh-display" style={{ fontSize: 22 }}>
              {m.gm_turn_title()}
            </h1>
            <span className="sh-timer" role="timer" style={{ fontSize: 34 }}>
              {remainingSec(startedAt, GM_TURN_SEC, now)}
              <small> {m.sec_suffix()}</small>
            </span>
          </div>
          <CameraFrame videoRef={cam.videoRef}>
            {cam.state === 'starting' && (
              <span style={{ fontSize: 14 }}>{m.camera_starting()}</span>
            )}
          </CameraFrame>
          <p className="sh-sub" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>
            {m.gm_turn_caution()}
          </p>
          {error && (
            <p role="alert" className="sh-error">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button
              variant="primary"
              disabled={busy || cam.state !== 'ready'}
              onClick={() => void send(cam.capture, m.send_failed())}
            >
              {busy ? m.sending_photo() : m.shoot_here()}
            </Button>
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              {m.pick_photo()}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="gm-photo-file"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </Screen>
      </div>
      {blocked && (
        <CameraBlocked reason={cam.state as 'denied' | 'unavailable'} onRetry={cam.retry} />
      )}
    </>
  );
}
