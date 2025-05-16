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
        if (!room || !room.round_states || !room.round_states[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const currentRound = room.round_states[roundId];
        if (currentRound.status !== 'hunter_turn') {
            return new Response('Cannot submit photo when round is not in hunter_turn', { status: 400 });
        }

        const photo_id = crypto.randomUUID();

        const submission_time = new Date().toISOString();

        // ハンター提出物をhunter_submissionsに保存
        if (!currentRound.hunter_submissions) currentRound.hunter_submissions = {};
        currentRound.hunter_submissions[player_id as string] = {
            player_internal_id: player_id as string,
            photo_id,
            submitted_at: submission_time,
            image_match_score: 0,
            time_bonus: 0,
            points_earned: 0,
        };

        await storage.put('room', room);

        return Response.json({
            photo_id,
            submission_time,
            player_id,
        });

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error submitting photo: ${error}`, { status: 500 });
    }
}