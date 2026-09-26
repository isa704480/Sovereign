import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Faqat `vite` dev serverida, Electron'siz (brauzerda UI'ni ko'rish/test qilish uchun)
// soxta ko'prik o'rnatiladi. Production build'da bu shart statik `false` — kod kirmaydi.
const boot = import.meta.env.DEV && !window.sovereign ? import("./lib/devMock.js").then((m) => m.install()) : Promise.resolve();

boot.then(() => {
  createRoot(document.getElementById("root")).render(<App />);
});
