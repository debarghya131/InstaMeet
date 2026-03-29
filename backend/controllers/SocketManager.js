import { Server } from "socket.io";

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

    socket.on("join-room", (roomId) => {
      socket.join(roomId);

      socket.emit("joined-room", {
        roomId,
        message: `Joined room ${roomId}`,
      });
    });

    socket.on("send-message", (payload) => {
      const roomId = payload?.roomId || "global";
      const message = payload?.message || "Empty message";

      io.to(roomId).emit("receive-message", {
        senderId: socket.id,
        roomId,
        message,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export default setupSocket;
