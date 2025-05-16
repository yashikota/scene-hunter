// handlers/gamemasterPhotoHandler.ts
import type { RoomState, RoundState, Hint } from '../types';
import { Hono } from "hono"
import { GoogleGenAI, Type } from "@google/genai";

// スタブ: AIサービスからヒントを生成する関数
async function generateHintsFromAI(photoId: string, env: any): Promise<string[]> {

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
    const body = await c.req.parseBody()
    const file = body["file"] as File

    if (!file) {
        return c.json({ error: "ファイルがアップロードされていません" }, 400)
    }

    try {
        // ファイルをBase64に変換
        const arrayBuffer = await file.arrayBuffer()
        const base64Image = btoa(
        new Uint8Array(arrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), "")
        )

        // Gemini APIで画像を解析
        const contents = [
        {
            inlineData: {
            mimeType: file.type,
            data: base64Image,
            },
        },
        { text: "この画像の特徴を5つ挙げて。日本語で" },
        ];

        const response = await ai.models.generateContent({
        model: "gemini-2.5-pro-exp-03-25",
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

        // string[]を直接返さず、必ずResponse型で返す
        const result = JSON.parse(response.text || "{\"result\":[]}").result;
        if (Array.isArray(result)) {
            return c.json({ result }, 200);
        } else {
            return c.json({ result: [] }, 200);
        }
    } catch (error) {
        return c.json({ result: [] }, 200);
    }
    })
    // 関数本体の最後で空配列を返すことで型エラーを防ぐ
    return [];
}

export async function handleSubmitGamemasterPhoto(
  room: RoomState,
  player_internal_id: string, // GMのinternal_id
  formData: FormData,
  env: any // For R2 and AI service access
): Promise<Response> {
  const currentRoundId = `round_${room.current_round_number}`;
  const round = room.round_states[currentRoundId];

  if (!round || round.status !== 'gamemaster_turn') {
    return new Response('Not in gamemaster turn or round not found.', { status: 400 });
  }
  if (round.gamemaster_internal_id !== player_internal_id) {
    return new Response('Only the designated Gamemaster can submit a photo.', { status: 403 });
  }

  const photoFile = formData.get('photo') as File;
  if (!photoFile) {
    return new Response('Photo file is required.', { status: 400 });
  }

  // TODO: 写真をR2などに保存する処理
  // const masterPhotoId = `room_${room.id}_round_${round.round_number}_gm_${crypto.randomUUID()}`;
  // await env.R2_BUCKET.put(masterPhotoId, await photoFile.arrayBuffer());
  const masterPhotoId = `stub_master_photo_${crypto.randomUUID()}`; // 仮ID
  round.master_photo_id = masterPhotoId;
  round.master_photo_submitted_at = new Date().toISOString();

  // AIからヒントを生成
  const hintTexts = await generateHintsFromAI(masterPhotoId, env);
  if (hintTexts.length === 0) {
      return new Response('Failed to generate hints from AI.', {status: 500});
  }
  round.ai_generated_hints = hintTexts.slice(0, room.settings.max_hints).map(text => ({ text, is_revealed: false }));
  
  // ハンターターンに移行
  round.status = 'hunter_turn';
  const now = new Date();
  round.turn_start_time = now.toISOString(); // ハンターターンの開始時刻
  round.turn_expires_at = new Date(now.getTime() + room.settings.turn_duration_seconds * 1000).toISOString();
  
  // 最初のヒントを開示
  if (round.ai_generated_hints.length > 0) {
    round.ai_generated_hints[0].is_revealed = true;
    round.revealed_hints_count = 1;
    if (room.settings.max_hints > 1) { // 2つ目以降のヒントがあればアラーム設定
        round.next_hint_reveal_time = new Date(now.getTime() + room.settings.hint_interval_seconds * 1000).toISOString();
    }
  }

  console.log(`Room ${room.code}: GM photo submitted. Hunter turn started. Expires: ${round.turn_expires_at}. Next hint: ${round.next_hint_reveal_time || 'N/A'}`);

  return new Response(JSON.stringify({
    message: 'Gamemaster photo submitted. Hunter turn begins!',
    master_photo_id: masterPhotoId,
    hunter_turn_expires_at: round.turn_expires_at,
    first_hint: round.ai_generated_hints[0]?.text,
    next_hint_reveal_time: round.next_hint_reveal_time,
  }), { headers: { 'Content-Type': 'application/json' }});
}