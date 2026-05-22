import crypto from "crypto";

import User from "../model/UserModels.js";

const TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24;

const AUTH_ERROR_MESSAGES = new Set([
  "Authorization token is required.",
  "Invalid token format.",
  "Invalid token signature.",
  "Token expired.",
  "Invalid or expired session.",
]);

export const isAuthErrorMessage = (message = "") =>
  AUTH_ERROR_MESSAGES.has(message);

export const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required.");
  }

  return process.env.JWT_SECRET;
};

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
};

export const verifyPassword = (password, storedPassword) => {
  if (!storedPassword?.includes(":")) {
    return storedPassword === password;
  }

  const [salt, storedHash] = storedPassword.split(":");
  const computedHash = crypto.scryptSync(password, salt, 64).toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(storedHash, "hex"),
    Buffer.from(computedHash, "hex")
  );
};

const encodeBase64Url = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const signToken = (payload) => {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(unsignedToken)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsignedToken}.${signature}`;
};

export const verifyToken = (token) => {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid token format.");
  }

  const [encodedHeader, encodedPayload, receivedSignature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(unsignedToken)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  if (receivedSignature.length !== expectedSignature.length) {
    throw new Error("Invalid token signature.");
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expectedSignature)
    )
  ) {
    throw new Error("Invalid token signature.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64").toString("utf-8")
  );

  if (payload.exp && Date.now() > payload.exp) {
    throw new Error("Token expired.");
  }

  return payload;
};

export const createAuthToken = (user) => {
  const payload = {
    sub: user._id.toString(),
    username: user.username,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };

  return signToken(payload);
};

export const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
};

export const getAuthenticatedUserByToken = async (token) => {
  if (!token) {
    throw new Error("Authorization token is required.");
  }

  const payload = verifyToken(token);
  const user = await User.findById(payload.sub);

  if (!user || user.token !== token) {
    throw new Error("Invalid or expired session.");
  }

  return user;
};

export const getAuthenticatedUser = async (req) => {
  const token = getBearerToken(req);
  return getAuthenticatedUserByToken(token);
};
