import React, { useRef, useState } from "react";
import {Camera} from "react-camera-pro";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type CameraRef = {
  takePhoto: () => string;
};

const CameraPage: React.FC = () => {
  //const camera = useRef<CameraRef>(null);
    const camera = useRef<unknown>(null);
  const [image, setImage] = useState<string>();

  const capture = () => {
    if (camera.current) {
      const photo = camera.current.takePhoto();
      setImage(photo);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen p-4 bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>カメラで写真を撮る</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!image ? (
            <>
              <div className="aspect-w-4 aspect-h-3">
                <Camera ref={camera} facingMode="environment" errorMessages={{}} />
              </div>
              <Button onClick={capture}>写真を撮る</Button>
            </>
          ) : (
            <>
              <img src={image} alt="撮影した写真" className="rounded" />
              <div className="flex gap-2">
                <Button onClick={() => setImage(undefined)}>もう一度撮る</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CameraPage;
