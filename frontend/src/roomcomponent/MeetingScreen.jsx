export default function MeetingScreen({
  userName,
  localStream,
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  selfSocketId,
  remoteFeeds,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeaveRoom,
}) {
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
  const isSoloView = filteredRemoteFeeds.length === 0;
  const hasLiveVideoTrack = (stream) =>
    Boolean(
      stream?.getVideoTracks?.().some((track) => track.readyState === "live")
    );

  const tiles = [
    {
      socketId: "local",
      userName: `${userName} (You)`,
      stream: isVideoEnabled || isScreenSharing ? localStream : null,
      isMuted: !isAudioEnabled,
      isVideoOff: !isVideoEnabled && !isScreenSharing,
      isLocal: true,
    },
    ...filteredRemoteFeeds.map((feed) => ({
      ...feed,
      isLocal: false,
    })),
  ];

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

        {tiles.map((tile) => (
          <div
            key={tile.socketId}
            className={`meeting-tile ${tile.isLocal ? "meeting-tile-local" : ""} ${
              isSoloView && tile.isLocal ? "meeting-tile-solo" : ""
            }`}
          >
            {tile.stream && !tile.isVideoOff && hasLiveVideoTrack(tile.stream) ? (
              <video
                autoPlay
                muted={tile.isLocal}
                playsInline
                ref={(video) => {
                  if (video && tile.stream) {
                    video.srcObject = tile.stream;
                  }
                }}
                className="meeting-video"
              />
            ) : (
              <div className="meeting-placeholder">
                <div className="meeting-avatar">{getInitials(tile.userName)}</div>
              </div>
            )}
            <div className="meeting-label">
              <span>{tile.userName || "Participant"}</span>
              <div className="meeting-badges">
                {tile.isMuted ? <span className="meeting-badge">Muted</span> : null}
                {tile.isVideoOff ? (
                  <span className="meeting-badge meeting-badge-off">Video Off</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="meeting-controls">
        <button
          className={`meeting-control ${isAudioEnabled ? "active" : "inactive"}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          <span className="meeting-control-icon">
            <i className="fa-solid fa-microphone" aria-hidden="true" />
          </span>
          <span className="meeting-control-label">
            {isAudioEnabled ? "Mute" : "Unmute"}
          </span>
        </button>

        <button
          className={`meeting-control ${isVideoEnabled ? "active" : "inactive"}`}
          onClick={onToggleVideo}
          title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          <span className="meeting-control-icon">
            <i className="fa-solid fa-video" aria-hidden="true" />
          </span>
          <span className="meeting-control-label">
            {isVideoEnabled ? "Stop Video" : "Start Video"}
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
