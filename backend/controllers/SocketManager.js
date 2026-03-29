import { Server } from "socket.io";

const roomParticipants = new Map();

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

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.emit("welcome", {
      message: "Socket connection established successfully.",
      socketId: socket.id,
    });

    socket.on("join-room", ({ roomId, userName, userId }) => {
      if (!roomId) {
        socket.emit("socket-error", {
          message: "roomId is required to join a room.",
        });
        return;
      }

      socket.join(roomId);
      const participant = {
        socketId: socket.id,
        roomId,
        userId: userId || socket.id,
        userName: userName || "Guest User",
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
      const senderName = payload?.senderName || "Guest User";

      if (!roomId) {
        socket.emit("socket-error", {
          message: "roomId is required to send a message.",
        });
        return;
      }

      io.to(roomId).emit("receive-message", {
        senderId: socket.id,
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

    socket.on("leave-room", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      socket.leave(roomId);
      const removedRoomState = removeParticipantFromRoom(socket.id);

      if (removedRoomState) {
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

    socket.on("disconnect", () => {
      const removedRoomState = removeParticipantFromRoom(socket.id);

      if (removedRoomState) {
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
