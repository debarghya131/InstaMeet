import express from "express";
import http from "http";
import cors from "cors";

import usersRouter from "./routes/UsersRoutes.js";
import setupSocket from "./controllers/SocketManager.js";

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: allowedOrigin,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "InstaMeet backend is running.",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy.",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/users", usersRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

const server = http.createServer(app);
setupSocket(server);

export { app, server };
