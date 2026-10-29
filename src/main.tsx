import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
// Register Pulse's PWA service worker in production and on localhost.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/pwabuilder-sw.js").catch((error) => {
      console.error("Pulse service worker registration failed:", error);
    });
  });
}
