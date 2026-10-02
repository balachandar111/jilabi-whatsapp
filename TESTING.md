# Testing guide — Krishna Jelabi Kadai WhatsApp ordering

Works with the **Meta test number** shown on your API Setup page (no business verification needed).

## 0 · Offline check (2 seconds, no accounts needed)
```bash
npm test
```
Simulates 55 WhatsApp messages (menu, sizes, cart, delivery routing, pickup slots, bulk, tracking) and checks every payload against Meta's limits.

## 1 · Install & run
```bash
npm install && npm run setup
cp backend/.env.example backend/.env     # set JWT_SECRET (long random), ADMIN_PASSWORD, MONGO_URI
docker compose up -d                     # or use MongoDB Atlas
npm run seed                             # admin + 3 outlets + sample products
                                         # (existing DB with old products? add: -- --refresh-products  -> REPLACES all products)
npm run dev                              # API :5000  |  admin :5173
ngrok http 5000                          # copy the https URL
```
Log in at http://localhost:5173 (ADMIN_USER / ADMIN_PASSWORD).

## 2 · Fill the Setup page (values from your Meta screenshot)
| Setup field | Where to get it |
|---|---|
| Public URL | the ngrok https URL |
| App ID / App Secret | App Dashboard → **App settings → Basic** |
| Phone Number ID | API Setup → Step 1 → *Phone Number ID* (yours shows 1361797437017184) |
| WhatsApp Business Account ID | same box → *WhatsApp Business account ID* (yours shows 1812410813127968) |
| Access token | click **Generate token** (temporary, ~24 h — fine for testing; expired later = error 190, just generate again) |
| Graph API version | leave `v25.0` (matches your screenshot) |
| Verify token | click **Generate** on the Setup page |
| Catalog ID | leave **empty** for now (list menus are used) |
| Delivery charge / free above / max km | e.g. 40 / 500 / 10 |
| Owner alert number | your mobile, digits with country code, e.g. `919876543210` |

Click **Save settings**, then in the *Test your setup* box, press in order:
1. **Check token** → should say VALID and “belongs to your App ID: yes”.
2. **Test connection** → shows the test number.
3. **Subscribe app to WABA** → lists your app.
4. On the Meta page: “Send a message from your test number” → **Recipient** dropdown → *Manage phone number list* → add **your own WhatsApp number** and confirm the code (test numbers can message only verified recipients, max 5). Then in Setup enter that number and press **Send hello_world template** — you receive it on WhatsApp.

## 3 · Webhook (so the bot receives customer messages)
Meta → WhatsApp → **Configuration** → Webhook → *Edit*
- Callback URL: `<ngrok-url>/webhook`
- Verify token: the one on your Setup page (save Setup FIRST)
- Click **Verify and save**, then subscribe to the **messages** field.

Reply to the hello_world message (or send “hi”) → the main menu list appears. ✅

> ngrok's free URL changes on every restart → update Public URL in Setup and the webhook in Meta each time.

## 4 · Razorpay (test mode)
1. Dashboard in **Test mode** → Settings → API Keys → Key ID + Secret → Setup → **Test Razorpay**.
2. Settings → Webhooks → Add: URL `<ngrok-url>/razorpay-webhook`, your own secret, events `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`. Put the same secret in Setup → *Webhook secret* → Save.
3. When paying a test link use UPI ID `success@razorpay` (or Razorpay's test card numbers).

## 5 · Outlets & products
- **Outlets**: fix the sample addresses/phones/coordinates (right-click a place in Google Maps to copy lat/lng).
- **Products**: check sizes/prices; tick “Out of stock at” for one item at one outlet to test routing.

## 6 · Test script (do it from your phone)
| # | You send | Expected |
|---|---|---|
| T1 | `hi` | Menu list: Sweets, Savories, Ghee Mithai, Bulk & Gifting, Track, Outlets |
| T2 | Sweets → Mysore Pak → 500g → qty 2 → Add more → Jalebi → qty 1 | Cart shows sizes and totals |
| T3 | Checkout → your name → **Home delivery** | “Share location” button appears |
| T4 | Tap it → **Send your current location** | “Nearest outlet: … km”; then send address + pincode |
| T5 | Summary → **Pay Now** | Razorpay link; pay with `success@razorpay` |
| T6 | (after payment) | “Order Confirmed!” on WhatsApp; owner alert; order in **Orders** page with outlet |
| T7 | Orders → View → **packed** → **dispatched** (add rider name/link first) | Customer gets “Packed”, then “Out for delivery” with rider |
| T8 | **delivered** | Customer gets delivered message |
| T9 | New order → **Self pickup** → outlet → time slot → pay | Order shows Pickup + slot; use **ready** → “Ready for pickup” message |
| T10 | Type `track` | Latest order and status |
| T11 | Bulk & Gifting → occasion → details → date | Reference BQ…; appears in **Bulk enquiries**; owner alerted |
| T12 | Outlets | Addresses + 3 map pins |
| T13 | Type location far away (or set Max km low) | “Outside our delivery area” + pickup option |
| T14 | Setup → **Create the order + OTP templates**, wait for APPROVED | Templates listed as APPROVED |
| T15 | `POST /api/public/otp/request {"phone":"98xxxxxxxx"}` then `/otp/verify` | Code arrives on WhatsApp; verify returns a token |

## 7 · Things that surprise people
- **Owner / outlet alerts** are normal messages, so they arrive only if that number messaged the bot in the last 24 h → send “hi” from the owner's phone once.
- **Status updates after 24 h** need the approved `order_*` templates (T14) — otherwise the admin shows “Customer not notified”.
- **OTP**: with `login_otp` not yet approved the code is sent as plain text, which only works inside the 24 h window.
- Changing `JWT_SECRET`/`ENCRYPTION_KEY` after saving secrets makes them unreadable — re-enter them.

## 8 · Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Webhook “Verify and save” fails | Save Setup first; verify token must match exactly; ngrok URL current; use `/webhook` path |
| Menu never arrives, no logs | messages field not subscribed, or *Subscribe app to WABA* not run |
| Backend log `401` on `/webhook` | App Secret in Setup is wrong (it must belong to the same app) — fix or clear it |
| Error `131030` | Recipient not in the allowed list (step 2.4) |
| Error `131047` | 24 h window closed → use a template |
| Error `190` | Access token expired → Generate token again, save |
| Error `132001` | Template doesn't exist / not approved yet |
| Razorpay link error | Test keys vs live keys mismatch, or Payment Links not enabled on the account |
| Payment done but no confirmation | Razorpay webhook URL/secret wrong, or ngrok URL changed |
