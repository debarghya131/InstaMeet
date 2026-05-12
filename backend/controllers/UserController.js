import crypto from "crypto";

import User from "../model/UserModels.js";
import Meeting from "../model/MeetingSchema.js";
import { closeMeetingRoom } from "./SocketManager.js";

const TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24;

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required.");
  }

  return process.env.JWT_SECRET;
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedPassword) => {
  if (!storedPassword?.includes(":")) {
    return storedPassword === password;
  }

  const [salt, storedHash] = storedPassword.split(":");
  const computedHash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

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

const signToken = (payload) => {
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

const verifyToken = (token) => {
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

  if (receivedSignature !== expectedSignature) {
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

const createAuthToken = (user) => {
  const payload = {
    sub: user._id.toString(),
    username: user.username,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };

  return signToken(payload);
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
};

const getAuthenticatedUser = async (req) => {
  const token = getBearerToken(req);

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

const sanitizeUser = (user, { includeToken = false } = {}) => ({
  id: user._id,
  name: user.name,
  username: user.username,
  ...(includeToken ? { token: user.token } : {}),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      data: users.map(sanitizeUser),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to fetch users.",
      error: error.message,
    });
  }
};

const registerUser = async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, username and password are required.",
      });
    }

    const existingUser = await User.findOne({
      username: username.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists.",
      });
    }

    const user = await User.create({
      name,
      username,
      password: hashPassword(password),
    });

    user.token = createAuthToken(user);
    await user.save();

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: sanitizeUser(user, { includeToken: true }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to register user.",
      error: error.message,
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    user.token = createAuthToken(user);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: sanitizeUser(user, { includeToken: true }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to login user.",
      error: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully.",
      data: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch user.",
      error: error.message,
    });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);

    return res.status(200).json({
      success: true,
      message: "Authenticated user fetched successfully.",
      data: sanitizeUser(user, { includeToken: true }),
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

const createMeeting = async (req, res) => {
  try {
    const { meetingCode } = req.body;
    const user = await getAuthenticatedUser(req);

    if (!meetingCode) {
      return res.status(400).json({
        success: false,
        message: "meetingCode is required.",
      });
    }

    const existingMeeting = await Meeting.findOne({ meetingCode });

    if (existingMeeting) {
      return res.status(409).json({
        success: false,
        message: "Meeting code already exists.",
      });
    }

    const meeting = await Meeting.create({
      userId: user._id,
      meetingCode,
    });

    return res.status(201).json({
      success: true,
      message: "Meeting created successfully.",
      data: meeting,
    });
  } catch (error) {
    const statusCode =
      error.message === "Authorization token is required." ||
      error.message === "Invalid token format." ||
      error.message === "Invalid token signature." ||
      error.message === "Token expired." ||
      error.message === "Invalid or expired session."
        ? 401
        : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 401 ? error.message : "Unable to create meeting.",
      error: statusCode === 500 ? error.message : undefined,
    });
  }
};

const getOrCreateGuestUser = async () => {
  const existingGuest = await User.findOne({ username: "guest" });
  if (existingGuest) {
    return existingGuest;
  }

  const randomPassword = crypto.randomBytes(24).toString("hex");

  const guestUser = await User.create({
    name: "Guest User",
    username: "guest",
    password: hashPassword(randomPassword),
  });

  return guestUser;
};

const createGuestMeeting = async (req, res) => {
  try {
    const { meetingCode } = req.body;

    if (!meetingCode) {
      return res.status(400).json({
        success: false,
        message: "meetingCode is required.",
      });
    }

    const existingMeeting = await Meeting.findOne({ meetingCode });

    if (existingMeeting) {
      return res.status(409).json({
        success: false,
        message: "Meeting code already exists.",
      });
    }

    const guestUser = await getOrCreateGuestUser();

    const meeting = await Meeting.create({
      userId: guestUser._id,
      meetingCode,
    });

    return res.status(201).json({
      success: true,
      message: "Guest meeting created successfully.",
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create guest meeting.",
      error: error.message,
    });
  }
};

const getMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find()
      .populate("userId", "name username")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Meetings fetched successfully.",
      data: meetings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch meetings.",
      error: error.message,
    });
  }
};

const getMyMeetings = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    const meetings = await Meeting.find({ userId: user._id }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      message: "Your meetings fetched successfully.",
      data: meetings,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

const getMeetingByCode = async (req, res) => {
  try {
    const { meetingCode } = req.params;

    if (!meetingCode) {
      return res.status(400).json({
        success: false,
        message: "meetingCode is required.",
      });
    }

    const meeting = await Meeting.findOne({ meetingCode }).populate(
      "userId",
      "name username"
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Meeting fetched successfully.",
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch meeting.",
      error: error.message,
    });
  }
};

const endHostedMeeting = async (req, res) => {
  try {
    const { meetingCode } = req.body;
    const user = await getAuthenticatedUser(req);

    if (!meetingCode) {
      return res.status(400).json({
        success: false,
        message: "meetingCode is required.",
      });
    }

    const meeting = await Meeting.findOne({
      meetingCode,
      userId: user._id,
    }).select("_id meetingCode");

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Hosted meeting not found.",
      });
    }

    await Meeting.deleteOne({ _id: meeting._id });
    await closeMeetingRoom(meeting.meetingCode, "Host ended the meeting.");

    return res.status(200).json({
      success: true,
      message: "Hosted meeting ended successfully.",
    });
  } catch (error) {
    const statusCode =
      error.message === "Authorization token is required." ||
      error.message === "Invalid token format." ||
      error.message === "Invalid token signature." ||
      error.message === "Token expired." ||
      error.message === "Invalid or expired session."
        ? 401
        : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 401 ? error.message : "Unable to end hosted meeting.",
      error: statusCode === 500 ? error.message : undefined,
    });
  }
};

export {
  createMeeting,
  createGuestMeeting,
  endHostedMeeting,
  getCurrentUser,
  getMeetings,
  getMeetingByCode,
  getMyMeetings,
  getUserById,
  getUsers,
  loginUser,
  registerUser,
};
