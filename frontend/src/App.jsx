import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import AuthenticationPage from "./pages/Authentication";
import LandingPage from "./pages/Landing";
import GuestPage from "./pages/Guestpage";
import RoomPage from "./roomcomponent/RoomPage";
import VideoMeetPage from "./pages/VideoMeet";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/authentication" element={<AuthenticationPage />} />
        <Route path="/guest" element={<GuestPage />} />
        <Route path="/video-meet" element={<VideoMeetPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
