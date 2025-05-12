import type { RoomState } from "./types";

export class RoomObject {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  room: RoomState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      const data = await request.json();
      this.room = data as RoomState;
      await this.storage.put('room', data);
      return new Response('Room initialized');
    }

    if (url.pathname === '/info') {
      const data = await this.storage.get('room');
      return Response.json(data);
    }

    return new Response('Not found', { status: 404 });
  }
}
