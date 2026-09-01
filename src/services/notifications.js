const config = require('../config');

let mockGeoState = config.geoMockState || 'normal';
let forceEmailFail = false;

function setMockState(state) {
  mockGeoState = state;
}

function getMockState() {
  return mockGeoState;
}

function setForceEmailFailure(val) {
  forceEmailFail = Boolean(val);
}

// Simple fetch wrapper with timeout
async function fetchWithTimeout(url) {
  // TODO: make timeout configurable
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function providerA(ip) {
  if (mockGeoState === 'mock-provider-a-down' || mockGeoState === 'mock-both-down') {
    throw new Error('Provider A is down (mocked)');
  }
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'United States', city: 'Local Dev', provider: 'provider_a' };
  }

  const res = await fetchWithTimeout(`http://ip-api.com/json/${ip}?fields=status,country,city`);
  if (res.status !== 'success') throw new Error('ip-api failed');

  return { country: res.country || null, city: res.city || null, provider: 'provider_a' };
}

async function providerB(ip) {
  if (mockGeoState === 'mock-both-down') {
    throw new Error('Provider B is down (mocked)');
  }
  if (mockGeoState === 'mock-provider-a-down') {
    return { country: 'Canada', city: 'Toronto', provider: 'provider_b' };
  }
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'United States', city: 'Local Dev', provider: 'provider_b' };
  }

  const res = await fetchWithTimeout(`https://ipapi.co/${ip}/json/`);
  if (res.error) throw new Error('ipapi failed');

  return { country: res.country_name || null, city: res.city || null, provider: 'provider_b' };
}

async function enrichIp(ip) {
  try {
    return await providerA(ip);
  } catch (errA) {
    console.warn(`[GeoService] Provider A failed (${errA.message}), trying Provider B...`);
  }

  try {
    return await providerB(ip);
  } catch (errB) {
    console.warn(`[GeoService] Provider B failed (${errB.message}), proceeding without geo data.`);
  }

  return { country: null, city: null, provider: 'none' };
}

async function sendEmail(submission) {
  if (forceEmailFail) {
    throw new Error('SMTP Connection Failed (Simulated Side Effect Failure)');
  }
  console.log(`[EmailService] Notification sent for submission ${submission.id} to tenant ${submission.tenant_id}`);
  return { sent: true };
}

async function notify(submission) {
  try {
    await sendEmail(submission);
  } catch (err) {
    console.error(`[SideEffectIsolated] Non-critical notification failed: ${err.message}`);
  }
}

module.exports = {
  enrichIp,
  setMockState,
  getMockState,
  sendEmail,
  notify,
  setForceEmailFailure
};
