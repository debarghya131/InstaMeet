import { useState, useRef, useEffect } from "react";

export default function RoomChat({
  messages,
  userName,
  selfSocketId,
  currentUserId,
  onSendMessage,
}) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedMessage = draft.trim();

    if (!trimmedMessage) {
      return;
    }

    onSendMessage(trimmedMessage);
    setDraft("");
  };

  const getInitials = (name) =>
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return (
    <section className="zoom-chat-panel">
      <div className="zoom-chat-header">
        <h3>Chat</h3>
        <p className="zoom-chat-subtitle">{messages.length} messages</p>
      </div>

      <div className="zoom-chat-messages">
        {messages.length === 0 ? (
          <div className="zoom-chat-empty">
            <p>No messages yet</p>
            <span>Start a conversation</span>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwnMessage = Boolean(
              (message.senderSocketId && message.senderSocketId === selfSocketId) ||
                (message.senderId &&
                  currentUserId &&
                  String(message.senderId) === String(currentUserId))
            );
            const time = message.createdAt
              ? new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
            const senderLabel = isOwnMessage ? "You" : message.senderName || "Guest";
            const senderUsername = message.senderName || userName || "Guest";
            const showUsername =
              senderUsername &&
              senderUsername !== senderLabel &&
              senderLabel !== "You";

            return (
              <div
                key={`${message.createdAt || "message"}-${index}`}
                className={`zoom-chat-message ${isOwnMessage ? "zoom-chat-own" : "zoom-chat-other"}`}
              >
                {!isOwnMessage && (
                  <div className="zoom-chat-avatar">
                    {getInitials(message.senderName)}
                  </div>
                )}

                <div className="zoom-chat-bubble">
                  <div className="zoom-chat-sender">
                    <span>{senderLabel}</span>
                    {showUsername ? (
                      <span className="zoom-chat-sender-id">
                        Username: {senderUsername || "N/A"}
                      </span>
                    ) : null}
                  </div>
                  <div className="zoom-chat-content">{message.message}</div>
                  {time ? <div className="zoom-chat-time">{time}</div> : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="zoom-chat-form" onSubmit={handleSubmit}>
        <input
          className="zoom-chat-input"
          type="text"
          placeholder="Write a message..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className="zoom-chat-send"
          disabled={!draft.trim()}
          title="Send message (Enter)"
        >
          <i className="fa-solid fa-paper-plane" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
