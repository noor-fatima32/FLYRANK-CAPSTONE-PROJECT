# Verification Evidence: Embeddable Widget & Lead-Capture Platform

This document contains empirical evidence for the implemented functionality and acceptance requirements of the Embeddable Widget & Lead-Capture Platform.

All results below are based on the latest local verification runs against the running API.

---

## 1. Widget CRUD

### Requirement

Authenticated users must be able to create, list, retrieve, update, and delete widgets. Widget management endpoints must require authentication.

### Verification

Widget management was manually verified using a valid tenant API key:

| Operation               | Endpoint                     | Expected Result    | Observed Result | Result |
| ----------------------- | ---------------------------- | ------------------ | --------------- | ------ |
| Create                  | `POST /api/v1/widgets`       | `201 Created`      | `201`           | PASS   |
| List                    | `GET /api/v1/widgets`        | `200 OK`           | `200`           | PASS   |
| Retrieve                | `GET /api/v1/widgets/:id`    | `200 OK`           | `200`           | PASS   |
| Update                  | `PUT /api/v1/widgets/:id`    | `200 OK`           | `200`           | PASS   |
| Delete                  | `DELETE /api/v1/widgets/:id` | `200 OK`           | `200`           | PASS   |
| Retrieve deleted widget | `GET /api/v1/widgets/:id`    | `404 Not Found`    | `404`           | PASS   |
| Unauthenticated create  | `POST /api/v1/widgets`       | `401 Unauthorized` | `401`           | PASS   |

### Create

A widget was successfully created using tenant A's API key.

```text
STATUS: 201
```

Returned widget ID:

```text
w_c8b7f0644f20
```

The API returned a complete widget configuration including the tenant ID, widget type, fields, button text, and generated embed snippet.

### List

```text
STATUS: 200
```

The authenticated tenant's widgets were returned, including:

```text
w_c8b7f0644f20
```

### Retrieve

The specific widget was successfully retrieved:

```text
STATUS: 200
```

The response contained:

```json
{
  "id": "w_c8b7f0644f20",
  "tenant_id": "tenant-a-id",
  "type": "contact_form",
  "title": "Test Contact Widget"
}
```

### Update

The widget was updated successfully:

```text
STATUS: 200
```

The response confirmed the updated values:

```text
title: "Updated Contact Widget"
button_text: "Submit Form"
```

The `updated_at` timestamp also changed, confirming that the modification was persisted.

### Delete

The widget was deleted successfully:

```text
STATUS: 200
```

Response:

```json
{
  "success": true,
  "message": "Widget deleted"
}
```

### Retrieve Deleted Widget

A subsequent retrieval of the deleted widget returned:

```text
STATUS: 404
```

Response:

```json
{
  "error": "Widget not found"
}
```

This confirms that the widget was actually removed.

### Unauthenticated Create

A widget creation request without an API key was rejected:

```text
STATUS: 401
```

Response:

```json
{
  "error": "missing api key"
}
```

### Result

**PASS**

---

## 2. Probe 1 — Valid Submission Stored & Visible in Dashboard

### Requirement

A valid submission from the public/second-origin submission path must be accepted, stored, return a successful 2xx response, and be visible through the owner dashboard API.

### Execution Proof

Latest automated acceptance run:

```text
--- Running Probe 1: Valid Submission ---

[JobQueue] Processing job job_1 (attempt 1/3)
[EmailService] Notification sent for submission sub_afa32d94f53f to tenant tenant-a-id
[JobQueue] Job job_1 completed successfully.

Probe 1 Status: 201 {
  success: true,
  submission_id: 'sub_afa32d94f53f',
  geo_enriched: true
}

Dashboard verified submission stored. Total: 1
```

### Verification

* HTTP status: `201 Created`
* Submission was assigned an ID.
* Geo enrichment succeeded.
* Submission was persisted.
* Dashboard verification confirmed the stored submission.

### Result

**PASS**

---

## 3. Probe 2 — Payload Validation & Oversized Payload Handling

### Requirement

Malformed submissions must be rejected with clean 4xx JSON responses rather than internal server errors. Payloads exceeding 100 KB must also be rejected.

### Missing Required Field

```text
Probe 2 Missing Required Field Status: 400
{
  error: 'validation error',
  details: [ 'email is required' ]
}
```

### Oversized Payload

```text
Probe 2 Oversized Status: 413
{
  error: 'payload exceeds 100kb limit'
}
```

### Verification

* Missing required field → `400 Bad Request`
* Payload greater than 100 KB → `413 Payload Too Large`
* Both responses are structured JSON errors.
* No `500 Internal Server Error` occurred.

### Result

**PASS**

---

## 4. Probe 3 — Rate Limiting & Burst Protection

### Requirement

Rapid submission bursts must trigger rate limiting with HTTP `429`, while legitimate requests remain supported.

### Execution Log

```text
[JobQueue] Processing job job_2 (attempt 1/3)
[EmailService] Notification sent for submission sub_954dd1f6ae2b to tenant tenant-a-id
[JobQueue] Job job_2 completed successfully.

[JobQueue] Processing job job_3 (attempt 1/3)
[EmailService] Notification sent for submission sub_edf0b9b23d9f to tenant tenant-a-id
[JobQueue] Job job_3 completed successfully.

[JobQueue] Processing job job_4 (attempt 1/3)
[EmailService] Notification sent for submission sub_dd6ad8d25d3d to tenant tenant-a-id
[JobQueue] Job job_4 completed successfully.

Hit 429 rate limit on request #4
```

### Verification

The burst exceeded the configured request threshold and produced:

```text
429 Too Many Requests
```

### Result

**PASS**

---

## 5. Probe 4 — Geo-Enrichment Fallback Chain

### Requirement

If geo provider A fails, provider B must be attempted. If both providers fail, the submission must still succeed without geo data.

### Provider A Down

```text
[GeoService] Provider A failed (Provider A is down (mocked)), trying Provider B...

Provider A down response: {
  success: true,
  submission_id: 'sub_f8f4074e1d0a',
  geo_enriched: true
}
```

This demonstrates successful fallback from provider A to provider B.

### Both Providers Down

```text
[GeoService] Provider A failed (Provider A is down (mocked)), trying Provider B...
[GeoService] Provider B failed (Provider B is down (mocked)), proceeding without geo data.

Both providers down response (still succeeded): {
  success: true,
  submission_id: 'sub_67c3a48217b3',
  geo_enriched: false
}
```

### Verification

* Provider A failure → Provider B attempted.
* Provider B successfully enriched the submission when available.
* Both providers unavailable → submission still succeeded.
* No geo data was attached when both providers were unavailable.

### Result

**PASS**

---

## 6. Probe 5 — Background Job & Isolated Side-Effect Failure

### Requirement

Email/webhook notification must be handled asynchronously. A notification failure must not cause the submission request to fail. The background job must retry up to three times and report failure after retries are exhausted.

### Execution Log

```text
[JobQueue] Processing job job_7 (attempt 1/3)

[JobQueue] Job job_7 failed attempt 1/3:
SMTP Connection Failed (Simulated Side Effect Failure).
Retrying in 100ms...

Submission status when email throws exception: 201 {
  success: true,
  submission_id: 'sub_0a0f51d160bc',
  geo_enriched: true
}

[JobQueue] Processing job job_7 (attempt 2/3)

[JobQueue] Job job_7 failed attempt 2/3:
SMTP Connection Failed (Simulated Side Effect Failure).
Retrying in 100ms...

[JobQueue] Processing job job_7 (attempt 3/3)

[JobQueue] Job job_7 failed after 3 attempts:
SMTP Connection Failed (Simulated Side Effect Failure)
```

### Verification

* HTTP submission returned `201`.
* Submission was accepted despite the simulated email failure.
* Background job retried.
* Three attempts were made.
* Final failure was logged after retries were exhausted.

### Result

**PASS**

---

## 7. Probe 6 — Honeypot Anti-Spam Detection

### Requirement

A submission containing the honeypot field must be silently dropped or rejected without creating a database record.

### Execution Log

```text
[Honeypot] Spam bot caught on widget w_acme_1. Dropping submission silently.

Probe 6 Response Status: 200 {
  success: true,
  message: 'Submission processed'
}

Submissions in DB before: 7, after: 7
```

### Verification

The response intentionally appears successful to the client, while the database count remains unchanged:

```text
Before: 7
After:  7
```

Therefore, no submission record was created.

### Result

**PASS**

---

## 8. Probe 7 — Idempotency & Deduplication

### Requirement

Submitting the same request with the same `idempotency_key` must not create duplicate database records. The second request must return the original submission ID.

### Execution Log

```text
First idempotency call status: 201 {
  success: true,
  submission_id: 'sub_d52b0a8dd081',
  geo_enriched: true
}

[Idempotency] Duplicate submission detected for key 'idemp_test_1788226609983'.
Returning original submission sub_d52b0a8dd081.

Second idempotency call (duplicate) status: 200 {
  success: true,
  submission_id: 'sub_d52b0a8dd081',
  geo_enriched: true,
  deduplicated: true
}

DB row count for idempotency_key 'idemp_test_1788226609983': 1
```

### Verification

* First request → `201`
* Second identical request → `200`
* Both requests returned the same submission ID.
* Database contains exactly one row for the idempotency key.

### Result

**PASS**

---

## 9. CORS Preflight

### Requirement

An `OPTIONS` preflight request to the public submission endpoint must succeed and expose the required CORS headers.

### Execution Proof

```text
--- Checking CORS Preflight ---

CORS preflight: 204 {
  'x-powered-by': 'Express',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-API-Key, Authorization',
  date: 'Tue, 01 Sep 2026 01:36:49 GMT',
  connection: 'keep-alive',
  'keep-alive': 'timeout=5'
}
```

### Verification

* HTTP status: `204`
* `Access-Control-Allow-Origin: *` present.
* `Access-Control-Allow-Methods` includes `POST` and `OPTIONS`.
* `Access-Control-Allow-Headers` includes `Content-Type`.
* `X-API-Key` and `Authorization` are also permitted.

### Result

**PASS**

---

## 10. Multi-Tenant Isolation

### Requirement

Each tenant must only be able to access its own widgets and submissions. A tenant must not be able to directly access another tenant's resources.

### Execution Log

```text
--- Checking Multi-Tenant Isolation ---

Tenant A widgets count: 1
Tenant B widgets count: 0
Tenant B direct access to Tenant A widget status: 404
```

### Verification

Tenant A:

```text
GET /api/v1/widgets
→ 200
→ Tenant A widget present
```

Tenant B:

```text
GET /api/v1/widgets
→ 200
→ Tenant A widget absent
```

Direct cross-tenant access:

```text
GET /api/v1/widgets/<tenant-A-widget-id>
→ 404 Not Found
```

### Result

**PASS**

---

## 11. Cache Headers

### Requirement

Public widget/config responses should expose the intended cache-control behavior.

### Verification Status

A cache-header result was **not captured in the latest automated acceptance output**.

Therefore, no cache-header behavior is claimed as empirically verified in this document.

A dedicated request should be recorded if cache-header evidence is required separately.

### Result

**NOT CAPTURED IN LATEST RUN**

---

## 12. Cross-Origin Widget

### Requirement

The embeddable widget must be accessible from a different origin and function through the configured CORS policy.

### Verification Status

The automated test suite verifies the CORS preflight behavior, but the latest output does not contain a complete browser/second-origin widget rendering and submission trace.

Therefore, this document does not claim a complete end-to-end second-origin widget execution based solely on the latest automated output.

### Result

**CORS PRELIGHT VERIFIED; FULL SECOND-ORIGIN EXECUTION TRACE NOT CAPTURED**

---

## 13. Full Automated Acceptance Verification

### Command

```text
npm test
```

### Test Runner

```text
> embeddable-widget-platform@1.0.0 test
> node test-probes.js
```

### Latest Execution

```text
=== STARTING ACCEPTANCE PROBE VERIFICATION ===

Database seeded successfully.

--- Checking CORS Preflight ---
CORS preflight: 204 {
  'x-powered-by': 'Express',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-API-Key, Authorization',
  date: 'Tue, 01 Sep 2026 01:36:49 GMT',
  connection: 'keep-alive',
  'keep-alive': 'timeout=5'
}

--- Checking Multi-Tenant Isolation ---
Tenant A widgets count: 1
Tenant B widgets count: 0
Tenant B direct access to Tenant A widget status: 404

--- Running Probe 1: Valid Submission ---
[JobQueue] Processing job job_1 (attempt 1/3)
[EmailService] Notification sent for submission sub_afa32d94f53f to tenant tenant-a-id
[JobQueue] Job job_1 completed successfully.
Probe 1 Status: 201 {
  success: true,
  submission_id: 'sub_afa32d94f53f',
  geo_enriched: true
}
Dashboard verified submission stored. Total: 1

--- Running Probe 2: Payload Validation ---
Probe 2 Missing Required Field Status: 400 {
  error: 'validation error',
  details: [ 'email is required' ]
}
Probe 2 Oversized Status: 413 {
  error: 'payload exceeds 100kb limit'
}

--- Running Probe 3: Rate Limit Burst Protection ---
[JobQueue] Processing job job_2 (attempt 1/3)
[EmailService] Notification sent for submission sub_954dd1f6ae2b to tenant tenant-a-id
[JobQueue] Job job_2 completed successfully.
[JobQueue] Processing job job_3 (attempt 1/3)
[EmailService] Notification sent for submission sub_edf0b9b23d9f to tenant tenant-a-id
[JobQueue] Job job_3 completed successfully.
[JobQueue] Processing job job_4 (attempt 1/3)
[EmailService] Notification sent for submission sub_dd6ad8d25d3d to tenant tenant-a-id
[JobQueue] Job job_4 completed successfully.
Hit 429 rate limit on request #4

--- Running Probe 4: Geo Fallback Chain ---
[GeoService] Provider A failed (Provider A is down (mocked)), trying Provider B...
[JobQueue] Processing job job_5 (attempt 1/3)
[EmailService] Notification sent for submission sub_f8f4074e1d0a to tenant tenant-a-id
[JobQueue] Job job_5 completed successfully.
Provider A down response: {
  success: true,
  submission_id: 'sub_f8f4074e1d0a',
  geo_enriched: true
}
[GeoService] Provider A failed (Provider A is down (mocked)), trying Provider B...
[GeoService] Provider B failed (Provider B is down (mocked)), proceeding without geo data.
[JobQueue] Processing job job_6 (attempt 1/3)
[EmailService] Notification sent for submission sub_67c3a48217b3 to tenant tenant-a-id
[JobQueue] Job job_6 completed successfully.
Both providers down response (still succeeded): {
  success: true,
  submission_id: 'sub_67c3a48217b3',
  geo_enriched: false
}

--- Running Probe 5: Isolated Side Effect Failure ---
[JobQueue] Processing job job_7 (attempt 1/3)
[JobQueue] Job job_7 failed attempt 1/3: SMTP Connection Failed (Simulated Side Effect Failure). Retrying in 100ms...
Submission status when email throws exception: 201 {
  success: true,
  submission_id: 'sub_0a0f51d160bc',
  geo_enriched: true
}
[JobQueue] Processing job job_7 (attempt 2/3)
[JobQueue] Job job_7 failed attempt 2/3: SMTP Connection Failed (Simulated Side Effect Failure). Retrying in 100ms...
[JobQueue] Processing job job_7 (attempt 3/3)
[JobQueue] Job job_7 failed after 3 attempts: SMTP Connection Failed (Simulated Side Effect Failure)

--- Running Probe 6: Honeypot Anti-Spam Detection ---
[Honeypot] Spam bot caught on widget w_acme_1. Dropping submission silently.
Probe 6 Response Status: 200 {
  success: true,
  message: 'Submission processed'
}
Submissions in DB before: 7, after: 7

--- Running Probe 7: Idempotency Key Deduplication ---
[JobQueue] Processing job job_8 (attempt 1/3)
[EmailService] Notification sent for submission sub_d52b0a8dd081 to tenant tenant-a-id
[JobQueue] Job job_8 completed successfully.
First idempotency call status: 201 {
  success: true,
  submission_id: 'sub_d52b0a8dd081',
  geo_enriched: true
}
[Idempotency] Duplicate submission detected for key 'idemp_test_1788226609983'. Returning original submission sub_d52b0a8dd081.
Second idempotency call (duplicate) status: 200 {
  success: true,
  submission_id: 'sub_d52b0a8dd081',
  geo_enriched: true,
  deduplicated: true
}
DB row count for idempotency_key 'idemp_test_1788226609983': 1

=============================================
  ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!
=============================================
```

### Final Automated Result

```text
ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!
```

**Result: PASS**
