# WatchParty

Watch YouTube videos in sync with friends.

-github link- https://github.com/muskan-kushwaha01/WatchPartySystem.git

## Live Links

- **Frontend:** https://watchpartysystem.onrender.com/
- **Backend:** https://watchparty-usbv.onrender.com/

## Setup

### Server
```bash
cd server
npm install
npm run dev
```

### Client
```bash
cd client
npm install
npm run dev
```

## Environment Variables

**server/.env**
```
MONGO_URI=your_mongodb_connection_string
```

**client/.env**
```
VITE_BACKEND_URL=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Architecture Overview

Here's a quick breakdown of how everything fits together:

```
Browser (React)
    │
    ├── talks to the server via Socket.IO (real-time events)
    │       → join room, play/pause/seek, chat, reactions
    │
    ├── loads YouTube videos using the YouTube IFrame API (react-youtube)
    │
    └── optionally signs in the user via Firebase Google Auth
            → after login, sends user info to the backend to save in MongoDB

Node.js Server (Express + Socket.IO)
    │
    ├── keeps all active rooms in memory (participants, video state, chat history)
    │
    ├── when a host plays/pauses/seeks → broadcasts that event to everyone in the room
    │
    ├── when a new user joins → asks the host for the current video timestamp
    │       → sends it to the new user so they start from the right place
    │
    ├── handles host transfer, moderator roles, and kicking users
    │
    └── optionally connects to MongoDB to persist room and user data
```

**In short:** The server is the middleman. Every action (play, pause, chat, etc.) goes from one user → server → all other users in the room. The YouTube player on each client just follows those instructions.
