import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { markGuestSession } from "../utils/session";

const API_BASE_URL = "http://localhost:5000/api/users";

export default function GuestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRoomId = searchParams.get("roomId") || "";

  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomId);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const normalizedRoomCode = useMemo(
    () => roomCodeInput.trim().toUpperCase(),
    [roomCodeInput]
  );

  const handleJoinGuest = async () => {
    if (!normalizedRoomCode) {
      setErrorMessage("Please enter a room ID.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      markGuestSession();
      const response = await fetch(
        `${API_BASE_URL}/meetings/code/${normalizedRoomCode}`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "This room code is not valid.");
      }

      const hostUsername = result?.data?.userId?.username;
      if (hostUsername && hostUsername !== "guest") {
        throw new Error(
          "Guests cannot join meetings created by authenticated users. Please sign in."
        );
      }

      navigate(`/room/${normalizedRoomCode}`, {
        state: {
          userName: "Guest User",
          userId: "",
          isGuest: true,
          role: "guest",
          setupPath: "/guest",
        },
      });
    } catch (error) {
      setErrorMessage(error.message || "This room code is not valid.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstantMeeting = () => {
    const roomCode = `GUEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    setIsLoading(true);
    setErrorMessage("");
    markGuestSession();

    fetch(`${API_BASE_URL}/meetings/guest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ meetingCode: roomCode }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to create guest meeting.");
        }

        navigate(`/room/${roomCode}`, {
          state: {
            userName: "Guest User",
            userId: "",
            isGuest: true,
            role: "guest",
            setupPath: "/guest",
          },
        });
      })
      .catch((error) => {
        setErrorMessage(error.message || "Unable to create guest meeting.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <main className="guest-page">
      <section className="guest-shell">
        <div className="guest-topbar">
          <div>
            <p className="guest-kicker">Guest Access</p>
            <h1>Join as Guest</h1>
            <p className="guest-subtitle">
              Enter a meeting ID to join without authentication.
            </p>
          </div>
          <Link className="guest-back" to="/authentication?mode=signup">
            Back to Sign Up
          </Link>
        </div>

        <div className="guest-card">
          <label className="guest-label" htmlFor="guestRoomCode">
            Meeting ID
          </label>
          <div className="guest-form-row">
            <input
              id="guestRoomCode"
              className="guest-input"
              type="text"
              placeholder="Enter meeting ID"
              value={roomCodeInput}
              onChange={(event) => setRoomCodeInput(event.target.value)}
            />
            <button
              type="button"
              className="guest-button guest-button-primary"
              onClick={handleJoinGuest}
              disabled={isLoading}
            >
              {isLoading ? "Checking..." : "Join Meeting"}
            </button>
            <button
              type="button"
              className="guest-button"
              onClick={handleInstantMeeting}
              disabled={isLoading}
            >
              Instant Meeting
            </button>
          </div>
          {errorMessage ? <p className="guest-error">{errorMessage}</p> : null}
          <p className="guest-hint">
            Instant Meeting always creates a new meeting ID.
          </p>
        </div>
      </section>
    </main>
  );
}
