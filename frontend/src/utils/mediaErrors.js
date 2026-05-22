const resolveDeviceLabel = (kind) => {
  if (kind === "audio") {
    return "microphone";
  }

  if (kind === "display") {
    return "screen sharing";
  }

  return "camera";
};

export const getFriendlyMediaError = (error, kind = "camera") => {
  const deviceLabel = resolveDeviceLabel(kind);
  const message = String(error?.message || "").toLowerCase();
  const errorName = String(error?.name || "");

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return `Permission to use your ${deviceLabel} was denied.`;
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return `No ${deviceLabel} was found on this device.`;
  }

  if (
    errorName === "NotReadableError" ||
    errorName === "TrackStartError" ||
    message.includes("starting videoinput failed") ||
    message.includes("could not start video source") ||
    message.includes("device in use") ||
    message.includes("concurrent mic process limit")
  ) {
    if (kind === "audio") {
      return "Your microphone is already being used by another tab or app.";
    }

    if (kind === "display") {
      return "Screen sharing could not start because another app or browser restriction blocked it.";
    }

    return "Your camera is already being used by another tab or app.";
  }

  if (errorName === "AbortError") {
    return `${deviceLabel[0].toUpperCase()}${deviceLabel.slice(1)} access was interrupted. Please try again.`;
  }

  if (errorName === "OverconstrainedError" || errorName === "ConstraintNotSatisfiedError") {
    return `Your ${deviceLabel} does not support the requested settings.`;
  }

  return error?.message || `Unable to use your ${deviceLabel}.`;
};
