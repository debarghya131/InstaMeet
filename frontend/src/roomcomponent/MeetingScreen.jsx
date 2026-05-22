export default function MeetingScreen({
  userName,
  localStream,
  isAudioEnabled,
  hasAudioTrack,
  isVideoEnabled,
  isScreenSharing,
  selfSocketId,
  activeSpeakerId,
  hasRemoteParticipant,
  remoteFeeds,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeaveRoom,
}) {
  const isVideoControlLocked = isScreenSharing;
  const audioControlLabel = hasAudioTrack
    ? isAudioEnabled
      ? "Mute"
      : "Unmute"
    : "Start Mic";
  const audioControlTitle = hasAudioTrack
    ? isAudioEnabled
      ? "Mute microphone"
      : "Unmute microphone"
    : "Turn on your microphone";
  const getInitials = (name) =>
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GU";

  const filteredRemoteFeeds = selfSocketId
    ? remoteFeeds.filter((feed) => feed.socketId !== selfSocketId)
    : remoteFeeds;
  const isSoloView = !hasRemoteParticipant;
  const hasLiveVideoTrack = (stream) =>
    Boolean(
      stream?.getVideoTracks?.().some((track) => track.readyState === "live")
    );
  const hasLiveAudioTrack = (stream) =>
    Boolean(
      stream?.getAudioTracks?.().some((track) => track.readyState === "live")
    );

  const tiles = [
    {
      socketId: "local",
      userName: `${userName} (You)`,
      stream: isVideoEnabled || isScreenSharing ? localStream : null,
      isMuted: !isAudioEnabled,
      hasAudioTrack,
      isVideoOff: !isVideoEnabled && !isScreenSharing,
      isLocal: true,
    },
    ...filteredRemoteFeeds.map((feed) => ({
      ...feed,
      isConnecting: !feed.stream,
      isLocal: false,
    })),
  ];
  const orderedTiles = [...tiles];

  if (activeSpeakerId) {
    const activeTileIndex = orderedTiles.findIndex(
      (tile) => tile.socketId === activeSpeakerId
    );

    if (activeTileIndex > 0) {
      const [activeTile] = orderedTiles.splice(activeTileIndex, 1);
      orderedTiles.unshift(activeTile);
    }
  }

  return (
    <section className="meeting-stage">
      <div className={`meeting-grid ${isSoloView ? "meeting-grid-solo" : ""}`}>
        {isSoloView ? (
          <div className="meeting-empty">
            <div className="meeting-empty-orb" />
            <h3>Waiting for participants</h3>
            <p>Share the room code to start your meeting.</p>
          </div>
        ) : null}

        {orderedTiles.map((tile) => (
          <div
            key={tile.socketId}
            className={`meeting-tile ${tile.isLocal ? "meeting-tile-local" : ""} ${
              isSoloView && tile.isLocal ? "meeting-tile-solo" : ""
            } ${tile.socketId === activeSpeakerId ? "meeting-tile-active" : ""}`}
          >
            {tile.stream && !tile.isVideoOff && hasLiveVideoTrack(tile.stream) ? (
              <video
                autoPlay
                muted
                playsInline
                ref={(video) => {
                  if (video && tile.stream) {
                    video.srcObject = tile.stream;
                    void video.play().catch(() => {});
                  }
                }}
                className="meeting-video"
              />
            ) : (
              <div className="meeting-placeholder">
                <div className="meeting-avatar">{getInitials(tile.userName)}</div>
                {tile.isConnecting ? (
                  <p className="meeting-connecting-copy">Connecting media...</p>
                ) : null}
              </div>
            )}
            <div className="meeting-label">
              <span>{tile.userName || "Participant"}</span>
              <div className="meeting-badges">
                {!tile.hasAudioTrack ? (
                  <span className="meeting-badge">Mic Off</span>
                ) : tile.socketId === activeSpeakerId ? (
                  <span className="meeting-badge meeting-badge-speaking">Speaking</span>
                ) : tile.isMuted ? (
                  <span className="meeting-badge">Muted</span>
                ) : null}
                {tile.isVideoOff ? (
                  <span className="meeting-badge meeting-badge-off">Video Off</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredRemoteFeeds.map((feed) =>
        feed.stream && feed.hasAudioTrack !== false && hasLiveAudioTrack(feed.stream) ? (
          <audio
            key={`audio-${feed.socketId}`}
            autoPlay
            playsInline
            hidden
            ref={(audio) => {
              if (audio && audio.srcObject !== feed.stream) {
                audio.srcObject = feed.stream;
                void audio.play().catch(() => {});
              }
            }}
          />
        ) : null
      )}

      <div className="meeting-controls">
        <button
          className={`meeting-control ${isAudioEnabled ? "active" : "inactive"}`}
          onClick={onToggleAudio}
          title={audioControlTitle}
        >
          <span className="meeting-control-icon">
            <i className="fa-solid fa-microphone" aria-hidden="true" />
          </span>
          <span className="meeting-control-label">{audioControlLabel}</span>
        </button>

        <button
          className={`meeting-control ${isVideoEnabled ? "active" : "inactive"} ${
            isVideoControlLocked ? "meeting-control-disabled" : ""
          }`}
          onClick={onToggleVideo}
          title={
            isVideoControlLocked
              ? "Stop screen sharing before changing your camera"
              : isVideoEnabled
                ? "Turn off camera"
                : "Turn on camera"
          }
          disabled={isVideoControlLocked}
        >
          <span className="meeting-control-icon">
            <i className="fa-solid fa-video" aria-hidden="true" />
          </span>
          <span className="meeting-control-label">
            {isVideoControlLocked
              ? "Camera Locked"
              : isVideoEnabled
                ? "Stop Video"
                : "Start Video"}
          </span>
        </button>

        <button
          className={`meeting-control meeting-control-share ${
            isScreenSharing ? "active" : "inactive"
          }`}
          onClick={onToggleScreenShare}
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
          className="meeting-control meeting-control-leave"
          onClick={onLeaveRoom}
          title="Leave the meeting room"
        >
          <span className="meeting-control-icon">
            <i className="fa-solid fa-phone" aria-hidden="true" />
          </span>
          <span className="meeting-control-label">Leave</span>
        </button>
      </div>
    </section>
  );
}
