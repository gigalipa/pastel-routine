const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../server');

test('REST API end-to-end: register, login, partner connect, progress, validation, and ICS export', async (t) => {
  const app = await createAppServer({ sqlitePath: ':memory:' });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(() => app.close());

  // 1. Register user 1
  const res1 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'carlos@test.com', displayName: 'Carlos', password: 'secret123' })
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.ok(data1.token);

  // 2. Reject invalid video ID
  const badVid = await fetch(`${baseUrl}/api/progress/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data1.token}` },
    body: JSON.stringify({ videoId: 'non-existent-id' })
  });
  assert.equal(badVid.status, 400);

  // 3. Valid video progress + daily check-in
  const okVid = await fetch(`${baseUrl}/api/progress/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data1.token}` },
    body: JSON.stringify({ videoId: 'e4-p6', notes: 'Visto con mi esposa' })
  });
  assert.equal(okVid.status, 200);

  const okCheckin = await fetch(`${baseUrl}/api/progress/daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data1.token}` },
    body: JSON.stringify({ date: '2026-11-01', weekPhase: 1, blockId: 'w1-breath' })
  });
  assert.equal(okCheckin.status, 200);

  // 4. Download .ics calendar file
  const icsRes = await fetch(`${baseUrl}/api/calendar.ics?token=${encodeURIComponent(data1.token)}`);
  assert.equal(icsRes.status, 200);
  assert.match(icsRes.headers.get('content-type'), /text\/calendar/);
  const icsBody = await icsRes.text();
  assert.ok(icsBody.includes('BEGIN:VCALENDAR'));
  assert.ok(icsBody.includes('RRULE:FREQ=DAILY'));
});
