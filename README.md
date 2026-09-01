# Embeddable Widget & Lead-Capture Platform

A lightweight, multi-tenant backend platform for creating embeddable lead-capture widgets, serving them on external websites, securely processing visitor submissions, enriching leads with geographic information, preventing spam and duplicate submissions, and exposing submission analytics through a tenant-isolated dashboard API.

Built with **Node.js, Express, and SQLite**, the project is designed as a backend-focused capstone demonstrating API design, multi-tenant isolation, validation, fault tolerance, rate limiting, idempotency, CORS, background jobs, and embeddable JavaScript.

---

## Table of Contents

* [Overview](#overview)
* [Key Features](#key-features)
* [Architecture](#architecture)
* [Technology Stack](#technology-stack)
* [Project Structure](#project-structure)
* [Getting Started](#getting-started)
* [Environment Configuration](#environment-configuration)
* [Database](#database)
* [Authentication](#authentication)
* [API Reference](#api-reference)
* [Widget Embedding](#widget-embedding)
* [Submission Flow](#submission-flow)
* [Security & Reliability](#security--reliability)
* [Testing & Verification](#testing--verification)
* [Seed Data](#seed-data)
* [Example Requests](#example-requests)
* [Example Responses](#example-responses)
* [Error Handling](#error-handling)
* [Known Limitations](#known-limitations)
* [Production Considerations](#production-considerations)
* [Development Notes](#development-notes)
* [License](#license)

---

# Overview

The Embeddable Widget & Lead-Capture Platform allows a tenant/customer to:

1. Authenticate using an API key.
2. Create configurable lead-capture widgets.
3. Retrieve and manage existing widgets.
4. Generate an embeddable JavaScript snippet.
5. Place the widget on an external website.
6. Accept visitor submissions without requiring authentication.
7. Validate submitted data against the widget's configured fields.
8. Detect spam using a honeypot field.
9. Apply request rate limiting.
10. Enrich visitor IP addresses with geographic information.
11. Fall back between multiple geo providers when one fails.
12. Store submissions in a tenant-isolated database.
13. Prevent duplicate submissions using idempotency keys.
14. Process non-critical email notifications asynchronously.
15. Retry failed notification jobs.
16. View submission data and aggregate statistics through dashboard endpoints.

The project separates **owner management**, **public widget delivery**, **visitor submission**, and **dashboard** responsibilities.

---

# Key Features

## Multi-Tenant Architecture

Every tenant has its own API key and its own widgets/submissions.

Authenticated widget and dashboard operations are scoped to the authenticated tenant:

```text
Tenant A
   │
   ├── Widgets
   │
   └── Submissions

Tenant B
   │
   ├── Widgets
   │
   └── Submissions
```

A tenant cannot retrieve another tenant's widgets through the authenticated widget management API.

Cross-tenant widget access returns:

```http
404 Not Found
```

rather than exposing whether another tenant owns the requested resource.

---

## Widget Management

Supported widget types:

* `signup_form`
* `contact_form`
* `cta_popover`

Supported field types:

* `text`
* `email`
* `url`
* `number`

Widgets support:

* Custom title
* Description
* Configurable fields
* Required/optional fields
* Custom submit button text
* Display options
* Unique widget IDs
* Automatic embed snippet generation

---

## Embeddable JavaScript

Each widget can be embedded using a single script tag:

```html
<script src="http://localhost:3000/public/widget.v1.js?id=w_acme_1"></script>
```

The browser-side script:

1. Detects its own `<script>` URL.
2. Extracts the widget ID.
3. Retrieves the public widget configuration.
4. Dynamically renders the form.
5. Escapes configuration values before inserting them into HTML.
6. Adds a hidden honeypot field.
7. Generates an idempotency key.
8. Submits visitor data to the API.
9. Displays success or failure feedback.

---

## Spam Protection

The embedded form contains a hidden honeypot field:

```text
_gotcha
```

If a bot populates this field, the backend silently discards the submission without saving it to the database.

The endpoint still returns a successful response to avoid giving automated attackers useful feedback.

---

## Rate Limiting

Submission requests are protected by an in-memory rate limiter.

Current policy:

```text
Maximum: 5 requests
Window:   10 seconds
Key:      Client IP + widget ID
```

When the limit is exceeded:

```http
429 Too Many Requests
```

is returned.

---

## Payload Protection

Express JSON and URL-encoded body parsing are limited to:

```text
100 KB
```

Oversized requests return:

```http
413 Payload Too Large
```

with a JSON error response.

---

## Input Validation

Widget configuration is validated before creation or update.

Validation includes:

* Allowed widget type
* Required title
* Title length
* Description length
* Field count
* Field names
* Duplicate field names
* Field types
* Field labels
* Required flags
* Button text
* Display options

Submission validation checks:

* Widget existence
* Data object format
* Unexpected fields
* Required fields
* String types
* Maximum field length
* Email format
* URL validity

Individual submitted field values are limited to:

```text
1000 characters
```

---

## IP Geolocation

The platform attempts to enrich submissions with:

1. Provider A — `ip-api.com`
2. Provider B — `ipapi.co`
3. No geo data if both providers fail

The fallback sequence is:

```text
Provider A
    │
    ├── Success ──> Store geo information
    │
    └── Failure
          │
          ▼
      Provider B
          │
          ├── Success ──> Store geo information
          │
          └── Failure ──> Continue without geo data
```

Geolocation failure does **not** cause the visitor submission to fail.

---

## Idempotency

The submission endpoint supports an optional:

```text
idempotency_key
```

This prevents duplicate lead creation caused by:

* Double-clicks
* Browser retries
* Network retries
* Repeated API requests

The database enforces uniqueness using:

```sql
UNIQUE(widget_id, idempotency_key)
```

When a duplicate request is detected, the original submission ID is returned.

Example:

```json
{
  "success": true,
  "submission_id": "sub_abc123",
  "geo_enriched": true,
  "deduplicated": true
}
```

---

## Background Jobs

Non-critical notification work is moved outside the main HTTP request/response path.

Submission flow:

```text
Visitor
   │
   ▼
Validate
   │
   ▼
Store submission
   │
   ▼
Queue notification
   │
   ▼
Return HTTP 201
   │
   └───────────────┐
                   ▼
             Background Job
                   │
             ┌─────┴─────┐
             │           │
           Success      Failure
                         │
                      Retry
                         │
                   Up to 3 attempts
```

This ensures that a notification failure does not prevent successful lead persistence.

---

# Architecture

```text
                         ┌──────────────────────┐
                         │     Customer Site    │
                         │   External Website   │
                         └──────────┬───────────┘
                                    │
                         <script src="...">
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │      Public Widget API      │
                    │ /public/widget.v1.js        │
                    │ /public/widgets/:id/config  │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                         Dynamic Form Rendering
                                   │
                                   │ POST submission
                                   ▼
                    ┌─────────────────────────────┐
                    │       Submission API        │
                    │ /api/v1/submissions         │
                    └──────────────┬──────────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                 │
                 ▼                 ▼                 ▼
          Rate Limiting       Validation        Honeypot
                 │                 │                 │
                 └─────────────────┼─────────────────┘
                                   │
                                   ▼
                           Geo Enrichment
                          A → B → No Geo
                                   │
                                   ▼
                              SQLite DB
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
                     ▼                           ▼
              Dashboard API               Background Job
                                             Queue
                                                │
                                                ▼
                                        Notification Service
```

---

# Technology Stack

| Technology      | Purpose                         |
| --------------- | ------------------------------- |
| Node.js         | Backend runtime                 |
| Express         | HTTP API framework              |
| SQLite          | Relational database             |
| better-sqlite3  | SQLite driver                   |
| CORS middleware | Cross-origin submission support |
| dotenv          | Environment configuration       |
| JavaScript      | Backend and embeddable widget   |
| HTML            | Customer-site demonstration     |

### Runtime Requirements

* Node.js 18+
* npm

---

# Project Structure

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

# Getting Started

## 1. Clone or Extract the Project

Navigate to the project directory:

```bash
cd capstone
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Create your local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Available configuration values include:

```env
PORT=3000
DATABASE_PATH=./data/app.db
BASE_URL=http://localhost:3000
GEO_MOCK_STATE=normal
```

Do not commit real secrets or production credentials to version control.

---

## 4. Initialize / Seed the Database

Run:

```bash
npm run seed
```

The seed script creates demo tenants and the default Acme widget.

---

## 5. Start the Server

```bash
npm start
```

The API will be available at:

```text
http://localhost:3000
```

Health check:

```text
GET http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "..."
}
```

---

# Environment Configuration

| Variable         | Default                 | Description                                  |
| ---------------- | ----------------------- | -------------------------------------------- |
| `PORT`           | `3000`                  | HTTP server port                             |
| `DATABASE_PATH`  | `data/app.db`           | SQLite database location                     |
| `BASE_URL`       | `http://localhost:3000` | Base URL used when generating embed snippets |
| `GEO_MOCK_STATE` | `normal`                | Initial geo testing state                    |

For example:

```env
PORT=3000
DATABASE_PATH=./data/app.db
BASE_URL=http://localhost:3000
GEO_MOCK_STATE=normal
```

---

# Database

The application uses SQLite with three primary tables.

## `tenants`

Stores customer/tenant information.

```text
id
name
api_key
created_at
```

---

## `widgets`

Stores widget configurations.

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

Each widget belongs to a tenant.

---

## `submissions`

Stores visitor lead submissions.

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

Database indexes are used for:

* Tenant widget lookup
* Widget submission lookup
* Tenant/date submission lookup
* Idempotency enforcement

---

# Authentication

Owner-facing APIs use API-key authentication.

The API accepts either:

### X-API-Key

```http
X-API-Key: key-tenant-a
```

### Bearer Token

```http
Authorization: Bearer key-tenant-a
```

Authentication is required for:

```text
/api/v1/widgets/*
/api/v1/dashboard/*
```

Public widget delivery and visitor submission endpoints do not require tenant authentication.

---

# API Reference

## Health

### `GET /health`

Checks whether the API is running.

### Response

```json
{
  "status": "ok",
  "timestamp": "2026-09-01T00:00:00.000Z"
}
```

---

# Widget Management API

All widget management endpoints require authentication.

---

## Create Widget

### `POST /api/v1/widgets`

Headers:

```http
X-API-Key: key-tenant-a
Content-Type: application/json
```

Request:

```json
{
  "type": "signup_form",
  "title": "Join Our Newsletter",
  "description": "Get our latest updates.",
  "fields": [
    {
      "name": "email",
      "type": "email",
      "label": "Email Address",
      "required": true
    },
    {
      "name": "name",
      "type": "text",
      "label": "Full Name",
      "required": false
    }
  ],
  "button_text": "Subscribe",
  "display_options": {
    "theme": "dark",
    "primaryColor": "#4f46e5"
  }
}
```

Returns:

```http
201 Created
```

The response includes the generated `embed_snippet`.

---

## List Widgets

### `GET /api/v1/widgets`

Headers:

```http
X-API-Key: key-tenant-a
```

Returns only widgets belonging to the authenticated tenant.

---

## Get Widget

### `GET /api/v1/widgets/:id`

Example:

```text
GET /api/v1/widgets/w_acme_1
```

Returns the requested widget when it belongs to the authenticated tenant.

A widget belonging to another tenant returns:

```http
404 Not Found
```

---

## Update Widget

### `PUT /api/v1/widgets/:id`

Updates an existing tenant-owned widget.

Example:

```json
{
  "title": "Updated Newsletter",
  "button_text": "Sign Me Up"
}
```

Partial updates are supported.

---

## Delete Widget

### `DELETE /api/v1/widgets/:id`

Deletes a tenant-owned widget.

Example response:

```json
{
  "success": true,
  "message": "Widget deleted"
}
```

Associated submissions are removed through the database's cascade relationship.

---

# Public Widget Delivery API

## Get Widget Configuration

### `GET /public/widgets/:id/config`

This endpoint is intentionally public because an external website must be able to load its widget configuration.

Example:

```text
GET /public/widgets/w_acme_1/config
```

Response:

```json
{
  "id": "w_acme_1",
  "type": "signup_form",
  "title": "Subscribe to Acme Weekly",
  "description": "Get news and updates straight to your inbox.",
  "fields": [
    {
      "name": "email",
      "type": "email",
      "label": "Email Address",
      "required": true
    }
  ],
  "button_text": "Join Newsletter",
  "display_options": {
    "theme": "dark",
    "primaryColor": "#4f46e5"
  }
}
```

The response uses public caching:

```http
Cache-Control: public, max-age=60
```

---

# Embed JavaScript

## `GET /public/widget.v1.js`

The embeddable browser script is served as a static asset.

The script is configured for long-term browser caching:

```http
Cache-Control: public, max-age=31536000, immutable
```

The generated widget snippet follows this format:

```html
<script src="http://localhost:3000/public/widget.v1.js?id=w_acme_1"></script>
```

---

# Submission API

## Submit Lead

### `POST /api/v1/submissions`

This endpoint is publicly accessible because visitors submitting forms are not expected to possess tenant API keys.

CORS is enabled.

Example request:

```json
{
  "widget_id": "w_acme_1",
  "data": {
    "email": "visitor@example.com",
    "name": "John Doe"
  },
  "idempotency_key": "unique-request-key"
}
```

Successful response:

```http
201 Created
```

```json
{
  "success": true,
  "submission_id": "sub_a1b2c3d4e5f6",
  "geo_enriched": true
}
```

---

# Submission Processing Pipeline

Every visitor submission passes through the following logical stages:

```text
1. Receive request
        │
        ▼
2. CORS handling
        │
        ▼
3. Rate limiting
        │
        ▼
4. Honeypot detection
        │
        ▼
5. Validate widget ID
        │
        ▼
6. Validate submission fields
        │
        ▼
7. Check idempotency key
        │
        ▼
8. Resolve client IP
        │
        ▼
9. Geo enrichment
        │
        ▼
10. Persist submission
        │
        ▼
11. Queue notification
        │
        ▼
12. Return HTTP 201
```

The design intentionally keeps non-critical operations from blocking the main submission response.

---

# Dashboard API

Dashboard endpoints require tenant authentication.

---

## Dashboard Statistics

### `GET /api/v1/dashboard/stats`

Returns:

* Tenant information
* Total widget count
* Total submission count
* Submission count per widget
* Geographic breakdown
* Recent seven-day submission activity

Example:

```json
{
  "tenant": {
    "id": "tenant-a-id",
    "name": "Acme Corp"
  },
  "total_widgets": 1,
  "total_submissions": 12,
  "per_widget_stats": [],
  "geo_breakdown": [],
  "recent_activity": []
}
```

---

## Submission Log

### `GET /api/v1/dashboard/submissions`

Returns submissions belonging to the authenticated tenant.

Optional widget filter:

```text
GET /api/v1/dashboard/submissions?widget_id=w_acme_1
```

Example response:

```json
[
  {
    "id": "sub_a1b2c3",
    "widget_id": "w_acme_1",
    "tenant_id": "tenant-a-id",
    "data": {
      "email": "visitor@example.com",
      "name": "John Doe"
    },
    "ip_address": "127.0.0.1",
    "country": "United States",
    "city": "Local Dev",
    "geo_provider": "provider_a",
    "created_at": "2026-09-01 00:00:00"
  }
]
```

---

# Widget Embedding

A customer website can embed a widget using the generated script.

Example:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Customer Website</title>
</head>
<body>

  <h1>Welcome</h1>

  <script src="http://localhost:3000/public/widget.v1.js?id=w_acme_1"></script>

</body>
</html>
```

The JavaScript widget automatically:

* Loads configuration
* Creates the form
* Renders configured fields
* Adds the honeypot
* Generates an idempotency key
* Sends submissions
* Displays feedback

---

# Running the Customer-Site Demo

Start the API:

```bash
npm start
```

Then serve the demo website on another origin.

For example:

```bash
npx serve customer-site -p 5500
```

or:

```bash
python -m http.server 5500 --directory customer-site
```

Open:

```text
http://localhost:5500/test-embed.html
```

This demonstrates the cross-origin embedding flow:

```text
localhost:5500
      │
      │ loads widget
      ▼
localhost:3000
      │
      ├── widget configuration
      │
      └── visitor submission
```

---

# Security & Reliability

## Tenant Isolation

Authenticated database queries consistently scope resources using:

```text
tenant_id
```

This prevents tenants from accessing each other's widgets and submissions through the management APIs.

---

## API-Key Authentication

Owner endpoints require an API key supplied through:

```http
X-API-Key
```

or:

```http
Authorization: Bearer <API_KEY>
```

Invalid or missing credentials receive:

```http
401 Unauthorized
```

---

## Input Validation

Both widget configuration and visitor submissions are validated before persistence.

This prevents:

* Unsupported field types
* Invalid emails
* Invalid URLs
* Unexpected submission fields
* Excessively long values
* Invalid widget configurations

---

## Payload Size Limit

Requests larger than 100 KB are rejected.

```http
413 Payload Too Large
```

---

## CORS

Submission requests support cross-origin browser clients.

Allowed methods include:

```text
GET
POST
OPTIONS
```

The API accepts:

```text
Content-Type
X-API-Key
Authorization
```

---

## Honeypot Protection

The `_gotcha` field provides a lightweight bot detection mechanism without requiring CAPTCHA.

---

## Rate Limiting

The submission endpoint limits bursts to:

```text
5 requests / 10 seconds / IP + widget
```

Excessive requests receive:

```http
429 Too Many Requests
```

---

## Idempotency

Database-level uniqueness ensures duplicate idempotency keys do not create duplicate records.

The implementation also handles race conditions where two requests attempt to insert the same key concurrently.

---

## Fault-Tolerant Geolocation

The application does not depend on successful geolocation to store a lead.

If both providers fail:

```text
country = null
city = null
geo_provider = "none"
```

The lead is still persisted.

---

## Side-Effect Isolation

Email/notification failures are intentionally isolated from the submission transaction.

A notification failure does not turn an otherwise successful lead submission into an HTTP error.

---

# Testing & Verification

The project includes an automated acceptance probe suite:

```bash
npm test
```

The test runner creates a temporary SQLite database and executes the server in test mode.

The verification suite covers:

### CORS

Verifies that OPTIONS preflight requests return:

```http
204 No Content
```

with appropriate CORS headers.

### Multi-Tenant Isolation

Verifies that:

* Tenant A can access its widgets.
* Tenant B cannot see Tenant A's widgets.
* Direct cross-tenant widget access returns `404`.

### Valid Submission

Verifies successful lead creation and persistence.

### Payload Validation

Tests:

* Missing required fields
* Oversized payloads

### Rate Limiting

Generates a burst of requests and verifies:

```http
429 Too Many Requests
```

is eventually returned.

### Geo Fallback

Tests:

```text
Provider A available
Provider A unavailable → Provider B
Both unavailable → no geo data
```

The provider failure states are mocked so the behavior is deterministic.

### Side-Effect Failure

Simulates notification failure and verifies that:

```text
Submission still succeeds
```

while the background job retries.

### Honeypot Protection

Verifies that a submission containing a populated `_gotcha` field is not persisted.

### Idempotency

Sends the same idempotency key twice and verifies:

```text
One database row
Same submission ID
Second response marked as deduplicated
```

---

# Running the Full Verification

```bash
npm test
```

Expected final output:

```text
=============================================
  ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!
=============================================
```

---

# Seed Data

The seed script creates two demo tenants.

## Tenant A

```text
Tenant: Acme Corp
Tenant ID: tenant-a-id
API Key: key-tenant-a
Widget: w_acme_1
```

Default widget:

```text
Type: signup_form
Title: Subscribe to Acme Weekly
Button: Join Newsletter
```

Fields:

```text
email → required
name  → optional
```

---

## Tenant B

```text
Tenant: Beta Inc
Tenant ID: tenant-b-id
API Key: key-tenant-b
```

Tenant B is intentionally seeded without Tenant A's widget to make tenant-isolation testing straightforward.

> The seeded API keys are demonstration credentials only and must not be used as production secrets.

---

# Example Requests

## Create a Widget

```bash
curl -X POST http://localhost:3000/api/v1/widgets \
  -H "Content-Type: application/json" \
  -H "X-API-Key: key-tenant-a" \
  -d '{
    "type": "contact_form",
    "title": "Contact Us",
    "description": "Send us a message.",
    "fields": [
      {
        "name": "name",
        "type": "text",
        "label": "Your Name",
        "required": true
      },
      {
        "name": "email",
        "type": "email",
        "label": "Email",
        "required": true
      }
    ],
    "button_text": "Send Message",
    "display_options": {
      "theme": "light"
    }
  }'
```

---

## List Widgets

```bash
curl \
  -H "X-API-Key: key-tenant-a" \
  http://localhost:3000/api/v1/widgets
```

---

## Get Dashboard Statistics

```bash
curl \
  -H "X-API-Key: key-tenant-a" \
  http://localhost:3000/api/v1/dashboard/stats
```

---

## Get Submissions

```bash
curl \
  -H "X-API-Key: key-tenant-a" \
  http://localhost:3000/api/v1/dashboard/submissions
```

---

## Submit a Lead

```bash
curl -X POST http://localhost:3000/api/v1/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "widget_id": "w_acme_1",
    "data": {
      "email": "visitor@example.com",
      "name": "Example Visitor"
    },
    "idempotency_key": "example-request-001"
  }'
```

---

# Example Responses

## Successful Submission

```json
{
  "success": true,
  "submission_id": "sub_123456789abc",
  "geo_enriched": true
}
```

---

## Duplicate Submission

```json
{
  "success": true,
  "submission_id": "sub_123456789abc",
  "geo_enriched": true,
  "deduplicated": true
}
```

---

## Validation Error

```json
{
  "error": "validation error",
  "details": [
    "email is required"
  ]
}
```

---

## Authentication Error

```json
{
  "error": "missing api key"
}
```

or:

```json
{
  "error": "invalid api key"
}
```

---

## Rate Limit Error

```json
{
  "error": "rate limit exceeded, try later"
}
```

---

## Invalid JSON

```json
{
  "error": "invalid json payload"
}
```

---

## Oversized Payload

```json
{
  "error": "payload exceeds 100kb limit"
}
```

---

# Error Handling

The application uses centralized Express error handling.

Common HTTP statuses include:

| Status | Meaning                                                   |
| ------ | --------------------------------------------------------- |
| `200`  | Successful request / idempotent duplicate / honeypot drop |
| `201`  | Submission or widget successfully created                 |
| `204`  | Successful CORS preflight                                 |
| `400`  | Invalid request or validation failure                     |
| `401`  | Missing or invalid authentication                         |
| `404`  | Resource not found                                        |
| `413`  | Request body exceeds 100 KB                               |
| `429`  | Rate limit exceeded                                       |
| `500`  | Unexpected internal server error                          |

Unexpected server errors return a generic response:

```json
{
  "error": "internal server error"
}
```

Detailed errors are logged server-side rather than exposed to clients.

---

# Known Limitations

This implementation intentionally uses lightweight infrastructure appropriate for a local/capstone environment.

## 1. In-Memory Rate Limiter

The rate limiter stores counters in a Node.js `Map`.

Therefore:

* Counters are lost when the process restarts.
* Multiple application instances do not share counters.
* It is not suitable for horizontally scaled production deployment.

A production deployment should use a shared store such as Redis.

---

## 2. In-Memory Background Queue

The job queue uses Node.js memory and timers.

Therefore:

* Jobs disappear if the process crashes.
* Jobs are not shared between server instances.
* There is no persistent job history.

A production system should use a durable queue such as BullMQ backed by Redis or another managed queue system.

---

## 3. SQLite

SQLite is appropriate for this capstone and local deployments.

For high-concurrency, horizontally scaled production workloads, PostgreSQL or another server-grade relational database would be more appropriate.

---

## 4. Console-Based Notifications

The notification service currently logs successful email delivery rather than connecting to a real SMTP provider.

This keeps the project dependency-free and compatible with a zero-cost development environment.

A production deployment should integrate with an actual email provider.

---

## 5. External Geo APIs

Geolocation currently depends on external services:

```text
ip-api.com
ipapi.co
```

These services can have:

* Rate limits
* Availability issues
* Network latency
* Service-specific usage restrictions

The application gracefully falls back when providers fail.

---

## 6. Simple Widget UI

The embedded widget intentionally uses a lightweight dynamically generated form.

The primary focus of this project is the backend platform, API behavior, reliability, and data handling rather than advanced frontend styling.

---

# Production Considerations

Before deploying this system to production, the following improvements are recommended.

### Infrastructure

* Replace SQLite with PostgreSQL where appropriate.
* Replace the in-memory rate limiter with Redis.
* Replace the in-memory job queue with a persistent queue.
* Run multiple application instances behind a load balancer.

### Authentication

* Replace static/demo API keys with securely generated production keys.
* Store hashed API keys where appropriate.
* Add key rotation and revocation.
* Add tenant/user roles if multiple dashboard users are required.

### Security

* Restrict CORS origins instead of allowing `*` where possible.
* Add HTTPS.
* Add security headers.
* Add request logging and audit logging.
* Consider stronger bot protection.
* Validate and normalize proxy-derived client IPs carefully.
* Avoid exposing sensitive operational information.

### Database

* Add migrations.
* Add backups.
* Add database connection monitoring.
* Consider pagination for submission listings.
* Add stronger indexing as data volume grows.

### Background Jobs

Use a persistent queue with:

* Retry policies
* Dead-letter handling
* Job status tracking
* Monitoring
* Worker processes

### Observability

Add:

* Structured logs
* Metrics
* Error tracking
* Request tracing
* Health/readiness checks

---

# Development Notes

## Start the application

```bash
npm start
```

## Seed the database

```bash
npm run seed
```

## Run acceptance probes

```bash
npm test
```

## Main server

```text
src/server.js
```

## Main submission logic

```text
src/controllers/submissionController.js
```

## Widget management

```text
src/controllers/widgetController.js
```

## Dashboard

```text
src/controllers/dashboardController.js
```

## Notification and geo services

```text
src/services/notifications.js
```

## Background job queue

```text
src/services/jobQueue.js
```

## Database schema

```text
src/db/schema.sql
```

## Embedded frontend

```text
public/widget.v1.js
```

## Acceptance tests

```text
test-probes.js
```

---

# Design Principles

The project follows several important backend design principles:

### Separation of Concerns

Routes, controllers, middleware, validation, services, and database logic are separated into dedicated modules.

### Fail Gracefully

Non-critical failures such as:

* Geolocation provider outages
* Notification failures

do not prevent valid leads from being stored.

### Defense in Depth

Multiple protections are applied:

```text
Payload limit
      +
Rate limiting
      +
Honeypot
      +
Input validation
      +
Tenant isolation
      +
Idempotency
      +
Database constraints
```

### Database-Level Integrity

Important constraints are enforced at the database level rather than relying exclusively on application logic.

### Tenant-Aware Data Access

Authenticated resources are consistently scoped to the current tenant.

---

# License

This project is released under the **MIT License**.

See [`LICENSE`](./LICENSE) for the complete license text.

---

## Project Status

**Status:** Capstone implementation / local development

**Core platform capabilities:**

* Multi-tenant widget management
* Embeddable JavaScript widget
* Public widget configuration delivery
* Cross-origin submissions
* Input validation
* Honeypot spam protection
* Rate limiting
* IP geolocation with fallback
* Idempotent submissions
* SQLite persistence
* Background notification jobs
* Retry handling
* Tenant dashboard statistics
* Automated acceptance probes
* Centralized error handling

The current implementation is optimized for demonstrating the required backend behavior in a local/capstone environment. Production deployment would require the infrastructure and security upgrades described in the [Production Considerations](#production-considerations) section.
