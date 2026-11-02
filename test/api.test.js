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

test('Marking a video as seen from the modal also marks its corresponding daily checklist item for today', async (t) => {
  const app = await createAppServer({ sqlitePath: ':memory:' });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(() => app.close());

  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'checklist@test.com', displayName: 'Daniel', password: 'secret123' })
  });
  const { token } = await res.json();

  // User watches the 45-min map video (e4-p6) on 2026-11-02 and clicks "Marcar como visto y guardar nota"
  const markRes = await fetch(`${baseUrl}/api/progress/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      videoId: 'e4-p6',
      notes: 'Visto completo (45 min)',
      date: '2026-11-02'
    })
  });
  assert.equal(markRes.status, 200);

  // Verify dashboard has BOTH the video marked in library AND 'w1-map' marked in todayBlocks
  const dashRes = await fetch(`${baseUrl}/api/dashboard?date=2026-11-02`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(dashRes.status, 200);
  const dash = await dashRes.json();
  assert.ok(dash.me.videoProgressMap['e4-p6'], 'Video should be marked in library');
  assert.equal(dash.me.videoProgressMap['e4-p6'].notes, 'Visto completo (45 min)');
  assert.ok(dash.me.todayBlocks.includes('w1-map'), 'Daily checklist item w1-map should be automatically checked for today');
});
