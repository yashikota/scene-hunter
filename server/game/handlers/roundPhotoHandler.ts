// handlers/roundPhotoHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState, Submission } from '../types';
import { notifyRoomEvent } from '../roomObject';

// スコア取得関数
async function getMatchScore(image1_url: string, image2_url: string): Promise<number> {
  console.log('送信する画像比較リクエスト:', {
    image1_url: image1_url,
    image2_url: image2_url,
  });  
  
  const response = await fetch('https://app-e2f392d6-88b6-48d8-85f6-46fb5211b218.ingress.apprun.sakura.ne.jp/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image1_url: image1_url,
            image2_url: image2_url
        })
    });

    if (!response.ok) {
        throw new Error(`画像比較APIエラー: ${response.statusText}`);
    }
    
    const data = await response.json() as { similarity_score?: number };
    console.log('画像比較APIレスポンス:', data);
    return typeof data.similarity_score === 'number' ? data.similarity_score : 0;
}

export async function handleRoundPhoto(
    storage: DurableObjectStorage,
    request: Request,
    roundId: string
): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        let player_id: string | undefined;
        let image_url: string | undefined;
        let remaining_seconds: number = 0;
        const contentType = request.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
            const body = await request.json() as Record<string, unknown>;
            player_id = typeof body.player_id === 'string' ? body.player_id : undefined;
            image_url = typeof body.image_url === 'string' ? body.image_url : (typeof body.image_url === 'string' ? body.image_url : undefined);
            remaining_seconds = typeof body.remaining_seconds === 'number' ? body.remaining_seconds : 0;
        } else {
            const formData = await request.formData();
            player_id = formData.get('player_id') as string;
            image_url = formData.get('image_url') as string || formData.get('image_url') as string;
            const rem = formData.get('remaining_seconds');
            remaining_seconds = typeof rem === 'string' && !isNaN(Number(rem)) ? Number(rem) : 0;
        }

        if (typeof player_id !== 'string' || typeof image_url !== 'string') {
            return new Response('Invalid submission: player_id (string) and image_url (string) are required.', { status: 400 });
        }

        const room = await storage.get<RoomState>('room');
        if (!room || !room.roundStates || !room.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const currentRound = room.roundStates[roundId];
        if (currentRound.state !== 'in_progress') {
            return new Response('Cannot submit photo when round is not in progress', { status: 400 });
        }

        // player_idとimage_urlの対応を保存
        const submission_time = new Date().toISOString();

        if (player_id === room.host) {
            currentRound.master_photo_id = image_url;
            await storage.put('room', room);
            return Response.json({
                player_id,
                image_url,
                submission_time,
            });
        }

        // サーバー側でremaining_secondsを計算しない
        // スコア取得
        const master_image_url = currentRound.master_photo_id;
        if (!master_image_url || !image_url) {
            return new Response('master_photo_idまたはimage_urlが未設定です', { status: 400 });
        }
        let match_score = 0;
        try {
            match_score = await getMatchScore(master_image_url, image_url);
            console.log(`match_score: ${match_score}`);
        } catch (err) {
            console.warn(`スコア取得失敗: ${err}`);
            match_score = 0;
        }

        const total_score = parseFloat((match_score + (remaining_seconds/2)).toFixed(2));
        console.log(`total_score: ${total_score}`);
        const newSubmission: Submission = {
            player_id,
            photo_id: image_url, // image_urlをphoto_idとして保存
            submission_time,
            remaining_seconds,
            match_score,
            total_score,
        };

        currentRound.submissions = currentRound.submissions || [];
        currentRound.submissions.push(newSubmission);

        // プレイヤーのスコア加算処理
        const player = room.players.find(p => p.player_id === player_id);
        if (player) {
            player.score += total_score;
        }

        await storage.put('room', room);

        // 写真提出通知イベント
        await notifyRoomEvent(room.code, 'game.photo_submitted', `写真が提出されました: ${player_id}`);

        return Response.json({
            player_id: newSubmission.player_id,
            image_url: newSubmission.photo_id,
            submission_time: newSubmission.submission_time,
        });

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error submitting photo: ${error}`, { status: 500 });
    }
}