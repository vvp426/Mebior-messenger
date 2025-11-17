// src/main.tsx

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import EmailAuthGate from "./EmailAuthGate";
import "./index.css";

const rootElement = document.getElementById("root") as HTMLElement;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <EmailAuthGate>
      {(firebaseUser) => <App firebaseUser={firebaseUser} />}
    </EmailAuthGate>
  </React.StrictMode>
);
