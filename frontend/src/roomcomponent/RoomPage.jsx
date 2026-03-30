import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { io } from "socket.io-client";

const SOCKET_SERVER_URL = "http://localhost:5000";

export default function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const socketRef = useRef(null);
  const savedUser =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("instameet_user") || "null")
      : null;
  const userName =
    location.state?.userName ||
    savedUser?.name ||
    savedUser?.username ||
    "Guest User";
  const userId = location.state?.userId || savedUser?.id || "";

  const [participants, setParticipants] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Connecting to room...");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("join-room", {
        roomId,
        userName,
        userId,
      });
    });

    socket.on("joined-room", (payload) => {
      setStatusMessage(payload?.message || `Joined room ${roomId}`);
      setErrorMessage("");
    });

    socket.on("room-users", (users) => {
      setParticipants(users || []);
    });

    socket.on("user-joined", (participant) => {
      setStatusMessage(`${participant?.userName || "A user"} joined the room.`);
    });

    socket.on("user-left", (participant) => {
      setStatusMessage(`${participant?.userName || "A user"} left the room.`);
    });

    socket.on("socket-error", (payload) => {
      setErrorMessage(payload?.message || "Unable to join room.");
    });

    socket.on("disconnect", () => {
      setStatusMessage("Disconnected from room.");
    });

    socketRef.current = socket;

    return () => {
      socket.emit("leave-room", { roomId });
      socket.disconnect();
    };
  }, [roomId, userId, userName]);

  return (
    <main className="room-page">
      <section className="room-shell">
        <div className="room-header">
          <div>
            <p className="room-kicker">Connected Room</p>
            <h1>{roomId}</h1>
            <p className="room-status">{statusMessage}</p>
          </div>

          <Link className="room-back" to="/video-meet">
            Back to Setup
          </Link>
        </div>

        {errorMessage ? <p className="room-error">{errorMessage}</p> : null}

        <div className="room-layout">
          <section className="room-panel">
            <h2>Participants</h2>
            <div className="room-participants">
              {participants.length === 0 ? (
                <p className="room-empty">No participants yet.</p>
              ) : (
                participants.map((participant) => (
                  <div className="room-participant-card" key={participant.socketId}>
                    <strong>{participant.userName}</strong>
                    <span>{participant.socketId === socketRef.current?.id ? "You" : "Participant"}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="room-panel">
            <h2>Room Details</h2>
            <ul className="room-details">
              <li>Room ID: {roomId}</li>
              <li>Your Name: {userName}</li>
              <li>Total Users: {participants.length}</li>
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
