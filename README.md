# Krishna Jelabi Kadai — WhatsApp E-Commerce (MERN admin + bot)

```
wa-sweet-mern/
├── backend/                 Node + Express + MongoDB (bot, REST API, webhooks)
│   └── src/
│       ├── index.js         app entry, serves frontend build in production
│       ├── config.js        .env values
│       ├── seed.js          creates admin user + sample products
│       ├── models/          Product, Order, Admin, Session, Setting
│       ├── routes/          webhooks · auth · products · orders · settings
│       ├── services/        bot.js (chat flow) · whatsapp.js · razorpay.js · settings.js (encrypted) · templates.js
│       └── middleware/auth.js   JWT guard
├── frontend/                React (Vite) admin app
│   └── src/pages/           Login · Dashboard · Orders · Products · Setup · Guide
├── docker-compose.yml       local MongoDB
└── package.json             root scripts
```

## What is covered from the SOW (Module 2)
| SOW item | Where |
|---|---|
| Interactive chat flow (greeting → menu → cart → checkout) | `services/bot.js` |
| Multi-location routing (nearest of Kodambakkam / Nungambakkam / Saligramam from the customer's shared location, stock-aware, delivery radius) | `services/geo.js`, `bot.js`, **Outlets** page |
| Weight variations (250g / 500g / 1kg), per-outlet stock, categories Sweets / Savories / Ghee Mithai | **Products** page |
| Bulk / gifting / wedding / corporate enquiries | WhatsApp “Bulk & Gifting” → **Bulk enquiries** page |
| Razorpay payment link (UPI / cards / netbanking) | `services/razorpay.js` |
| Delivery (fee, free-above threshold, radius, rider + tracking link) and self-pickup with slot | Setup → Shop, order details |
| Order tracking + notifications: Confirmed → Packed → Ready / Out for delivery → Delivered (auto template fallback after 24 h) | `routes/orders.js`, customer can also type `track` |
| OTP login via WhatsApp for the website | `/api/public/otp/*` (uses the `login_otp` authentication template) |
| Website integration API (outlets, live catalogue, my orders) | `/api/public/*` |

**Not included:** the WordPress/Next.js website itself, direct Porter/Dunzo/Swiggy-Genie API calls (needs their business credentials — rider is assigned manually for now), and WhatsApp Pay.

**Testing:** see `TESTING.md`. Offline logic test: `npm test`.

## What the frontend (admin app) gives you
| Page | Purpose |
|---|---|
| Dashboard | today's orders/revenue (per outlet), paid orders to pack, pending payments, new bulk enquiries |
| Orders | search/filter, view details, change status (customer gets WhatsApp update — free text, or approved template if 24h window is closed), CSV export |
| Products | products with sizes, categories, per-outlet stock (bot reads them live) |
| Outlets | branches: address, phone, coordinates, hours, alert number |
| Bulk enquiries | wedding / festival / corporate requests from WhatsApp |
| **Setup** | enter Meta (App ID, App Secret, token, IDs) + Razorpay credentials (stored **encrypted** in MongoDB), copy webhook URLs, **check token**, **test connection**, **subscribe app**, **send test message**, **create/list message templates** |
| **Guide** | interactive checklist of every prerequisite and Meta/Razorpay configuration step |

## Quick start (full steps + troubleshooting: see SETUP.md)
```bash
npm install && npm run setup
cp backend/.env.example backend/.env      # set MONGO_URI, JWT_SECRET, ADMIN_PASSWORD, PUBLIC_URL
docker compose up -d                      # local MongoDB (or use MongoDB Atlas)
npm run seed                              # admin login + 3 outlets + sample products with sizes
npm run dev                               # backend :5000  |  frontend :5173
ngrok http 5000                           # public HTTPS URL -> put it in PUBLIC_URL / Setup page
npm test                                  # offline bot-flow test (no Meta/Mongo needed)
```
1. Open http://localhost:5173 → log in (ADMIN_USER / ADMIN_PASSWORD).
2. Open **Guide** and follow sections A–F (Meta Business, app, number, system user token, webhook, Live mode, billing).
3. Open **Setup**, fill the credentials, **Save**, then use the test buttons.
4. In Meta paste the webhook URL + verify token shown on the Setup page; in Razorpay paste the Razorpay webhook URL.
5. Send "hi" to your WhatsApp number.

## Customer flow
any message → main menu (Sweets / Savories / Ghee Mithai / Bulk & Gifting / Track / Outlets) → product → size → quantity → cart → name → **Home delivery** (share location → nearest outlet → address) or **Self pickup** (outlet → time slot) → summary with delivery fee → **Pay Now** → Razorpay link in chat → payment webhook → *Order Confirmed* to customer + alert to owner / outlet → order appears in admin.

## Where credentials live
Entered on the **Setup** page → saved in MongoDB (`settings` collection). Secrets (access token, app secret, Razorpay secret, webhook secret) are encrypted with AES-256-GCM using `ENCRYPTION_KEY` (or `JWT_SECRET`). **Don't change that key after saving secrets** or you'll need to re-enter them.
`.env` values (`WA_TOKEN`, `PHONE_NUMBER_ID`, …) still work as fallbacks.

## Production
```bash
npm run build          # builds frontend/dist ; Express serves it
npm start              # or: pm2 start backend/src/index.js --name sweetbot
```
Host on Render / Railway / AWS / VPS + MongoDB Atlas, behind HTTPS. Set `PUBLIC_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`.
If you host the frontend separately, build it with `VITE_API_URL=https://your-backend/api` and set `CLIENT_ORIGIN` in the backend.

## REST API (`/api/*` needs `Authorization: Bearer <token>`)
| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/login | get JWT |
| GET | /api/orders , /api/orders/stats | list (filters, paging) / dashboard numbers |
| PATCH | /api/orders/:id/status | `{status, notify}` |
| GET/POST/PUT/DELETE | /api/products , /api/branches | manage products / outlets |
| GET/PATCH | /api/bulk | bulk enquiries |
| PATCH | /api/orders/:id/rider | assign rider + tracking link |
| GET/POST | /api/public/branches , /products , /otp/request , /otp/verify , /me/orders | website API (no admin login) |
| GET/PUT | /api/settings | read (masked) / save credentials |
| POST | /api/settings/test-token · test-whatsapp · subscribe-app · send-test · test-razorpay | connection tests |
| GET/POST | /api/settings/templates , /templates/defaults | list / create the 4 order templates |
| GET/POST | /webhook , /razorpay-webhook | Meta + Razorpay callbacks (signature-verified) |

## Notes
- WhatsApp free-form messages only work inside the customer's 24-hour window; outside it only approved templates work — hence the automatic template fallback.
- Pricing on the Meta side is per message and varies by category/country; check Meta's current rate card.
- Login and OTP endpoints are rate limited (in-memory; use Redis if you run several server instances).
