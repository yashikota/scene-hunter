```txt
npm install
npm run dev
```

```mermaid
graph TD
    A[Start] --> B[Create Room]
    B --> C[Players Join Room with Room Code]
    C --> D[Set Game Master]
    D --> E[Game Master Takes Photo]
    E --> F[AI Extracts Features/Creates Hints]
    F --> G[Hunters Receive First Hint]
    G --> H[Additional Hints Every 10 seconds]
    H --> I[Hunters Take Photos]
    I --> J[Compare Photos & Calculate Scores]
    J --> K[End Round & Show Results]
    K --> L{More Rounds?}
    L -- Yes --> M[New Game Master?]
    M -- Yes --> N[Change Game Master]
    M -- No --> E
    L -- No --> O[Show Final Leaderboard]
    O --> P[End Game]
```

### API Endpoints

#### Room Management
- `POST /rooms` - Create a new room
- `GET /rooms/:roomId/info` - Get room information
- `POST /rooms/:roomId/join` - Join an existing room
- `PUT /rooms/:roomId/gamemaster` - Change the game master
- `POST /rooms/:roomId/leave` - Leave a room
- `PUT /rooms/:roomId/settings` - Update room settings
- `GET /rooms/:roomId/leaderboard` - Get leaderboard

#### Round Management
- `POST /rooms/:roomId/start` - Start a new round
- `POST /rounds/:roundId/photo` - Submit a photo
- `POST /rounds/:roundId/end` - End the current round
- `GET /rounds/:roundId` - Get round information
- `GET /rooms/:roomId/rounds` - List all rounds in a room

### Components

#### Server Components
- `RoomObject` - Durable Object managing room and round state
- Handler functions for each API endpoint
- Python service for image similarity comparison

#### Client Components
- `GameRoom` - Manages overall room state and player interactions
- `GameRound` - Handles round-specific gameplay and hint display
- `Leaderboard` - Displays player rankings