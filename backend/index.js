import fs from "fs";
import mongoose from "mongoose";
import { server } from "./app.js";

if (typeof process.loadEnvFile === "function" && fs.existsSync("./.env")) {
  process.loadEnvFile("./.env");
}

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is required to start the backend.");
  process.exit(1);
}

const startServer = async () => {
  try {
    if (process.env.MONGODB_URL) {
      try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("MongoDB connected successfully.");
      } catch (error) {
        console.error("MongoDB connection failed:", error.message);
      }
    } else {
      console.log("MONGODB_URL not found. Server starting without database.");
    }

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Set PORT to another value.`);
      } else {
        console.error("Server failed to start:", error.message);
      }

      process.exit(1);
    });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
