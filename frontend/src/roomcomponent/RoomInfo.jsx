import { useState } from "react";

export default function RoomInfo({
  roomId,
  userName,
  hostName,
  participants,
  isAudioEnabled,
  isVideoEnabled,
}) {
  const resolvedHostName = hostName || userName;
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyRoomId = async () => {
    if (!roomId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(roomId);
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, 1400);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <section className="room-sidebar">
      <section className="room-panel">
        <div className="room-panel-heading">
          <div>
            <p className="room-panel-kicker">Session Info</p>
            <h2>Live Status</h2>
          </div>
        </div>
        <ul className="room-details">
          <li className="room-detail-item room-detail-room-id">
            <span className="room-detail-label">Room ID</span>
            <div className="room-detail-copy-group">
              <strong className="room-detail-code">{roomId}</strong>
              <button
                type="button"
                className={`room-copy-button ${isCopied ? "copied" : ""}`}
                onClick={handleCopyRoomId}
                title={isCopied ? "Copied" : "Copy room ID"}
                aria-label={isCopied ? "Copied room ID" : "Copy room ID"}
              >
                <i className="fa-solid fa-copy" aria-hidden="true" />
              </button>
            </div>
          </li>
          <li className="room-detail-item">
            <span className="room-detail-label">Your Name</span>
            <strong className="room-detail-text">{userName}</strong>
          </li>
          <li className="room-detail-item">
            <span className="room-detail-label">Host Name</span>
            <strong className="room-detail-text">{resolvedHostName}</strong>
          </li>
          <li className="room-detail-item">
            <span className="room-detail-label">Connected Users</span>
            <strong className="room-detail-text">{participants.length}</strong>
          </li>
          <li className="room-detail-item">
            <span className="room-detail-label">Microphone</span>
            <strong className="room-detail-text">
              {isAudioEnabled ? "On" : "Off"}
            </strong>
          </li>
          <li className="room-detail-item">
            <span className="room-detail-label">Camera</span>
            <strong className="room-detail-text">
              {isVideoEnabled ? "On" : "Off"}
            </strong>
          </li>
        </ul>
      </section>
    </section>
  );
}
