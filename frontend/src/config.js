const API_ROOT =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:5000";

export const API_BASE_URL = `${API_ROOT}/api/users`;
export const SOCKET_SERVER_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL?.replace(/\/+$/, "") || API_ROOT;

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

const splitEnvList = (value = "") =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeIceServer = (server) => {
  if (!server || !server.urls) {
    return null;
  }

  const urls = Array.isArray(server.urls)
    ? server.urls.filter(Boolean)
    : server.urls;

  if (!urls || (Array.isArray(urls) && urls.length === 0)) {
    return null;
  }

  return {
    urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  };
};

const parseIceServersFromSimpleEnv = () => {
  const configuredStunUrls = splitEnvList(import.meta.env.VITE_STUN_URLS || "");
  const configuredTurnUrls = splitEnvList(import.meta.env.VITE_TURN_URLS || "");
  const turnUsername = import.meta.env.VITE_TURN_USERNAME?.trim() || "";
  const turnCredential = import.meta.env.VITE_TURN_PASSWORD?.trim() || "";

  const iceServers = [];

  if (configuredStunUrls.length > 0) {
    iceServers.push({
      urls: configuredStunUrls,
    });
  }

  if (
    configuredTurnUrls.length > 0 &&
    turnUsername &&
    turnCredential
  ) {
    iceServers.push({
      urls: configuredTurnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return iceServers.map(normalizeIceServer).filter(Boolean);
};

const parseConfiguredIceServers = () => {
  const simpleEnvIceServers = parseIceServersFromSimpleEnv();

  if (simpleEnvIceServers.length > 0) {
    return simpleEnvIceServers;
  }

  const rawValue = import.meta.env.VITE_WEBRTC_ICE_SERVERS;

  if (!rawValue) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    const normalizedServers = Array.isArray(parsedValue)
      ? parsedValue.map(normalizeIceServer).filter(Boolean)
      : [];

    return normalizedServers.length > 0 ? normalizedServers : DEFAULT_ICE_SERVERS;
  } catch (error) {
    console.warn("Unable to parse VITE_WEBRTC_ICE_SERVERS. Falling back to STUN only.", error);
    return DEFAULT_ICE_SERVERS;
  }
};

export const ICE_SERVERS = parseConfiguredIceServers();
export const RTC_CONFIGURATION = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy:
    import.meta.env.VITE_WEBRTC_ICE_TRANSPORT_POLICY === "relay"
      ? "relay"
      : "all",
};

export const ICE_SERVER_LABELS = ICE_SERVERS.flatMap((server) =>
  Array.isArray(server.urls) ? server.urls : [server.urls]
);
