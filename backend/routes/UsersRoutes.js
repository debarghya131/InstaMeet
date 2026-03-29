import express from "express";
import {
  createMeeting,
  getCurrentUser,
  getMeetings,
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
router.get("/me", getCurrentUser);
router.get("/my-meetings", getMyMeetings);
router.get("/:id", getUserById);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/meetings", createMeeting);

export default router;
