from fastapi import FastAPI
from pydantic import BaseModel
import requests
import numpy as np
import math
import cv2
import imgsim

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

class CompareRequest(BaseModel):
    image1_url: str
    image2_url: str

@app.post("/compare")
def compare(req: CompareRequest):
    img1 = load_image(req.image1_url)
    img2 = load_image(req.image2_url)
    score = compute_similarity(img1, img2)
    return {"similarity_score": round(score, 4)}

def load_image(url: str):
    response = requests.get(url)
    data = np.frombuffer(response.content, np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

def compute_similarity(img1, img2):
    vtr = imgsim.Vectorizer()
    img1 = cv2.resize(img1, (256, 256))
    img2 = cv2.resize(img2, (256, 256))
    # imgsimライブラリを使用した距離計算
    def custom_decay(x):
        n = 2.49
        k = 0.000918
        return math.exp(-k * (x ** n))
    img1vector = vtr.vectorize(img1)
    img2vector = vtr.vectorize(img2)
    dist = imgsim.distance(img1vector, img2vector)
    score = 100 * custom_decay(dist)
    print(f"imgsim Distance: {dist:.2f}")
    print(f"imgsim Score: {score:.2f}")
    return score
