# InstaMeet

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
