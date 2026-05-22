import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";

import MeetingScreen from "./MeetingScreen";
import RoomChat from "./RoomChat";
import RoomInfo from "./RoomInfo";
import RoomPresence from "./RoomPresence";
import {
  clearAuthenticatedSession,
  clearPendingHostRoom,
  markAuthenticatedSession,
  markGuestSession,
  resolveSessionContext,
  setPendingHostRoom,
} from "../utils/session";
import { getFriendlyMediaError } from "../utils/mediaErrors";
import { API_BASE_URL, RTC_CONFIGURATION, SOCKET_SERVER_URL } from "../config";

export default function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const speakerAnalysisContextRef = useRef(null);
  const speakerAnalyserMapRef = useRef(new Map());
  const peerConnectionsRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const pendingOffersRef = useRef(new Set());
  const exitInProgressRef = useRef(false);
  const lastSpeakerAtRef = useRef(0);
  const exitContextRef = useRef({
    isAuthenticatedUser: false,
    isCurrentUserHost: false,
    roomId: "",
    setupPath: "/video-meet",
  });
  const {
    authToken,
    userName,
    userId,
    isGuestUser,
    isAuthenticatedUser,
    setupPath,
  } =
    resolveSessionContext(location.state);

  const [participants, setParticipants] = useState([]);
  const [remoteFeeds, setRemoteFeeds] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selfSocketId, setSelfSocketId] = useState("");
  const [activeSpeakerId, setActiveSpeakerId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Preparing your camera and microphone...");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [activePanel, setActivePanel] = useState("chat");
  const [hostName, setHostName] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const savedMediaPrefs =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("instameet_media_prefs") || "null")
      : null;
  const initialAudioEnabled =
    savedMediaPrefs?.audioEnabled === undefined ? true : savedMediaPrefs?.audioEnabled;
  const initialVideoEnabled =
    savedMediaPrefs?.videoEnabled === undefined ? true : savedMediaPrefs?.videoEnabled;
  const currentParticipant =
    participants.find((participant) => participant.socketId === selfSocketId) ||
    participants.find((participant) => String(participant.userId) === String(userId));
  const isCurrentUserHost = Boolean(currentParticipant?.isHost);
  const currentChatIdentity =
    currentParticipant?.userId || userId || selfSocketId || "";
  const hasLiveAudioTrack = Boolean(
    localStreamRef.current?.getAudioTracks().some((track) => track.readyState === "live")
  );

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
    if (!socketId || socketId === socketRef.current?.id) {
      return;
    }

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

  const cleanupSpeakerAnalyser = useCallback((speakerId) => {
    const currentAnalyser = speakerAnalyserMapRef.current.get(speakerId);

    if (!currentAnalyser) {
      return;
    }

    currentAnalyser.source.disconnect();
    currentAnalyser.analyser.disconnect();
    speakerAnalyserMapRef.current.delete(speakerId);
  }, []);

  const cleanupAllSpeakerAnalysers = useCallback(() => {
    speakerAnalyserMapRef.current.forEach((_, speakerId) => {
      cleanupSpeakerAnalyser(speakerId);
    });

    if (speakerAnalysisContextRef.current) {
      void speakerAnalysisContextRef.current.close().catch(() => {});
      speakerAnalysisContextRef.current = null;
    }
  }, [cleanupSpeakerAnalyser]);

  const mergeRemoteMedia = (
    socketId,
    { track, stream, userName = "Participant" }
  ) => {
    if (!socketId || socketId === socketRef.current?.id) {
      return;
    }

    setRemoteFeeds((currentFeeds) => {
      const existingFeed = currentFeeds.find((feed) => feed.socketId === socketId);
      const nextStream = stream || existingFeed?.stream || new MediaStream();

      if (!stream && track) {
        const duplicateTrack = nextStream
          .getTracks()
          .find((candidate) => candidate.id === track.id);

        if (!duplicateTrack) {
          nextStream
            .getTracks()
            .filter((candidate) => candidate.kind === track.kind)
            .forEach((candidate) => {
              nextStream.removeTrack(candidate);
            });

          nextStream.addTrack(track);
        }
      }

      if (!existingFeed) {
        return [
          ...currentFeeds,
          {
            socketId,
            userName,
            stream: nextStream,
          },
        ];
      }

      return currentFeeds.map((feed) =>
        feed.socketId === socketId
          ? {
              ...feed,
              userName: feed.userName || userName,
              stream: nextStream,
            }
          : feed
      );
    });
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
    pendingIceCandidatesRef.current.delete(socketId);
    removeRemoteFeed(socketId);
  }, []);

  const queueIceCandidate = (socketId, candidate) => {
    const currentQueue = pendingIceCandidatesRef.current.get(socketId) || [];
    pendingIceCandidatesRef.current.set(socketId, [...currentQueue, candidate]);
  };

  const flushQueuedIceCandidates = useCallback(async (socketId, peerConnection) => {
    const queuedCandidates = pendingIceCandidatesRef.current.get(socketId);

    if (!queuedCandidates?.length) {
      return;
    }

    pendingIceCandidatesRef.current.delete(socketId);

    for (const candidate of queuedCandidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        setErrorMessage(error.message || "Unable to process room signal.");
      }
    }
  }, []);

  const ensurePeerConnection = useCallback((targetSocketId, targetName = "Participant") => {
    const existingConnection = peerConnectionsRef.current.get(targetSocketId);

    if (existingConnection) {
      return existingConnection;
    }

    const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
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
      const incomingTrack = event.track;
      const incomingStream = event.streams?.[0];

      if (!incomingTrack && !incomingStream) {
        return;
      }

      mergeRemoteMedia(targetSocketId, {
        track: incomingTrack,
        stream: incomingStream,
        userName: targetName,
      });
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

    if (peerConnection.signalingState !== "stable") {
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

    setRemoteFeeds((currentFeeds) =>
      currentFeeds.filter((feed) => activeSocketIds.has(feed.socketId))
    );

    remoteUsers.forEach(async (participant) => {
      upsertRemoteFeed(participant.socketId, {
        userName: participant.userName,
        isMuted: participant.isMuted,
        hasAudioTrack: participant.hasAudioTrack,
        isVideoOff: participant.isVideoOff,
      });

      if (selfSocketId && selfSocketId < participant.socketId) {
        await createOfferForParticipant(participant);
      }
    });
  }, [cleanupPeerConnection, createOfferForParticipant]);

  const replaceTrackForPeers = async (kind, nextTrack) => {
    const peerConnections = Array.from(peerConnectionsRef.current.entries());
    const peersNeedingRenegotiation = new Set();

    await Promise.allSettled(
      peerConnections.map(async ([socketId, peerConnection]) => {
        const transceiver = peerConnection
          .getTransceivers()
          .find(
            (candidate) =>
              candidate.sender?.track?.kind === kind ||
              candidate.receiver?.track?.kind === kind
          );
        const sender = transceiver?.sender;

        if (sender) {
          const hadOutgoingTrack = Boolean(sender.track);
          await sender.replaceTrack(nextTrack);

          const preferredDirection =
            nextTrack && transceiver.receiver?.track?.kind === kind
              ? "sendrecv"
              : nextTrack
                ? "sendonly"
                : transceiver.receiver?.track?.kind === kind
                  ? "recvonly"
                  : "inactive";

          if (transceiver.direction !== preferredDirection) {
            transceiver.direction = preferredDirection;
            peersNeedingRenegotiation.add(socketId);
            return;
          }

          if (hadOutgoingTrack !== Boolean(nextTrack)) {
            peersNeedingRenegotiation.add(socketId);
          }
          return;
        }

        if (nextTrack && localStreamRef.current) {
          peerConnection.addTrack(nextTrack, localStreamRef.current);
          peersNeedingRenegotiation.add(socketId);
        }
      })
    );

    await Promise.allSettled(
      Array.from(peersNeedingRenegotiation).map(async (socketId) => {
        const participant =
          participants.find((candidate) => candidate.socketId === socketId) ||
          remoteFeeds.find((candidate) => candidate.socketId === socketId);

        if (!participant) {
          return;
        }

        await createOfferForParticipant({
          socketId,
          userName: participant.userName || "Participant",
        });
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

  const teardownRoomConnection = useCallback((mode = "disconnect") => {
    if (socketRef.current) {
      socketRef.current.emit("leave-room", { roomId, mode });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    peerConnectionsRef.current.forEach((peerConnection) => {
      peerConnection.close();
    });
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
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
    setSelfSocketId("");
    setActiveSpeakerId("");
    setIsScreenSharing(false);
    lastSpeakerAtRef.current = 0;
    cleanupAllSpeakerAnalysers();
  }, [roomId, cleanupAllSpeakerAnalysers]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const desiredSpeakerStreams = new Map();
    const localAudioTrack = localStreamRef.current
      ?.getAudioTracks()
      ?.find((track) => track.readyState === "live");

    if (localStreamRef.current && localAudioTrack) {
      desiredSpeakerStreams.set("local", {
        stream: localStreamRef.current,
        trackId: localAudioTrack.id,
        isMuted: !isAudioEnabled,
      });
    }

    remoteFeeds.forEach((feed) => {
      const liveAudioTrack = feed.stream
        ?.getAudioTracks()
        ?.find((track) => track.readyState === "live");

      if (!feed.stream || !liveAudioTrack) {
        return;
      }

      desiredSpeakerStreams.set(feed.socketId, {
        stream: feed.stream,
        trackId: liveAudioTrack.id,
        isMuted: feed.hasAudioTrack === false || Boolean(feed.isMuted),
      });
    });

    speakerAnalyserMapRef.current.forEach((_, speakerId) => {
      if (!desiredSpeakerStreams.has(speakerId)) {
        cleanupSpeakerAnalyser(speakerId);
      }
    });

    if (!desiredSpeakerStreams.size) {
      lastSpeakerAtRef.current = 0;
      setActiveSpeakerId("");
      return undefined;
    }

    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return undefined;
    }

    let speakerAnalysisContext = speakerAnalysisContextRef.current;

    if (!speakerAnalysisContext || speakerAnalysisContext.state === "closed") {
      speakerAnalysisContext = new AudioContextConstructor();
      speakerAnalysisContextRef.current = speakerAnalysisContext;
    }

    if (speakerAnalysisContext.state === "suspended") {
      void speakerAnalysisContext.resume().catch(() => {});
    }

    desiredSpeakerStreams.forEach(({ stream, trackId }, speakerId) => {
      const currentAnalyser = speakerAnalyserMapRef.current.get(speakerId);

      if (
        currentAnalyser &&
        currentAnalyser.stream === stream &&
        currentAnalyser.trackId === trackId
      ) {
        return;
      }

      cleanupSpeakerAnalyser(speakerId);

      try {
        const analyser = speakerAnalysisContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;

        const source = speakerAnalysisContext.createMediaStreamSource(stream);
        source.connect(analyser);

        speakerAnalyserMapRef.current.set(speakerId, {
          analyser,
          dataArray: new Uint8Array(analyser.fftSize),
          source,
          stream,
          trackId,
        });
      } catch {
        // Some browsers can reject analyser creation for unstable device states.
      }
    });

    const monitorIntervalId = window.setInterval(() => {
      let loudestSpeakerId = "";
      let loudestSpeakerLevel = 0;

      desiredSpeakerStreams.forEach(({ isMuted }, speakerId) => {
        if (isMuted) {
          return;
        }

        const currentAnalyser = speakerAnalyserMapRef.current.get(speakerId);

        if (!currentAnalyser) {
          return;
        }

        currentAnalyser.analyser.getByteTimeDomainData(currentAnalyser.dataArray);

        const averageDeviation =
          currentAnalyser.dataArray.reduce(
            (total, value) => total + Math.abs(value - 128),
            0
          ) / currentAnalyser.dataArray.length;

        if (averageDeviation > loudestSpeakerLevel) {
          loudestSpeakerLevel = averageDeviation;
          loudestSpeakerId = speakerId;
        }
      });

      const now = Date.now();

      if (loudestSpeakerId && loudestSpeakerLevel >= 9) {
        lastSpeakerAtRef.current = now;
        setActiveSpeakerId((currentSpeakerId) =>
          currentSpeakerId === loudestSpeakerId
            ? currentSpeakerId
            : loudestSpeakerId
        );
        return;
      }

      if (now - lastSpeakerAtRef.current > 1400) {
        setActiveSpeakerId("");
      }
    }, 220);

    return () => {
      window.clearInterval(monitorIntervalId);
    };
  }, [remoteFeeds, isAudioEnabled, hasLiveAudioTrack, cleanupSpeakerAnalyser]);

  useEffect(
    () => () => {
      cleanupAllSpeakerAnalysers();
    },
    [cleanupAllSpeakerAnalysers]
  );

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

          if (mediaConstraints.audio) {
            try {
              const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
              });
              audioOnlyStream.getAudioTracks().forEach((track) => {
                stream.addTrack(track);
              });
            } catch {
              // Fall through and continue without audio.
            }
          }

          if (mediaConstraints.video) {
            try {
              const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
                video: true,
              });
              videoOnlyStream.getVideoTracks().forEach((track) => {
                stream.addTrack(track);
              });
            } catch {
              // Fall through and continue without video.
            }
          }

          if (stream.getTracks().length > 0) {
            setErrorMessage(
              "Some media permissions were denied. Joined with available devices only."
            );
            setStatusMessage("Joining room with limited media access...");
          } else {
            setErrorMessage(
              "Camera and microphone access failed. Joined with media off."
            );
            setStatusMessage("Joining room without camera and microphone...");
          }
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
          auth:
            isAuthenticatedUser && authToken
              ? {
                  token: authToken,
                }
              : undefined,
          transports: ["websocket"],
          reconnection: false,
          timeout: 8000,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setSelfSocketId(socket.id);
          setIsSocketConnected(true);
          setStatusMessage(`Connected. Joining room ${roomId}...`);
          socket.emit("join-room", {
            roomId,
            userName,
            userId,
            hasAudioTrack: stream.getAudioTracks().some(
              (track) => track.readyState === "live"
            ),
          });
        });

        socket.on("joined-room", (payload) => {
          setStatusMessage(payload?.message || `Joined room ${roomId}`);
          if (stream.getTracks().length > 0) {
            setErrorMessage("");
          }

          if (!stream.getAudioTracks().length || !initialAudioEnabled) {
            socket.emit("toggle-audio", {
              roomId,
              isMuted: true,
              hasAudioTrack: stream.getAudioTracks().some(
                (track) => track.readyState === "live"
              ),
            });
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

          if (participant.socketId !== socket.id) {
            upsertRemoteFeed(participant.socketId, {
              userName: participant.userName,
              isMuted: participant.isMuted,
              hasAudioTrack: participant.hasAudioTrack,
              isVideoOff: participant.isVideoOff,
            });
          }
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
              await flushQueuedIceCandidates(fromSocketId, peerConnection);

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
              await flushQueuedIceCandidates(fromSocketId, peerConnection);
            }

            if (signal.type === "ice-candidate" && signal.candidate) {
              if (!peerConnection.remoteDescription?.type) {
                queueIceCandidate(fromSocketId, signal.candidate);
              } else {
                await peerConnection.addIceCandidate(
                  new RTCIceCandidate(signal.candidate)
                );
              }
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
          if (payload?.code === "AUTH_REQUIRED") {
            meetingEndedTimeoutId = window.setTimeout(() => {
              exitRoom("logout");
            }, 1200);
          }
        });

        socket.on("disconnect", () => {
          if (exitInProgressRef.current) {
            return;
          }

          setSelfSocketId("");
          setIsSocketConnected(false);
          setStatusMessage("Disconnected from room.");
        });

        socket.on("connect_error", () => {
          if (exitInProgressRef.current) {
            return;
          }

          setSelfSocketId("");
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
        setErrorMessage(
          getFriendlyMediaError(
            error,
            initialVideoEnabled ? "camera" : "audio"
          )
        );
        setStatusMessage("Media access failed.");
      }
    };

    void setupRoom();

    return () => {
      isCancelled = true;
      if (meetingEndedTimeoutId) {
        clearTimeout(meetingEndedTimeoutId);
      }

      teardownRoomConnection("disconnect");
    };
  }, [
    roomId,
    authToken,
    userId,
    userName,
    isAuthenticatedUser,
    initialAudioEnabled,
    initialVideoEnabled,
    syncRoomUsers,
    ensurePeerConnection,
    cleanupPeerConnection,
    flushQueuedIceCandidates,
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
    const localStream = ensureLocalStreamContainer();
    const audioTracks = localStream
      .getAudioTracks()
      .filter((track) => track.readyState === "live");

    if (audioTracks.length === 0) {
      localStream.getAudioTracks().forEach((track) => {
        localStream.removeTrack(track);
        if (track.readyState === "live") {
          track.stop();
        }
      });

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const [newAudioTrack] = audioStream.getAudioTracks();

        if (!newAudioTrack) {
          throw new Error("No microphone track available.");
        }

        localStream.addTrack(newAudioTrack);
        await replaceAudioTrackForPeers(newAudioTrack);
        setIsAudioEnabled(true);
        socketRef.current?.emit("toggle-audio", {
          roomId,
          isMuted: false,
          hasAudioTrack: true,
        });
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(getFriendlyMediaError(error, "audio"));
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
      hasAudioTrack: true,
    });
    setErrorMessage("");
  };

  const toggleVideo = async () => {
    if (isScreenSharing) {
      setErrorMessage("Stop screen sharing before changing your camera.");
      return;
    }

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
      setErrorMessage(getFriendlyMediaError(error, "camera"));
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
        setErrorMessage(getFriendlyMediaError(error, "display"));
      }
    }
  };

  const leaveRoom = () => {
    exitRoom("setup");
  };

  const handlePanelChange = (panelName) => {
    setActivePanel(panelName);
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
            <div className="zoom-topbar-middle">
              <span className="zoom-made-with">Made With ♥️ Debarghya</span>
            </div>
            <div className="zoom-topbar-right">
              <span className="zoom-status">{statusMessage}</span>
              <span className="zoom-pill">{participantCountLabel}</span>
            </div>
          </header>

          <div className="zoom-mobile-controls">
            <button
              type="button"
              className={`meeting-control ${isAudioEnabled ? "active" : "inactive"}`}
              onClick={toggleAudio}
              title={
                hasLiveAudioTrack
                  ? isAudioEnabled
                    ? "Mute microphone"
                    : "Unmute microphone"
                  : "Turn on your microphone"
              }
            >
              <span className="meeting-control-icon">
                <i className="fa-solid fa-microphone" aria-hidden="true" />
              </span>
              <span className="meeting-control-label">
                {hasLiveAudioTrack
                  ? isAudioEnabled
                    ? "Mute"
                    : "Unmute"
                  : "Start Mic"}
              </span>
            </button>

            <button
              type="button"
              className={`meeting-control ${isVideoEnabled ? "active" : "inactive"} ${
                isScreenSharing ? "meeting-control-disabled" : ""
              }`}
              onClick={toggleVideo}
              title={
                isScreenSharing
                  ? "Stop screen sharing before changing your camera"
                  : isVideoEnabled
                    ? "Turn off camera"
                    : "Turn on camera"
              }
              disabled={isScreenSharing}
            >
              <span className="meeting-control-icon">
                <i className="fa-solid fa-video" aria-hidden="true" />
              </span>
              <span className="meeting-control-label">
                {isScreenSharing
                  ? "Camera Locked"
                  : isVideoEnabled
                    ? "Stop Video"
                    : "Start Video"}
              </span>
            </button>

            <button
              type="button"
              className={`meeting-control meeting-control-share ${
                isScreenSharing ? "active" : "inactive"
              }`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? "Stop screen sharing" : "Share your screen"}
            >
              <span className="meeting-control-icon">
                <i className="fa-solid fa-display" aria-hidden="true" />
              </span>
              <span className="meeting-control-label">
                {isScreenSharing ? "Stop Share" : "Share Screen"}
              </span>
            </button>

            <button
              type="button"
              className="meeting-control meeting-control-leave"
              onClick={leaveRoom}
              title="Leave the meeting room"
            >
              <span className="meeting-control-icon">
                <i className="fa-solid fa-phone" aria-hidden="true" />
              </span>
              <span className="meeting-control-label">Leave</span>
            </button>

            <button
              type="button"
              className={`zoom-mobile-menu ${isMobileSidebarOpen ? "open" : ""}`}
              aria-label={
                isMobileSidebarOpen ? "Close meeting menu" : "Open meeting menu"
              }
              aria-expanded={isMobileSidebarOpen}
              onClick={() => setIsMobileSidebarOpen((currentValue) => !currentValue)}
            >
              <span className="zoom-mobile-menu-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>

          <div className="zoom-content">
            {errorMessage ? <p className="room-error">{errorMessage}</p> : null}

            <div className="zoom-stage">
              <MeetingScreen
                userName={userName}
                localStream={localStreamRef.current}
                isAudioEnabled={isAudioEnabled}
                hasAudioTrack={hasLiveAudioTrack}
              isVideoEnabled={isVideoEnabled}
              isScreenSharing={isScreenSharing}
              selfSocketId={selfSocketId}
              activeSpeakerId={activeSpeakerId}
              hasRemoteParticipant={participants.some(
                (participant) => participant.socketId !== selfSocketId
              )}
              remoteFeeds={remoteFeeds}
              onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
                onToggleScreenShare={toggleScreenShare}
                onLeaveRoom={leaveRoom}
              />
            </div>
          </div>
        </div>

        {isMobileSidebarOpen ? (
          <button
            type="button"
            className="zoom-side-backdrop"
            aria-label="Close meeting menu"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        ) : null}

        <aside className={`zoom-side ${isMobileSidebarOpen ? "zoom-side-open" : ""}`}>
          <div className="zoom-side-header">
            <div className="zoom-side-tabs">
              <button
                type="button"
                className={`zoom-tab ${activePanel === "chat" ? "active" : ""}`}
                onClick={() => handlePanelChange("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={`zoom-tab ${activePanel === "info" ? "active" : ""}`}
                onClick={() => handlePanelChange("info")}
              >
                Info
              </button>
              <button
                type="button"
                className={`zoom-tab ${activePanel === "presence" ? "active" : ""}`}
                onClick={() => handlePanelChange("presence")}
              >
                Who is here
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
            ) : activePanel === "presence" ? (
              <RoomPresence
                participants={participants}
                selfSocketId={selfSocketId}
              />
            ) : (
              <RoomInfo
                roomId={roomId}
                userName={userName}
                hostName={hostName}
                participants={participants}
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
              />
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
