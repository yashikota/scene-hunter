// generateHintsFromPhoto.ts
import { GoogleGenAI, Type } from "@google/genai";

/**
 * 画像から特徴的なヒントを抽出する関数
 * @param imageBuffer 画像のArrayBuffer
 * @param mimeType 画像のMIMEタイプ (例: "image/jpeg")
 * @param apiKey Gemini AIのAPIキー
 * @param hintCount 生成するヒントの数 (デフォルト: 5)
 * @returns ヒントの配列
 */
export async function generateHintsFromPhoto(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  apiKey: string,
  hintCount: number = 5
): Promise<string[]> {
  console.log(`[DEBUG] generateHintsFromPhoto called with mimeType: ${mimeType}, hintCount: ${hintCount}`);
  console.log(`[DEBUG] Image buffer size: ${imageBuffer.byteLength} bytes`);
  
  if (!apiKey) {
    console.log('[DEBUG] No API key provided');
    throw new Error("Gemini APIキーが設定されていません");
  }

  try {
    // ArrayBufferをBase64に変換
    console.log('[DEBUG] Converting ArrayBuffer to Base64');
    const base64Image = btoa(
      new Uint8Array(imageBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), "")
    );
    console.log(`[DEBUG] Base64 image length: ${base64Image.length}`);

    // Gemini AIクライアントを初期化
    console.log('[DEBUG] Initializing Gemini AI client');
    const ai = new GoogleGenAI({ apiKey });

    // Gemini APIリクエストの内容
    const promptText = `この画像の特徴的な要素を${hintCount}つ挙げてください。それぞれヒントとして使えるように簡潔に書いてください。日本語で回答してください。`;
    console.log(`[DEBUG] Prompt text: ${promptText}`);
    
    const contents = [
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
      { text: promptText },
    ];

    // Gemini APIで画像を解析
    console.log('[DEBUG] Sending request to Gemini API');
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro-exp-03-25",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hints: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              },
              description: `画像から抽出した${hintCount}つのヒント`,
              minItems: String(hintCount),
              maxItems: String(hintCount)
            }
          }
        }
      }
    });

    console.log('[DEBUG] Received response from Gemini API');
    console.log(`[DEBUG] Raw response text: ${response.text}`);
    
    // レスポンスからヒントを取得
    const parsedResponse = JSON.parse(response.text || `{"hints":[]}`)
    console.log(`[DEBUG] Parsed response: ${JSON.stringify(parsedResponse)}`);
    
    const hints = parsedResponse.hints || [];
    console.log(`[DEBUG] Extracted hints: ${JSON.stringify(hints)}`);
    return hints;
  } catch (error) {
    console.error('[ERROR] Error in generateHintsFromPhoto:', error);
    throw new Error("画像の解析に失敗しました");
  }
}