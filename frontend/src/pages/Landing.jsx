import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../App.css";
import logo from "../assets/logo.svg";

const featureImages = Array.from({ length: 11 }, (_, index) => ({
  src: new URL(`../assets/img${index + 1}.png`, import.meta.url).href,
  label: `Feature ${index + 1}`,
}));

const guestFeatureImages = Array.from({ length: 5 }, (_, index) => ({
  src: new URL(`../assets/guestimg${index + 1}.png`, import.meta.url).href,
  label: `Guest Feature ${index + 1}`,
}));

export default function LandingPage() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState("features");
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const activeImages =
    activeFeatureTab === "features" ? featureImages : guestFeatureImages;
  const activeFeatureImage = activeImages[activeFeatureIndex] || activeImages[0];

  const handleStartFlow = () => {
    setIsMobileMenuOpen(false);
    navigate("/authentication?mode=signup&redirect=/video-meet");
  };

  const handleFeatureTabChange = (nextTab) => {
    setActiveFeatureTab(nextTab);
    setActiveFeatureIndex(0);
  };

  const showPreviousFeature = () => {
    setActiveFeatureIndex((currentIndex) =>
      currentIndex === 0 ? activeImages.length - 1 : currentIndex - 1
    );
  };

  const showNextFeature = () => {
    setActiveFeatureIndex((currentIndex) =>
      currentIndex === activeImages.length - 1 ? 0 : currentIndex + 1
    );
  };

  return (
    <main className="landing-page">
      <div className="landing-overlay">
        <div className="landing-shell">
          <header className="landing-navbar">
            <Link className="landing-brand" to="/">
              <img className="brand-logo" src={logo} alt="InstaMeet logo" />
            </Link>

            <button
              type="button"
              className={`landing-menu-toggle ${isMobileMenuOpen ? "open" : ""}`}
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="landing-actions"
              onClick={() => setIsMobileMenuOpen((currentValue) => !currentValue)}
            >
              <span className="landing-menu-toggle-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>

            <div
              id="landing-actions"
              className={`landing-actions ${isMobileMenuOpen ? "open" : ""}`}
            >
              <Link
                className="nav-button nav-button-success nav-link-button"
                to="/authentication?mode=login"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Login
              </Link>
              <Link
                className="nav-button nav-button-register nav-link-button"
                to="/authentication?mode=signup"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Register
              </Link>
              <Link
                className="nav-button nav-button-accent nav-link-button"
                to="/guest"
                onClick={() => setIsMobileMenuOpen(false)}
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

          <div className="landing-hero-layout">
            <section className="landing-content">
              <p className="landing-kicker">InstaMeet</p>
              <h1>
                <span>Meet, talk, and</span>
                <span>collaborate</span>
                <span>from anywhere.</span>
              </h1>
              <p className="landing-description">
                A simple video meeting experience for fast calls, team standups,
                and shared rooms.
              </p>
              <div className="landing-hero-actions">
                <button className="hero-button" onClick={handleStartFlow}>
                  Get Started
                </button>
                <Link className="hero-button hero-button-guest" to="/guest">
                  Join as Guest
                </Link>
              </div>
              <p className="landing-credit">by Debarghya ❤️</p>
            </section>

            <aside className="landing-feature-card">
              <div className="landing-feature-tabs">
                <button
                  type="button"
                  className={`landing-feature-tab ${
                    activeFeatureTab === "features" ? "active" : ""
                  }`}
                  onClick={() => handleFeatureTabChange("features")}
                >
                  Features
                </button>
                <button
                  type="button"
                  className={`landing-feature-tab ${
                    activeFeatureTab === "guest" ? "active" : ""
                  }`}
                  onClick={() => handleFeatureTabChange("guest")}
                >
                  Guest Features
                </button>
              </div>

              <div className="landing-feature-preview">
                <button
                  type="button"
                  className="landing-feature-arrow landing-feature-arrow-left"
                  onClick={showPreviousFeature}
                  aria-label="Show previous feature"
                >
                  <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                </button>
                <figure className="landing-feature-slide">
                  <img src={activeFeatureImage.src} alt={activeFeatureImage.label} />
                </figure>
                <button
                  type="button"
                  className="landing-feature-arrow landing-feature-arrow-right"
                  onClick={showNextFeature}
                  aria-label="Show next feature"
                >
                  <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                </button>
              </div>

              <div className="landing-feature-dots" aria-label="Feature previews">
                {activeImages.map((image, index) => (
                  <button
                    type="button"
                    key={image.src}
                    className={`landing-feature-dot ${
                      index === activeFeatureIndex ? "active" : ""
                    }`}
                    onClick={() => setActiveFeatureIndex(index)}
                    aria-label={`Show ${image.label}`}
                  />
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
