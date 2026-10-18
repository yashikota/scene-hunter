import { useEffect, useRef, useState } from "react";
import { objectUrl } from "../photo/objectUrl";
import { useCamera } from "../photo/useCamera";
import { m } from "../paraglide/messages";
import { Button } from "../ui/Button";
import { CameraFrame } from "../ui/CameraFrame";
import { Screen } from "../ui/Screen";
import { formatCode, TopBar } from "../ui/TopBar";
import { useNow } from "../ui/useNow";
import { CameraBlocked } from "./CameraBlocked";
import { PlayerSubmitted } from "./PlayerSubmitted";
import { HintList } from "./HintList";
import { remainingSec } from "./turnTime";

export interface PlayerTurnProps {
  code: string;
  round: number;
  rounds: number;
  limitSec: number;
  turnStartedLocalAt: number | null;
  hints: readonly string[];
  /** イベントで自分の提出が確認できているか。 */
  submitted: boolean;
  /** 提出済みの人数と、提出する人の数（GM を除く）。 */
  submittedCount: number;
  playerCount: number;
  /** 撮った写真（encodeJpeg 済み）を出す。失敗は reject する。 */
  onShutter(blob: Blob): Promise<void>;
}

/** draft：撮って確認している写真（まだ何も送っていない）。 */
type Sent = {
  blob: Blob;
  url: string | undefined;
  status: "draft" | "sending" | "failed" | "sent";
};

/**
 * プレイヤーのターン：ヒントを見ながらその場で撮り、確かめてから提出する（端末の写真は選べない）。
 * 提出するまでは撮り直せる。撮影の秒数は提出を押した時刻で数える（shutter をそこで送る）。
 * 提出したあとに送れなかったときは、同じ写真をもう一度送るだけにする。
 */
export function PlayerTurn(props: PlayerTurnProps) {
  const { code, round, rounds, limitSec, turnStartedLocalAt, hints, onShutter } = props;
  const cam = useCamera();
  const now = useNow();
  const [sent, setSent] = useState<Sent | null>(null);
  const [capturing, setCapturing] = useState(false);
  /** 連打で shutter が二重に走らないよう、state の反映を待たずに止める。 */
  const inFlight = useRef(false);
  const capturingRef = useRef(false);
  const blocked = cam.state === "denied" || cam.state === "unavailable";
  const remaining = remainingSec(turnStartedLocalAt, limitSec, now);

  useEffect(() => {
    const url = sent?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sent?.url]);

  const deliver = async (blob: Blob, url: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSent({ blob, url, status: "sending" });
    try {
      await onShutter(blob);
      setSent({ blob, url, status: "sent" });
    } catch {
      setSent({ blob, url, status: "failed" });
    } finally {
      inFlight.current = false;
    }
  };

  const shoot = async () => {
    if (inFlight.current || capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const blob = await cam.capture();
      setSent({ blob, url: objectUrl(blob), status: "draft" });
    } catch {
      // 撮影に失敗したら、止めていないカメラのまま押し直せる。
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  };

  const retake = () => {
    setSent(null);
    cam.retry();
  };

  const mine = sent?.status === "sent" || props.submitted;
  if (mine) {
    return (
      <PlayerSubmitted
        round={round}
        rounds={rounds}
        startedAt={turnStartedLocalAt}
        limitSec={limitSec}
        photoUrl={sent?.url}
        submitted={props.submittedCount}
        total={props.playerCount}
      />
    );
  }

  if (sent && sent.status !== "draft") {
    return (
      <Screen>
        <TopBar
          left={m.round_label({ round, rounds })}
          right={<span>{m.time_left({ count: remaining })}</span>}
        />
        <CameraFrame>{sent.url && <img src={sent.url} alt={m.your_photo()} />}</CameraFrame>
        {sent.status === "failed" ? (
          <>
            <p role="alert" className="sh-error">
              {m.send_failed()}
            </p>
            <Button variant="primary" onClick={() => void deliver(sent.blob, sent.url)}>
              {m.resend_button()}
            </Button>
          </>
        ) : (
          <p
            role="status"
            className="sh-sub"
            style={{ margin: 0, textAlign: "center", fontWeight: 800 }}
          >
            {m.sending_photo()}
          </p>
        )}
      </Screen>
    );
  }

  return (
    <>
      <div hidden={blocked}>
        <Screen>
          <TopBar
            left={m.round_label({ round, rounds })}
            right={<span>{m.room_badge({ code: formatCode(code) })}</span>}
          />
          <div style={{ textAlign: "center" }}>
            <span className="sh-timer" role="timer" style={{ fontSize: 56 }}>
              {remaining}
              <small> {m.sec_suffix()}</small>
            </span>
          </div>
          <HintList
            hints={hints}
            shown={hints.length}
            turnStartedLocalAt={turnStartedLocalAt}
            now={now}
          />
          <CameraFrame videoRef={cam.videoRef}>
            {sent
              ? sent.url && <img src={sent.url} alt={m.your_photo()} />
              : cam.state === "starting" && (
                  <span style={{ fontSize: 14 }}>{m.camera_starting()}</span>
                )}
          </CameraFrame>
          {sent ? (
            <div className="sh-row">
              <Button onClick={retake}>{m.retake()}</Button>
              <Button
                variant="primary"
                disabled={remaining === 0}
                onClick={() => void deliver(sent.blob, sent.url)}
              >
                {m.submit_photo()}
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              disabled={capturing || cam.state !== "ready" || remaining === 0}
              onClick={() => void shoot()}
            >
              {m.shutter_button()}
            </Button>
          )}
        </Screen>
      </div>
      {blocked && (
        <CameraBlocked reason={cam.state as "denied" | "unavailable"} onRetry={cam.retry} />
      )}
    </>
  );
}
