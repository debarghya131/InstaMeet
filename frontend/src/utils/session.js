export const AUTH_SETUP_PATH = "/video-meet";
export const GUEST_SETUP_PATH = "/guest";

const AUTH_USER_KEY = "instameet_user";
const AUTH_TOKEN_KEY = "instameet_token";
const LEGACY_ROLE_KEY = "instameet_role";
const SESSION_TYPE_KEY = "instameet_session_type";
const GUEST_FLAG_KEY = "instameet_guest";
const SETUP_PATH_KEY = "instameet_setup_path";
const PENDING_HOST_ROOM_KEY = "instameet_pending_host_room";

const getSessionStorage = () =>
  typeof window !== "undefined" ? window.sessionStorage : null;

const getLocalStorage = () =>
  typeof window !== "undefined" ? window.localStorage : null;

const clearLegacySharedAuth = () => {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ROLE_KEY);
};

export const getStoredUser = () => {
  const storage = getSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    return JSON.parse(storage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
};

export const getStoredAuthToken = () => {
  const storage = getSessionStorage();
  return storage ? storage.getItem(AUTH_TOKEN_KEY) : null;
};

export const getStoredUserId = (savedUser = getStoredUser()) =>
  savedUser?.id || savedUser?._id || savedUser?.userId || "";

export const resolveSessionContext = (locationState = {}) => {
  const sessionStorage = getSessionStorage();
  const savedUser = getStoredUser();
  const authToken = getStoredAuthToken();
  if (!savedUser && !authToken) {
    clearLegacySharedAuth();
  }
  const savedUserId = getStoredUserId(savedUser);
  const sessionType = sessionStorage?.getItem(SESSION_TYPE_KEY);
  const routeIsGuest =
    locationState?.role === "guest" || Boolean(locationState?.isGuest);
  const routeIsAuthenticated = locationState?.role === "user";
  const sessionIsGuest =
    sessionType === "guest" ||
    sessionStorage?.getItem(GUEST_FLAG_KEY) === "true";
  const sessionIsAuthenticated = sessionType === "user";
  const hasStoredAuth = Boolean(locationState?.userId || authToken || savedUserId);
  const isGuestUser = routeIsGuest
    ? true
    : routeIsAuthenticated
      ? false
      : sessionIsGuest
        ? true
        : sessionIsAuthenticated
          ? false
          : !hasStoredAuth;
  const isAuthenticatedUser = !isGuestUser;
  const setupPath =
    locationState?.setupPath ||
    sessionStorage?.getItem(SETUP_PATH_KEY) ||
    (isGuestUser ? GUEST_SETUP_PATH : AUTH_SETUP_PATH);
  const userName =
    locationState?.userName ||
    (isGuestUser
      ? "Guest User"
      : savedUser?.name || savedUser?.username || "User");
  const userId = isGuestUser ? "" : locationState?.userId || savedUserId || "";

  return {
    authToken,
    savedUser,
    setupPath,
    userId,
    userName,
    isAuthenticatedUser,
    isGuestUser,
  };
};

export const markGuestSession = () => {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.setItem(SESSION_TYPE_KEY, "guest");
  sessionStorage.setItem(GUEST_FLAG_KEY, "true");
  sessionStorage.setItem(SETUP_PATH_KEY, GUEST_SETUP_PATH);
  clearLegacySharedAuth();
};

export const saveAuthenticatedSession = (authData) => {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authData));
  if (authData?.token) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, authData.token);
  } else {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }
  sessionStorage.setItem(SESSION_TYPE_KEY, "user");
  sessionStorage.removeItem(GUEST_FLAG_KEY);
  sessionStorage.setItem(SETUP_PATH_KEY, AUTH_SETUP_PATH);
  clearLegacySharedAuth();
};

export const markAuthenticatedSession = () => {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  sessionStorage.setItem(SESSION_TYPE_KEY, "user");
  sessionStorage.removeItem(GUEST_FLAG_KEY);
  sessionStorage.setItem(SETUP_PATH_KEY, AUTH_SETUP_PATH);
  clearLegacySharedAuth();
};

export const clearSessionRoutingState = () => {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  sessionStorage.removeItem(SESSION_TYPE_KEY);
  sessionStorage.removeItem(GUEST_FLAG_KEY);
  sessionStorage.removeItem(SETUP_PATH_KEY);
  sessionStorage.removeItem(PENDING_HOST_ROOM_KEY);
};

export const clearAuthenticatedSession = () => {
  const sessionStorage = getSessionStorage();

  clearLegacySharedAuth();

  if (sessionStorage) {
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    clearSessionRoutingState();
  }
};

export const getPendingHostRoom = () => {
  const sessionStorage = getSessionStorage();
  return sessionStorage ? sessionStorage.getItem(PENDING_HOST_ROOM_KEY) : null;
};

export const setPendingHostRoom = (roomId) => {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  sessionStorage.setItem(PENDING_HOST_ROOM_KEY, roomId);
};

export const clearPendingHostRoom = () => {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  sessionStorage.removeItem(PENDING_HOST_ROOM_KEY);
};
