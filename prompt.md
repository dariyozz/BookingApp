# TeamLift — Product Engineer Internship Challenge: Full Build Prompt

## Your role and objective

Act as a senior full-stack product engineer. Build a complete, polished, working **TeamLift Office Hours / Coffee Chat Scheduler** based on the requirements below.

Treat this as a focused product-engineering challenge intended to take approximately two hours. Prioritize a reliable end-to-end experience, clean implementation, and a polished interface over unnecessary features.

**Do not stop after proposing an architecture or generating a scaffold.** Inspect the available repository, implement the application, run the relevant checks, fix discovered issues, and prepare it for deployment. Deploy it where credentials and account access permit. Report honestly what works, what was tested, and what remains incomplete.

Use sensible defaults for details not specified here. Avoid expanding scope without a clear reason.

---

## 1. Product requirements

Build a simple scheduling application for a single host, Dario Jakovleski, who offers virtual coffee chats.

The host can publish available time slots. Visitors can browse availability, provide their details, and reserve a slot. A successful booking makes that slot unavailable to other visitors.

The application must prevent double bookings, handle cancellation correctly, and preserve historical records.

No user accounts, sign-up, or login system is required. There is one host, and one authoritative time zone: `Europe/Skopje`.

### Host profile

Use the following demonstration profile:

- **Name:** Dario Jakovleski
- **Introduction:** “I enjoy meeting curious people, sharing ideas, and talking about technology, products, and creative work. Book a relaxed chat and let's connect.”
- **Avatar:** A styled circular avatar with the initials “AM.”
- **Meeting type:** Virtual coffee chat.
- **Meeting link:** The link will be shared separately. Do not fabricate a meeting URL or promise that one will be automatically delivered.

Keep the profile consistent throughout the public page, booking confirmation, and dashboard.

---

## 2. Required technology stack

Use the following technologies:

**Frontend**
- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

**Backend**
- NestJS
- TypeScript
- REST API

**Database**
- Neon PostgreSQL
- Prisma ORM
- Prisma migrations committed to the repository

**AI integration**
- Google Gemini API, called exclusively from the backend.

**Deployment targets**
- Frontend: Vercel
- Backend: Render
- Database: Neon PostgreSQL

Use a monorepo structured approximately as follows:

```text
teamlift/
├── client/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── .env.example
│   └── ...
├── server/
│   ├── src/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── test/
│   ├── package.json
│   ├── .env.example
│   └── ...
├── package.json
├── README.md
└── ...
```

You may adjust the internal structure when there is a clear technical reason, but keep the frontend and backend separate.

Use compatible, stable package versions and commit the lockfile. Provide root-level commands where practical so a developer can install, run, build, and test the project without navigating through unnecessary steps.

---

## 3. UI design and interaction

Create a warm, editorial visual identity.
Be Creative with app name and all text paragraphs.

### Visual direction

- Warm cream or off-white background.
- Forest-green primary accents.
- Friendly, contemporary typography.
- Subtle organic shapes and restrained decorative details.
- Generous spacing, clear hierarchy, and readable text.
- Light theme only.
- A consistent system of buttons, cards, form fields, badges, dialogs, and status indicators.

Avoid a generic admin-template appearance. The application should feel like a real, thoughtfully designed product while remaining straightforward to implement.

Use shadcn/ui and Tailwind for reusable, consistent components. Do not spend excessive time on elaborate animation or decoration.

### Responsive and accessible behavior

The public booking flow and dashboard must work on desktop and mobile.

Provide semantic markup, properly labelled fields, keyboard-accessible controls, visible focus indicators, accessible dialog behavior, and sufficient text contrast.

Include clear loading, success, empty, validation, and error states. Avoid dead buttons, placeholder interactions, and controls that appear functional but do nothing.

---

## 4. Public booking experience

Create a public-facing booking page that combines an upcoming-availability list with a calendar view.

### Page layout

Include:
1. TeamLift branding and a concise introduction.
2. The Dario Jakovleski host profile and virtual coffee-chat description.
3. A prominent list of upcoming available slots.
4. A calendar that lets visitors browse dates and select available times.
5. A booking form or dialog for the chosen slot.
6. Clear availability and booking-confirmation states.

The upcoming-slots list and calendar must use the same underlying availability data. Selecting a date must display the relevant available slots.

Hide past slots from public availability. Limit publicly bookable dates to the next 30 days. Show empty-state messaging when no slots are available.

Display the time zone explicitly wherever dates and times are shown: **Europe/Skopje (Skopje time)**. Do not depend on the visitor's local browser time zone to communicate meeting times.

### Booking form

Collect:
- Full name — required.
- Email address — required and validated.
- Optional note — optional, saved with the booking and displayed to the host.

Show the selected slot's date, start time, duration, and time-zone label before submission.

Disable duplicate submission while a request is in progress. Provide helpful validation messages and a friendly response if the slot has already been booked.

### Successful booking

After the backend confirms the booking has been saved, immediately show an in-app confirmation screen.

Display the booking date, time, duration, host name, time zone, and a friendly confirmation message. Clarify that this is a virtual coffee chat and that the meeting link will be shared separately.

No email delivery is required. Do not implement SMTP or pretend that a confirmation email was sent.

---

## 5. Host dashboard

Create a separate host dashboard, accessible from a distinct dashboard route or page.

**Authentication is intentionally out of scope for this demo.** The dashboard is unprotected, meaning anyone who can access it may modify slots or bookings. Document this limitation prominently in the README and identify it as a security improvement required before production use.

Keep the dashboard focused on the core scheduling workflow.

### Dashboard overview

Include:
- Summary cards for upcoming slots, available slots, upcoming bookings, and relevant booking counts.
- A useful upcoming-activity section.
- A schedule or slot list with dates, times, durations, and statuses.
- A booking list showing the visitor's name, email, optional note, linked slot, and booking status.
- Access to past and cancelled records through history views or status filters.

Make it easy to distinguish available, booked, cancelled, and past slots.

### Slot management

The host must be able to:

- Create one slot at a time.
- Specify its date, start time, and duration.
- Edit unbooked slots.
- Cancel available slots.
- Cancel booked slots after an explicit confirmation warning.

Do not allow editing an already-booked slot. The host must cancel it and create a replacement if changes are needed.

Prevent overlapping active slots. Validate the requested time interval on the backend even if the frontend also validates it.

Reject invalid or past start times for newly created slots. A slot must have a valid, positive duration and end time.

### Booking management and cancellation

The host can review bookings and cancel a booking or its associated scheduled slot through the dashboard. Require a confirmation for destructive-looking actions, particularly cancellation of an existing booking.

Cancellation must preserve history rather than erase records.

Use the following explicit behavior:

**Cancelling a booking only**
- Mark the booking as cancelled.
- Retain the booking record in history.
- If its slot is still in the future and remains a valid time, reopen that slot for future booking.
- Do not reopen it if doing so would create an overlap with another active slot.

**Cancelling a slot**
- Mark the slot as cancelled.
- If it has a booking, also mark that booking as cancelled.
- Retain the original slot and booking in dashboard history.
- If the time is still in the future and available, create a new available slot for that same interval so visitors can book it again.
- Ensure the replacement slot does not overlap another active slot.
- Do not delete the original cancelled records.

Maintain unambiguous relationships between historical slots and bookings. A replacement availability slot must be a distinct record if required to preserve the cancelled slot's history.

Retain past slots and booking records in the dashboard; do not expose past slots as bookable public availability.

---

## 6. Data model and database behavior

Design a clear Prisma schema for the single-host scheduler. At a minimum, support scheduled slots and bookings with an appropriate relationship and explicit statuses.

Use consistent naming and appropriate indexes, foreign keys, and database constraints where practical.

The model must preserve historical bookings even when slots are cancelled or become available again. Avoid a design that overwrites or deletes prior booking records when a slot is booked again.

Suggested slot lifecycle:

`AVAILABLE → BOOKED`

`AVAILABLE → CANCELLED`

`BOOKED → CANCELLED`

A host cancellation may result in a new `AVAILABLE` slot record for the same future time. A cancelled historical slot must never silently become active again if doing so would obscure its history.

Suggested booking lifecycle:

`CONFIRMED → CANCELLED`

Use enums or equivalent constrained values for statuses. Define the transitions centrally in backend logic rather than scattering status strings throughout the application.

### Concurrent booking protection

**Prevent double bookings at the database/transaction level, not only in the UI.**

Two visitors may attempt to book the same slot nearly simultaneously. Exactly one request must succeed. All losing requests must receive a clear conflict response and a friendly user-facing message.

Use an appropriate PostgreSQL transaction and atomic state transition, with a database constraint or other robust concurrency safeguard. For example, atomically claim a slot only when its current status is `AVAILABLE`, and create the booking within the same transaction. Roll back the transaction if any necessary step fails.

Do not rely on a simple “check whether available, then insert” sequence without concurrency protection.

Handle invalid identifiers, validation failures, unavailable slots, conflicting slots, and database errors gracefully. Return suitable HTTP status codes and consistent error response shapes.

The same email address may have multiple active bookings. Do not introduce an email-based uniqueness restriction.

---

## 7. Time-zone handling and daylight saving

Use `Europe/Skopje` as the authoritative business time zone.

The application must:
- Interpret host-entered dates and times as Skopje local time.
- Store appointment instants consistently in PostgreSQL using timezone-aware timestamps where appropriate.
- Convert timestamps to Skopje time for public pages, dashboard views, API representations where relevant, and confirmations.
- Apply daylight-saving transitions correctly.
- Never depend on the backend server's local time zone.
- Avoid parsing user-facing local date-time strings as if they were automatically UTC.

Use a reliable time-zone library, such as `date-fns-tz` or an equivalent compatible solution, where necessary.

Handle daylight-saving edge cases carefully. Reject nonexistent local times and avoid silently choosing the wrong instant when a local time is ambiguous. Keep the implementation proportional to the challenge, but do not sacrifice correctness in normal scheduling behavior.

Use consistent time-zone-aware APIs and make the time zone visible in the interface.

---

## 8. Gemini AI confirmation message

Integrate Google Gemini to produce a friendly, concise, contextual confirmation message for a successful booking.

### Required behavior

The database booking operation must succeed or fail independently of AI generation.

Implement this sequence:
1. The visitor submits the booking.
2. The backend validates and saves the booking transactionally.
3. The API returns the successful booking response without waiting for Gemini.
4. The frontend immediately displays the booking confirmation, including a deterministic fallback message.
5. In the background, the frontend initiates a separate request to a backend Gemini endpoint.
6. If Gemini responds successfully, replace the fallback message with its generated message.
7. If the request fails, times out, or the API key is missing, retain the fallback and leave the booking untouched.

This must never result in a duplicate booking or a failed booking merely because AI generation failed.

The AI request must have a reasonable timeout, input validation, and bounded output length. Prevent unbounded retries.

Personalize the message using only the necessary context, such as the visitor's first name and appointment time. Do not send the visitor's email address or private note to Gemini.

### Security

- Store the Gemini API key in a backend-only environment variable.
- Never expose the key in frontend code, Vite environment variables, browser responses, source control, or logs.
- Provide a server-side integration service so AI-provider logic does not leak across unrelated parts of the application.
- Handle rate limits and provider errors without interrupting booking.

Choose a compatible Gemini model available to the configured account and document the model and required environment variables in the README. Avoid hard-coding assumptions that make the application unusable if the key is absent.

Include a deterministic fallback message that is friendly and accurate even when AI is disabled. The fallback must not promise that an email or meeting link was sent.

No Google Calendar integration is required.

---

## 9. Demo data and cleanup

Provide demo data that makes the application useful immediately after setup.

Include a representative set of future available slots and a small number of sample bookings so the host dashboard demonstrates different states. Sample records must be visually plausible and clearly identifiable as demo data.

### Seeding behavior

- Provide a repeatable, idempotent seed command.
- Populate the hosted demo once during initial setup.
- Do not run the seed script automatically on every server restart.
- Document the command and the recommended initial deployment sequence.

Track seeded records explicitly, for example through an `isDemoData` field or equivalent reliable marker.

### Cleanup behavior

Provide a dedicated cleanup command that removes only explicitly identifiable demo records.

It must not indiscriminately truncate tables or delete all bookings and slots.

Preserve genuine bookings and genuine slots, including any genuine booking associated with a slot originally created for demonstration purposes. If deleting a demo record would orphan or destroy genuine data, preserve the necessary record and handle the cleanup safely.

Make the command understandable, repeatable, and documented. Do not provide a destructive production reset command that can be accidentally run against the live database.

---

## 10. Environment configuration

Provide `.env.example` files for the frontend and backend with placeholder values only. Never commit real credentials.

Document environment variables as appropriate for the chosen implementation, including:

- `DATABASE_URL` — Neon PostgreSQL application connection string.
- `DIRECT_URL` or equivalent direct database connection setting if required for Prisma migrations.
- `GEMINI_API_KEY` — backend-only API key.
- `GEMINI_MODEL` — model configuration if used.
- `PORT` — server port as required by Render.
- `CLIENT_URL` or equivalent frontend URL for CORS configuration.
- `VITE_API_BASE_URL` — public frontend API base URL.

Use environment variables that have clear, consistent names. Validate required configuration at startup where appropriate without preventing basic booking functionality merely because the optional Gemini key is missing.

The backend must be configured to accept requests from the deployed frontend while allowing local development. Do not use unrestricted production CORS unnecessarily.

Do not hard-code production URLs, secrets, database credentials, or platform-specific assumptions throughout the source code.

---

## 11. Automated tests and manual verification

Write meaningful automated backend tests using the project's chosen testing tools.

At minimum, test:

1. Creating a valid slot.
2. Rejecting invalid input and invalid durations.
3. Rejecting overlapping active slots.
4. Booking an available slot successfully.
5. Preventing a second booking of the same slot.
6. Concurrent booking attempts, ensuring only one visitor succeeds.
7. Booking conflict responses with appropriate status codes.
8. Cancelling a booking and reopening a valid future slot.
9. Cancelling a booked slot while preserving historical records and safely reopening availability when permitted.
10. Rejecting invalid cancellation or slot-edit requests.
11. Correct time-zone conversion and relevant daylight-saving edge cases.
12. Gemini missing-key, timeout, and provider-failure fallback behavior without affecting the saved booking.

Mock the Gemini service in automated tests. The regular test suite must not require paid AI requests or a real Gemini API key.

Use appropriate test fixtures and isolate database-dependent tests so they do not corrupt genuine data.

Also provide and execute a manual end-to-end checklist covering:
- Opening the public booking page.
- Browsing dates and availability.
- Creating a slot in the dashboard.
- Booking a slot as a visitor.
- Confirming that the slot becomes unavailable.
- Attempting a conflicting booking.
- Cancelling a booking and checking reopened availability.
- Cancelling a slot with an existing booking and checking retained history.
- Checking behavior when Gemini succeeds and when it is unavailable.
- Testing the responsive layout and primary keyboard interactions.

Run available automated tests, TypeScript checks, and production builds for both frontend and backend. Fix issues discovered during verification.

**Report actual results.** Clearly distinguish tests that were executed and passed from tests that were not run. Do not claim a manual test, deployment, or successful build without verifying it.

---

## 12. Deployment requirements

Aim to deliver a genuinely working deployed application.

### Neon PostgreSQL
- Document how to create the database and configure connection strings.
- Apply Prisma migrations to the target database using the appropriate deployment procedure.
- Avoid using development-only schema-push commands as a substitute for committed migrations.

### Render backend
- Configure the NestJS service to build and start correctly.
- Respect the platform-provided port.
- Add an appropriate health-check endpoint.
- Configure database access, the frontend origin/CORS, and the optional Gemini key.
- Document the migration and initial seed process.

### Vercel frontend
- Configure the Vite build and deployment root correctly for the monorepo.
- Set the deployed API base URL through the appropriate environment variable.
- Confirm that the deployed frontend communicates with the deployed backend.

Include a deployment section in the README with ordered steps and required settings. Include sample values only where safe and clearly identify values that the developer must supply.

Attempt live deployment if authenticated access, repository permissions, and necessary credentials are available. If access is unavailable, do not pretend deployment succeeded: complete the repository and deployment configuration and provide exact manual steps for the outstanding work.

---

## 13. README and handoff

Write a complete, developer-friendly README covering:

1. Product overview and key features.
2. Technology stack and architecture.
3. Repository structure.
4. Prerequisites.
5. Local installation and startup commands.
6. Environment variables and `.env.example` files.
7. Neon database configuration.
8. Prisma migrations and schema workflow.
9. Demo-data seeding and safe cleanup.
10. Automated tests and manual verification.
11. Production build and type-check commands.
12. Deployment steps for Vercel, Render, and Neon.
13. Gemini configuration, timeout handling, and fallback behavior.
14. Known limitations and design trade-offs.
15. AI coding tools used during development, documented honestly.
16. Future improvements.

Explain that the host dashboard has no authentication and is intended only for the demonstration. Mention that production use would require access control and further security hardening.

The README must reflect the implementation that actually exists, not an aspirational feature list. Include a concise list of unfinished work or deployment blockers if necessary.

Prepare the repository so it can be pushed to GitHub. Include appropriate `.gitignore` rules, the lockfile, migrations, and all required project files. Never commit secrets, local environment files containing credentials, or generated build artifacts unnecessarily.

---

## 14. Scope and engineering priorities

Work in this order:

**Priority 1 — Functional foundation**
- Establish the monorepo and environment setup.
- Implement the Prisma schema and migrations.
- Implement slot creation, availability, booking, and transactional conflict prevention.
- Implement cancellation and historical record preservation.

**Priority 2 — Complete product experience**
- Build the public booking page and host dashboard.
- Implement forms, calendar/list browsing, responsive design, validation, and status states.
- Ensure Skopje time-zone handling is consistent.

**Priority 3 — AI and verification**
- Add backend-only Gemini integration and the non-blocking fallback experience.
- Implement and run automated tests.
- Run type checks and production builds.
- Perform and document the manual end-to-end checklist.

**Priority 4 — Handoff and deployment**
- Create the README and environment examples.
- Add repeatable seed and safe cleanup commands.
- Configure and attempt deployment.
- Report the final state, including live URLs if deployment succeeds.

If time becomes constrained, reduce optional visual flourishes before compromising core booking correctness, concurrency handling, cancellation history, or basic responsive usability.

Do not add authentication, email delivery, Google Calendar synchronization, payment processing, or a dedicated rescheduling workflow.

---

## 15. Definition of done

The project is complete when the following are satisfied, or when any remaining blockers are clearly documented:

- A visitor can browse upcoming availability and book a slot.
- A slot cannot be booked successfully by two visitors.
- The host can create and edit eligible slots.
- The host can cancel slots and bookings without losing history.
- Valid future availability can reopen after cancellation without introducing overlaps.
- Dates, times, and daylight-saving behavior are correct for `Europe/Skopje`.
- Gemini can produce a friendly confirmation message without controlling the booking's success.
- A deterministic fallback works when Gemini is unavailable or unconfigured.
- Demo data can be safely seeded and cleaned up.
- The frontend and backend pass their available type checks and production builds.
- Automated tests cover the essential business rules.
- The README and environment examples make local setup reproducible.
- The deployment configuration is present, and live deployment is completed where access permits.
- GitHub publication instructions and a truthful handoff report are provided.

## Final instruction

Start by inspecting the current repository and identifying what already exists. Then implement the application end to end, make sensible decisions about unspecified details, and verify the result.

At completion, provide a concise handoff summary containing:
- What was implemented.
- Local setup and run commands.
- Tests, type checks, and builds actually executed, with their results.
- Any live deployment URLs that were verified.
- GitHub repository status or publication instructions.
- Any unresolved issues or credential-dependent steps.

Be transparent, pragmatic, and focused on delivering a reliable working product.