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
        const photo_url = formData.get('photo_url');

        if (typeof player_id !== 'string' || typeof photo_url !== 'string') {
            return new Response('Invalid submission: player_id (string) and photo_url (string) are required.', { status: 400 });
        }

        const room = await storage.get<RoomState>('room');
        if (!room || !room.roundStates || !room.roundStates[roundId]) {
            return new Response('Round not found', { status: 404 });
        }

        const currentRound = room.roundStates[roundId];
        if (currentRound.state !== 'in_progress') {
            return new Response('Cannot submit photo when round is not in progress', { status: 400 });
        }

        // player_idとphoto_urlの対応を保存
        const submission_time = new Date().toISOString();

        const timeSinceStart = (new Date().getTime() - new Date(currentRound.start_time).getTime()) / 1000;
        const roundDuration = 60;
        const remaining_seconds = Math.max(0, Math.floor(roundDuration - timeSinceStart));

        const newSubmission: Submission = {
            player_id,
            photo_id: photo_url, // photo_urlをphoto_idとして保存
            submission_time,
            remaining_seconds,
            match_score: 0,
            total_score: 0,
        };

        currentRound.submissions = currentRound.submissions || [];
        currentRound.submissions.push(newSubmission);

        await storage.put('room', room);

        return Response.json({
            player_id: newSubmission.player_id,
            photo_url: newSubmission.photo_id,
            submission_time: newSubmission.submission_time,
        });

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        return new Response(`Error submitting photo: ${error}`, { status: 500 });
    }
}