# Engineering Build Log

This document records architectural decisions, AI pair-programming assistance, honest evaluations of AI generation errors, and manual human corrections made during development.

---

## 1. Initial Architecture & Design Phase
- **AI Contribution:** Proposed a 3-tier request path separation (Owner Management, Embed Delivery, Visitor Submission) and outlined SQLite table schemas (`tenants`, `widgets`, `submissions`) with indices.
- **Human Decisions & Adjustments:**
  - Selected SQLite (`better-sqlite3`) for instant zero-dependency local execution without requiring running Docker daemons.
  - Opted for raw SQL queries over heavyweight ORMs (e.g. Prisma or TypeORM) to keep query execution transparent, multi-tenant checks explicit, and performance lightweight.

---

## 2. Widget Management & Multi-Tenant Isolation
- **AI Contribution:** Generated CRUD controllers in `src/controllers/widgetController.js` and auth middleware in `src/middleware/auth.js`.
- **AI Error & Correction 1 (Cross-Tenant Information Leak):**
  - *What AI generated wrong:* The AI's initial implementation returned `403 Forbidden` when a tenant attempted to access or modify a widget ID belonging to another tenant.
  - *Why it was wrong:* Returning HTTP 403 leaks metadata — it explicitly confirms to an attacker that the targeted widget ID exists in the system.
  - *Human Correction:* Updated `src/controllers/widgetController.js` so that cross-tenant resource lookups return `404 Not Found`. This prevents malicious tenants from enumerating valid widget IDs across tenant boundaries.

---

## 3. Embed Delivery & Caching Strategy
- **AI Contribution:** Designed `public/widget.v1.js` for dynamic DOM injection and built `/public/widgets/:id/config` delivery endpoint.
- **Headers Configured:**
  - Static script bundle (`/public/widget.v1.js`): `Cache-Control: public, max-age=31536000, immutable`
  - Public widget config (`/public/widgets/:id/config`): `Cache-Control: public, max-age=60` and `Access-Control-Allow-Origin: *`

---

## 4. Public Submissions, Validation & Abuse Protection
- **AI Contribution:** Implemented payload validation, body size limiting (`express.json({ limit: '100kb' })`), honeypot anti-spam (`_gotcha`), and IP/widget rate limiting (429).
- **AI Error & Correction 2 (API Contract Violation on 413 Payload Limit):**
  - *What AI generated wrong:* The AI attached Express body-parser middleware for the 100KB payload limit without a custom error handler. When testing with payloads >100KB, Express emitted its default HTML error page (`<pre>Payload Too Large</pre>`).
  - *Why it was wrong:* The backend contract mandates consistent JSON responses (`{ "error": "..." }`) across all endpoints and status codes. Returning HTML breaks API clients and frontends.
  - *Human Correction:* Built custom middleware in `src/middleware/errorHandler.js` to catch `type: 'entity.too.large'` errors and explicitly return a clean JSON response: `{ "error": "Payload size exceeds 100KB limit" }` with HTTP 413.

---

## 5. Geo Enrichment Fallback Chain & Isolated Side Effects
- **AI Contribution:** Implemented Provider A (`ip-api.com`) -> Provider B (`ipapi.co`) -> Graceful fallback chain and non-blocking email notifications in `src/services/notifications.js`.
- **AI Error & Correction 3 (Floating Unhandled Promise in Controller):**
  - *What AI generated wrong:* In `src/controllers/submissionController.js`, the AI triggered side effects via `notifications.notify(savedSubmission)` without the `await` keyword.
  - *Why it was wrong:* Even though `notify` caught internal errors, invoking an async function without `await` leaves a floating/unhandled promise. This violates explicit async control flow standards and risks unhandled promise rejection warnings in modern Node runtimes or static code analysis tools.
  - *Human Correction:* Added `await` to `await notifications.notify(savedSubmission)` in `submissionController.js`. This guarantees clean, explicit promise resolution while preserving non-blocking side-effect failure isolation via the service's internal try-catch handler.
- **Testing Ergonomics:**
  - Added test control endpoints (`/api/v1/test/geo-state`, `/api/v1/test/email-fail`, `/api/v1/test/reset-limits`) allowing probe scripts to deterministically test failure conditions.

---

## 6. Verification & Probe Results
- Ran `node test-probes.js` across all 6 probes and multi-tenant scenarios.
- All 6 acceptance probes passed on verification runs.

---

## 7. Shared Requirements Scope Gap Closures

### Gap 1 — Background Job Queue for Notification Side Effect
- **What was missing:** In `submissionController.js`, notifications were invoked directly on the request path. The submission endpoint waited for notification execution before returning the HTTP response, and lacked retries or failure alert logging.
- **Why it mattered:** The capstone brief's shared requirements table mandates at least 1 background job pattern to offload slow/bulk work off the request path with retries and failure alert logging. Synchronous notification calls slow down HTTP responses and lack retry mechanisms.
- **What was added:** Implemented a lightweight in-process job queue in `src/services/jobQueue.js` that accepts async job functions, processes them asynchronously off the request path using `setImmediate`, retries up to 3 times with configurable delay on failure, and logs a formatted failure alert (`[JobQueue] Job <id> failed after 3 attempts...`) when retries exhaust. Updated `submissionController.js` to enqueue notification jobs non-blockingly and return HTTP 201 immediately.

### Gap 2 — Request Idempotency on Submission Endpoint
- **What was missing:** `POST /api/v1/submissions` previously inserted a new submission row for every incoming request, with no mechanism to deduplicate repeated form-fill attempts or network retries.
- **Why it mattered:** The capstone brief mandates idempotency where duplicate operations impact real-world behavior. Rapid double-clicks or browser retries on lead-capture widgets would create duplicate database submissions and send duplicate email notifications.
- **What was added:** Added an optional `idempotency_key` parameter to `POST /api/v1/submissions` and updated SQLite `schema.sql` with an `idempotency_key TEXT` column and `UNIQUE(widget_id, idempotency_key)` constraint. In `submissionController.js`, matching `(widget_id, idempotency_key)` requests return the existing `submission_id` and HTTP 200 without inserting a duplicate row or re-enqueuing notifications. Updated `public/widget.v1.js` to generate a UUID key per widget render.
---

## 8. AI Usage & Cost Tracking
AI tools used: Claude (Anthropic) + Gemini (Google)
- Claude: Free tier used — no per-call cost tracked
- Gemini: Free tier used — no per-call cost tracked
- Budget guard: Both tools used on free tiers only,
  consistent with the $0 stack requirement of this capstone
- Code refactor (naming, comments, file merge) done via Gemini
- All 6 probes re-verified after refactor — passed