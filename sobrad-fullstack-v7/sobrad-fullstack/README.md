# SÕBRAD

SÕBRAD is a calm-companion web app for journaling, mood check-ins, guided breathing, and a supportive chat — with a FastAPI/SQLite backend and a Vite/React frontend.

## Quickstart (easiest — no terminal needed)

1. Open the `backend` folder and double-click **`start.bat`** (Windows) or **`start.sh`** (Mac/Linux). Leave that window open.
2. Open the `frontend` folder and double-click **`start.bat`** / **`start.sh`** the same way. Leave that window open too.
3. Open **http://localhost:5173** in your browser.

Both scripts set everything up automatically the first time (they need Python
and Node.js already installed on the computer — if either is missing, the
script tells you and links where to get it).

## Quickstart (terminal)

Run the backend and frontend in two separate terminals.

**Terminal 1 — backend**

```
cd backend
python3 -m venv venv
source venv/bin/activate      # on Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend**

```
cd frontend
npm install
npm run dev
```

Open the app at **http://localhost:5173**. The frontend talks to the backend at `http://localhost:8000/api` (configured in `frontend/.env`).

See `backend/README.md` and `frontend/README.md` for further detail on each side (project layout, environment variables, etc).

## Deploying for real (Render + Cloudflare Pages)

This needs the project in a Git repository (e.g. GitHub) first, since both
Render and Cloudflare Pages deploy by connecting to a repo, not by file
upload. Once it's pushed to GitHub:

**Backend → Render**
1. New → Web Service → connect the repo → set **Root Directory** to `backend`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add an environment variable `SOBRAD_JWT_SECRET` set to your own random secret string.
5. Deploy. Render gives you a URL like `https://sobrad-backend.onrender.com`.

**Frontend → Cloudflare Pages**
1. Create a Pages project connected to the same repo → set **Root Directory** to `frontend`.
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Add an environment variable `VITE_API_URL` set to your Render URL from above plus `/api`, e.g. `https://sobrad-backend.onrender.com/api`.
5. Deploy. Cloudflare gives you a URL like `https://sobrad.pages.dev`.

**Then, back on Render:** add an environment variable `SOBRAD_CORS_ORIGINS` on
the backend set to your Cloudflare Pages URL (e.g.
`https://sobrad.pages.dev`), and redeploy the backend — this tells it to
accept requests from your live frontend. Without this step the deployed site
will load but logging in will fail with a CORS error.

If you'd like help actually setting up the GitHub repo and walking through
these dashboards step by step, just ask.
