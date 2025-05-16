import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Round, Submission } from '../types';
import { GoogleGenAI } from '@google/genai';
import { generateHintsFromPhoto } from './generateHintsFromPhoto';

export async function handleRoundPhoto(
  storage: DurableObjectStorage,
  request: Request,
  roundId: string,
  env?: any
): Promise<Response> {
  console.log(`[DEBUG] handleRoundPhoto called for roundId: ${roundId}`);
  
  try {
    // 認証チェック
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      console.log('[DEBUG] Authorization failed');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // マルチパートフォームデータの解析
    console.log('[DEBUG] Parsing form data');
    const formData = await request.formData();
    const player_id = formData.get('player_id') as string;
    const photo = formData.get('photo') as File;

    console.log(`[DEBUG] Received form data: player_id=${player_id}, photo=${photo ? photo.name : 'missing'}`);

    if (!player_id || !photo) {
      console.log('[DEBUG] Missing player_id or photo');
      return new Response('Missing player_id or photo', { status: 400 });
    }

    // ラウンド情報の取得
    console.log(`[DEBUG] Fetching round: ${roundId}`);
    const round = await storage.get<Round>(`round:${roundId}`);
    if (!round) {
      console.log('[DEBUG] Round not found');
      return new Response('Round not found', { status: 404 });
    }

    // ラウンドが進行中かチェック
    console.log(`[DEBUG] Round state: ${round.state}`);
    if (round.state !== 'in_progress') {
      console.log('[DEBUG] Round is not in progress');
      return new Response('Round is not in progress', { status: 400 });
    }

    // ルーム情報を取得してプレイヤーがハンターか確認
    console.log(`[DEBUG] Fetching room: ${round.room_id}`);
    const room = await storage.get<any>(`room:${round.room_id}`);
    if (!room) {
      console.log('[DEBUG] Room not found');
      return new Response('Room not found', { status: 404 });
    }

    // プレイヤーがゲームマスターの場合（マスター写真の提出処理）
    console.log(`[DEBUG] Finding player ${player_id} in room`);
    const player = (room.players as Array<any>).find((p: any) => p.player_id === player_id);
    if (!player) {
      console.log('[DEBUG] Player not in room');
      return new Response('Player not in room', { status: 400 });
    }

    // 写真のArrayBufferを取得
    console.log('[DEBUG] Getting photo buffer');
    const photoArrayBuffer = await photo.arrayBuffer();
    console.log(`[DEBUG] Photo buffer size: ${photoArrayBuffer.byteLength} bytes`);

    // ゲームマスターの場合はマスター写真を設定し、ヒントを生成する
    if (player.role === 'gamemaster') {
      console.log('[DEBUG] Player is gamemaster, handling master photo submission');
      
      if (round.master_photo_id) {
        console.log('[DEBUG] Master photo already submitted');
        return new Response('Master photo already submitted', { status: 400 });
      }

      // 写真をアップロード (実際の実装ではR2などのストレージに保存)
      const photo_id = `master_${roundId}_${Date.now()}`;
      console.log(`[DEBUG] Generated master photo ID: ${photo_id}`);
      // TODO: ここで写真をストレージにアップロード
      
      // マスター写真IDを設定
      round.master_photo_id = photo_id;
      
      try {
        // Gemini APIキーがある場合はヒントを生成
        if (env && env.GEMINI_API_KEY) {
          console.log('[DEBUG] GEMINI_API_KEY found, generating hints');
          console.log(`[DEBUG] Photo MIME type: ${photo.type}`);
          
          const hints = await generateHintsFromPhoto(
            photoArrayBuffer,
            photo.type,
            env.GEMINI_API_KEY,
            5 // 5つのヒントを生成
          );
          
          console.log(`[DEBUG] Hints generated: ${JSON.stringify(hints)}`);
          
          // ヒントをラウンド情報に保存
          round.hints = hints;
        } else {
          console.log('[DEBUG] No GEMINI_API_KEY found in env');
        }
      } catch (error) {
        console.error('[ERROR] Error generating hints:', error);
        // ヒント生成に失敗してもゲームは継続（ヒントはオプション機能）
      }
      
      // ラウンド状態を更新
      console.log('[DEBUG] Updating round state with master photo');
      await storage.put(`round:${roundId}`, round);
      
      return new Response(JSON.stringify({
        photo_id,
        hints: round.hints || []
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // ハンターの写真提出処理（ゲームマスターでない場合）
    console.log('[DEBUG] Player is hunter, handling hunter photo submission');
    
    // プレイヤーが既に提出済みかチェック
    if (round.submissions.some(sub => sub.player_id === player_id)) {
      console.log('[DEBUG] Player already submitted a photo');
      return new Response('Player already submitted a photo', { status: 400 });
    }

    // マスター写真がまだ設定されていない場合
    if (!round.master_photo_id) {
      console.log('[DEBUG] Master photo not yet submitted');
      return new Response('Master photo not yet submitted', { status: 400 });
    }

    // 写真をアップロード (実際の実装ではR2などのストレージに保存)
    const photo_id = `${roundId}_${player_id}_${Date.now()}`;
    console.log(`[DEBUG] Generated hunter photo ID: ${photo_id}`);
    // TODO: ここで写真をストレージにアップロード
    
    // 画像比較サービスへリクエスト (Python FastAPIサービス)
    const masterPhotoUrl = `https://your-storage-url.com/${round.master_photo_id}`; // 実際のURL
    const playerPhotoUrl = `https://your-storage-url.com/${photo_id}`; // 実際のURL
    
    console.log('[DEBUG] Comparing images');
    console.log(`[DEBUG] Master photo URL: ${masterPhotoUrl}`);
    console.log(`[DEBUG] Player photo URL: ${playerPhotoUrl}`);
    
    const compareResponse = await fetch('https://your-python-service.com/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image1_url: masterPhotoUrl,
        image2_url: playerPhotoUrl
      })
    });
    
    if (!compareResponse.ok) {
      console.log(`[DEBUG] Image comparison failed with status: ${compareResponse.status}`);
      return new Response('Failed to compare images', { status: 500 });
    }
    
    const compareData = await compareResponse.json();
    console.log(`[DEBUG] Image comparison result: ${JSON.stringify(compareData)}`);
    const { similarity_score } = compareData as { similarity_score: number };
    
    // 残り時間の計算 (60秒制限)
    const startTime = new Date(round.start_time).getTime();
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - startTime) / 1000;
    const remainingSeconds = Math.max(0, 60 - elapsedSeconds); // 60秒制限
    
    console.log(`[DEBUG] Time calculation: startTime=${startTime}, currentTime=${currentTime}`);
    console.log(`[DEBUG] elapsedSeconds=${elapsedSeconds}, remainingSeconds=${remainingSeconds}`);
    
    // スコアの計算: 画像の類似性スコア
    const match_score = similarity_score;
    
    // 合計スコア: 画像の類似性 + 残り時間
    const total_score = match_score + remainingSeconds;
    console.log(`[DEBUG] Scores: match_score=${match_score}, total_score=${total_score}`);
    
    // 提出情報の作成
    const submission: Submission = {
      player_id,
      photo_id,
      submission_time: new Date().toISOString(),
      remaining_seconds: remainingSeconds,
      match_score,
      total_score
    };
    
    // ラウンドの提出情報を更新
    console.log('[DEBUG] Updating round with submission');
    round.submissions.push(submission);
    await storage.put(`round:${roundId}`, round);
    
    // プレイヤーのスコアを更新
    console.log('[DEBUG] Updating player score');
    player.score += total_score;
    await storage.put(`room:${round.room_id}`, room);
    
    return new Response(JSON.stringify({
      photo_id,
      match_score,
      remaining_seconds: remainingSeconds,
      total_score,
      hints: round.hints || [] // ヒントも返す
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[ERROR] Error in handleRoundPhoto:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}