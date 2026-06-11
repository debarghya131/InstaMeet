import express from "express";
import { recordWebsiteView } from "../controllers/WebsiteController.js";
import { apiLimiter } from "../utils/rateLimit.js";

const router = express.Router();

router.post("/views", apiLimiter, recordWebsiteView);

export default router;
