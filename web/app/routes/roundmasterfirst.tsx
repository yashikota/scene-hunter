import type React from "react";
import { useRef, useState } from "react";
import { Camera, type CameraType } from "react-camera-pro";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const CameraPage: React.FC = () => {
  const camera = useRef<CameraType>(null);
  const [image, setImage] = useState<string>();
  const [cameraStarted, setCameraStarted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"camera" | "file" | null>(
    null,
  );
  const [uploadSuccess, setUploadSuccess] = useState(false);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadMethod("file");
      // カメラ状態をリセット
      setImage(undefined);
      setCameraStarted(false);
    }
  };

  const uploadImage = () => {
    console.log("画像をアップロードしました");
    setUploadSuccess(true);
  };

  const resetFileSelection = () => {
    setSelectedFile(null);
    setUploadMethod(null);
    setUploadSuccess(false);
  };

  return (
    <div className="relative min-h-screen bg-sky-100 pt-16">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full h-16 bg-sky-300 shadow z-20 flex items-center justify-center">
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
      {!cameraStarted &&
        image &&
        uploadMethod === "camera" &&
        !uploadSuccess && (
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
                  <Button onClick={uploadImage}>アップロード</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      {/* ファイル選択結果表示 */}
      {selectedFile && uploadMethod === "file" && !uploadSuccess && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>選択したファイル</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center">{selectedFile.name}</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={resetFileSelection} variant="secondary">
                  別のファイルを選択
                </Button>
                <Button onClick={uploadImage}>アップロード</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* アップロード成功画面 */}
      {uploadSuccess && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>アップロード成功</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center">画像のアップロードに成功しました</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={resetFileSelection}>トップに戻る</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 初期画面 */}
      {!cameraStarted && !image && !selectedFile && !uploadSuccess && (
        <div className="flex justify-center items-center min-h-screen p-4">
          <Card className="w-full max-w-md mt-4">
            <CardHeader>
              <CardTitle>シーンを撮影しましょう</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">カメラで撮影</h3>
                <div className="flex justify-center">
                  <Button
                    onClick={() => {
                      setCameraStarted(true);
                      setUploadMethod("camera");
                    }}
                  >
                    カメラを起動する
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">ファイルを選択</h3>
                <div className="grid w-full max-w-sm items-center gap-1.5 mx-auto">
                  <Label htmlFor="picture">画像ファイル</Label>
                  <Input
                    id="picture"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CameraPage;
