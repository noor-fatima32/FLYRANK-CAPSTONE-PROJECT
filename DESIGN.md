# Embeddable Widget & Lead-Capture Platform

A backend-focused, multi-tenant lead-capture platform built with **Node.js, Express, and SQLite**.

The platform allows authenticated tenants to create and manage embeddable widgets, generate a single-line JavaScript embed snippet, serve widget configuration to customer websites, collect lead submissions, validate and protect incoming traffic, enrich submissions with geolocation, and process notification side effects asynchronously.

The implementation focuses on the capstone requirements for **widget management, embeddable delivery, lead capture, tenant isolation, validation, rate limiting, CORS, honeypot protection, geolocation fallback, background jobs, retries, idempotency, and automated acceptance testing**.

---

## 1. What This Project Does

The platform has three primary flows.

### 1. Widget Owner Flow

Authenticated tenants use an API key to manage their widgets:

```text
Tenant
  │
  │ X-API-Key / Bearer API key
  ▼
Express API
  │
  ▼
Widget Controller
  │
  ▼
SQLite
```

Each widget belongs to exactly one tenant.

Supported widget types are:

* `signup_form`
* `contact_form`
* `cta_popover`

Widget configurations can contain up to 20 fields using supported field types such as:

* `text`
* `email`
* `url`
* `number`

---

### 2. Embeddable Widget Flow

Each widget generates a single-line embed snippet such as:

```html
<script src="http://localhost:3000/public/widget.v1.js?id=w_acme_1"></script>
```

The versioned JavaScript bundle loads the widget configuration and renders the form dynamically.

The widget configuration is requested from:

```text
GET /public/widgets/:id/config
```

The bundle is served from:

```text
GET /public/widget.v1.js
```

The JavaScript bundle is configured for long-lived caching, while widget configuration uses a shorter cache lifetime because configuration can change.

---

### 3. Visitor Submission Flow

A visitor submits the embedded form through:

```text
POST /api/v1/submissions
```

The request passes through:

```text
CORS
  ↓
Rate Limiting
  ↓
Honeypot Detection
  ↓
Widget Validation
  ↓
Submission Validation
  ↓
Idempotency Check
  ↓
Geo Enrichment
  ↓
SQLite Persistence
  ↓
Background Notification Job
  ↓
HTTP 201 Response
```

Notification delivery is intentionally moved outside the HTTP request/response path.

---

# 2. Architecture

```text
                         Customer Website
                               │
                               │ widget.v1.js
                               ▼
                    ┌─────────────────────┐
                    │ Public Widget Bundle│
                    └──────────┬──────────┘
                               │
                               ▼
                 GET /public/widgets/:id/config
                               │
                               ▼
                       ┌──────────────┐
                       │  Express API │
                       └──────┬───────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
           CORS          Rate Limiter     Validation
             │                │                │
             └────────────────┼────────────────┘
                              │
                              ▼
                       Submission Controller
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                    ▼         ▼         ▼
               Honeypot  Idempotency   Geo
                                      A → B
                              │
                              ▼
                           SQLite
                              │
                              ▼
                         Job Queue
                              │
                              ▼
                        Notifications
```

The project uses a layered Express structure:

```text
routes/
    Defines HTTP routes.

controllers/
    Handles HTTP requests and responses.

middleware/
    Provides authentication, CORS, rate limiting,
    and centralized error handling.

validation/
    Validates widget configuration and submissions.

services/
    Contains the background job queue and
    notification/geolocation logic.

db/
    Initializes SQLite and defines the database schema.
```

---

# 3. Project Structure

```text
capstone/
│
├── public/
│   └── widget.v1.js
│
├── customer-site/
│   └── test-embed.html
│
├── data/
│   └── app.db
│
├── src/
│   ├── config.js
│   ├── server.js
│   │
│   ├── controllers/
│   │   ├── dashboardController.js
│   │   ├── deliveryController.js
│   │   ├── submissionController.js
│   │   └── widgetController.js
│   │
│   ├── db/
│   │   ├── index.js
│   │   ├── schema.sql
│   │   └── seed.js
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── cors.js
│   │   ├── errorHandler.js
│   │   └── rateLimiter.js
│   │
│   ├── routes/
│   │   ├── dashboardRoutes.js
│   │   ├── deliveryRoutes.js
│   │   ├── submissionRoutes.js
│   │   ├── testRoutes.js
│   │   └── widgetRoutes.js
│   │
│   ├── services/
│   │   ├── jobQueue.js
│   │   └── notifications.js
│   │
│   └── validation/
│       ├── submissionValidation.js
│       └── widgetValidation.js
│
├── .env.example
├── capstone.yaml
├── package.json
├── package-lock.json
├── test-probes.js
├── BUILDLOG.md
├── EVIDENCE.md
└── README.md
```

---

# 4. Database Design

SQLite is used through `better-sqlite3`.

## Tenants

Stores customer/tenant accounts.

Important fields:

```text
id
name
api_key
created_at
```

The seed script creates:

```text
Tenant A
ID: tenant-a-id
Name: Acme Corp
API Key: key-tenant-a

Tenant B
ID: tenant-b-id
Name: Beta Inc
API Key: key-tenant-b
```

---

## Widgets

Stores widget configurations.

Important fields:

```text
id
tenant_id
type
title
description
fields_json
button_text
display_options_json
created_at
updated_at
```

Every widget belongs to a tenant through `tenant_id`.

---

## Submissions

Stores visitor lead submissions.

Important fields:

```text
id
widget_id
tenant_id
data_json
ip_address
country
city
geo_provider
idempotency_key
created_at
```

The database enforces:

```text
FOREIGN KEY (widget_id)
FOREIGN KEY (tenant_id)
UNIQUE(widget_id, idempotency_key)
```

`geo_enriched` is not stored as a database column. The API derives that response field from whether `geo_provider` is `none`.

---

# 5. Authentication & Multi-Tenant Isolation

Management endpoints require a valid tenant API key.

Two authentication formats are accepted.

### X-API-Key

```text
X-API-Key: key-tenant-a
```

### Bearer Token

```text
Authorization: Bearer key-tenant-a
```

The authentication middleware looks up the API key in the `tenants` table and attaches the authenticated tenant to the request.

All tenant-owned widget and dashboard queries are scoped using:

```text
tenant_id = authenticated tenant
```

This prevents one tenant from accessing another tenant's resources.

Cross-tenant widget access intentionally returns:

```text
404 Not Found
```

rather than exposing whether the requested widget belongs to another tenant.

---

# 6. Widget Management API

All widget-management endpoints require authentication.

| Method | Endpoint              | Purpose             |
| ------ | --------------------- | ------------------- |
| POST   | `/api/v1/widgets`     | Create widget       |
| GET    | `/api/v1/widgets`     | List tenant widgets |
| GET    | `/api/v1/widgets/:id` | Retrieve widget     |
| PUT    | `/api/v1/widgets/:id` | Update widget       |
| DELETE | `/api/v1/widgets/:id` | Delete widget       |

Widget configuration is validated before insertion or update.

Validation includes:

* allowed widget types
* required title
* title length
* allowed field types
* valid field names
* duplicate field detection
* field labels
* required flags
* button text length
* display options object validation

---

# 7. Public Widget Delivery

## JavaScript Bundle

```text
GET /public/widget.v1.js
```

The bundle is served with:

```text
Cache-Control: public, max-age=31536000, immutable
```

The bundle reads its widget ID from the script URL.

Example:

```html
<script src="http://localhost:3000/public/widget.v1.js?id=w_acme_1"></script>
```

---

## Widget Configuration

```text
GET /public/widgets/:id/config
```

The configuration endpoint returns the public configuration needed by the widget:

```text
id
type
title
description
fields
button_text
display_options
```

It uses:

```text
Cache-Control: public, max-age=60
Access-Control-Allow-Origin: *
```

The shorter cache period allows configuration changes to become visible without requiring a new JavaScript bundle.

---

# 8. Public Submission API

```text
POST /api/v1/submissions
```

Example request:

```json
{
  "widget_id": "w_acme_1",
  "data": {
    "email": "visitor@example.com",
    "name": "Valid User"
  }
}
```

Successful submissions return:

```text
201 Created
```

with a response similar to:

```json
{
  "success": true,
  "submission_id": "sub_example",
  "geo_enriched": true
}
```

---

# 9. Validation & Payload Protection

The API uses Express JSON and URL-encoded body parsing with a:

```text
100 KB
```

request limit.

Oversized JSON requests return:

```text
413 Payload Too Large
```

with a JSON response instead of Express's default HTML error page.

Example:

```json
{
  "error": "payload exceeds 100kb limit"
}
```

Submission validation checks:

* widget existence
* required fields
* unexpected fields
* field value types
* maximum field length
* email format
* URL format
* widget field configuration

Invalid requests return controlled `400` responses.

---

# 10. Rate Limiting

Public submission traffic uses an in-memory IP/widget rate limiter.

Current configuration:

```text
Window: 10 seconds
Maximum: 5 requests
```

Requests exceeding the configured threshold return:

```text
429 Too Many Requests
```

Example:

```json
{
  "error": "rate limit exceeded, try later"
}
```

The implementation uses an in-memory `Map`, so a distributed deployment would require a shared store such as Redis.

---

# 11. Honeypot Anti-Spam

The embedded form contains a hidden:

```text
_gotcha
```

field.

Normal users do not interact with the field.

If a bot fills it, the API silently drops the submission and returns:

```text
200 OK
```

Example:

```json
{
  "success": true,
  "message": "Submission processed"
}
```

The submission is not stored in SQLite.

This prevents simple automated form bots from receiving an explicit rejection signal.

---

# 12. Geolocation Fallback

Submissions attempt IP-based geolocation using two providers.

The fallback chain is:

```text
Provider A
    │
    ├── success ───────────────► use result
    │
    └── failure
            │
            ▼
        Provider B
            │
            ├── success ───────► use result
            │
            └── failure
                    │
                    ▼
              Continue without geo
```

Provider A uses `ip-api.com`.

Provider B uses `ipapi.co`.

Geolocation is an optional enrichment step. A failure of both providers does not prevent the lead from being stored.

The automated tests use deterministic mock states to simulate:

```text
Provider A unavailable
Both providers unavailable
```

This makes failure behavior reproducible during acceptance testing.

---

# 13. Background Notification Jobs

Notification delivery is intentionally separated from the HTTP response path.

After a successful submission is persisted:

```text
Submission
    ↓
Job Queue
    ↓
Notification
```

The queue is an **in-process, in-memory queue** implemented in:

```text
src/services/jobQueue.js
```

Jobs execute asynchronously using `setImmediate()`.

If a notification fails, the job retries up to three times.

Current default:

```text
Maximum attempts: 3
Retry delay: 100ms
```

After all attempts fail, the queue logs a visible failure message.

Importantly, notification failure does not cause the already-persisted submission request to fail.

The current notification implementation logs successful delivery to the console rather than sending through a production SMTP provider.

---

# 14. Idempotency

The public submission endpoint supports an optional:

```text
idempotency_key
```

Example:

```json
{
  "widget_id": "w_acme_1",
  "data": {
    "email": "visitor@example.com"
  },
  "idempotency_key": "unique-request-key"
}
```

The database enforces uniqueness using the widget and idempotency key.

If the same key is submitted again for the same widget:

```text
First request:
201 Created

Second request:
200 OK
```

The second request returns the original `submission_id` and does not create another database row or notification job.

The embedded widget automatically generates an idempotency key when it renders.

This protects against duplicate submissions caused by:

* double-clicks
* browser retries
* network retries
* repeated client requests

---

# 15. Dashboard API

Authenticated tenants can access dashboard endpoints.

### Statistics

```text
GET /api/v1/dashboard/stats
```

The response includes:

* tenant information
* total widgets
* total submissions
* submissions per widget
* geographic breakdown
* recent submission activity

### Submission List

```text
GET /api/v1/dashboard/submissions
```

The endpoint returns submissions belonging only to the authenticated tenant.

It also supports filtering by:

```text
?widget_id=<widget-id>
```

---

# 16. CORS

The public submission route supports cross-origin requests.

The configured response headers include:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization
```

An OPTIONS preflight request returns:

```text
204 No Content
```

This allows the public widget to submit from a different website origin.

---

# 17. Customer-Site Demonstration

The repository includes:

```text
customer-site/test-embed.html
```

The page represents a separate customer website origin.

For example:

```text
Customer site:
http://localhost:5500

Backend:
http://localhost:3000
```

The customer page embeds:

```html
<script src="http://localhost:3000/public/widget.v1.js?id=w_acme_1"></script>
```

This demonstrates the intended cross-origin embed architecture.

---

# 18. Local Setup

## Requirements

* Node.js 18+
* npm

## Install dependencies

```bash
npm install
```

## Configure environment

### macOS/Linux

```bash
cp .env.example .env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

The default configuration uses:

```text
PORT=3000
DATABASE_PATH=./data/app.db
BASE_URL=http://localhost:3000
```

---

# 19. Seed the Database

Run:

```bash
npm run seed
```

The seed script creates:

```text
Tenant A
tenant-a-id
key-tenant-a

Tenant B
tenant-b-id
key-tenant-b
```

and the default Acme widget:

```text
w_acme_1
```

---

# 20. Start the API

Run:

```bash
npm start
```

The API starts on:

```text
http://localhost:3000
```

Health check:

```text
GET /health
```

Expected response:

```json
{
  "status": "ok"
}
```

---

# 21. Run the Automated Acceptance Tests

Run:

```bash
npm test
```

The test suite creates an isolated temporary SQLite database and verifies:

1. CORS preflight
2. Multi-tenant isolation
3. Valid submission
4. Dashboard persistence
5. Required-field validation
6. Oversized payload handling
7. Rate limiting
8. Geo Provider A → Provider B fallback
9. Submission success when both geo providers fail
10. Notification side-effect failure isolation
11. Background job retries
12. Honeypot spam protection
13. Idempotency and duplicate prevention

The latest verification run completed with:

```text
=============================================
  ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!
=============================================
```

---

# 22. Manual Widget CRUD Verification

Widget management was also manually verified using a valid tenant API key.

| Operation               | Endpoint                     | Result             |
| ----------------------- | ---------------------------- | ------------------ |
| Create                  | `POST /api/v1/widgets`       | `201 Created`      |
| List                    | `GET /api/v1/widgets`        | `200 OK`           |
| Retrieve                | `GET /api/v1/widgets/:id`    | `200 OK`           |
| Update                  | `PUT /api/v1/widgets/:id`    | `200 OK`           |
| Delete                  | `DELETE /api/v1/widgets/:id` | `200 OK`           |
| Retrieve deleted widget | `GET /api/v1/widgets/:id`    | `404 Not Found`    |
| Unauthenticated create  | `POST /api/v1/widgets`       | `401 Unauthorized` |

The manually tested widget was:

```text
w_c8b7f0644f20
```

The update verification changed:

```text
Title:
Test Contact Widget
→
Updated Contact Widget

Button:
Send Message
→
Submit Form
```

The widget was then deleted successfully and a subsequent retrieval returned:

```text
404 Not Found
```

---

# 23. Latest Automated Verification

The latest `npm test` execution verified:

```text
CORS preflight:
204

Tenant A widgets count:
1

Tenant B widgets count:
0

Tenant B direct access to Tenant A widget:
404

Probe 1:
201

Probe 2 missing required field:
400

Probe 2 oversized payload:
413

Probe 3 rate limiting:
429

Probe 4 Provider A failure:
submission succeeded with geo enrichment

Probe 4 both providers unavailable:
submission succeeded without geo enrichment

Probe 5 notification failure:
submission returned 201
background job retried three times

Probe 6 honeypot:
200
database row count unchanged

Probe 7 first idempotency request:
201

Probe 7 duplicate idempotency request:
200
same submission_id
database row count:
1
```

Final result:

```text
ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!
```

Detailed verification evidence is available in:

```text
EVIDENCE.md
```

---

# 24. Design & Engineering Documentation

The repository includes:

### `DESIGN.md`

Documents:

* system architecture
* request flows
* data model
* security decisions
* reliability patterns
* caching strategy
* background processing
* testing strategy

### `BUILDLOG.md`

Documents:

* architectural decisions
* AI-assisted development
* implementation corrections
* requirement gap closures
* testing and verification history

### `EVIDENCE.md`

Contains empirical verification results for the acceptance requirements and automated probes.

---

# 25. Honest Limitations

This implementation intentionally uses lightweight local infrastructure appropriate for the capstone.

### In-Memory Rate Limiter

The rate limiter uses an in-memory `Map`.

A distributed deployment would require a shared rate-limit store such as Redis.

### In-Memory Job Queue

The notification queue is implemented in-process.

Jobs are not persisted to SQLite and would be lost if the process terminates before completion.

A production deployment could use a persistent queue such as BullMQ/Redis or another managed job system.

### SQLite

SQLite provides simple local persistence and keeps the project easy to run.

A larger distributed production system would typically use PostgreSQL or another server-based relational database.

### Geolocation Providers

The project uses external IP geolocation services and deterministic mock states for acceptance testing.

Production deployments should account for provider quotas, availability, privacy requirements, and operational monitoring.

### Email Notifications

The current notification service logs notification delivery rather than sending real production email.

### Widget UI

The embedded widget intentionally uses a minimal JavaScript-rendered form because this capstone focuses primarily on backend API behavior, reliability, security, and testability.

---

# 26. Summary

This project implements a complete embeddable lead-capture backend with:

* Multi-tenant widget management
* Authenticated widget CRUD
* Tenant isolation
* Configurable form fields
* JavaScript embed delivery
* Public widget configuration
* Cross-origin submission support
* CORS preflight handling
* Input validation
* 100 KB payload protection
* Rate limiting
* Honeypot anti-spam protection
* IP geolocation enrichment
* Provider fallback
* Graceful degradation when geo providers fail
* SQLite persistence
* Asynchronous notification jobs
* Three-attempt background retries
* Idempotent submission handling
* Owner dashboard APIs
* Automated acceptance probes

The latest automated verification completed successfully with:

```text
ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!
```
