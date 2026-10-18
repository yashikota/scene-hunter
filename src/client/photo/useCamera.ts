import { useCallback, useEffect, useRef, useState } from "react";
import { captureFrame, startCamera, type CameraError } from "./camera";
import { encodeJpeg } from "./encode";

export type CameraState = "starting" | "ready" | CameraError;

/**
 * video に映すカメラを起動し、アンマウントと撮影のあとにトラックを止める。
 * capture は映像を JPEG にして返し、カメラを止める（もう一度使うなら retry）。
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    setState("starting");
    void startCamera(video).then((r) => {
      if ("error" in r) {
        if (!cancelled) setState(r.error);
        return;
      }
      if (cancelled) {
        r.stop();
        return;
      }
      stopRef.current = r.stop;
      setState("ready");
    });
    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const capture = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current;
    if (!video) throw new Error("camera is not mounted");
    const { canvas, w, h } = captureFrame(video);
    const blob = await encodeJpeg(canvas, w, h);
    stopRef.current?.();
    stopRef.current = null;
    return blob;
  }, []);

  return { videoRef, state, retry, capture };
}
