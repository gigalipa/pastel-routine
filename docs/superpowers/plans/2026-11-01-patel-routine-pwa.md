# Patel Routine PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable Progressive Web App (PWA) for tracking Oscar Patel's 66 biomechanical/fascial routine videos across 4 focus areas and a 3-week progressive schedule, with multi-user partner connections, motivational quotes, native Web Push notifications, and `.ics` calendar export.

**Architecture:** A single lightweight Node.js (`>=22`) server (`server.js`) using native `http` + a dual-mode database layer (`db.js`) that uses Node's built-in `node:sqlite` locally and PostgreSQL (`pg`) when `DATABASE_URL` is configured in Render. The frontend (`public/`) is a zero-build Vanilla JS/CSS PWA with a Service Worker (`sw.js`) for offline caching and Web Push (`web-push`).

**Tech Stack:** Node.js 22/24 (`node:sqlite`, `node:http`, `node:crypto`, `node:test`), `pg` (for Neon/Render PostgreSQL), `web-push` (for VAPID native notifications), Vanilla HTML5/CSS3/JS PWA.

**Spec:** `docs/superpowers/specs/2026-11-01-patel-routine-pwa-design.md`

## Global Constraints

- **Ponytail Simplicity:** No frontend build step, no bundler, no ORM. Standard library first (`node:crypto` scrypt for passwords and HMAC tokens, `node:sqlite` for local DB, `node:test` for tests).
- **Exact Catalog:** Must include all 66 videos from the 4 sheets of `1UAVeVGK7lRMrI5H0Aj7MjdEeoOE4R_rJx0ZeSduc4Qw` mapped accurately to Enfoques 1–4 and Weeks 1, 2, and 3+.
- **Multi-user Privacy:** A user's progress (`video_progress`, `daily_checkins`) is only visible to themselves and users linked in `connections` via `invite_code`.
- **Render Ready:** Must include `render.yaml` and support `PORT` and `DATABASE_URL` environment variables out of the box.

## Execution Lines & Dependency Matrix

- **Line A (Data & Catalog):** Task 1 (`package.json`, `data/catalog.json`, `data/quotes.json`, `lib/catalog.js`) — Local Test: `node --test test/catalog.test.js`
- **Line B (Database & Auth Core):** Task 2 (`lib/db.js`, `lib/auth.js`) — Local Test: `node --test test/db.test.js`
- **Line C (HTTP API, Calendar & Push):** Task 3 (`server.js`, `lib/ics.js`) depends on Line A + Line B — Local Test: `node --test test/api.test.js`
- **Line D (PWA Frontend & Deployment):** Task 4 (`public/index.html`, `public/styles.css`, `public/app.js`, `public/sw.js`, `public/manifest.json`, `render.yaml`) depends on Line C — Local Test: `node --test test/e2e.test.js`
- **Global Integration Test:** `npm test` (`node --test test/*.test.js`)

## Review Focus

1. **Duplicate partner connection or self-linking:** A user entering their own `invite_code` or linking twice with the same partner must be rejected cleanly (`400 Bad Request`) or handled idempotently without duplicating partner cards.
2. **Case-insensitive email & whitespace on login/register:** Mobile keyboards often capitalize the first letter or add trailing spaces to emails and invite codes (`" User@Mail.com "`, `"patel-12ab "`); the server must normalize `.trim().toLowerCase()` for emails and `.trim().toUpperCase()` for invite codes.
3. **Streak calculation across days:** Calculating daily streak must count consecutive dates (`YYYY-MM-DD`) accurately when a user has checked in both yesterday and today, or only today, without crashing on empty history.
4. **Week 3 safety gate:** Switching to or viewing Week 3 must explicitly surface the mandatory TMJ/cervical tension safety warning from the spec.
5. **Invalid video IDs on progress endpoints:** Attempting to mark a non-existent `video_id` as completed must return `400 Bad Request` instead of polluting progress percentages.

---

### Task 1: Project Setup, 66-Video Catalog & Motivational Quotes Engine

**Files:**
- Create: `package.json`
- Create: `scripts/build-catalog.js`
- Create: `data/catalog.json`
- Create: `data/quotes.json`
- Create: `lib/catalog.js`
- Test: `test/catalog.test.js`

**Interfaces:**
- Produces:
  - `getCatalog()`: returns `{ focuses: Array, videos: Array, weeklyPlan: Object }`
  - `getVideoById(videoId)`: returns video object or `null`
  - `getQuotesForWeek(weekNumber, topic)`: returns matching motivational quotes array
  - `syncFromGoogleSheet(spreadsheetId)`: fetches live CSVs from Google Sheets and updates catalog

- [ ] **Step 1: Create `package.json` and install minimal dependencies (`pg`, `web-push`)**

```json
{
  "name": "pastel-routine",
  "version": "1.0.0",
  "description": "PWA de seguimiento y motivación para las rutinas de Oscar Patel",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/*.test.js"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "pg": "^8.13.1",
    "web-push": "^3.6.7"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing test `test/catalog.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { getCatalog, getVideoById, getQuotesForWeek } = require('../lib/catalog');

test('Catalog contains all 66 videos across 4 focuses and maps the 3-week plan', () => {
  const catalog = getCatalog();
  assert.equal(catalog.focuses.length, 4);
  assert.equal(catalog.videos.length, 66);

  const f1 = catalog.videos.filter(v => v.focusId === 1);
  const f2 = catalog.videos.filter(v => v.focusId === 2);
  const f3 = catalog.videos.filter(v => v.focusId === 3);
  const f4 = catalog.videos.filter(v => v.focusId === 4);
  assert.equal(f1.length, 30);
  assert.equal(f2.length, 15);
  assert.equal(f3.length, 15);
  assert.equal(f4.length, 6);

  // Verify Week 1 recommended videos: Enfoque 4 Pos 6, Enfoque 3 Pos 1..8, Enfoque 1 Pos 1..7
  const w1 = catalog.weeklyPlan['1'];
  assert.ok(w1.videoIds.includes('e4-p6'));
  assert.ok(w1.videoIds.includes('e3-p1'));
  assert.ok(w1.videoIds.includes('e3-p8'));
  assert.ok(w1.videoIds.includes('e1-p1'));
  assert.ok(w1.videoIds.includes('e1-p7'));
  assert.equal(w1.videoIds.length, 16);

  // Verify Week 2 recommended videos: Enfoque 3 Pos 14, Enfoque 2 Pos 3, 9, 10
  const w2 = catalog.weeklyPlan['2'];
  assert.deepEqual(w2.coreVideoIds, ['e3-p14', 'e2-p3', 'e2-p9', 'e2-p10']);

  // Verify Week 3 recommended videos: Enfoque 3 Pos 15, Enfoque 1 Pos 30 + safety warning
  const w3 = catalog.weeklyPlan['3'];
  assert.deepEqual(w3.coreVideoIds, ['e3-p15', 'e1-p30']);
  assert.ok(w3.safetyWarning.includes('tensión mandibular'));

  // Verify video lookup and YouTube ID extraction
  const mapVideo = getVideoById('e4-p6');
  assert.equal(mapVideo.youtubeId, 'WM_X4wZBVd0');
});

test('Quotes engine returns contextual motivational quotes for each week', () => {
  const q1 = getQuotesForWeek(1);
  const q2 = getQuotesForWeek(2);
  const q3 = getQuotesForWeek(3);
  assert.ok(q1.length >= 4);
  assert.ok(q2.length >= 4);
  assert.ok(q3.length >= 4);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/catalog.test.js`
Expected: FAIL with `Cannot find module '../lib/catalog'`

- [ ] **Step 4: Generate `data/catalog.json`, `data/quotes.json`, and implement `lib/catalog.js`**

Create `data/quotes.json` with contextual quotes per week/phase and `data/catalog.json` parsed directly from the Google Sheet export, plus `lib/catalog.js` exposing `getCatalog()`, `getVideoById()`, `getQuotesForWeek()`, and `syncFromGoogleSheet()`.

- [ ] **Step 5: Run test to verify it passes and commit**

Run: `node --test test/catalog.test.js`
Expected: PASS
Commit: `git add package.json package-lock.json data/ lib/catalog.js test/catalog.test.js && git commit -m "feat: add 66-video Oscar Patel catalog, 3-week progression plan, and contextual quotes"`

---

### Task 2: Database Layer (SQLite + Postgres Dual Adapter) & Auth / Partner Connections

**Files:**
- Create: `lib/auth.js`
- Create: `lib/db.js`
- Test: `test/db.test.js`

**Interfaces:**
- Produces:
  - `createDb(options)`: initializes tables and returns async repository methods:
    - `registerUser({ email, displayName, password, timezone })`
    - `authenticateUser({ email, password })`
    - `getUserById(id)`
    - `updateUserSettings(userId, { currentWeek, reminderTime, timezone, displayName })`
    - `connectPartner(userId, inviteCode)`
    - `toggleVideoProgress(userId, videoId, notes)`
    - `toggleDailyBlock(userId, date, weekPhase, videoId)`
    - `sendCheer(fromUserId, toUserId, message)`
    - `getDashboardData(userId, todayDate)`
    - `savePushSubscription(userId, subscription)`
    - `getDueReminders(hhmm)`
    - `getOrCreateVapidKeys(generateFn)`

- [ ] **Step 1: Write the failing test `test/db.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../lib/db');

test('User registration, normalization, partner linking, streaks, and cheers', async () => {
  const db = await createDb({ sqlitePath: ':memory:' });

  // Register husband (first user becomes admin) and wife
  const u1 = await db.registerUser({
    email: '  Esposo@Example.com ',
    displayName: 'Carlos',
    password: 'password123',
    timezone: 'America/Bogota'
  });
  assert.equal(u1.email, 'esposo@example.com');
  assert.equal(u1.role, 'admin');
  assert.match(u1.inviteCode, /^PATEL-[A-Z0-9]{4}$/);

  const u2 = await db.registerUser({
    email: 'esposa@example.com',
    displayName: 'Ana',
    password: 'password456',
    timezone: 'America/Bogota'
  });
  assert.equal(u2.role, 'member');

  // Prevent self-linking
  await assert.rejects(
    () => db.connectPartner(u1.id, u1.inviteCode),
    /No puedes vincularte contigo mismo/
  );

  // Link husband and wife using lowercase/spaced invite code
  await db.connectPartner(u1.id, ` ${u2.inviteCode.toLowerCase()} `);

  // Mark video progress & daily check-in across consecutive days
  await db.toggleVideoProgress(u2.id, 'e4-p6', 'Excelente mapa general');
  await db.toggleDailyBlock(u2.id, '2026-10-31', 1, 'e3-p1');
  await db.toggleDailyBlock(u2.id, '2026-11-01', 1, 'e3-p2');

  // Send motivational cheer
  await db.sendCheer(u1.id, u2.id, '¡Vamos amor, excelente constancia!');

  // Verify dashboard shows partner progress and 2-day streak
  const dash1 = await db.getDashboardData(u1.id, '2026-11-01');
  assert.equal(dash1.partners.length, 1);
  assert.equal(dash1.partners[0].displayName, 'Ana');
  assert.equal(dash1.partners[0].streak, 2);
  assert.equal(dash1.partners[0].completedVideosCount, 1);
  assert.equal(dash1.partners[0].todayBlocks.length, 1);

  const dash2 = await db.getDashboardData(u2.id, '2026-11-01');
  assert.equal(dash2.cheers.length, 1);
  assert.equal(dash2.cheers[0].fromName, 'Carlos');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/db.test.js`
Expected: FAIL with `Cannot find module '../lib/db'`

- [ ] **Step 3: Implement `lib/auth.js` and `lib/db.js`**

Implement password hashing (`crypto.scryptSync`), stateless signed tokens (`crypto.createHmac`), and `lib/db.js` supporting both `node:sqlite` (`DatabaseSync`) and `pg` (`Pool`) behind the exact same async API.

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `node --test test/db.test.js`
Expected: PASS
Commit: `git add lib/auth.js lib/db.js test/db.test.js && git commit -m "feat: add dual SQLite/Postgres database adapter, auth, partner connections, and streak calculation"`

---

### Task 3: HTTP Server, REST API, `.ics` Calendar Generator & Web Push

**Files:**
- Create: `lib/ics.js`
- Create: `server.js`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `lib/catalog.js`, `lib/db.js`, `lib/auth.js`
- Produces:
  - `createAppServer({ sqlitePath })`: returns `{ server, db, start(port), close() }`
  - `generateIcs({ displayName, reminderTime, weekPhase, weeklyPlan })`: returns RFC 5545 `.ics` string

- [ ] **Step 1: Write the failing test `test/api.test.js`**

```javascript
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

  // 4. Download .ics calendar file
  const icsRes = await fetch(`${baseUrl}/api/calendar.ics?token=${encodeURIComponent(data1.token)}`);
  assert.equal(icsRes.status, 200);
  assert.match(icsRes.headers.get('content-type'), /text\/calendar/);
  const icsBody = await icsRes.text();
  assert.ok(icsBody.includes('BEGIN:VCALENDAR'));
  assert.ok(icsBody.includes('RRULE:FREQ=DAILY'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/api.test.js`
Expected: FAIL with `Cannot find module '../server'`

- [ ] **Step 3: Implement `lib/ics.js` and `server.js`**

Implement RFC 5545 `.ics` generation in `lib/ics.js` and the HTTP router + static file server + Web Push notification dispatcher in `server.js`.

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `node --test test/api.test.js`
Expected: PASS
Commit: `git add lib/ics.js server.js test/api.test.js && git commit -m "feat: add HTTP API server, Web Push dispatcher, and ICS calendar export"`

---

### Task 4: Pastel Routine PWA Frontend, Service Worker & Render Blueprint

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Create: `public/icon.svg`
- Create: `public/styles.css`
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `render.yaml`
- Create: `README.md`
- Test: `test/e2e.test.js`

**Interfaces:**
- Consumes: All `/api/*` endpoints from `server.js`
- Produces: Installable PWA with 4 navigation tabs (`Hoy`, `Biblioteca`, `Compañeros`, `Ajustes`), embedded YouTube player modal, partner cheer system, and Render deployment blueprint.

- [ ] **Step 1: Write the failing test `test/e2e.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../server');

test('PWA static assets, manifest, Service Worker, and UI structure are served properly', async (t) => {
  const app = await createAppServer({ sqlitePath: ':memory:' });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(() => app.close());

  const indexRes = await fetch(`${baseUrl}/`);
  assert.equal(indexRes.status, 200);
  const html = await indexRes.text();
  assert.ok(html.includes('manifest.json'));
  assert.ok(html.includes('Pastel Routine'));

  const manifestRes = await fetch(`${baseUrl}/manifest.json`);
  assert.equal(manifestRes.status, 200);
  const manifest = await manifestRes.json();
  assert.equal(manifest.display, 'standalone');

  const swRes = await fetch(`${baseUrl}/sw.js`);
  assert.equal(swRes.status, 200);
  const swText = await swRes.text();
  assert.ok(swText.includes("addEventListener('push'"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/e2e.test.js`
Expected: FAIL with `404` on `/`

- [ ] **Step 3: Implement `public/*`, `render.yaml`, and `README.md`**

Create the soothing Pastel Routine design (`public/styles.css`), responsive mobile-first 4-tab layout (`public/index.html`, `public/app.js`), Service Worker (`public/sw.js`), Web App Manifest (`public/manifest.json`), SVG app icon (`public/icon.svg`), and `render.yaml` Blueprint.

- [ ] **Step 4: Run full test suite to verify everything passes and commit**

Run: `npm test`
Expected: PASS (all 4 test suites passing)
Commit: `git add public/ render.yaml README.md test/e2e.test.js && git commit -m "feat: add Pastel Routine PWA frontend, Service Worker, and Render blueprint"`
