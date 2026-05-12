const API_ROOT =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:5000";

export const API_BASE_URL = `${API_ROOT}/api/users`;
export const SOCKET_SERVER_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL?.replace(/\/+$/, "") || API_ROOT;
