import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GoogleOAuthProvider } from "@react-oauth/google";

// Tras un deploy, una pestaña abierta con el bundle viejo pide chunks (hash) que ya no existen
// ("Failed to fetch dynamically imported module"). Recargar una vez trae el index.html nuevo.
const PRELOAD_RELOAD_KEY = "orbit:preload-reload-at";
window.addEventListener("vite:preloadError", (event) => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) ?? 0);
  } catch {
    /* ignore */
  }
  // Evita bucle de recargas si el chunk falta de verdad.
  if (Date.now() - last < 30_000) return;
  event.preventDefault();
  try {
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.reload();
});

const googleClientId =(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);
