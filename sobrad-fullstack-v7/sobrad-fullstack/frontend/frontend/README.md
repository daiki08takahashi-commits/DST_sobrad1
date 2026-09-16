# SÕBRAD — frontend

A calm companion web app, built by DST (Daiki Systems Tech). This is the
React frontend; it talks to the SÕBRAD FastAPI backend (see `../backend`)
over a small JSON API.

Stack: [Vite](https://vitejs.dev) + React + [React Router](https://reactrouter.com),
plain CSS (no framework) implementing the SÕBRAD design system.

## Easiest way to run it

If you don't want to use a terminal: double-click **`start.bat`** (Windows) or
**`start.sh`** (Mac/Linux — first time only, right-click it and "Run as
program", or run `chmod +x start.sh` once in a terminal). It installs
everything automatically and starts the dev server. Make sure the backend's
own `start.bat`/`start.sh` is already running in another window first.

## Getting started (terminal)

```bash
npm install
npm run dev
```

This starts a local dev server (Vite prints the URL, typically
`http://localhost:5173`).

The app expects the backend to be running and reachable at the URL in
`.env` (see below). Without a backend running, the Login screen will still
render, but signing in and every other screen's data will fail to load.

### Configuring the backend URL

Copy `.env.example` to `.env` and adjust if your backend isn't running at
the default:

```bash
cp .env.example .env
```

```
VITE_API_URL=http://localhost:8000/api
```

If `.env` is missing or `VITE_API_URL` isn't set, the app falls back to
`http://localhost:8000/api`.

## Building for production

```bash
npm run build
```

Output is written to `dist/`. Preview the production build locally with:

```bash
npm run preview
```

## Project structure

```
src/
  api.js                 Shared fetch client — base URL, auth header, JSON handling
  AuthContext.jsx         Auth/session state (token + username, backed by localStorage)
  ToastContext.jsx        Small toast-notification provider
  App.jsx                 Route table
  index.css               Design system (tokens, light/dark themes, all screen styles)
  components/
    icons.jsx              Shared line-icon set
    Topbar.jsx              Back-button + title header used by most screens
    EmergencyFab.jsx        Pinned "get help now" button
    RequireAuth.jsx         Route guard — redirects to /login without a token
  pages/
    Login.jsx, Home.jsx, Breathing.jsx, Journal.jsx,
    Chat.jsx, Mood.jsx, Progress.jsx, Emergency.jsx
```

## Notes

- Auth token is stored in `localStorage` under `sobrad_token` (username under
  `sobrad_username`) and attached automatically as a `Bearer` header by
  `src/api.js`.
- Every authenticated screen is reachable while signed out only via
  `/login`; all other routes redirect there without a token. The Emergency
  screen is reached from any authenticated screen via the pinned
  bottom-right button.
