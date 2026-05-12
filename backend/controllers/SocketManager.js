import { Server } from "socket.io";
import Meeting from "../model/MeetingSchema.js";

const roomParticipants = new Map();
const roomHostMap = new Map();
let ioInstance = null;

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

    socket.on("join-room", async ({ roomId, userName, userId }) => {
      if (!roomId) {
        socket.emit("socket-error", {
          message: "roomId is required to join a room.",
        });
        return;
      }

      const isGuestJoin =
        !isValidObjectId(String(userId || "")) ||
        String(userName || "").trim().toLowerCase() === "guest user";

      if (isGuestJoin) {
        try {
          const meeting = await Meeting.findOne({ meetingCode: roomId })
            .populate("userId", "username")
            .select("userId");

          const hostUsername =
            meeting?.userId && typeof meeting.userId === "object"
              ? meeting.userId.username
              : null;

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
        await ensureMeetingExists(roomId, userId);
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
        if (fallbackHost) {
          hostUserId = fallbackHost;
        } else {
          const nextHost = String(userId || socket.id);
          roomHostMap.set(roomId, nextHost);
          hostUserId = nextHost;
        }
      }

      socket.join(roomId);
      const participant = {
        socketId: socket.id,
        roomId,
        userId: userId || socket.id,
        userName: userName || "Guest User",
        isHost: hostUserId ? String(userId || socket.id) === hostUserId : false,
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
      const senderName = payload?.senderName || participant?.userName || "Guest User";
      const senderId =
        payload?.senderId ||
        payload?.userId ||
        participant?.userId ||
        socket.id;

      if (!roomId) {
        socket.emit("socket-error", {
          message: "roomId is required to send a message.",
        });
        return;
      }

      io.to(roomId).emit("receive-message", {
        senderId,
        senderSocketId: socket.id,
        senderName,
        roomId,
        message,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on("webrtc-signal", ({ roomId, targetSocketId, signal, caller }) => {
      if (!roomId || !targetSocketId || !signal) {
        socket.emit("socket-error", {
          message: "roomId, targetSocketId and signal are required.",
        });
        return;
      }

      io.to(targetSocketId).emit("webrtc-signal", {
        roomId,
        signal,
        fromSocketId: socket.id,
        caller,
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
        const hostUserId = roomHostMap.get(removedRoomState.roomId);
        const isHostLeaving =
          removedRoomState.participant.isHost ||
          (hostUserId && String(removedRoomState.participant.userId) === hostUserId);
        const isAuthenticatedHostLeavingToSetup =
          isHostLeaving &&
          leaveMode === "setup" &&
          isValidObjectId(String(removedRoomState.participant.userId));

        if (isHostLeaving && !isAuthenticatedHostLeavingToSetup) {
          await Meeting.deleteOne({ meetingCode: removedRoomState.roomId });
          await closeMeetingRoom(
            removedRoomState.roomId,
            "Host ended the meeting."
          );
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
    });

    socket.on("disconnect", async () => {
      const removedRoomState = removeParticipantFromRoom(socket.id);

      if (removedRoomState) {
        const hostUserId = roomHostMap.get(removedRoomState.roomId);
        const isHostLeaving =
          removedRoomState.participant.isHost ||
          (hostUserId && String(removedRoomState.participant.userId) === hostUserId);

        if (isHostLeaving) {
          await Meeting.deleteOne({ meetingCode: removedRoomState.roomId });
          await closeMeetingRoom(
            removedRoomState.roomId,
            "Host ended the meeting."
          );
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
