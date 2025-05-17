import React, { useRef, useState } from "react";
import { Camera, type CameraType } from "react-camera-pro";
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
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const capture = () => {
    if (camera.current) {
      const photo = camera.current.takePhoto();
      setImage(photo);
      setCameraStarted(false);
      setUploadedUrl(null); // アップロード結果をリセット
    }
  };

  const reset = () => {
    setImage(undefined);
    setUploadedUrl(null);
  };

  const uploadImage = async () => {
    if (!image) {
      alert("画像が存在しません。");
      return;
    }

    if (!image.startsWith("data:image/")) {
      alert("画像形式が不正です。");
      return;
    }

    setUploading(true);

    try {
      const byteString = atob(image.split(",")[1]);
      const mimeString = image.split(",")[0].split(":")[1].split(";")[0];

      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });

      const formData = new FormData();
      formData.append("image", blob, "captured.jpg");
      formData.append("filename", `scene-hunter/${Date.now()}.webp`);
      formData.append("w", "800");
      formData.append("q", "90");
      formData.append("f", "webp");

      const res = await fetch(
        "https://scene-hunter-image.yashikota.workers.dev/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const json = await res.json();
      setUploadedUrl(json.path);
    } catch (err) {
      console.error("アップロード失敗:", err);
      alert("アップロードに失敗しました。");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-100 pt-16">
      {/* ✅ ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-white shadow z-20 flex items-center justify-center">
        <h1 className="text-xl font-bold text-gray-800">Scene Hunter</h1>
      </header>

      {/* 📸 カメラ全画面表示 */}
      {cameraStarted && !image && (
        <>
          <div className="fixed top-0 left-0 w-screen h-screen z-0">
            <Camera
              ref={camera}
              facingMode="environment"
              errorMessages={{}}
              aspectRatio="cover"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="fixed bottom-6 w-full flex justify-center z-10 space-x-4">
            <Button
              onClick={capture}
              className="w-16 h-16 rounded-full text-xl shadow-md"
            >
              📸
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

      {/* 🖼️ 撮影後の表示 */}
      {!cameraStarted && image && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>撮影結果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <img src={image} alt="撮影した写真" className="rounded" />
              <div className="flex gap-2 justify-center">
                <Button onClick={reset}>もう一度撮る</Button>
                <Button onClick={uploadImage} disabled={uploading}>
                  {uploading ? "アップロード中..." : "アップロード"}
                </Button>
              </div>
              {uploadedUrl && (
                <p className="text-sm break-words text-center text-green-600">
                  アップロード成功:
                  <br />
                  <a
                    href={uploadedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {uploadedUrl}
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ▶️ 初期画面（カメラ起動ボタン） */}
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
