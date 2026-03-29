import express from "express";

const router = express.Router();

const sampleUsers = [
  {
    id: 1,
    name: "Debarghya",
    email: "debarghya@example.com",
  },
  {
    id: 2,
    name: "Test User",
    email: "test@example.com",
  },
];

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Users route working properly.",
    data: sampleUsers,
  });
});

router.get("/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Users test route is active.",
  });
});

router.post("/echo", (req, res) => {
  res.status(201).json({
    success: true,
    message: "Received request body successfully.",
    data: req.body,
  });
});

export default router;
