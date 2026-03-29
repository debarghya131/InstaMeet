import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import AuthenticationPage from "./pages/Authentication";
import LandingPage from "./pages/Landing";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/authentication" element={<AuthenticationPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
