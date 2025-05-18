import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, type CameraType } from "react-camera-pro";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { sendEvent, useWebSocket } from "../contexts/WebSocketContext";

const CameraPage: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useWebSocket();
  const roomId = "012345"; // 実際のアプリケーションではURLパラメータなどから取得

  const camera = useRef<CameraType>(null);
  const [image, setImage] = useState<string>();
  const [cameraStarted, setCameraStarted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [visibleCommentCount, setVisibleCommentCount] = useState(0);
  const [cameraStartTime, setCameraStartTime] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const cameraComments = [
    "カメラを安定させてくださいいいいいいいいいいいいいいいいいいいいいいいいいいい",
    "明るい場所で撮影しましょう",
    "被写体にピントを合わせてください",
    "手ブレに注意しましょう",
    "構図を整えてください",
  ];

  const generateRandomFilename = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8);
    return `scene-hunter/${date}-${random}.jpg`;
  };

  const capture = useCallback(() => {
    if (camera.current) {
      const photo = camera.current.takePhoto();
      // ImageData型の場合の処理を追加
      if (typeof photo === "string") {
        setImage(photo);
      } else {
        // ImageDataの場合は文字列に変換するか、別の処理を行う
        console.warn("ImageData形式の写真は処理できません");
        return;
      }
      setCameraStarted(false);
      setAnimationStarted(false);

      if (cameraStartTime !== null) {
        const elapsedSeconds = (Date.now() - cameraStartTime) / 1000;
        console.log(
          `カメラ起動から撮影までの時間: ${elapsedSeconds.toFixed(2)}秒`,
        );
      }
    }
  }, [cameraStartTime]); // cameraはrefなので依存配列から削除

  const reset = () => {
    setImage(undefined);
    setCameraStarted(true);
    setCameraStartTime(Date.now()); // カメラ再起動時刻もリセット
  };

  const uploadImage = async () => {
    if (!image) return;
    setUploading(true);

    try {
      const blob = await (await fetch(image)).blob();
      const file = new File([blob], "captured.jpg", { type: "image/jpeg" });

      const filename = generateRandomFilename();

      const formData = new FormData();
      formData.append("image", file);
      formData.append("filename", filename);
      formData.append("w", "800");
      formData.append("q", "90");

      const res = await fetch(
        "https://scene-hunter-image.yashikota.workers.dev/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!res.ok) throw new Error("アップロードに失敗しました");

      const result = await res.json();
      console.log("✅ アップロード成功:", result);
      setUploadSuccess(true);

      // RESTを通じて写真提出イベントを送信
      const userId = `user-${Math.random().toString(36).substring(2, 8)}`; // 実際のアプリケーションでは認証システムなどから取得
      sendEvent(roomId, {
        event_type: "game.photo_submitted",
        player_id: userId,
        submission_time: new Date().toISOString(),
      }).catch((error) => {
        console.error("写真提出イベント送信エラー:", error);
      });

      // 次の画面に遷移
      setTimeout(() => {
        navigate("/answercheck");
      }, 1000);
    } catch (err: unknown) {
      console.error(
        "❌ アップロードエラー:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const commentTimers: NodeJS.Timeout[] = [];

    if (cameraStarted) {
      setAnimationStarted(true);
      setVisibleCommentCount(0); // 初期化

      timer = setTimeout(() => {
        capture();
      }, 60000);

      for (const sec of [0, 10, 20, 30, 40]) {
        const t = setTimeout(() => {
          setVisibleCommentCount((count) => count + 1);
        }, sec * 1000);
        commentTimers.push(t);
      }
    } else {
      setAnimationStarted(false);
      setVisibleCommentCount(0);
    }

    return () => {
      if (timer) clearTimeout(timer);
      commentTimers.forEach(clearTimeout);
    };
  }, [cameraStarted, capture]);

  // カメラ起動時刻セットを含む起動関数
  const startCamera = () => {
    setCameraStarted(true);
    setCameraStartTime(Date.now());
  };

  return (
    <div className="relative min-h-screen bg-sky-100 pt-16">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-sky-300 shadow z-20 flex items-center justify-between px-4">
        <h1 className="text-xl font-bold text-gray-800">Scene Hunter</h1>
        <div>
          {connectionStatus === "connected" && (
            <span className="text-green-500 text-sm">接続済み</span>
          )}
          {connectionStatus === "connecting" && (
            <span className="text-yellow-500 text-sm">接続中...</span>
          )}
          {connectionStatus === "disconnected" && (
            <span className="text-gray-500 text-sm">未接続</span>
          )}
          {connectionStatus === "error" && (
            <span className="text-red-500 text-sm">接続エラー</span>
          )}
        </div>
      </header>

      {/* カメラ起動中 */}
      {cameraStarted && !image && (
        <>
          {/* カメラ画面 */}
          <div className="fixed top-0 left-0 w-screen h-screen z-10">
            <Camera
              ref={camera}
              facingMode="environment"
              errorMessages={{}}
              aspectRatio="cover"
            />
          </div>

          {/* コメント */}
          {showComments && (
            <div className="fixed inset-x-0 bottom-40 px-4 space-y-2 z-[50] flex flex-col items-end">
              {cameraComments.map(
                (comment, index) =>
                  index < visibleCommentCount && (
                    <div
                      key={`comment-${comment.substring(0, 10)}-${index}`}
                      className="bg-white bg-opacity-80 text-black text-sm px-3 py-1 rounded shadow max-w-xs text-right"
                    >
                      {comment}
                    </div>
                  ),
              )}
            </div>
          )}

          {/* シークバー & カメラアイコン */}
          <div className="fixed bottom-24 w-full flex justify-center z-[60]">
            <div className="relative w-[90%] h-2 bg-white bg-opacity-80 rounded">
              {/* 7分割の丸い目印を追加 */}
              {[0, 1, 2, 3, 4, 6].map((i) => (
                <div
                  key={i}
                  className="absolute top-1/2 text-2xl"
                  style={{
                    left: `${(i / 6) * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {i === 6 ? "✅" : "❓"}
                </div>
              ))}
              {/* 動くカメラアイコン */}
              {animationStarted && (
                <div
                  className="absolute top-[-22px] text-xl z-[70]"
                  style={{
                    animation: "slideIcon 60s linear forwards",
                    transform: "translateX(-50%)",
                  }}
                >
                  📷
                </div>
              )}
            </div>
          </div>

          {/* フッター */}
          <div className="fixed bottom-0 w-full flex justify-center items-center space-x-4 h-20 bg-sky-300 z-[50] shadow-md">
            <Button
              onClick={capture}
              className="w-16 h-16 rounded-full text-xl shadow-md bg-white text-black hover:bg-gray-200"
            >
              📸
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowComments((prev) => !prev)}
            >
              {showComments ? "コメント非表示" : "コメント表示"}
            </Button>
          </div>
        </>
      )}

      {/* 撮影結果表示 */}
      {!cameraStarted && image && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>撮影結果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <img src={image} alt="撮影した写真" className="rounded" />
              <div className="flex gap-2 justify-center flex-wrap">
                <Button
                  onClick={uploadImage}
                  disabled={uploading || uploadSuccess}
                  className={uploadSuccess ? "bg-green-500" : ""}
                >
                  {uploading
                    ? "アップロード中..."
                    : uploadSuccess
                      ? "アップロード完了"
                      : "アップロード"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 初期画面 */}
      {!cameraStarted && !image && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>カメラで写真を撮る</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex justify-center">
              <Button onClick={startCamera}>カメラを起動する</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 📷アイコンアニメーション用CSS */}
      <style>{`
        @keyframes slideIcon {
          0% { left: 0%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};

export default CameraPage;
