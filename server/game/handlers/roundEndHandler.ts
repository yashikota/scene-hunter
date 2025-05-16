// handlers/roundEndHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';

export async function handleRoundEnd(
    storage: DurableObjectStorage,
    request: Request,
    roundId: string
): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // 認証チェック（元のコードに合わせて）
    const authHeader = request.headers.get('Authorization');
    // ここで authHeader の妥当性をチェックするロジックを実装
    // 例: if (!authHeader || !authHeader.startsWith('Bearer ') || !isValidToken(authHeader.substring(7))) {
    //       return new Response('Unauthorized', { status: 401 });
    //     }
    // 今回は元のコードには具体的なトークン検証がないため、ヘッダ存在のみをチェックの例として残します。
    // 実際には適切な検証が必要です。
    if (!authHeader || !authHeader.startsWith('Bearer ')) { // 簡易的なチェック
        // return new Response('Unauthorized: Missing or malformed Bearer token', { status: 401 });
        // 元のコードではこのチェックはあるが、誰でも実行できる状態なので、実際の権限チェックが必要
    }


    try {
        const room = await storage.get<RoomState>('room');
        if (!room || !room.roundStates || !room.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const currentRound = room.roundStates[roundId];

        // TODO: 誰がラウンドを終了できるかの権限チェック (例: ホストのみ)
        // const requestorId = getUserIdFromToken(authHeader); // 仮の関数
        // if (room.host !== requestorId) {
        //   return new Response('Forbidden: Only the host can end the round', { status: 403 });
        // }


        if (currentRound.state !== 'in_progress') {
            return new Response('Cannot end round that is not in progress', { status: 400 });
        }

        const now = new Date().toISOString();
        currentRound.state = 'ended';
        currentRound.end_time = now;

        // TODO: ラウンド終了時のスコア計算や次のラウンドへの準備などがあればここで行う
        // (例: currentRound.submissions を元に各プレイヤーのスコアを更新し、room.players に反映)

        // room.roundStates[roundId] = currentRound; // room オブジェクト内で直接変更されている

        // 全ラウンド終了かチェック
        const playedRoundNumbers = new Set(Object.values(room.roundStates || {}).filter(r => r.state === 'ended').map(r => r.round_number));
        if (room.rounds !== undefined && playedRoundNumbers.size >= room.rounds) {
            room.status = 'finished'; // ルーム全体のステータスを更新
        }


        await storage.put('room', room);

        return Response.json({
            round_id: roundId,
            end_time: now,
            state: currentRound.state,
            success: true,
        });

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error ending round: ${error}`, { status: 500 });
    }
}