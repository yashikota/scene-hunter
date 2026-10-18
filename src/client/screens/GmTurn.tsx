import { useEffect, useRef, useState } from "react";
import { encodeJpeg, fitWithin, loadImageFile } from "../photo/encode";
import { objectUrl } from "../photo/objectUrl";
import { useCamera } from "../photo/useCamera";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { CameraFrame } from "../ui/CameraFrame";
import { Screen } from "../ui/Screen";
import { TopBar } from "../ui/TopBar";
import { useNow } from "../ui/useNow";
import { CameraBlocked } from "./CameraBlocked";
import { GM_TURN_SEC, remainingSec } from "./turnTime";

export interface GmTurnProps {
  round: number;
  rounds: number;
  /** 撮った（選んだ）写真を出す。失敗は reject する。 */
  onPhoto(blob: Blob): Promise<void>;
}

/** 撮って（選んで）確認している写真。source でやり直しの方法（撮り直すか選び直すか）を決める。 */
type Draft = { blob: Blob; url: string | undefined; source: "camera" | "file" };

/**
 * GM のターン：お題の写真をその場で撮るか、撮影済みの写真から選び、確かめてから決める。
 * 60 秒のカウントダウンは目安で、強制はしない。
 */
export function GmTurn({ round, rounds, onPhoto }: GmTurnProps) {
  const cam = useCamera();
  const fileRef = useRef<HTMLInputElement>(null);
  const [startedAt] = useState(() => Date.now());
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const blocked = cam.state === "denied" || cam.state === "unavailable";

  useEffect(() => {
    const url = draft?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft?.url]);

  const prepare = async (make: () => Promise<Blob>, source: Draft["source"], failure: string) => {
    setBusy(true);
    setError(null);
    try {
      const blob = await make();
      setDraft({ blob, url: objectUrl(blob), source });
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const send = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      await onPhoto(blob);
    } catch {
      // 送れなかったときは、同じ写真のまま決め直すか、やり直せる。
      setError(m.send_failed());
    } finally {
      setBusy(false);
    }
  };

  const redo = () => {
    const source = draft?.source;
    setDraft(null);
    setError(null);
    // 撮影ではカメラを止めているので起動し直す。選んだ写真なら、もう一度選ぶ画面を開く。
    if (source === "camera") cam.retry();
    else fileRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void prepare(
      async () => {
        const bitmap = await loadImageFile(file);
        const { w, h } = fitWithin(bitmap.width, bitmap.height);
        try {
          return await encodeJpeg(bitmap, w, h);
        } finally {
          bitmap.close();
        }
      },
      "file",
      m.photo_unreadable(),
    );
  };

  return (
    <>
      <div hidden={blocked}>
        <Screen>
          <TopBar
            left={m.round_label({ round, rounds })}
            right={<span className="sh-badge">{m.gm_turn_badge()}</span>}
          />
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h1 className="sh-display" style={{ fontSize: 22 }}>
              {m.gm_turn_title()}
            </h1>
            <span className="sh-timer" role="timer" style={{ fontSize: 34 }}>
              {remainingSec(startedAt, GM_TURN_SEC, now)}
              <small> {m.sec_suffix()}</small>
            </span>
          </div>
          <CameraFrame videoRef={cam.videoRef}>
            {draft
              ? draft.url && <img src={draft.url} alt={m.topic_photo()} />
              : cam.state === "starting" && (
                  <span style={{ fontSize: 14 }}>{m.camera_starting()}</span>
                )}
          </CameraFrame>
          {error && (
            <p role="alert" className="sh-error">
              {error}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {draft ? (
              <div className="sh-row">
                <Button disabled={busy} onClick={redo}>
                  {draft.source === "camera" ? m.retake() : m.repick()}
                </Button>
                <Button variant="primary" disabled={busy} onClick={() => void send(draft.blob)}>
                  {busy ? m.sending_photo() : m.use_topic_photo()}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="primary"
                  disabled={busy || cam.state !== "ready"}
                  onClick={() => void prepare(cam.capture, "camera", m.camera_blocked_title())}
                >
                  {m.shoot_here()}
                </Button>
                <Button disabled={busy} onClick={() => fileRef.current?.click()}>
                  {m.pick_photo()}
                </Button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="gm-photo-file"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </Screen>
      </div>
      {blocked && (
        <CameraBlocked reason={cam.state as "denied" | "unavailable"} onRetry={cam.retry} />
      )}
    </>
  );
}
