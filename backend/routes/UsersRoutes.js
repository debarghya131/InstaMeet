import express from "express";
import {
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
} from "../controllers/UserController.js";
import {
  apiLimiter,
  authLimiter,
  meetingLimiter,
} from "../utils/rateLimit.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Users API is working properly.",
  });
});

router.get("/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Users test route is active.",
  });
});

router.get("/all", apiLimiter, getUsers);
router.get("/meetings", apiLimiter, getMeetings);
router.get("/meetings/code/:meetingCode", apiLimiter, getMeetingByCode);
router.get("/me", apiLimiter, getCurrentUser);
router.get("/my-meetings", apiLimiter, getMyMeetings);
router.get("/:id", apiLimiter, getUserById);
router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/meetings", meetingLimiter, createMeeting);
router.post("/meetings/guest", meetingLimiter, createGuestMeeting);
router.post("/meetings/end", meetingLimiter, endHostedMeeting);

export default router;
