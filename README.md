# InstaMeet

## Deployment guide

Use:

- `frontend` -> `Vercel`
- `backend` -> `Render`

### 1. Deploy the backend on Render

Create a new `Web Service` on Render and point it to this repository.

Render settings:

- `Root Directory`: `backend`
- `Build Command`: `npm install`
- `Start Command`: `npm start`

Backend environment variables:

```env
JWT_SECRET=your-strong-random-secret
MONGODB_URL=your-mongodb-connection-string
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

Important notes:

- `CORS_ORIGIN` must be your real Vercel frontend URL.
- If you later add a custom frontend domain, update `CORS_ORIGIN` and redeploy.
- Render will provide `PORT` automatically, so you do not need to set it manually.

Recommended Render health check:

- `Health Check Path`: `/api/health`

After deployment, note your backend URL, for example:

```text
https://instameet-api.onrender.com
```

### 2. Deploy the frontend on Vercel

Create a new Vercel project and use the `frontend` folder as the project root.

Vercel settings:

- `Root Directory`: `frontend`
- `Framework Preset`: `Vite`
- `Build Command`: `npm run build`
- `Output Directory`: `dist`

Frontend environment variables:

```env
VITE_API_BASE_URL=https://your-backend-domain.onrender.com
VITE_SOCKET_SERVER_URL=https://your-backend-domain.onrender.com
VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302
VITE_TURN_URLS=turn:your-turn-host:3478?transport=udp,turn:your-turn-host:3478?transport=tcp
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_PASSWORD=your-turn-password
VITE_WEBRTC_ICE_TRANSPORT_POLICY=all
```

Important notes:

- `VITE_API_BASE_URL` and `VITE_SOCKET_SERVER_URL` should both point to the same Render backend base URL.
- The frontend now includes a Vercel SPA rewrite file at [frontend/vercel.json](/home/debarghya/Project/04%20-%20InstaMeet/instameet/frontend/vercel.json:1), so routes like `/room/:roomId` work on refresh.
- After changing any `VITE_*` variable, redeploy the frontend. Vite reads them at build time.

### 3. Update backend CORS after Vercel gives you the final URL

Once Vercel gives you the real frontend URL:

1. Open Render service settings.
2. Set `CORS_ORIGIN` to that exact Vercel URL.
3. Redeploy the backend.

### 4. Test production

After both deployments:

1. Open the Vercel frontend URL.
2. Create or join a room.
3. Open the same room in another browser or device.
4. Test:
   - join/leave
   - audio
   - video
   - screen share
   - room refresh on `/room/...`

### 5. WebRTC production note

Public STUN servers may work for some users, but for reliable production audio/video
across stricter networks, add a TURN server.

## Production WebRTC setup

For local development, the app can work with public STUN servers only.
For a deployed app, you should configure a TURN server as well, otherwise
users on restrictive networks may join the room but fail to exchange audio/video.

### Frontend environment variables

Set these values in the frontend deployment environment before building:

```env
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_SOCKET_SERVER_URL=https://your-backend-domain.com
VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302
VITE_TURN_URLS=turn:your-turn-host:3478?transport=udp,turn:your-turn-host:3478?transport=tcp
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_PASSWORD=your-turn-password
VITE_WEBRTC_ICE_TRANSPORT_POLICY=all
```

`VITE_WEBRTC_ICE_TRANSPORT_POLICY` accepts:

- `all`: use direct peer-to-peer first, then relay when needed
- `relay`: force TURN relay for debugging or locked-down networks

### Backend environment variables

Make sure the backend has:

```env
JWT_SECRET=your-secret
MONGODB_URL=your-mongodb-connection-string
CORS_ORIGIN=https://your-frontend-domain.com
```

### If video still fails in production

1. Confirm the TURN hostname, username, and password are correct.
2. Redeploy the frontend after changing env vars. Vite reads them at build time.
3. Temporarily set `VITE_WEBRTC_ICE_TRANSPORT_POLICY=relay` and test again.
4. If relay mode works but normal mode fails, the TURN server is helping and the
   issue was network/NAT traversal rather than the room UI.
