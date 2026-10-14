# TeamLift Coffee Chats

TeamLift is a scheduling app for virtual coffee chats with Dario Jakovleski. Visitors browse the next 30 days of availability and reserve a slot; the host uses an unprotected dashboard to manage slots and review booking history. Appointment times are interpreted and displayed in `Europe/Skopje`.

## Stack and layout

- `client/`: Vite, React, TypeScript, Tailwind CSS, and reusable shadcn-style UI primitives.
- `server/`: NestJS REST API, Prisma ORM, and Neon PostgreSQL.
- `server/prisma/schema.prisma`: slot/booking models and lifecycle enums.
- `server/prisma/migrations/`: committed PostgreSQL migrations, including database-enforced active-slot overlap prevention.

Prisma stores all slots and bookings in PostgreSQL. The API does not seed demo rows on startup and will not run without `DATABASE_URL`; this avoids silently switching to process-local data that disappears on restart.

## Code map

| Area | Where to look | Responsibility |
| --- | --- | --- |
| Frontend routes and screens | `client/src/App.tsx` (`App`, `PublicBookingPage`, `DashboardPage`) | Routes `/` and `/dashboard`, loads API data, handles forms, and displays errors and booking confirmation. |
| Frontend UI building blocks | `client/src/components/ui/` | Shared buttons, cards, dialogs, labels, inputs, and badges. |
| API routes | `server/src/app.controller.ts` | Maps HTTP methods and paths to service functions. `server/src/main.ts` adds the `/api` prefix and configures CORS. |
| Scheduling and business rules | `server/src/app.service.ts` (`listPublicSlots`, `createBooking`, `createHostSlot`, `cancelBooking`, etc.) | Validates requests, queries PostgreSQL through Prisma, coordinates transactions, and formats API responses. |
| Local time conversion | `server/src/time-zone.ts` (`parseSkopjeLocal`) | Converts user-entered Skopje wall-clock dates/times to unambiguous instants and rejects daylight-saving gaps or duplicates. |
| Database connection | `server/src/prisma.service.ts` | Requires `DATABASE_URL`, creates the Prisma PostgreSQL adapter, and manages connection lifecycle. |
| Persistent data model | `server/prisma/schema.prisma` | Defines slot and booking records, statuses, and relations. |
| Database invariants and legacy import | `server/prisma/migrations/20261014_init/migration.sql` | Creates PostgreSQL constraints/indexes and, where applicable, imports the old `public.slots` and `public.bookings` tables. |
| Demo data | `server/prisma/seed.ts`, `server/prisma/cleanup-demo.ts` | Explicitly seeds marked examples and removes only demo records while preserving slots with genuine bookings. |

The core data model is deliberately small: a `Slot` stores its start/end instants, duration, status, and demo marker; a `Booking` belongs to one slot and stores visitor details, optional note, status, and demo marker. The lifecycle enums in `server/prisma/schema.prisma` make availability and cancellation explicit instead of encoding them as missing rows.

## End-to-end workflow

### Visitor booking

1. `PublicBookingPage` in `client/src/App.tsx` fetches `GET /api/public/slots` when the page opens. The API returns future, `AVAILABLE` slots within the next 30 days, ordered by start time. The page groups and formats them in `Europe/Skopje`.
2. A visitor selects a slot and submits their name, email, and optional note. The browser posts these fields to `POST /api/public/bookings`.
3. `AppController` in `server/src/app.controller.ts` forwards the request to `AppService.createBooking` in `server/src/app.service.ts`. The service validates the JSON object, required text, name/email lengths, and email shape.
4. Inside one Prisma transaction, the service conditionally changes the requested slot from `AVAILABLE` to `BOOKED` only if it is still in the future. It checks that exactly one row changed, then creates the confirmed booking. The slot claim and booking insert commit together; if either fails, neither change is retained.
5. On success, the browser closes the form, shows the immediate confirmation, and starts reloading public availability so the booked slot disappears. It also calls `POST /api/ai/confirmation` to personalize the message. This second request is optional and does not determine whether the booking succeeded.

### Host scheduling and dashboard

The dashboard in `DashboardPage` loads `GET /api/dashboard`, which returns summary counts plus slot and booking history. Creating a slot posts a Skopje-local date, start time, and duration to `POST /api/host/slots`. The service validates the input, computes the end instant, checks for overlapping active slots, and inserts the slot. The dashboard reloads after successful changes.

Host actions use `DELETE /api/host/slots/:slotId` to cancel a slot and `DELETE /api/host/bookings/:bookingId` to cancel an individual booking. Cancellation changes status instead of deleting the record, retaining history. Cancelling a future booking reopens its slot if it is still booked and no active overlap prevents that. Cancelling a future slot also cancels its confirmed booking; when its time is still free, the service creates a new available slot for that interval. The host API and dashboard currently have no authentication or authorization.

### API route reference

All routes below are prefixed with `/api` (`server/src/main.ts`).

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Checks the database connection with a simple query and returns service/time-zone metadata. |
| `GET /public/slots` | Lists public availability; optional `?date=YYYY-MM-DD` filters by a Skopje calendar day. |
| `POST /public/bookings` | Atomically claims an available slot and creates the booking. Body: `slotId`, `visitorName`, `visitorEmail`, optional `note`. |
| `POST /ai/confirmation` | Generates an optional confirmation message from Gemini, or returns a deterministic fallback. Body: `slotId`, `firstName`. |
| `GET /dashboard` | Returns host dashboard counts, slots, bookings, and upcoming activity. |
| `GET /host/slots` | Returns all slots for host-side use. |
| `POST /host/slots` | Creates a slot. Body: `date`, `startTime`, `durationMinutes`. |
| `PATCH /host/slots/:slotId` | Edits an available slot. Booked/cancelled slots cannot be edited. |
| `DELETE /host/slots/:slotId` | Cancels a slot while retaining its history. |
| `DELETE /host/bookings/:bookingId` | Cancels a booking and may reopen its future slot. |

Date/time inputs are Skopje-local strings. Persisted timestamps and timestamp fields in API responses are ISO-8601 instants; the UI formats those instants back into Skopje time. Invalid requests produce HTTP errors rather than silently creating substitute data.

## Local setup

Prerequisites: Node.js 22 or newer, npm, and a PostgreSQL database. Neon is the intended hosted database.

```powershell
npm install
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set `DATABASE_URL` to a working PostgreSQL connection string. For Neon, use the pooled URL for `DATABASE_URL` and the unpooled/direct URL for `DIRECT_URL` where available. The frontend can run without a `.env` file locally; it defaults to `http://localhost:3001/api`.

Apply schema migrations and optionally load the demonstration records:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

For a database that already contains the older TeamLift `public.slots` and
`public.bookings` tables but has no Prisma migration history, back it up first.
Apply the initial migration SQL once, then baseline it so future migrations can
be deployed normally:

```powershell
npx prisma db execute --file prisma/migrations/20261014_init/migration.sql
npx prisma migrate resolve --applied 20261014_init
npm run db:migrate
```

That initial migration keeps the legacy tables and imports their slots and
bookings into the new Prisma tables. Do not use this baseline procedure for an
unrelated non-empty database.

Start the API and frontend in separate terminals:

```powershell
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`. `http://localhost:3001/api/health` checks API and database availability. Without a configured database the API reports a startup/configuration error; the frontend shows an availability error rather than fabricating or storing bookings in memory.

## Database workflow

- `npm run db:generate`: generate the Prisma Client after schema changes.
- `npm run db:migrate`: apply committed migrations with `prisma migrate deploy`.
- `npm run db:seed`: manually insert a small, idempotent sample schedule once. Demo data is marked with `isDemoData`; it is not reseeded on server restart.
- `npm run db:cleanup-demo`: delete only marked demo bookings and slots. If a demo slot has genuine bookings, cleanup preserves it and clears its demo marker.

Do not use `prisma db push` or cleanup as a production reset. Take a database backup before any manual production data maintenance.

Bookings are created in a transaction that atomically changes a slot from `AVAILABLE` to `BOOKED` and inserts the booking. The migration also adds a partial unique index for confirmed bookings and a PostgreSQL exclusion constraint preventing overlapping non-cancelled slots. Date/time input is parsed strictly as Skopje local time; nonexistent or ambiguous daylight-saving times are rejected.

## Important edge cases and design choices

- **Two people try to book the same slot:** the API does not rely on the page's possibly stale availability list. The conditional `updateMany` in `AppService.createBooking` is the atomic claim: only the request that changes one `AVAILABLE` row wins. The transaction then inserts its booking; the other request receives a conflict response. PostgreSQL's `Booking_one_confirmed_per_slot_idx` is an additional guard against duplicate confirmed bookings.
- **Slots overlap:** `AppService.hasOverlap` checks intervals using `existing.startAt < requested.endAt && existing.endAt > requested.startAt`. The database independently enforces this in `Slot_no_active_overlap` for every non-cancelled slot. Intervals are half-open (`[start, end)`), so one slot may start exactly when another ends. The database constraint protects against races between simultaneous slot creation/edit requests.
- **Daylight-saving transitions:** a local time can be nonexistent when clocks jump forward or occur twice when clocks move back. `parseSkopjeLocal` in `server/src/time-zone.ts` tests possible offsets and round-trips candidate instants through the IANA time zone. It rejects zero or multiple matching instants instead of guessing. Slots are then persisted as `TIMESTAMPTZ` instants, not as server-local dates.
- **Availability bounds:** public listing is limited to future slots no more than 30 days ahead. With a date filter, the API calculates the start and end of that local calendar day in Skopje time, including the proper offset for that date.
- **Input validation:** host-created durations must be whole numbers from 15 to 180 minutes. Booking names and notes have length limits, and email addresses are checked on the backend; browser form validation is only a convenience, not the trust boundary.
- **Stale availability:** the list shown in a browser can change before a visitor submits. The API rechecks current slot state and start time while claiming it, returning a conflict if it has already been booked or passed; a missing slot returns not found.
- **Cancellation keeps an audit trail:** slots and bookings use `CANCELLED` statuses and remain in the database. This preserves history, avoids destructive deletion, and makes it possible to report cancelled records.
- **AI is not on the booking critical path:** a successful database booking is confirmed before the UI requests AI text. If `GEMINI_API_KEY` is absent, the slot cannot be found, or Gemini fails/returns empty text, the API responds with a fixed fallback. Gemini output is whitespace-normalized and capped at 180 characters; provider errors are logged with the key redacted.
- **Demo data is explicit:** startup never seeds records. `isDemoData` distinguishes examples from real records, and cleanup preserves any demo slot that has non-demo bookings.
- **Database configuration is mandatory:** `PrismaService` fails startup if `DATABASE_URL` is missing. There is deliberately no in-memory fallback that could make a booking appear to work but lose it on restart.

## Interview walkthrough: likely questions

**Why use a database transaction for a booking?**  
The slot status change and booking row represent one business operation. The transaction commits both or neither. Combined with the conditional status update, it prevents two requests from successfully claiming the same slot even if both browsers saw it as available.

**Why check overlaps in both application code and PostgreSQL?**  
The service check gives users a clear conflict response before attempting the write. It alone can race if two requests check at the same time. The PostgreSQL exclusion constraint is the final concurrency-safe invariant and also protects writes from any other code path.

**Why is time-zone parsing in the backend?**  
The host enters wall-clock times in the scheduling zone, regardless of the browser or server zone. The backend is the authoritative boundary: it validates the date/time and converts to an instant before persistence. The UI also formats in the named zone rather than the visitor's machine zone.

**What does the AI feature do, and what happens if it is unavailable?**  
After the booking succeeds, the browser requests a short personalized confirmation. Gemini credentials stay on the server. Missing configuration, provider errors, or empty output use the built-in confirmation; none of those can roll back or invalidate the booking.

**Why preserve cancelled rows instead of deleting them?**  
Cancellation is a lifecycle state, not data erasure. Keeping the records maintains booking history and allows the dashboard to count cancellations. A future cancelled booking can make its slot available again, while past time is not reopened.

**What would you improve before production?**  
Add authentication and role-based authorization to every host endpoint, since the current dashboard is intentionally unprotected. I would also add integration tests against PostgreSQL for the database constraints and truly concurrent requests, stronger request DTO validation/rate limiting, and operational handling for email or calendar invitations. The meeting link is currently shared separately; no email/calendar integration exists.

## Environment

See [server/.env.example](./server/.env.example). `DATABASE_URL` is required by the backend at runtime. `DIRECT_URL` is optional and is used for Prisma migration commands when provided. `GEMINI_API_KEY` is optional and backend-only; AI generation only enriches the successful in-app confirmation. The frontend never receives the key. `GEMINI_MODEL`, `PORT`, and `CLIENT_URL` configure the AI model, API port, and allowed browser origin.

The frontend may set `VITE_API_BASE_URL` in `client/.env.local` to point to a deployed API, including its `/api` prefix.

## Tests and builds

```powershell
npm test
npm run build:server
npm run build:client
```

Tests mock the Prisma service and do not require Neon credentials. Verify a
configured live database with `http://localhost:3001/api/health` before testing
the booking flow.

## Hosting: Neon + Render + Vercel

This repo is an npm-workspaces monorepo. Keep both hosting projects rooted at the repository root so they use the root `package-lock.json`. The standalone `client/package-lock.json` does not list all the frontend libraries; deploying Vercel with `client/` as its root makes `npm ci` omit those libraries and causes the TypeScript "Cannot find module" errors shown in the Vercel build log.

### 1. Create the PostgreSQL database

1. Create a PostgreSQL project in Neon and copy its pooled connection string for runtime use.
2. Also copy the direct/unpooled connection string for migrations. Do not commit either URL.
3. You will add these as Render environment variables in the next step. `DATABASE_URL` is required; `DIRECT_URL` is recommended for migration commands.

### 2. Deploy the API to Render

Create a **Web Service** from the Git repository with these settings:

| Render setting | Value |
| --- | --- |
| Root Directory | Leave blank (repository root) |
| Runtime | Node |
| Build Command | `npm ci && npm run build:server` |
| Start Command | `npm --workspace server run start:prod` |
| Health Check Path | `/api/health` |

Set these environment variables in Render's service settings. Do not add quotes around values in the Render UI.

| Variable | Value | Required |
| --- | --- | --- |
| `DATABASE_URL` | Neon pooled/runtime connection string | Yes |
| `DIRECT_URL` | Neon direct/unpooled connection string | Recommended; used by Prisma migrations when present |
| `CLIENT_URL` | Exact frontend origin, e.g. `https://your-project.vercel.app` (no trailing slash or path) | Yes for browser requests |
| `GEMINI_API_KEY` | Gemini API key | Optional; fallback confirmation works without it |
| `GEMINI_MODEL` | For example `gemini-3.8-flash` | Optional |
| `NODE_VERSION` | `22` | Recommended |

Do not set `PORT` manually on Render. Render supplies it at runtime, and `server/src/main.ts` reads `process.env.PORT` (falling back to 3001 locally).

Deploy the service once. From the Render service's **Shell** (working directory is the repository root), apply database migrations:

```sh
npm run db:migrate
```

This applies the committed Prisma migrations, including the slot-overlap and confirmed-booking constraints. Run migrations again after deploying a future schema change. If your Render plan supports a pre-deploy command, set it to `npm run db:migrate` so migrations complete before each new version starts; otherwise run it manually from the Render Shell before relying on the new schema.

Only if you want sample data in the hosted app, run this once from the same Render Shell after migrating:

```sh
npm run db:seed
```

Skip seeding for a clean production database. The seed is marked as demo data and does not run automatically. Never use `db:cleanup-demo` as a production reset.

Check the deployed API before configuring the frontend:

```sh
curl.exe -i https://YOUR-RENDER-SERVICE.onrender.com/api/health
```

Expect HTTP 200 and JSON with `"ok": true` and `"database": "connected"`. A database/configuration error must be fixed on Render before deploying the client.

### 3. Deploy the frontend to Vercel

Import the same Git repository into Vercel and set the project options:

| Vercel setting | Value |
| --- | --- |
| Root Directory | `.` (repository root; do not set this to `client`) |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build:client` |
| Output Directory | `client/dist` |

Set this Vercel project environment variable for **Production** (and Preview too, if you want preview deployments to call the same API):

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://YOUR-RENDER-SERVICE.onrender.com/api` |

The value must include `/api`; it is compiled into the frontend during the Vercel build and is not a secret. Trigger a deployment after adding or changing it.

The root `vercel.json` rewrites client-side routes to the built `index.html`, allowing direct visits or refreshes at `/dashboard`. Keep that file if you change frontend hosting or routing configuration.

### 4. Connect CORS and verify the full deployment

Copy the deployed Vercel origin (or custom domain) and update Render's `CLIENT_URL` to exactly that origin, for example `https://your-project.vercel.app`. Do not include a route or trailing slash. Save the variable and redeploy/restart the Render service so the API reads it.

Then verify:

1. Open `https://YOUR-RENDER-SERVICE.onrender.com/api/health` and confirm it reports database connectivity.
2. Open the Vercel URL and confirm availability loads. If it does not, check the browser console/network tab, `VITE_API_BASE_URL`, and Render's `CLIENT_URL`.
3. Test the complete flow: create a future slot in `/dashboard`, book it from `/`, and confirm it disappears from public availability.
4. Refresh `/dashboard` directly to check the Vercel SPA rewrite.

If you use a custom frontend domain, update `CLIENT_URL` to that domain's origin and redeploy the API. If you change the Render API URL, update `VITE_API_BASE_URL` in Vercel and redeploy the frontend.

### Optional Vercel CLI deployment

After linking the Vercel project and configuring its environment variables, deploy from the repository root with:

```powershell
npx vercel --prod
```

Otherwise, deploy through the Vercel dashboard by importing the repository; no local CLI installation is required. Hosting-provider dashboards and free-tier behavior can change, so confirm the current plan's service availability and sleep/usage limits.

No live deployment was performed from this workspace.

## Limitations and safety

**The host dashboard is intentionally unauthenticated. Anyone who can access it can create or cancel slots and bookings. It is demonstration-only and must be protected by authentication/authorization and further security hardening before production use.** No confirmation email, meeting-link delivery, or calendar integration is implemented. The meeting link must be shared separately.

Never put real database credentials in `.env.example` or commit local `.env`
files. If a connection string has been committed or shared, rotate its database
password and update the local environment file.


https://bookingapp-992h.onrender.com/api/