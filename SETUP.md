# Setup (Windows / Mac / Linux)

Requirements: **Node.js 18+** and **MongoDB** (Docker *or* free MongoDB Atlas).

## 1. Install
```bash
cd wa-sweet-mern
npm install          # installs "concurrently" (root)
npm run setup        # installs backend + frontend packages
```

## 2. Configure
`backend/.env` is already included with safe local defaults. Open it and change `JWT_SECRET` and `ADMIN_PASSWORD`.
(If it is missing:  Windows `copy backend\.env.example backend\.env`  |  Mac/Linux `cp backend/.env.example backend/.env`)

## 3. Start MongoDB — pick ONE
- **Docker:** `docker compose up -d`
- **Atlas (no install):** create a free cluster at mongodb.com/atlas → Connect → Drivers → copy the string, e.g.
  `MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/sweetbot`
  (Atlas → Network Access → allow your IP)
- **Installed locally:** keep `MONGO_URI=mongodb://127.0.0.1:27017/sweetbot`

## 4. Seed + run
```bash
npm run seed         # admin user + 3 outlets + sample products
npm run dev          # API http://localhost:5000  |  Admin http://localhost:5173
```
Login with `ADMIN_USER` / `ADMIN_PASSWORD` from `backend/.env` (default `admin` / `ChangeMe@123`).

## 5. Optional checks
```bash
npm test             # offline bot-flow test (no MongoDB / Meta needed)
```
Then follow **TESTING.md** for Meta (WhatsApp) + Razorpay configuration.

## Common errors
| Error | Fix |
|---|---|
| `Cannot find module ...` | Run `npm run setup` from the project root (already fixed: all files are included in this version) |
| `MongoDB connection failed` | MongoDB not running / wrong `MONGO_URI` |
| Login says "Invalid username or password" | Run `npm run seed` again after changing `ADMIN_PASSWORD` |
| Login says "Cannot reach the server" | Backend not running — check the `api` terminal output |
| Port 5000 busy (macOS AirPlay) | Set `PORT=5001` in `.env` and change the proxy in `frontend/vite.config.js` |
