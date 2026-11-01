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
