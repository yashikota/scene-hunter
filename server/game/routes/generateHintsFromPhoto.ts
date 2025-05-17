// generateHintsFromPhoto.ts
import { Hono } from "hono"
import { GoogleGenAI, Type } from "@google/genai";

type Bindings = {
  GEMINI_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get("/", (c) => {
  return c.text("Hello Hono!")
})

app.post("/upload", async (c) => {
  // APIキーを取得
  const apiKey = c.env.GEMINI_API_KEY
  if (!apiKey) {
    return c.json({ error: "APIキーが設定されていません" }, 500)
  }
  const ai = new GoogleGenAI({ apiKey: apiKey });
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "リクエストボディが不正です（JSON形式で送信してください）" }, 400);
  }
  const imageUrl = body["image_url"] as string;
  //const imageUrl = "https://scene-hunter-image.yashikota.workers.dev/file/test.jpg";
  if (!imageUrl) {
    return c.json({ error: "画像URLが送信されていません" }, 400)
  }

  try {
    console.log("画像URL:", imageUrl);
    // 画像URLから画像データを取得しBase64に変換
    const imageResponse = await fetch(imageUrl);
    console.log("imageResponse status:", imageResponse.status);
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    console.log("imageArrayBuffer byteLength:", imageArrayBuffer.byteLength);
    const base64ImageData = Buffer.from(new Uint8Array(imageArrayBuffer)).toString('base64');
    console.log("base64ImageData length:", base64ImageData.length);

    // Gemini APIで画像を解析
    const contents = [
      {
        inlineData: {
          mimeType: "image/jpeg", // 必要に応じて動的に変更
          data: base64ImageData,
        },
      },
      { text: "`Describe this image in as much detail as possible, focusing on all visible elements (e.g., furniture, objects, people) and their positions on the screen. Specify where each object appears in the frame (e.g., top-left, bottom center, slightly right of center), their size relative to other items, and how they overlap or relate spatially.Include information that helps a user recreate the same photo, such as the camera angle, height, distance, and framing (e.g., centered composition, tilted view). Use Japanese for output.Do not include weather, lighting, or environmental conditions—focus strictly on the layout and visual arrangement of elements within the indoor space.この画像の特徴的な要素を5つ挙げてください。それぞれヒントとして使えるように簡潔に書いてください。日本語で回答してください。`;" },
    ];

    console.log("Gemini APIリクエスト:", JSON.stringify(contents).slice(0, 500));
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            result: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              },
              description: "画像の5つの特徴",
              minItems: "5",
              maxItems: "5"
            }
          }
        }
      }
    });
    console.log("Gemini APIレスポンス:", geminiResponse.text);
    return c.json(JSON.parse(geminiResponse.text || "{\"result\":[]}"))
  } catch (error) {
    console.error("エラー詳細:", error);
    return c.json({ error: "画像の解析に失敗しました" }, 500)
  }
})

export default app;