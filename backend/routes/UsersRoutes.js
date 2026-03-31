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

router.get("/all", getUsers);
router.get("/meetings", getMeetings);
router.get("/meetings/code/:meetingCode", getMeetingByCode);
router.get("/me", getCurrentUser);
router.get("/my-meetings", getMyMeetings);
router.get("/:id", getUserById);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/meetings", createMeeting);
router.post("/meetings/guest", createGuestMeeting);
router.post("/meetings/end", endHostedMeeting);

export default router;
