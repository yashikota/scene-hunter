// handlers/initHandler.ts
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { RoomState } from '../types';

export async function handleInit(
  storage: DurableObjectStorage,
  request: Request
): Promise<{ response: Response; roomState?: RoomState }> {
  if (request.method !== 'POST') {
    return { response: new Response('Method Not Allowed', { status: 405 }) };
  }
  try {
    const data = (await request.json()) as RoomState;
    // TODO: dataに対するバリデーションをここに追加することを推奨
    await storage.put('room', data);
    return { response: new Response('Room initialized'), roomState: data };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { response: new Response(`Invalid JSON: ${errorMsg}`, { status: 400 }) };
  }
}