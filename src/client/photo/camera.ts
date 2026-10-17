import { fitWithin } from './encode';

export type CameraError = 'denied' | 'unavailable';

function toCameraError(e: unknown): CameraError {
  const name = e instanceof Error ? e.name : (e as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
}

/** 背面カメラを優先して起動し、video に映す。失敗は例外にせず error で返す。 */
export async function startCamera(
  video: HTMLVideoElement,
): Promise<{ stop(): void } | { error: CameraError }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (e) {
    return { error: toCameraError(e) };
  }
  const stop = () => {
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
  };
  video.srcObject = stream;
  try {
    await video.play();
  } catch (e) {
    stop();
    return { error: toCameraError(e) };
  }
  return { stop };
}

/** いまの映像を、長辺 1280 px に収めた canvas に写し取る。 */
export function captureFrame(video: HTMLVideoElement): {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
} {
  const { w, h } = fitWithin(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
  return { canvas, w, h };
}
