import WebsiteStats from "../model/WebsiteStatsSchema.js";
import { broadcastWebsiteViews } from "./SocketManager.js";

const WEBSITE_STATS_KEY = "instameet";
const VIEW_COOKIE_NAME = "actual_view_counted";
const VIEW_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const hasCookie = (req, cookieName) =>
  (req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .includes(cookieName);

const getViewCookieOptions = (req) => {
  const isSecureRequest =
    req.secure || req.headers["x-forwarded-proto"] === "https";

  return {
    httpOnly: true,
    maxAge: VIEW_COOKIE_MAX_AGE_MS,
    path: "/",
    sameSite: isSecureRequest ? "none" : "lax",
    secure: isSecureRequest,
  };
};

export const recordWebsiteView = async (req, res) => {
  try {
    const wasAlreadyCounted = hasCookie(req, VIEW_COOKIE_NAME);
    const stats = await WebsiteStats.findOneAndUpdate(
      { key: WEBSITE_STATS_KEY },
      wasAlreadyCounted
        ? {
            $setOnInsert: {
              key: WEBSITE_STATS_KEY,
              views: 0,
            },
          }
        : {
            $inc: { views: 1 },
            $setOnInsert: { key: WEBSITE_STATS_KEY },
          },
      {
        new: true,
        upsert: true,
      }
    );

    if (!wasAlreadyCounted) {
      res.cookie(VIEW_COOKIE_NAME, "true", getViewCookieOptions(req));
      broadcastWebsiteViews(stats.views);
    }

    return res.status(200).json({
      success: true,
      message: wasAlreadyCounted
        ? "Website view was already counted in the last 24 hours."
        : "Website view recorded successfully.",
      data: {
        views: stats.views,
        counted: !wasAlreadyCounted,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to record website view.",
      error: error.message,
    });
  }
};
