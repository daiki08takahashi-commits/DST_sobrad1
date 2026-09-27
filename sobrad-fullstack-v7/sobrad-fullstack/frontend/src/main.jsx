import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registers the audio-caching service worker so already-played Sleep/
// Breathing tracks can replay offline. This is a progressive enhancement,
// not a requirement for the app to function, so any failure here (no
// browser support, registration error, etc.) is silently ignored --
// offline audio caching just won't be available, but everything else
// still works normally.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline audio caching just won't be available -- everything else still works normally
    });
  });
}
