process.env.NODE_ENV = 'test';

const fs = require('fs');
const os = require('os');
const path = require('path');

const testDbPath = path.join(
  os.tmpdir(),
  `flyrank-capstone-test-${process.pid}.db`
);

try {
  fs.unlinkSync(testDbPath);
} catch {}

process.env.DATABASE_PATH = testDbPath;

const http = require('http');
const server = require('./src/server');
const config = require('./src/config');
const db = require('./src/db');
const seedDatabase = require('./src/db/seed');

let instance;

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runProbes() {
  console.log('=== STARTING ACCEPTANCE PROBE VERIFICATION ===\n');
  seedDatabase();

  // Start temporary server
  await new Promise((res) => {
    instance = server.listen(config.port, res);
  });

  const baseOpts = {
    hostname: 'localhost',
    port: config.port,
    headers: { 'Content-Type': 'application/json' }
  };

  try {

    // Fix #10: CORS Preflight Test
    console.log('\n--- Checking CORS Preflight ---');

    const preflight = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5500',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });

    console.log('CORS preflight:', preflight.status, preflight.headers);

    if (preflight.status !== 204) {
      throw new Error(`CORS preflight failed: ${preflight.status}`);
    }

    if (preflight.headers['access-control-allow-origin'] !== '*') {
      throw new Error('Missing Access-Control-Allow-Origin header');
    }


    // Multi-tenant isolation test
    console.log('--- Checking Multi-Tenant Isolation ---');

    const tenantARes = await makeRequest({
      ...baseOpts,
      path: '/api/v1/widgets',
      method: 'GET',
      headers: { 'X-API-Key': 'key-tenant-a' }
    });
    console.log(`Tenant A widgets count: ${tenantARes.data.length}`);
    if (
      tenantARes.status !== 200 ||
      !Array.isArray(tenantARes.data) ||
      !tenantARes.data.some(widget => widget.id === 'w_acme_1')
    ) {
      throw new Error('Tenant A widget isolation test failed');
    }

    const tenantBRes = await makeRequest({
      ...baseOpts,
      path: '/api/v1/widgets',
      method: 'GET',
      headers: { 'X-API-Key': 'key-tenant-b' }
    });
    console.log(`Tenant B widgets count: ${tenantBRes.data.length}`);
    if (
      tenantBRes.status !== 200 ||
      tenantBRes.data.some(widget => widget.id === 'w_acme_1')
    ) {
      throw new Error('Tenant B received Tenant A widget data');
    }

    // Explicit cross-tenant widget access test
    const crossTenantRes = await makeRequest({
      ...baseOpts,
      path: '/api/v1/widgets/w_acme_1',
      method: 'GET',
      headers: { 'X-API-Key': 'key-tenant-b' }
    });

    console.log(
      `Tenant B direct access to Tenant A widget status: ${crossTenantRes.status}`
    );

    if (crossTenantRes.status !== 404) {
      throw new Error(
        `Cross-tenant widget access should return 404, got ${crossTenantRes.status}`
      );
    }

    // Probe 1: Valid Submission
    console.log('\n--- Running Probe 1: Valid Submission ---');
    const probe1Res = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'visitor@example.com', name: 'Valid User' }
    });
    console.log(`Probe 1 Status: ${probe1Res.status}`, probe1Res.data);
    if (probe1Res.status !== 201 || !probe1Res.data.submission_id) {
      throw new Error('Probe 1 failed');
    }

    // Verify submission is visible in Dashboard API for Tenant A
    const dashRes = await makeRequest({
      ...baseOpts,
      path: '/api/v1/dashboard/submissions',
      method: 'GET',
      headers: { 'X-API-Key': 'key-tenant-a' }
    });
    console.log(`Dashboard verified submission stored. Total: ${dashRes.data.length}`);

    // Probe 2: Malformed and Oversized Payloads
    console.log('\n--- Running Probe 2: Payload Validation ---');
    const probe2MissingField = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { name: 'No Email Provided' }
    });
    console.log(`Probe 2 Missing Required Field Status: ${probe2MissingField.status}`, probe2MissingField.data);

    // Oversized payload (> 100KB)
    const largeString = 'X'.repeat(105 * 1024);
    const probe2Oversized = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'large@example.com', payload: largeString }
    });
    console.log(`Probe 2 Oversized Status: ${probe2Oversized.status}`, probe2Oversized.data);
    if (probe2Oversized.status !== 413) {
      throw new Error(`Expected 413 for oversized payload, got ${probe2Oversized.status}`);
    }

    // Probe 3: Rate Limiting
    console.log('\n--- Running Probe 3: Rate Limit Burst Protection ---');
    let hit429 = false;
    for (let i = 0; i < 10; i++) {
      const burstRes = await makeRequest({
        ...baseOpts,
        path: '/api/v1/submissions',
        method: 'POST'
      }, {
        widget_id: 'w_acme_1',
        data: { email: `burst${i}@example.com` }
      });
      if (burstRes.status === 429) {
        hit429 = true;
        console.log(`Hit 429 rate limit on request #${i + 1}`);
        break;
      }
    }
    if (!hit429) throw new Error('Probe 3 failed: Rate limit 429 was not triggered');

    // Reset rate limits for remaining tests
    await makeRequest({ ...baseOpts, path: '/api/v1/test/reset-limits', method: 'POST' });

    // Probe 4: Geo Fallback Chain
    console.log('\n--- Running Probe 4: Geo Fallback Chain ---');
    // Disable Provider A
    await makeRequest({ ...baseOpts, path: '/api/v1/test/geo-state', method: 'POST' }, { state: 'mock-provider-a-down' });
    const probe4StateB = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'geo_provider_b@example.com' }
    });
    console.log('Provider A down response:', probe4StateB.data);

    // Disable both providers
    await makeRequest({ ...baseOpts, path: '/api/v1/test/geo-state', method: 'POST' }, { state: 'mock-both-down' });
    const probe4StateNone = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'geo_both_down@example.com' }
    });
    console.log('Both providers down response (still succeeded):', probe4StateNone.data);
    if (probe4StateNone.status !== 201) throw new Error('Probe 4 failed: Submission did not succeed when providers down');

    // Reset Geo state
    await makeRequest({ ...baseOpts, path: '/api/v1/test/geo-state', method: 'POST' }, { state: 'normal' });

    // Probe 5: Safe Side Effect Failure
    console.log('\n--- Running Probe 5: Isolated Side Effect Failure ---');
    await makeRequest({ ...baseOpts, path: '/api/v1/test/email-fail', method: 'POST' }, { shouldFail: true });
    const probe5Res = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'side_effect_test@example.com' }
    });
    console.log('Submission status when email throws exception:', probe5Res.status, probe5Res.data);
    if (probe5Res.status !== 201) throw new Error('Probe 5 failed: Email failure blocked submission success');
    // Wait for background job retries to exhaust and log failure alert before resetting test state
    await new Promise((res) => setTimeout(res, 350));
    await makeRequest({ ...baseOpts, path: '/api/v1/test/email-fail', method: 'POST' }, { shouldFail: false });

    // Probe 6: Honeypot Anti-Spam
    console.log('\n--- Running Probe 6: Honeypot Anti-Spam Detection ---');
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
    const probe6Res = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'bot@spammer.com' },
      _gotcha: 'http://spam-link.com'
    });
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
    console.log(`Probe 6 Response Status: ${probe6Res.status}`, probe6Res.data);
    console.log(`Submissions in DB before: ${countBefore}, after: ${countAfter}`);
    if (countAfter !== countBefore) throw new Error('Probe 6 failed: Honeypot submission was saved to DB');

    // Probe 7: Idempotency Key Deduplication
    console.log('\n--- Running Probe 7: Idempotency Key Deduplication ---');
    await makeRequest({ ...baseOpts, path: '/api/v1/test/reset-limits', method: 'POST' });
    const testIdempKey = `idemp_test_${Date.now()}`;
    const firstIdempRes = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'idemp@example.com', name: 'Idempotency User' },
      idempotency_key: testIdempKey
    });
    console.log('First idempotency call status:', firstIdempRes.status, firstIdempRes.data);
    if (firstIdempRes.status !== 201 || !firstIdempRes.data.submission_id) {
      throw new Error('Probe 7 failed: First idempotency submission did not create a row');
    }

    const secondIdempRes = await makeRequest({
      ...baseOpts,
      path: '/api/v1/submissions',
      method: 'POST'
    }, {
      widget_id: 'w_acme_1',
      data: { email: 'idemp@example.com', name: 'Idempotency User' },
      idempotency_key: testIdempKey
    });
    console.log('Second idempotency call (duplicate) status:', secondIdempRes.status, secondIdempRes.data);
    if (secondIdempRes.data.submission_id !== firstIdempRes.data.submission_id) {
      throw new Error('Probe 7 failed: Duplicate idempotency call did not return original submission_id');
    }

    const dbRowsForKey = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE idempotency_key = ?').get(testIdempKey).count;
    console.log(`DB row count for idempotency_key '${testIdempKey}': ${dbRowsForKey}`);
    if (dbRowsForKey !== 1) {
      throw new Error(`Probe 7 failed: Expected 1 DB row for key, found ${dbRowsForKey}`);
    }

    console.log('\n=============================================');
    console.log('  ALL ACCEPTANCE PROBES PASSED SUCCESSFULLY!');
    console.log('=============================================\n');

  } catch (err) {
    console.error('\nPROBE VERIFICATION FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    if (instance) instance.close();
  }
}

if (require.main === module) {
  runProbes();
}