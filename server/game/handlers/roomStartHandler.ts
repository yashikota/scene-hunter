// handlers/roomStartHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { Round, RoomState } from '../types';
import { randomUUID } from 'crypto';
import { generateHintsFromPhoto } from './generateHintsFromPhoto';

export async function handleRoomStart(
  storage: DurableObjectStorage,
  request: Request,
  roomId: string
): Promise<Response> {
  try {
    // 認証チェック
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // リクエストボディの解析
    const body = await request.json() as { gamemaster_id: string; photo: string };
    const { gamemaster_id, photo } = body;
    
    if (!gamemaster_id || !photo) {
      return new Response('Missing gamemaster_id or photo', { status: 400 });
    }
    
    // ルームの取得
    const room = await storage.get<RoomState>(`room:${roomId}`);
    if (!room) {
      return new Response('Room not found', { status: 404 });
    }
    
    // ルームステータスのチェック
    if (room.status !== 'waiting' && room.status !== 'in_progress') {
      return new Response('Room is not in a startable state', { status: 400 });
    }
    
    // ゲームマスターのチェック
    const gamemaster = room.players.find(p => p.player_id === gamemaster_id);
    if (!gamemaster || gamemaster.role !== 'gamemaster') {
      return new Response('Invalid game master', { status: 400 });
    }
    
    // プレイヤー数のチェック (3人以上必要)
    if (room.players.length < 3) {
      return new Response('Not enough players (minimum 3 required)', { status: 400 });
    }
    
    // 現在のラウンド番号を更新
    room.currentRound += 1;
    if (room.currentRound > room.rounds) {
      return new Response('All rounds completed', { status: 400 });
    }
    
    // 写真を保存 (実際の実装ではR2などのストレージに保存)
    const photo_id = `${roomId}_master_${room.currentRound}_${Date.now()}`;
    // TODO: ここで写真をストレージにアップロード
    
    // 写真URLの生成 (実際の実装に合わせて調整)
    const photoUrl = `https://your-storage-url.com/${photo_id}`;
    
    // 画像データを取得
    const photoResponse = await fetch(photoUrl);
    const photoArrayBuffer = await photoResponse.arrayBuffer();
    const mimeType = photoResponse.headers.get('Content-Type') || 'image/jpeg';
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
    // AIを使用して写真からヒントを生成
    const hints = await generateHintsFromPhoto(
      photoArrayBuffer,
      mimeType,
      GEMINI_API_KEY,
      5 // 5つのヒントを生成
    );
    
    // 新しいラウンドの作成
    const roundId = randomUUID();
    const round: Round = {
      round_id: roundId,
      room_id: roomId,
      round_number: room.currentRound,
      start_time: new Date().toISOString(),
      end_time: '', // ラウンド終了時に設定
      state: 'in_progress',
      master_photo_id: photo_id,
      hints,
      revealed_hints: 1, // 最初は1つ目のヒントだけを表示
      submissions: []
    };
    
    // ルームのステータスを更新
    room.status = 'in_progress';
    if (!room.roundStates) {
      room.roundStates = {};
    }
    room.roundStates[roundId] = round;
    
    // ストレージに保存
    await storage.put(`room:${roomId}`, room);
    await storage.put(`round:${roundId}`, round);
    
    // 10秒ごとにヒントを追加するタイマーを設定（実際の実装ではウェブワーカーなどで処理）
    // Note: これはサーバーサイドの概念的実装で、実際にはクライアント側でタイマーを管理する場合が多い
    
    return new Response(JSON.stringify({
      round_id: roundId,
      round_number: room.currentRound,
      start_time: round.start_time,
      first_hint: hints[0] // 最初のヒントだけを返す
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in handleRoomStart:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}