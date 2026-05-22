import User from "../model/UserModels.js";
import Meeting from "../model/MeetingSchema.js";
import { closeMeetingRoom } from "./SocketManager.js";
import crypto from "crypto";
import {
  createAuthToken,
  getAuthenticatedUser,
  hashPassword,
  isAuthErrorMessage,
  verifyPassword,
} from "../utils/auth.js";

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
    await getAuthenticatedUser(req);
    const users = await User.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      data: users.map(sanitizeUser),
    });
  } catch (error) {
    const statusCode = isAuthErrorMessage(error.message) ? 401 : 500;

    res.status(statusCode).json({
      success: false,
      message: statusCode === 401 ? error.message : "Unable to fetch users.",
      error: statusCode === 500 ? error.message : undefined,
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
    await getAuthenticatedUser(req);
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
    const statusCode = isAuthErrorMessage(error.message) ? 401 : 500;

    return res.status(statusCode).json({
      success: false,
      message: statusCode === 401 ? error.message : "Unable to fetch user.",
      error: statusCode === 500 ? error.message : undefined,
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
      isAuthErrorMessage(error.message)
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
    await getAuthenticatedUser(req);
    const meetings = await Meeting.find()
      .populate("userId", "name username")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Meetings fetched successfully.",
      data: meetings,
    });
  } catch (error) {
    const statusCode = isAuthErrorMessage(error.message) ? 401 : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 401 ? error.message : "Unable to fetch meetings.",
      error: statusCode === 500 ? error.message : undefined,
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
    return res.status(isAuthErrorMessage(error.message) ? 401 : 500).json({
      success: false,
      message: isAuthErrorMessage(error.message)
        ? error.message
        : "Unable to fetch your meetings.",
      error: isAuthErrorMessage(error.message) ? undefined : error.message,
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
      isAuthErrorMessage(error.message)
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
