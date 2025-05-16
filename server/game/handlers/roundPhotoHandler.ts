// handlers/roundPhotoHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Submission } from '../types';

export async function handleRoundPhoto(
    storage: DurableObjectStorage,
    request: Request,
    roundId: string
): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const formData = await request.formData();
        const player_id = formData.get('player_id');
        const photo = formData.get('photo'); // Fileオブジェクトを期待

        if (typeof player_id !== 'string' || !(photo instanceof File)) {
            return new Response('Invalid submission: player_id (string) and photo (file) are required.', { status: 400 });
        }

        const room = await storage.get<RoomState>('room');
        if (!room || !room.roundStates || !room.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const currentRound = room.roundStates[roundId];
        if (currentRound.state !== 'in_progress') {
            return new Response('Cannot submit photo when round is not in progress', { status: 400 });
        }

        // TODO: 写真をR2などに実際にアップロードする処理
        // const photoBuffer = await photo.arrayBuffer();
        // const photoKey = `rooms/${room.id}/rounds/${roundId}/photos/${player_id}-${photo.name}`;
        // await env.YOUR_R2_BUCKET.put(photoKey, photoBuffer);
        const photo_id = crypto.randomUUID(); // R2のキーやIDなど、永続化された写真のID

        const submission_time = new Date().toISOString();

        // 残り時間の計算 (元のコードでは固定値60, ここでは仮の値)
        // 本来はラウンド開始時刻と現在時刻から計算
        const timeSinceStart = (new Date().getTime() - new Date(currentRound.start_time).getTime()) / 1000;
        const roundDuration = 60; // 例: ラウンドの制限時間（秒）
        const remaining_seconds = Math.max(0, Math.floor(roundDuration - timeSinceStart));


        const newSubmission: Submission = {
            player_id,
            photo_id, // R2などに保存した写真のID or Key
            submission_time,
            remaining_seconds, // 要計算
            match_score: 0,    // 初期スコア
            total_score: 0,    // 初期スコア
        };

        currentRound.submissions = currentRound.submissions || [];
        currentRound.submissions.push(newSubmission);
        // room.roundStates[roundId] = currentRound; // room オブジェクト内で直接変更されているので不要かも

        await storage.put('room', room);

        return Response.json({
            photo_id: newSubmission.photo_id,
            submission_time: newSubmission.submission_time,
            player_id: newSubmission.player_id,
            // remaining_seconds: newSubmission.remaining_seconds, // 必要なら返す
        });

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error submitting photo: ${error}`, { status: 500 });
    }
}