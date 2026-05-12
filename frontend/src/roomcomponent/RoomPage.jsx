import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";

import MeetingScreen from "./MeetingScreen";
import RoomChat from "./RoomChat";
import RoomInfo from "./RoomInfo";
import {
  clearAuthenticatedSession,
  clearPendingHostRoom,
  markAuthenticatedSession,
  markGuestSession,
  resolveSessionContext,
  setPendingHostRoom,
} from "../utils/session";
import { API_BASE_URL, SOCKET_SERVER_URL } from "../config";

const rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export default function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const pendingOffersRef = useRef(new Set());
  const exitInProgressRef = useRef(false);
  const exitContextRef = useRef({
    isAuthenticatedUser: false,
    isCurrentUserHost: false,
    roomId: "",
    setupPath: "/video-meet",
  });
  const { userName, userId, isGuestUser, isAuthenticatedUser, setupPath } =
    resolveSessionContext(location.state);

  const [participants, setParticipants] = useState([]);
  const [remoteFeeds, setRemoteFeeds] = useState([]);
  const [messages, setMessages] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Preparing your camera and microphone...");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [activePanel, setActivePanel] = useState("chat");
  const [hostName, setHostName] = useState("");
  const savedMediaPrefs =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("instameet_media_prefs") || "null")
      : null;
  const initialAudioEnabled =
    savedMediaPrefs?.audioEnabled === undefined ? true : savedMediaPrefs?.audioEnabled;
  const initialVideoEnabled =
    savedMediaPrefs?.videoEnabled === undefined ? true : savedMediaPrefs?.videoEnabled;
  const selfSocketId = socketRef.current?.id;
  const currentParticipant =
    participants.find((participant) => participant.socketId === selfSocketId) ||
    participants.find((participant) => String(participant.userId) === String(userId));
  const isCurrentUserHost = Boolean(currentParticipant?.isHost);
  const currentChatIdentity =
    currentParticipant?.userId || userId || selfSocketId || "";

  useEffect(() => {
    exitContextRef.current = {
      isAuthenticatedUser,
      isCurrentUserHost,
      roomId,
      setupPath,
    };
  }, [isAuthenticatedUser, isCurrentUserHost, roomId, setupPath]);

  useEffect(() => {
    if (isAuthenticatedUser) {
      markAuthenticatedSession();
      return;
    }

    if (isGuestUser) {
      markGuestSession();
    }
  }, [isAuthenticatedUser, isGuestUser]);

  const updateParticipantState = (socketId, updates) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.socketId === socketId
          ? { ...participant, ...updates }
          : participant
      )
    );
  };

  const upsertRemoteFeed = (socketId, updates) => {
    setRemoteFeeds((currentFeeds) => {
      const existingFeed = currentFeeds.find((feed) => feed.socketId === socketId);

      if (!existingFeed) {
        return [...currentFeeds, { socketId, ...updates }];
      }

      return currentFeeds.map((feed) =>
        feed.socketId === socketId ? { ...feed, ...updates } : feed
      );
    });
  };

  const removeRemoteFeed = (socketId) => {
    setRemoteFeeds((currentFeeds) =>
      currentFeeds.filter((feed) => feed.socketId !== socketId)
    );
  };

  const ensureLocalStreamContainer = () => {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }

    return localStreamRef.current;
  };

  const cleanupPeerConnection = useCallback((socketId) => {
    const peerConnection = peerConnectionsRef.current.get(socketId);

    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      peerConnectionsRef.current.delete(socketId);
    }

    pendingOffersRef.current.delete(socketId);
    removeRemoteFeed(socketId);
  }, []);

  const ensurePeerConnection = useCallback((targetSocketId, targetName = "Participant") => {
    const existingConnection = peerConnectionsRef.current.get(targetSocketId);

    if (existingConnection) {
      return existingConnection;
    }

    const peerConnection = new RTCPeerConnection(rtcConfiguration);
    peerConnectionsRef.current.set(targetSocketId, peerConnection);

    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    }

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) {
        return;
      }

      socketRef.current.emit("webrtc-signal", {
        roomId,
        targetSocketId,
        caller: { userName, userId },
        signal: {
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
        },
      });
    };

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;

      if (stream) {
        upsertRemoteFeed(targetSocketId, {
          userName: targetName,
          stream,
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peerConnection.connectionState)) {
        cleanupPeerConnection(targetSocketId);
      }
    };

    return peerConnection;
  }, [roomId, userName, userId, cleanupPeerConnection]);

  const createOfferForParticipant = useCallback(async (participant) => {
    if (!socketRef.current || pendingOffersRef.current.has(participant.socketId)) {
      return;
    }

    const peerConnection = ensurePeerConnection(
      participant.socketId,
      participant.userName
    );

    if (peerConnection.localDescription) {
      return;
    }

    pendingOffersRef.current.add(participant.socketId);

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socketRef.current.emit("webrtc-signal", {
        roomId,
        targetSocketId: participant.socketId,
        caller: { userName, userId },
        signal: {
          type: "offer",
          sdp: offer,
        },
      });
    } catch (error) {
      setErrorMessage(error.message || "Unable to create a room offer.");
    } finally {
      pendingOffersRef.current.delete(participant.socketId);
    }
  }, [ensurePeerConnection, roomId, userName, userId]);

  const syncRoomUsers = useCallback((users, selfSocketId) => {
    setParticipants(users || []);

    const remoteUsers = (users || []).filter(
      (participant) => participant.socketId !== selfSocketId
    );
    const activeSocketIds = new Set(remoteUsers.map((participant) => participant.socketId));

    peerConnectionsRef.current.forEach((_, socketId) => {
      if (!activeSocketIds.has(socketId)) {
        cleanupPeerConnection(socketId);
      }
    });

    remoteUsers.forEach(async (participant) => {
      upsertRemoteFeed(participant.socketId, {
        userName: participant.userName,
        isMuted: participant.isMuted,
        isVideoOff: participant.isVideoOff,
      });

      if (selfSocketId && selfSocketId < participant.socketId) {
        await createOfferForParticipant(participant);
      }
    });
  }, [cleanupPeerConnection, createOfferForParticipant]);

  const replaceTrackForPeers = async (kind, nextTrack) => {
    const peerConnections = Array.from(peerConnectionsRef.current.values());

    await Promise.allSettled(
      peerConnections.map(async (peerConnection) => {
        const sender = peerConnection
          .getSenders()
          .find((candidate) => candidate.track?.kind === kind);

        if (sender) {
          await sender.replaceTrack(nextTrack);
          return;
        }

        if (nextTrack && localStreamRef.current) {
          peerConnection.addTrack(nextTrack, localStreamRef.current);
        }
      })
    );
  };

  const replaceVideoTrackForPeers = async (videoTrack) => {
    await replaceTrackForPeers("video", videoTrack);
  };

  const replaceAudioTrackForPeers = async (audioTrack) => {
    await replaceTrackForPeers("audio", audioTrack);
  };

  const removeVideoTracksFromLocalStream = () => {
    const localStream = ensureLocalStreamContainer();

    localStream.getVideoTracks().forEach((track) => {
      localStream.removeTrack(track);
    });
  };

  const stopScreenShare = async ({ restoreCamera = true } = {}) => {
    const screenTrack = screenTrackRef.current;
    screenTrackRef.current = null;

    if (screenTrack) {
      screenTrack.onended = null;
      if (screenTrack.readyState !== "ended") {
        screenTrack.stop();
      }
    }

    removeVideoTracksFromLocalStream();

    const cameraTrack = cameraTrackRef.current;
    const shouldRestoreCamera =
      restoreCamera && isVideoEnabled && cameraTrack?.readyState === "live";

    if (shouldRestoreCamera) {
      const localStream = ensureLocalStreamContainer();
      localStream.addTrack(cameraTrack);
      await replaceVideoTrackForPeers(cameraTrack);
      socketRef.current?.emit("toggle-video", {
        roomId,
        isVideoOff: false,
      });
    } else {
      await replaceVideoTrackForPeers(null);
      socketRef.current?.emit("toggle-video", {
        roomId,
        isVideoOff: true,
      });
    }

    setIsScreenSharing(false);
  };

  const teardownRoomConnection = useCallback((mode = "leave") => {
    if (socketRef.current) {
      socketRef.current.emit("leave-room", { roomId, mode });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    peerConnectionsRef.current.forEach((peerConnection) => {
      peerConnection.close();
    });
    peerConnectionsRef.current.clear();
    pendingOffersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    cameraTrackRef.current?.stop();
    cameraTrackRef.current = null;
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;

    setRemoteFeeds([]);
    setIsScreenSharing(false);
  }, [roomId]);

  const exitRoom = useCallback(
    (mode = "setup") => {
      if (exitInProgressRef.current) {
        return;
      }

      exitInProgressRef.current = true;
      const currentExitContext = exitContextRef.current;

      if (
        mode === "setup" &&
        currentExitContext.isAuthenticatedUser &&
        currentExitContext.isCurrentUserHost
      ) {
        setPendingHostRoom(currentExitContext.roomId);
      } else {
        clearPendingHostRoom();
      }

      teardownRoomConnection(mode);

      if (mode === "logout" && currentExitContext.isAuthenticatedUser) {
        clearAuthenticatedSession();
        navigate("/authentication?mode=login");
        return;
      }

      navigate(currentExitContext.setupPath);
    },
    [navigate, teardownRoomConnection]
  );

  useEffect(() => {
    let isCancelled = false;
    let meetingEndedTimeoutId;
    exitInProgressRef.current = false;

    const setupRoom = async () => {
      try {
        let stream;
        const mediaConstraints = {
          audio: Boolean(initialAudioEnabled),
          video: Boolean(initialVideoEnabled),
        };

        try {
          stream =
            mediaConstraints.audio || mediaConstraints.video
              ? await navigator.mediaDevices.getUserMedia(mediaConstraints)
              : new MediaStream();
        } catch {
          stream = new MediaStream();
          setErrorMessage(
            "Camera and microphone access failed. Joined with media off."
          );
          setStatusMessage("Joining room without camera and microphone...");
        }

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream.getAudioTracks().forEach((track) => {
          track.enabled = Boolean(initialAudioEnabled);
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = Boolean(initialVideoEnabled);
        });

        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        localStreamRef.current = stream;
        setIsAudioEnabled(stream.getAudioTracks().some((track) => track.enabled));
        setIsVideoEnabled(stream.getVideoTracks().some((track) => track.enabled));
        setIsMediaReady(true);
        setStatusMessage("Connecting to room...");

        const socket = io(SOCKET_SERVER_URL, {
          transports: ["websocket"],
          reconnection: false,
          timeout: 8000,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setIsSocketConnected(true);
          setStatusMessage(`Connected. Joining room ${roomId}...`);
          socket.emit("join-room", { roomId, userName, userId });
        });

        socket.on("joined-room", (payload) => {
          setStatusMessage(payload?.message || `Joined room ${roomId}`);
          if (stream.getTracks().length > 0) {
            setErrorMessage("");
          }

          if (!stream.getAudioTracks().length || !initialAudioEnabled) {
            socket.emit("toggle-audio", { roomId, isMuted: true });
          }
          if (!stream.getVideoTracks().length || !initialVideoEnabled) {
            socket.emit("toggle-video", { roomId, isVideoOff: true });
          }
        });

        socket.on("room-users", (users) => {
          syncRoomUsers(users || [], socket.id);
        });

        socket.on("user-joined", (participant) => {
          setStatusMessage(`${participant?.userName || "A user"} joined the room.`);
        });

        socket.on("user-left", (participant) => {
          setStatusMessage(`${participant?.userName || "A user"} left the room.`);
          cleanupPeerConnection(participant?.socketId);
        });

        socket.on("user-updated", (participant) => {
          updateParticipantState(participant.socketId, participant);
          upsertRemoteFeed(participant.socketId, {
            userName: participant.userName,
            isMuted: participant.isMuted,
            isVideoOff: participant.isVideoOff,
          });
        });

        socket.on("receive-message", (message) => {
          setMessages((currentMessages) => [...currentMessages, message]);
        });

        socket.on("webrtc-signal", async ({ signal, fromSocketId, caller }) => {
          if (!signal || !fromSocketId) {
            return;
          }

          const peerConnection = ensurePeerConnection(
            fromSocketId,
            caller?.userName || "Participant"
          );

          try {
            if (signal.type === "offer") {
              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(signal.sdp)
              );

              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);

              socket.emit("webrtc-signal", {
                roomId,
                targetSocketId: fromSocketId,
                caller: { userName, userId },
                signal: {
                  type: "answer",
                  sdp: answer,
                },
              });
            }

            if (signal.type === "answer") {
              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(signal.sdp)
              );
            }

            if (signal.type === "ice-candidate" && signal.candidate) {
              await peerConnection.addIceCandidate(
                new RTCIceCandidate(signal.candidate)
              );
            }
          } catch (error) {
            setErrorMessage(error.message || "Unable to process room signal.");
          }
        });

        socket.on("socket-error", (payload) => {
          if (exitInProgressRef.current) {
            return;
          }

          setErrorMessage(payload?.message || "Unable to join room.");
          if (payload?.code === "GUEST_FORBIDDEN") {
            meetingEndedTimeoutId = window.setTimeout(() => {
              exitRoom("setup");
            }, 1200);
          }
        });

        socket.on("disconnect", () => {
          if (exitInProgressRef.current) {
            return;
          }

          setIsSocketConnected(false);
          setStatusMessage("Disconnected from room.");
        });

        socket.on("connect_error", () => {
          if (exitInProgressRef.current) {
            return;
          }

          setIsSocketConnected(false);
          setErrorMessage("Unable to connect to the meeting server.");
          setStatusMessage("Connection failed.");
        });

        socket.on("meeting-ended", (payload) => {
          if (exitInProgressRef.current) {
            return;
          }

          const message = payload?.message || "Meeting has ended.";
          setErrorMessage(message);
          setStatusMessage(message);

          meetingEndedTimeoutId = window.setTimeout(() => {
            exitRoom("setup");
          }, 1200);
        });
      } catch (error) {
        setErrorMessage(error.message || "Unable to start your camera and microphone.");
        setStatusMessage("Media access failed.");
      }
    };

    void setupRoom();

    return () => {
      isCancelled = true;
      if (meetingEndedTimeoutId) {
        clearTimeout(meetingEndedTimeoutId);
      }

      teardownRoomConnection();
    };
  }, [
    roomId,
    userId,
    userName,
    initialAudioEnabled,
    initialVideoEnabled,
    syncRoomUsers,
    ensurePeerConnection,
    cleanupPeerConnection,
    exitRoom,
    teardownRoomConnection,
  ]);

  useEffect(() => {
    let isActive = true;

    const fetchHostName = async () => {
      if (!roomId) {
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/meetings/code/${roomId}`);
        const result = await response.json();

        if (!isActive) {
          return;
        }

        if (response.ok && result?.data?.userId) {
          const host =
            result.data.userId.name ||
            result.data.userId.username ||
            "";
          setHostName(host);
        }
      } catch {
        if (isActive) {
          setHostName("");
        }
      }
    };

    void fetchHostName();

    return () => {
      isActive = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (hostName) {
      return;
    }
    const hostParticipant = participants.find((participant) => participant.isHost);
    if (hostParticipant?.userName) {
      setHostName(hostParticipant.userName);
    }
  }, [hostName, participants]);

  const toggleAudio = async () => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];

    if (audioTracks.length === 0) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const [newAudioTrack] = audioStream.getAudioTracks();

        if (!newAudioTrack) {
          throw new Error("No microphone track available.");
        }

        const localStream = ensureLocalStreamContainer();
        localStream.addTrack(newAudioTrack);
        await replaceAudioTrackForPeers(newAudioTrack);
        setIsAudioEnabled(true);
        socketRef.current?.emit("toggle-audio", {
          roomId,
          isMuted: false,
        });
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(error.message || "Unable to access your microphone.");
      }
      return;
    }

    const nextAudioState = !isAudioEnabled;
    audioTracks.forEach((track) => {
      track.enabled = nextAudioState;
    });
    setIsAudioEnabled(nextAudioState);
    socketRef.current?.emit("toggle-audio", {
      roomId,
      isMuted: !nextAudioState,
    });
    setErrorMessage("");
  };

  const toggleVideo = async () => {
    const localStream = ensureLocalStreamContainer();

    try {
      if (isVideoEnabled) {
        if (isScreenSharing) {
          await stopScreenShare({ restoreCamera: false });
        }

        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });

        cameraTrackRef.current = null;
        await replaceVideoTrackForPeers(null);
        setIsVideoEnabled(false);
        socketRef.current?.emit("toggle-video", {
          roomId,
          isVideoOff: true,
        });
        setErrorMessage("");
        return;
      }

      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const [newVideoTrack] = cameraStream.getVideoTracks();

      if (!newVideoTrack) {
        throw new Error("Unable to restart camera.");
      }

      localStream.addTrack(newVideoTrack);
      cameraTrackRef.current = newVideoTrack;
      await replaceVideoTrackForPeers(newVideoTrack);
      setIsVideoEnabled(true);
      socketRef.current?.emit("toggle-video", {
        roomId,
        isVideoOff: false,
      });
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Unable to control your camera.");
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrorMessage("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const [screenTrack] = displayStream.getVideoTracks();

      if (!screenTrack) {
        throw new Error("Unable to start screen sharing.");
      }

      const localStream = ensureLocalStreamContainer();
      const [activeCameraTrack] = localStream.getVideoTracks();

      if (activeCameraTrack && activeCameraTrack !== screenTrack) {
        cameraTrackRef.current = activeCameraTrack;
      }

      removeVideoTracksFromLocalStream();
      localStream.addTrack(screenTrack);
      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => {
        void stopScreenShare();
      };

      await replaceVideoTrackForPeers(screenTrack);
      setIsScreenSharing(true);
      socketRef.current?.emit("toggle-video", {
        roomId,
        isVideoOff: false,
      });
      setErrorMessage("");
    } catch (error) {
      if (error.name === "NotAllowedError") {
        setErrorMessage("Screen sharing permission was cancelled.");
      } else {
        setErrorMessage(error.message || "Unable to share your screen.");
      }
    }
  };

  const leaveRoom = () => {
    exitRoom("setup");
  };

  const sendMessage = (messageText) => {
    const nextMessage = {
      roomId,
      senderName: userName,
      senderId: userId,
      message: messageText,
      createdAt: new Date().toISOString(),
    };

    socketRef.current?.emit("send-message", nextMessage);
  };

  const participantCountLabel =
    participants.length === 1 ? "1 participant" : `${participants.length} participants`;
  const isRoomReady = isMediaReady && isSocketConnected;

  if (!isRoomReady) {
    return (
      <main className="zoom-room">
        <section className="zoom-loading">
          <div className="zoom-loading-card">
            <div className="zoom-loading-orb" />
            <h2>Connecting to room</h2>
            <p>{statusMessage}</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="zoom-room">
      <section className="zoom-frame">
        <div className="zoom-main">
          <header className="zoom-topbar">
            <div className="zoom-topbar-left">
              <span className="zoom-brand">InstaMeet</span>
              <span className="zoom-room-chip">Room {roomId}</span>
            </div>
            <div className="zoom-topbar-right">
              <span className="zoom-status">{statusMessage}</span>
              <span className="zoom-pill">{participantCountLabel}</span>
            </div>
          </header>

          {errorMessage ? <p className="room-error">{errorMessage}</p> : null}

          <div className="zoom-stage">
            <MeetingScreen
              userName={userName}
              localStream={localStreamRef.current}
              isAudioEnabled={isAudioEnabled}
              isVideoEnabled={isVideoEnabled}
              isScreenSharing={isScreenSharing}
              selfSocketId={selfSocketId}
              remoteFeeds={remoteFeeds}
              onToggleAudio={toggleAudio}
              onToggleVideo={toggleVideo}
              onToggleScreenShare={toggleScreenShare}
              onLeaveRoom={leaveRoom}
            />
          </div>
        </div>

        <aside className="zoom-side">
          <div className="zoom-side-header">
            <div className="zoom-side-tabs">
              <button
                type="button"
                className={`zoom-tab ${activePanel === "chat" ? "active" : ""}`}
                onClick={() => setActivePanel("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={`zoom-tab ${activePanel === "info" ? "active" : ""}`}
                onClick={() => setActivePanel("info")}
              >
                Info
              </button>
            </div>
          </div>

          <div className="zoom-side-body">
            {activePanel === "chat" ? (
              <RoomChat
                messages={messages}
                userName={userName}
                selfSocketId={selfSocketId}
                currentUserId={currentChatIdentity}
                onSendMessage={sendMessage}
              />
            ) : (
            <RoomInfo
              roomId={roomId}
              userName={userName}
              hostName={hostName}
              participants={participants}
              isAudioEnabled={isAudioEnabled}
              isVideoEnabled={isVideoEnabled}
              selfSocketId={selfSocketId}
            />
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
