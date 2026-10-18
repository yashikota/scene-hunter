import type { ReactNode, RefObject } from "react";
import { m } from "../paraglide/messages";

/** カメラの映像の枠（四隅の印つき）。video が無いときは children を中に出す。 */
export function CameraFrame({
  videoRef,
  children,
}: {
  videoRef?: RefObject<HTMLVideoElement | null>;
  children?: ReactNode;
}) {
  return (
    <div className="sh-camera">
      {videoRef && <video ref={videoRef} muted playsInline aria-label={m.camera_preview()} />}
      <span className="sh-corner sh-corner--tl" aria-hidden="true" />
      <span className="sh-corner sh-corner--tr" aria-hidden="true" />
      <span className="sh-corner sh-corner--bl" aria-hidden="true" />
      <span className="sh-corner sh-corner--br" aria-hidden="true" />
      {children}
    </div>
  );
}
