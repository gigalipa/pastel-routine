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

  // Authenticate with mixed case email
  const authed = await db.authenticateUser({
    email: 'ESPOSO@example.com ',
    password: 'password123'
  });
  assert.equal(authed.id, u1.id);

  // Prevent self-linking
  await assert.rejects(
    () => db.connectPartner(u1.id, u1.inviteCode),
    /No puedes vincularte contigo mismo/
  );

  // Link husband and wife using lowercase/spaced invite code
  await db.connectPartner(u1.id, ` ${u2.inviteCode.toLowerCase()} `);

  // Duplicate link is idempotent (does not create duplicate partner rows)
  await db.connectPartner(u1.id, u2.inviteCode);

  // Mark video progress & daily check-in across consecutive days
  await db.toggleVideoProgress(u2.id, 'e4-p6', 'Excelente mapa general');
  await db.toggleDailyBlock(u2.id, '2026-10-31', 1, 'w1-breath');
  await db.toggleDailyBlock(u2.id, '2026-11-01', 1, 'w1-tongue');

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

test('Timezone-aware due reminders match user timezone HH:MM accurately', async () => {
  const db = await createDb({ sqlitePath: ':memory:' });
  const u1 = await db.registerUser({
    email: 'tz@example.com',
    displayName: 'Mateo',
    password: 'password123',
    timezone: 'America/Bogota'
  });
  await db.updateUserSettings(u1.id, { reminderTime: '08:00', timezone: 'America/Bogota' });
  await db.savePushSubscription(u1.id, {
    endpoint: 'https://push.example.com/sub1',
    keys: { p256dh: 'k1', auth: 'a1' }
  });

  // 2026-11-01T13:00:00Z is 08:00 in America/Bogota (UTC-5)
  const utcDateAt8amBogota = new Date('2026-11-01T13:00:00.000Z');
  const due = await db.getDueReminders(utcDateAt8amBogota);
  assert.equal(due.length, 1);
  assert.equal(due[0].userId, u1.id);

  // 14:00Z is 09:00 in America/Bogota -> should not match 08:00
  const utcDateAt9amBogota = new Date('2026-11-01T14:00:00.000Z');
  const notDue = await db.getDueReminders(utcDateAt9amBogota);
  assert.equal(notDue.length, 0);
});
