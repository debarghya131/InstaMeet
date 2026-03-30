import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export default function VideoMeetPage() {
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const savedUser =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("instameet_user") || "null")
      : null;
  const displayName = savedUser?.name || savedUser?.username || "Guest User";

  const [connectionState, setConnectionState] = useState("idle");
  const [iceGatheringState, setIceGatheringState] = useState("new");
  const [stunStatus, setStunStatus] = useState("Not started");
  const [errorMessage, setErrorMessage] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [roomCodeInput, setRoomCodeInput] = useState("INSTA-ROOM-101");
  const [roomCode, setRoomCode] = useState("INSTA-ROOM-101");

  const stopVideoTracks = async () => {
    const stream = localStreamRef.current;

    if (!stream) {
      return;
    }

    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.stop();
      stream.removeTrack(track);
    });

    const videoSender = peerConnectionRef.current
      ?.getSenders()
      .find((sender) => sender.track?.kind === "video");

    if (videoSender) {
      await videoSender.replaceTrack(null);
    }

    attachStreamToPreview(stream);
    syncTrackState(stream);
  };

  const releaseMeetingResources = async () => {
    if (peerConnectionRef.current) {
      const senders = peerConnectionRef.current.getSenders();
      await Promise.allSettled(
        senders.map((sender) => sender.replaceTrack(null))
      );
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setIsAudioEnabled(false);
    setIsVideoEnabled(false);
  };

  const attachStreamToPreview = (stream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  };

  const syncTrackState = (stream) => {
    setIsAudioEnabled(
      stream?.getAudioTracks().some((track) => track.enabled && track.readyState === "live") || false
    );
    setIsVideoEnabled(
      stream?.getVideoTracks().some((track) => track.enabled && track.readyState === "live") || false
    );
  };

  useEffect(() => {
    let isDisposed = false;

    const startMeetingPreview = async () => {
      try {
        setConnectionState("requesting-media");
        setErrorMessage("");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (isDisposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        syncTrackState(stream);

        attachStreamToPreview(stream);

        const peerConnection = new RTCPeerConnection(rtcConfiguration);
        peerConnectionRef.current = peerConnection;

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        peerConnection.onicegatheringstatechange = () => {
          setIceGatheringState(peerConnection.iceGatheringState);
        };

        peerConnection.oniceconnectionstatechange = () => {
          setConnectionState(peerConnection.iceConnectionState);
        };

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            setCandidateCount((currentCount) => currentCount + 1);
            setStunStatus("STUN server responding and ICE candidates gathered.");
          }

          if (!event.candidate && peerConnection.iceGatheringState === "complete") {
            setStunStatus("ICE gathering complete.");
          }
        };

        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });

        await peerConnection.setLocalDescription(offer);
        setConnectionState("offer-created");
        setStunStatus("STUN server activated for ICE gathering.");
      } catch (error) {
        setErrorMessage(error.message || "Unable to start local media.");
        setConnectionState("failed");
        setStunStatus("STUN activation failed.");
      }
    };

    startMeetingPreview();

    return () => {
      isDisposed = true;
      void releaseMeetingResources();
    };
  }, []);

  const toggleAudio = () => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];

    if (audioTracks.length === 0) {
      setErrorMessage("No microphone track available to control.");
      return;
    }

    const nextAudioState = !isAudioEnabled;
    audioTracks.forEach((track) => {
      track.enabled = nextAudioState;
    });
    syncTrackState(localStreamRef.current);
    setErrorMessage("");
  };

  const toggleVideo = async () => {
    const stream = localStreamRef.current;

    if (!stream) {
      setErrorMessage("Local media stream is not available.");
      return;
    }

    try {
      if (isVideoEnabled) {
        if (stream.getVideoTracks().length === 0) {
          setErrorMessage("No camera track available to control.");
          return;
        }
        await stopVideoTracks();
        setErrorMessage("");
        return;
      }

      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      const [newVideoTrack] = cameraStream.getVideoTracks();

      if (!newVideoTrack) {
        throw new Error("Unable to restart camera.");
      }

      stream.addTrack(newVideoTrack);

      const videoSender = peerConnectionRef.current
        ?.getSenders()
        .find((sender) => sender.track?.kind === "video");

      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      } else if (peerConnectionRef.current) {
        peerConnectionRef.current.addTrack(newVideoTrack, stream);
      }

      attachStreamToPreview(stream);
      syncTrackState(stream);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Unable to control camera.");
    }
  };

  const handleRoomCodeSubmit = (event) => {
    event.preventDefault();

    const trimmedRoomCode = roomCodeInput.trim();

    if (!trimmedRoomCode) {
      setErrorMessage("Please enter a room ID.");
      return;
    }

    const nextRoomCode = trimmedRoomCode.toUpperCase();
    setRoomCode(nextRoomCode);
    setErrorMessage("");
    void releaseMeetingResources().finally(() => {
      navigate(`/room/${nextRoomCode}`, {
        state: {
          userName: displayName,
          userId: savedUser?.id || "",
        },
      });
    });
  };

  return (
    <main className="video-meet-page">
      <section className="video-meet-shell">
        <div className="video-meet-topbar">
          <div>
            <h1>InstaMeet Video Room</h1>
          </div>

          <div className="video-meet-topbar-actions">
            <Link className="video-meet-back" to="/">
              Back Home
            </Link>
          </div>
        </div>

        <div className="video-meet-hero">
          <div className="video-meet-hero-copy">
            <p className="video-meet-tagline">Connect with your ❤️ ones</p>
            <form className="video-room-form" onSubmit={handleRoomCodeSubmit}>
              <label className="video-room-label" htmlFor="roomCode">
                Create your custom room ID
              </label>
              <div className="video-room-form-row">
                <input
                  id="roomCode"
                  className="video-room-input"
                  type="text"
                  value={roomCodeInput}
                  onChange={(event) => setRoomCodeInput(event.target.value)}
                  placeholder="Enter room ID"
                />
                <button type="submit" className="video-room-submit">
                  Connect
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="video-meet-grid">
          <div className="video-stage">
            <div className="video-stage-header">
              <div>
                <p className="video-stage-label">Your Camera</p>
                <h2>{displayName}</h2>
              </div>
              <div className="video-stage-live">
                <span className="video-stage-live-dot" />
                Live Preview
              </div>
            </div>

            <div className="video-stage-frame">
              <video
                ref={localVideoRef}
                className="video-preview"
                autoPlay
                muted
                playsInline
              />

              <div className="video-stage-overlay">
                <div className="video-stage-caption">
                  <strong>{isVideoEnabled ? "Camera active" : "Camera paused"}</strong>
                  <span>
                    {isAudioEnabled ? "Microphone on" : "Microphone muted"}
                  </span>
                </div>
              </div>
            </div>

            <div className="video-controls">
              <button
                type="button"
                className={`video-control-button ${isAudioEnabled ? "" : "video-control-button-off"}`}
                onClick={toggleAudio}
              >
                {isAudioEnabled ? "Mute Audio" : "Unmute Audio"}
              </button>
              <button
                type="button"
                className={`video-control-button ${isVideoEnabled ? "" : "video-control-button-off"}`}
                onClick={toggleVideo}
              >
                {isVideoEnabled ? "Turn Off Video" : "Turn On Video"}
              </button>
            </div>
          </div>

          <div className="video-panel video-status-panel">
            <h2>Session Console</h2>
            <div className="video-status-list">
              <p>
                <span>ICE Connection:</span> {connectionState}
              </p>
              <p>
                <span>ICE Gathering:</span> {iceGatheringState}
              </p>
              <p>
                <span>STUN Status:</span> {stunStatus}
              </p>
              <p>
                <span>Candidates Found:</span> {candidateCount}
              </p>
              <p>
                <span>Microphone:</span> {isAudioEnabled ? "On" : "Off"}
              </p>
              <p>
                <span>Camera:</span> {isVideoEnabled ? "On" : "Off"}
              </p>
            </div>

            {errorMessage ? (
              <p className="video-error-message">{errorMessage}</p>
            ) : null}

            <div className="video-server-box">
              <h3>Room Summary</h3>
              <ul>
                <li>Room ID: {roomCode}</li>
                <li>User: {displayName}</li>
                <li>STUN: {stunStatus}</li>
              </ul>
            </div>

            <div className="video-server-box">
              <h3>Active STUN Servers</h3>
              <ul>
                <li>stun:stun.l.google.com:19302</li>
                <li>stun:stun1.l.google.com:19302</li>
                <li>stun:stun2.l.google.com:19302</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
