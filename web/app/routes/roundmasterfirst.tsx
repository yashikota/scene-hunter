import type React from "react";
import { useRef, useState } from "react";
import { Camera, type CameraType } from "react-camera-pro";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const CameraPage: React.FC = () => {
  const camera = useRef<CameraType>(null);
  const [image, setImage] = useState<string>();
  const [cameraStarted, setCameraStarted] = useState(false);
  const [uploading, setUploading] = useState(false);

  const navigate = useNavigate(); // ✅ ページ遷移のためのフック

  // ランダムな JPEG ファイル名を生成
  const generateRandomFilename = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8);
    return `room_id/${date}-${random}.jpg`;
  };

  const capture = () => {
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
    }
  };

  const reset = () => {
    setImage(undefined);
    setCameraStarted(true);
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

      // ✅ アップロード成功後にページ遷移
      navigate("/roundmastersecond");
    } catch (err: unknown) {
      console.error(
        "❌ アップロードエラー:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-sky-100 pt-16">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-sky-300 shadow z-20 flex items-center justify-center">
        {" "}
        {/* ヘッダーも水色に */}
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

          <div className="fixed bottom-0 w-full flex justify-center items-center space-x-4 h-20 bg-sky-300 z-[50] shadow-md">
            <Button
              onClick={capture}
              className="w-16 h-16 rounded-full text-xl shadow-md bg-white text-black hover:bg-gray-200"
            >
              📸
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
              <Button onClick={() => setCameraStarted(true)}>
                カメラを起動する
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CameraPage;
