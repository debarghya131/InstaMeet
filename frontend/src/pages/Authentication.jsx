import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { saveAuthenticatedSession } from "../utils/session";
import { API_BASE_URL } from "../config";

export default function AuthenticationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const redirectPath = searchParams.get("redirect") || "/video-meet";
  const [mode, setMode] = useState("login");
  const [formValues, setFormValues] = useState({
    name: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [status, setStatus] = useState({
    loading: false,
    error: "",
    success: "",
  });
  const isLogin = mode === "login";

  useEffect(() => {
    setMode(requestedMode);
  }, [requestedMode]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setSearchParams({ mode: nextMode, redirect: redirectPath });
    setStatus({
      loading: false,
      error: "",
      success: "",
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({
      loading: true,
      error: "",
      success: "",
    });

    try {
      if (!isLogin && formValues.password !== formValues.confirmPassword) {
        throw new Error("Password and confirm password must match.");
      }

      const endpoint = isLogin ? "login" : "register";
      const payload = isLogin
        ? {
            username: formValues.username,
            password: formValues.password,
          }
        : {
            name: formValues.name,
            username: formValues.username,
            password: formValues.password,
          };

      const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Authentication request failed.");
      }

      if (isLogin) {
        saveAuthenticatedSession(result.data);

        setStatus({
          loading: false,
          error: "",
          success: result.message,
        });

        setFormValues({
          name: "",
          username: "",
          password: "",
          confirmPassword: "",
        });

        window.setTimeout(() => {
          navigate(redirectPath);
        }, 900);
      } else {
        setStatus({
          loading: false,
          error: "",
          success: "Signup successful. Please login to continue.",
        });

        setFormValues({
          name: "",
          username: formValues.username,
          password: "",
          confirmPassword: "",
        });

        setMode("login");
        setSearchParams({ mode: "login", redirect: redirectPath });
      }
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message || "Something went wrong.",
        success: "",
      });
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-intro">
          <p className="auth-kicker">InstaMeet Access</p>
          <h1>
            {isLogin ? "Login to continue your meetings" : "Create your account"}
          </h1>
          <p className="auth-description">
            {isLogin
              ? "Join your workspace, reconnect with your team, and manage calls from one secure dashboard."
              : "Sign up to start instant meetings, invite teammates, and manage shared rooms from one place."}
          </p>
        </div>

        <div className="auth-switcher">
          <button
            type="button"
            className={`auth-switch ${isLogin ? 'auth-switch-active' : ""}`}
            onClick={() => handleModeChange("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-switch ${!isLogin ? 'auth-switch-active' : ""}`}
            onClick={() => handleModeChange("signup")}
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <label className="auth-field">
              <span>Full Name</span>
              <input
                type="text"
                name="name"
                value={formValues.name}
                onChange={handleChange}
                placeholder="Enter your full name"
              />
            </label>
          )}

          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              name="username"
              value={formValues.username}
              onChange={handleChange}
              placeholder={isLogin ? "Enter your username" : "Choose a username"}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={formValues.password}
              onChange={handleChange}
              placeholder={
                isLogin ? "Enter your password" : "Create a strong password"
              }
            />
          </label>

          {!isLogin && (
            <label className="auth-field">
              <span>Confirm Password</span>
              <input
                type="password"
                name="confirmPassword"
                value={formValues.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
              />
            </label>
          )}

          {status.error ? (
            <p className="auth-message auth-message-error">{status.error}</p>
          ) : null}

          {status.success ? (
            <p className="auth-message auth-message-success">{status.success}</p>
          ) : null}

          <button type="submit" className="auth-submit">
            {status.loading
              ? "Please wait..."
              : isLogin
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <div className="auth-links">
          <span>{isLogin ? "Need to go back?" : "Already have an account?"}</span>
          <Link to="/">Return Home</Link>
        </div>
      </section>
    </main>
  );
}
