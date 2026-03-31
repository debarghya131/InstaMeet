import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "../App.css";
import logo from "../assets/logo.svg";

export default function LandingPage() {
  const navigate = useNavigate();

  const handleStartFlow = () => {
    navigate("/authentication?mode=signup&redirect=/video-meet");
  };

  return (
    <main className="landing-page">
      <div className="landing-overlay">
        <div className="landing-shell">
          <header className="landing-navbar">
            <Link className="landing-brand" to="/">
              <img className="brand-logo" src={logo} alt="InstaMeet logo" />
            </Link>

            <div className="landing-actions">
              <Link
                className="nav-button nav-button-success nav-link-button"
                to="/authentication?mode=login"
              >
                Login
              </Link>
              <Link
                className="nav-button nav-button-register nav-link-button"
                to="/authentication?mode=signup"
              >
                Register
              </Link>
              <Link
                className="nav-button nav-button-accent nav-link-button"
                to="/guest"
              >
                Join as Guest
              </Link>
              <button
                className="nav-button nav-button-primary"
                onClick={handleStartFlow}
              >
                Start Meeting
              </button>
            </div>
          </header>

          <section className="landing-content">
            <p className="landing-kicker">InstaMeet</p>
            <h1>Meet, talk, and collaborate from anywhere.</h1>
            <p className="landing-description">
              A simple video meeting experience for fast calls, team standups,
              and shared rooms.
            </p>
            <div className="landing-hero-actions">
              <button className="hero-button" onClick={handleStartFlow}>
                Get Started
              </button>
            </div>
            <p className="landing-credit">by Debarghya ❤️</p>
          </section>
        </div>
      </div>
    </main>
  );
}
