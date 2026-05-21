export default function RoomPresence({ participants, selfSocketId }) {
  return (
    <section className="room-presence-panel">
      <div className="room-presence-header">
        <h3>Who is here</h3>
        <p className="room-presence-subtitle">
          {participants.length} {participants.length === 1 ? "participant" : "participants"}
        </p>
      </div>

      <div className="room-presence-list">
        {participants.length === 0 ? (
          <div className="room-presence-empty">
            <p>No one is here yet</p>
            <span>Participants will appear here once they join.</span>
          </div>
        ) : (
          participants.map((participant) => {
            const isSelf = participant.socketId === selfSocketId;
            const isHost = Boolean(participant.isHost);

            return (
              <div className="room-presence-item" key={participant.socketId}>
                <div className="room-presence-main">
                  <span className="room-presence-name">
                    {participant.userName}
                    {isSelf ? <span className="room-presence-you"> (You)</span> : null}
                  </span>
                  {isHost ? <span className="room-presence-badge">Host</span> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
