# Commerce Calculator

A full-stack billing app: an Express + TypeScript backend backed by a real
persistent data store, and a React + TypeScript (Vite) frontend. Every
customer gets their own consumer ID, their own cart/ledger, and a permanent
history of past transactions with running due/credit tracking. There's also
a password-protected admin dashboard for you to operate the shop.

## Project structure

```
commerce-calculator/
├── backend/     Express API + JSON data store (TypeScript)
└── frontend/    React app (Vite + TypeScript)
```

## How it works

- **Consumer IDs.** On first visit, you either enter an existing ID or
  generate a new one (just give a name). IDs look like `CUST-7F3K9Q`. There's
  no password on the customer side — the ID itself is the credential,
  similar to a loyalty-card number.
- **Ledger** — add articles (name, amount, GST slab, quantity) to the current
  cart. The same article name merges quantities instead of duplicating rows.
  Each row has a quantity editor (type any number, including large restocks)
  plus a quick "+1" button, and a "Remove" button.
- **Bill page** — shows the current cart itemized (subtotal/tax/total are
  now part of the same table as the line items, not a separately-styled
  block), plus your current balance banner at the top. Settling a bill
  automatically rolls in any existing due or credit: pay more than this
  bill's total and the extra clears old dues first, then becomes credit
  applied to your *next* bill; pay less and the shortfall carries forward
  as due. If you already owe money, a standalone "Pay off your due" box lets
  you record a payment at any time — no need to buy anything first.
- **Transaction history** — every settlement and every standalone payment is
  kept forever, each showing the balance immediately after it. Recording a
  payment always *adds* to what's been paid — it can never overwrite or
  erase an earlier payment (this was a real bug in an earlier version, now
  fixed by making every payment its own transaction rather than an edit of
  an old one).
- **Admin dashboard** (`/admin`, password `admin123` by default) — stats
  (total customers, transactions, amount billed/collected, outstanding
  due/credit across everyone), a searchable customer directory so you can
  look up a lost ID by name, drill-down into any customer's full history,
  and the ability to correct or delete a faulty transaction. Editing or
  deleting a transaction automatically recalculates that customer's balance
  and every later transaction of theirs, so the ledger stays consistent.
- **Data store.** All of this lives in `backend/data.json`, a plain JSON
  file created automatically on first run and rewritten after every change,
  so nothing is lost between restarts. It's deliberately a zero-dependency,
  pure-JavaScript store (no native modules to compile) so `npm install`
  can't fail on someone's machine due to a missing C++ build toolchain.

## Running it

You need two terminals — one for the backend, one for the frontend.

### 1. Backend (http://localhost:3001)

```sh
cd backend
npm install
npm run dev
```

`backend/data.json` is created automatically on first run and excluded from
version control — back it up yourself if it matters to you.

**Admin password:** defaults to `admin123`. To change it, set the
`ADMIN_PASSWORD` environment variable before starting the backend, e.g.
`ADMIN_PASSWORD=something-else npm run dev`.

API (all under `/api`):
- `POST /api/customers` — body `{ name }`, creates a customer, returns a generated ID
- `GET /api/customers/:id` — look up a customer (case-insensitive); includes their current `balance`
- `GET /api/customers/:id/cart` — current (unsettled) line items
- `GET /api/customers/:id/bill` — current cart totals plus balance: `{ subtotal, tax, total, itemCount, lineCount, balance, due, credit }`
- `GET /api/customers/:id/balance` — just the balance: `{ balance, due, credit }`
- `POST /api/customers/:id/cart` — body `{ name, amount, taxRate?, quantity? }`; merges into an existing line if the name matches
- `PATCH /api/customers/:id/cart/:itemId` — body `{ quantity }`, sets the exact quantity (up to 1,000,000)
- `DELETE /api/customers/:id/cart/:itemId` — removes a line item
- `POST /api/customers/:id/settle` — body `{ paid }`; finalizes the cart into a transaction, rolling in any existing balance, then clears the cart
- `POST /api/customers/:id/payments` — body `{ amount }`; records a standalone payment against the balance (always additive)
- `GET /api/customers/:id/transactions` — full history, newest first

Admin API (all require header `x-admin-password: <password>`):
- `POST /api/admin/login` — body `{ password }`; just for immediate login feedback
- `GET /api/admin/stats` — shop-wide totals
- `GET /api/admin/customers?q=` — list/search customers by name or ID
- `GET /api/admin/customers/:id/transactions` — a specific customer's full history
- `GET /api/admin/transactions` — every transaction across every customer
- `PATCH /api/admin/transactions/:txId` — body `{ subtotal?, tax?, total?, paid?, note? }`; corrects a transaction and recalculates that customer's balance forward from that point
- `DELETE /api/admin/transactions/:txId` — deletes a transaction and recalculates the customer's balance

### 2. Frontend (http://localhost:5173)

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. You'll land on the identity gate first; the
ledger and bill pages require a valid consumer ID (remembered in your
browser via `localStorage` until you hit "Switch ID"). The admin dashboard
lives at a separate, unlinked route — `/admin` — and isn't shown anywhere in
the customer-facing UI; only people who know that URL and the password can
reach it.

All amounts are shown in ₹ (INR).

## Accessing it from your phone (same Wi-Fi)

The frontend proxies API calls internally, so only **one port** (`5173`)
needs to be reachable.

1. Make sure your phone is on the same Wi-Fi network as your computer.
2. Find your computer's local IP address:
   - **Windows**: `ipconfig` in Command Prompt → "IPv4 Address"
   - **Mac**: `ipconfig getifaddr en0` in Terminal
   - **Linux**: `hostname -I`
3. Start both servers as usual.
4. On your phone's browser, go to `http://<your-computer's-IP>:5173`.

## Sharing it with anyone, anywhere (temporary public link)

This uses a **tunnel** — a free service that gives your locally-running app
a public URL. The link only works while your computer is on and both
servers are running.

**Using Cloudflare Tunnel (no account needed):**

1. Install `cloudflared`:
   - **Mac**: `brew install cloudflared`
   - **Windows/Linux**: see [developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads)
2. Start both servers as usual.
3. In a third terminal: `cloudflared tunnel --url http://localhost:5173`
4. Share the `https://random-words-1234.trycloudflare.com` URL it prints.

**Alternative: single-server mode** — build the frontend into the backend
and serve everything from one port instead of running two dev servers:
```sh
cd backend
npm run build:all   # builds the backend, builds the frontend, copies it into backend/public
npm start
```
Then tunnel `http://localhost:3001` instead of 5173.

**Worth knowing about tunneling:** anyone with the link can create customer
IDs and use the app. The `/admin` route is still password-protected, but the
password travels as a request header — fine over the HTTPS tunnel, but
don't reuse a password you care about elsewhere. Data is real and permanent
(the JSON file), so it'll still be there next time even after you stop the
tunnel; just the *public link* stops working until you start a new tunnel.

**If you want it reachable even when your computer is off:** that requires
actually deploying the backend and frontend to a cloud host rather than
tunneling from your machine — a different, bigger step. Happy to set that up
whenever you want to go that route.

## Notes on the data model

- A customer's **cart** is their current, unsettled, in-progress order.
- Every customer has a running **balance**: positive means they owe the
  shop (due), negative means the shop owes them (credit), zero means
  settled. This is the single source of truth for "how much is
  outstanding" — individual transactions record what the balance was
  immediately before and after them, for a full audit trail, but the
  customer's current `balance` field is what everything else derives from.
- **Settling** a cart or **recording a payment** each create a new
  transaction that adjusts the balance — nothing is ever overwritten in
  place, which is what makes payment history reliable.
- Admin **corrections** (editing or deleting a transaction) are the one
  exception: they replay that customer's entire transaction history in
  order afterward, recalculating every balance from that point forward, so
  a fix to an old mistake correctly ripples through to today's balance.
- Consumer IDs use an unambiguous character set (no `0`/`O`/`1`/`I`) so
  they're easy to read back over the phone, and lookups are case-insensitive.
