import rateLimit from "express-rate-limit";

const minutes = (value) => value * 60 * 1000;

const createLimiter = ({ windowMinutes, limit, message }) =>
  rateLimit({
    windowMs: minutes(windowMinutes),
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });

export const authLimiter = createLimiter({
  windowMinutes: 15,
  limit: 10,
  message: "Too many login or register attempts. Please try again later.",
});

export const meetingLimiter = createLimiter({
  windowMinutes: 10,
  limit: 20,
  message: "Too many meeting requests. Please slow down and try again later.",
});

export const apiLimiter = createLimiter({
  windowMinutes: 15,
  limit: 100,
  message: "Too many requests. Please try again later.",
});
