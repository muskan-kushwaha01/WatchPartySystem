# WatchParty

Watch YouTube videos in sync with friends.

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
