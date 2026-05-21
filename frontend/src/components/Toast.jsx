export default function Toast({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="app-toast app-toast-error" role="alert" aria-live="assertive">
      {message}
    </div>
  );
}
