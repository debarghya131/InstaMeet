import { Server } from "socket.io";
import Meeting from "../model/MeetingSchema.js";
import {
  getAuthenticatedUserByToken,
  isAuthErrorMessage,
} from "../utils/auth.js";

const roomParticipants = new Map();
const roomHostMap = new Map();
const roomCloseTimers = new Map();
let ioInstance = null;
const ROOM_CLOSE_GRACE_MS = 15000;

const getRoomUsers = (roomId) => roomParticipants.get(roomId) || [];

const addParticipantToRoom = (roomId, participant) => {
  const existingParticipants = getRoomUsers(roomId);
  const filteredParticipants = existingParticipants.filter(
    (user) => user.socketId !== participant.socketId
  );

  const updatedParticipants = [...filteredParticipants, participant];
  roomParticipants.set(roomId, updatedParticipants);

  return updatedParticipants;
};

const isValidObjectId = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

const clearScheduledRoomClose = (roomId) => {
  const scheduledTimer = roomCloseTimers.get(roomId);

  if (!scheduledTimer) {
    return;
  }

  clearTimeout(scheduledTimer);
  roomCloseTimers.delete(roomId);
};

const scheduleRoomClose = (roomId) => {
  if (!roomId || roomCloseTimers.has(roomId)) {
    return;
  }

  const timeoutId = setTimeout(async () => {
    roomCloseTimers.delete(roomId);

    if (getRoomUsers(roomId).length > 0) {
      return;
    }

    await Meeting.deleteOne({ meetingCode: roomId });
    roomParticipants.delete(roomId);
    roomHostMap.delete(roomId);
  }, ROOM_CLOSE_GRACE_MS);

  roomCloseTimers.set(roomId, timeoutId);
};

const ensureMeetingExists = async (roomId, userId) => {
  if (!roomId || !isValidObjectId(userId)) {
    return;
  }

  const existingMeeting = await Meeting.findOne({ meetingCode: roomId }).select(
    "_id"
  );

  if (!existingMeeting) {
    await Meeting.create({
      userId,
      meetingCode: roomId,
    });
  }
};

const getHostUserId = async (roomId) => {
  if (roomHostMap.has(roomId)) {
    return roomHostMap.get(roomId);
  }

  const meeting = await Meeting.findOne({ meetingCode: roomId })
    .populate("userId", "username")
    .select("userId");

  const isGuestMeeting =
    meeting?.userId &&
    typeof meeting.userId === "object" &&
    meeting.userId.username === "guest";

  if (isGuestMeeting) {
    return null;
  }

  const hostUserId = meeting?.userId
    ? String(meeting.userId._id || meeting.userId)
    : null;

  if (hostUserId) {
    roomHostMap.set(roomId, hostUserId);
  }

  return hostUserId;
};

const getRoomMeeting = async (roomId) =>
  Meeting.findOne({ meetingCode: roomId })
    .populate("userId", "name username")
    .select("userId");

const resolveParticipantIdentity = async (socket, payload = {}) => {
  const authToken = socket.handshake.auth?.token || payload.authToken || "";
  const claimedUserName = String(payload.userName || "").trim();

  if (authToken) {
    const authenticatedUser = await getAuthenticatedUserByToken(authToken);

    return {
      userId: String(authenticatedUser._id),
      userName:
        authenticatedUser.name || authenticatedUser.username || "Authenticated User",
      isGuestJoin: false,
    };
  }

  return {
    userId: "",
    userName: claimedUserName || "Guest User",
    isGuestJoin: true,
  };
};

const removeParticipantFromRoom = (socketId) => {
  let removedParticipant = null;

  for (const [roomId, participants] of roomParticipants.entries()) {
    const participant = participants.find((user) => user.socketId === socketId);

    if (!participant) {
      continue;
    }

    removedParticipant = {
      roomId,
      participant,
    };

    const updatedParticipants = participants.filter(
      (user) => user.socketId !== socketId
    );

    if (updatedParticipants.length === 0) {
      roomParticipants.delete(roomId);
    } else {
      roomParticipants.set(roomId, updatedParticipants);
    }

    break;
  }

  return removedParticipant;
};

const findParticipantInRoom = (roomId, socketId) =>
  getRoomUsers(roomId).find((participant) => participant.socketId === socketId);

const updateParticipantState = (roomId, socketId, updates) => {
  const participants = getRoomUsers(roomId);
  const updatedParticipants = participants.map((participant) =>
    participant.socketId === socketId
      ? { ...participant, ...updates }
      : participant
  );

  roomParticipants.set(roomId, updatedParticipants);
  return updatedParticipants.find((participant) => participant.socketId === socketId);
};

const closeMeetingRoom = async (
  roomId,
  message = "Host ended the meeting."
) => {
  if (!roomId) {
    return;
  }

  clearScheduledRoomClose(roomId);

  if (ioInstance) {
    ioInstance.to(roomId).emit("meeting-ended", {
      roomId,
      message,
    });

    const sockets = await ioInstance.in(roomId).fetchSockets();
    sockets.forEach((clientSocket) => {
      clientSocket.leave(roomId);
    });
  }

  roomParticipants.delete(roomId);
  roomHostMap.delete(roomId);
};

const setupSocket = (server) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
  const io = new Server(server, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
    },
  });
  ioInstance = io;

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.emit("welcome", {
      message: "Socket connection established successfully.",
      socketId: socket.id,
    });

    socket.on("join-room", async (payload = {}) => {
      const { roomId } = payload;

      if (!roomId) {
        socket.emit("socket-error", {
          message: "roomId is required to join a room.",
        });
        return;
      }

      let identity;

      try {
        identity = await resolveParticipantIdentity(socket, payload);
      } catch (error) {
        socket.emit("socket-error", {
          code: "AUTH_REQUIRED",
          message: isAuthErrorMessage(error.message)
            ? "Please sign in again to join this room."
            : "Unable to verify your meeting session.",
        });
        return;
      }

      if (identity.isGuestJoin) {
        try {
          const meeting = await getRoomMeeting(roomId);
          const hostUsername = meeting?.userId?.username || null;

          if (meeting && hostUsername && hostUsername !== "guest") {
            socket.emit("socket-error", {
              code: "GUEST_FORBIDDEN",
              message:
                "Guests cannot join meetings created by authenticated users. Please sign in.",
            });
            return;
          }
        } catch (error) {
          console.error("Guest join validation failed:", error);
        }
      }

      try {
        await ensureMeetingExists(roomId, identity.userId);
      } catch (error) {
        console.error("Unable to ensure meeting exists:", error);
      }

      let hostUserId = null;

      try {
        hostUserId = await getHostUserId(roomId);
      } catch (error) {
        hostUserId = null;
      }

      if (!hostUserId) {
        const fallbackHost = roomHostMap.get(roomId);
        if (fallbackHost && getRoomUsers(roomId).length > 0) {
          hostUserId = fallbackHost;
        } else {
          const nextHost = String(identity.userId || socket.id);
          roomHostMap.set(roomId, nextHost);
          hostUserId = nextHost;
        }
      }

      clearScheduledRoomClose(roomId);
      socket.join(roomId);
      const participant = {
        socketId: socket.id,
        roomId,
        userId: identity.userId || socket.id,
        userName: identity.userName,
        isHost: hostUserId
          ? String(identity.userId || socket.id) === hostUserId
          : false,
        isMuted: false,
        isVideoOff: false,
        joinedAt: new Date().toISOString(),
      };

      addParticipantToRoom(roomId, participant);

      socket.emit("joined-room", {
        roomId,
        participant,
        message: `Joined room ${roomId}`,
      });

      socket.to(roomId).emit("user-joined", participant);
      io.to(roomId).emit("room-users", getRoomUsers(roomId));
    });

    socket.on("send-message", (payload) => {
      const roomId = payload?.roomId;
      const message = payload?.message || "Empty message";
      const participant = roomId ? findParticipantInRoom(roomId, socket.id) : null;

      if (!roomId) {
        socket.emit("socket-error", {
          message: "roomId is required to send a message.",
        });
        return;
      }

      if (!participant) {
        socket.emit("socket-error", {
          message: "Join the room before sending messages.",
        });
        return;
      }

      io.to(roomId).emit("receive-message", {
        senderId: participant.userId || socket.id,
        senderSocketId: socket.id,
        senderName: participant.userName || "Guest User",
        roomId,
        message,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on("webrtc-signal", ({ roomId, targetSocketId, signal }) => {
      if (!roomId || !targetSocketId || !signal) {
        socket.emit("socket-error", {
          message: "roomId, targetSocketId and signal are required.",
        });
        return;
      }

      const participant = findParticipantInRoom(roomId, socket.id);

      if (!participant) {
        socket.emit("socket-error", {
          message: "Join the room before sending WebRTC signals.",
        });
        return;
      }

      io.to(targetSocketId).emit("webrtc-signal", {
        roomId,
        signal,
        fromSocketId: socket.id,
        caller: {
          userId: participant.userId || socket.id,
          userName: participant.userName || "Participant",
        },
      });
    });

    socket.on("toggle-audio", ({ roomId, isMuted }) => {
      if (!roomId) {
        return;
      }

      const participant = updateParticipantState(roomId, socket.id, {
        isMuted: Boolean(isMuted),
      });

      if (participant) {
        io.to(roomId).emit("user-updated", participant);
      }
    });

    socket.on("toggle-video", ({ roomId, isVideoOff }) => {
      if (!roomId) {
        return;
      }

      const participant = updateParticipantState(roomId, socket.id, {
        isVideoOff: Boolean(isVideoOff),
      });

      if (participant) {
        io.to(roomId).emit("user-updated", participant);
      }
    });

    socket.on("leave-room", async ({ roomId, mode }) => {
      if (!roomId) {
        return;
      }

      const leaveMode = mode || "leave";
      socket.leave(roomId);
      const removedRoomState = removeParticipantFromRoom(socket.id);

      if (removedRoomState) {
        const remainingParticipants = getRoomUsers(removedRoomState.roomId);
        const hostUserId = roomHostMap.get(removedRoomState.roomId);
        const isHostLeaving =
          removedRoomState.participant.isHost ||
          (hostUserId && String(removedRoomState.participant.userId) === hostUserId);
        const isAuthenticatedHostLeavingToSetup =
          isHostLeaving &&
          leaveMode === "setup" &&
          isValidObjectId(String(removedRoomState.participant.userId));
        const isTransientDisconnect = leaveMode === "disconnect";

        if (
          isHostLeaving &&
          !isAuthenticatedHostLeavingToSetup &&
          !isTransientDisconnect
        ) {
          await Meeting.deleteOne({ meetingCode: removedRoomState.roomId });
          await closeMeetingRoom(
            removedRoomState.roomId,
            "Host ended the meeting."
          );
          return;
        }

        if (remainingParticipants.length === 0) {
          if (isTransientDisconnect) {
            scheduleRoomClose(removedRoomState.roomId);
          } else if (!isAuthenticatedHostLeavingToSetup) {
            await Meeting.deleteOne({ meetingCode: removedRoomState.roomId });
            roomHostMap.delete(removedRoomState.roomId);
          }
          return;
        }

        socket.to(removedRoomState.roomId).emit("user-left", {
          socketId: socket.id,
          roomId: removedRoomState.roomId,
          userName: removedRoomState.participant.userName,
        });

        io.to(removedRoomState.roomId).emit(
          "room-users",
          remainingParticipants
        );
      }
    });

    socket.on("disconnect", async () => {
      const removedRoomState = removeParticipantFromRoom(socket.id);

      if (removedRoomState) {
        const remainingParticipants = getRoomUsers(removedRoomState.roomId);

        if (remainingParticipants.length === 0) {
          scheduleRoomClose(removedRoomState.roomId);
          return;
        }

        socket.to(removedRoomState.roomId).emit("user-left", {
          socketId: socket.id,
          roomId: removedRoomState.roomId,
          userName: removedRoomState.participant.userName,
        });

        io.to(removedRoomState.roomId).emit(
          "room-users",
          getRoomUsers(removedRoomState.roomId)
        );
      }

      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export default setupSocket;
export { closeMeetingRoom };
