import React, { useEffect, useRef, useState } from "react";
import { Camera, type CameraType } from "react-camera-pro";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const CameraPage: React.FC = () => {
  const camera = useRef<CameraType>(null);
  const [image, setImage] = useState<string>();
  const [cameraStarted, setCameraStarted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [animationStarted, setAnimationStarted] = useState(false);

  const cameraComments = [
    "撮影対象を中央に合わせてください",
    "光の反射に注意してください",
    "端が切れないようにしましょう",
    "背景が整理されているか確認しましょう",
    "ピントを合わせてください",
  ];

  const generateRandomFilename = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8);
    return `scene-hunter/${date}-${random}.jpg`;
  };

  const capture = () => {
    if (camera.current) {
      const photo = camera.current.takePhoto();
      setImage(photo);
      setCameraStarted(false);
    }
  };

  const reset = () => {
    setImage(undefined);
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

      const res = await fetch("https://scene-hunter-image.yashikota.workers.dev/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("アップロードに失敗しました");

      const result = await res.json();
      console.log("✅ アップロード成功:", result);
    } catch (err: any) {
      console.error("❌ アップロードエラー:", err.message);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (cameraStarted) {
      setAnimationStarted(true);
    } else {
      setAnimationStarted(false);
    }
  }, [cameraStarted]);

  return (
    <div className="relative min-h-screen bg-gray-100 pt-16">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-white shadow z-20 flex items-center justify-center">
        <h1 className="text-xl font-bold text-gray-800">Scene Hunter</h1>
      </header>

      {/* カメラ画面 */}
      {cameraStarted && !image && (
        <>
          <div className="fixed top-0 left-0 w-screen h-screen z-0">
            <Camera
              ref={camera}
              facingMode="environment"
              errorMessages={{}}
              aspectRatio="cover"
            />
          </div>

          {/* コメント */}
          {showComments && (
            <div className="fixed inset-x-0 bottom-40 px-4 space-y-2 z-10 flex flex-col items-end">
              {cameraComments.map((comment, index) => (
                <div
                  key={index}
                  className="bg-white bg-opacity-80 text-black text-sm px-3 py-1 rounded shadow max-w-xs text-right"
                >
                  {comment}
                </div>
              ))}
            </div>
          )}

          {/* シークバーとカメラアイコン */}
          <div className="fixed bottom-24 w-full flex justify-center z-30">
            <div className="relative w-[90%] h-2 bg-white bg-opacity-80 rounded overflow-hidden">
              {animationStarted && (
                <div
                  className="absolute top-[-22px] left-0 text-xl z-40"
                  style={{
                    animation: "slideIcon 60s linear forwards",
                  }}
                >
                  📷
                </div>
              )}
            </div>
          </div>

          {/* フッター（白背景付き） */}
          <div className="fixed bottom-0 w-full flex justify-center items-center space-x-4 h-20 bg-white z-20 shadow-md">
            <Button
              onClick={capture}
              className="w-16 h-16 rounded-full text-xl shadow-md"
            >
              📸
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowComments((prev) => !prev)}
            >
              {showComments ? "コメント非表示" : "コメント表示"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCameraStarted(false)}
              className="h-16"
            >
              キャンセル
            </Button>
          </div>
        </>
      )}

      {/* 撮影結果 */}
      {!cameraStarted && image && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>撮影結果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <img src={image} alt="撮影した写真" className="rounded" />
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={reset} variant="secondary">
                  もう一度撮る
                </Button>
                <Button onClick={uploadImage} disabled={uploading}>
                  {uploading ? "アップロード中..." : "アップロード"}
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
              <Button onClick={() => setCameraStarted(true)}>カメラを起動する</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* アニメーション用CSS */}
      <style>{`
        @keyframes slideIcon {
          0% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default CameraPage;
