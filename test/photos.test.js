const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../server');

test('Progress photos upload, partner visibility filtering, before/after metadata, and deletion', async (t) => {
  const app = await createAppServer({ sqlitePath: ':memory:' });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(() => app.close());

  // 1. Register husband and wife, plus an unlinked user
  const r1 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'carlos@photos.com', displayName: 'Carlos', password: 'password123' })
  });
  const u1 = await r1.json();

  const r2 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana@photos.com', displayName: 'Ana', password: 'password123' })
  });
  const u2 = await r2.json();

  const r3 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'extra@photos.com', displayName: 'Extra', password: 'password123' })
  });
  const u3 = await r3.json();

  // Link Carlos and Ana
  await fetch(`${baseUrl}/api/partners/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
    body: JSON.stringify({ inviteCode: u2.user.inviteCode })
  });

  // 2. Carlos uploads 1 shared photo and 1 private photo
  const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const upShared = await fetch(`${baseUrl}/api/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
    body: JSON.stringify({
      angle: 'profile_right',
      weekPhase: 1,
      caption: 'Día 1 - Inicio Semana 1',
      sharedWithPartner: true,
      takenAt: '2026-11-01',
      imageDataUrl: sampleDataUrl
    })
  });
  assert.equal(upShared.status, 200);
  const sharedPhoto = await upShared.json();
  assert.ok(sharedPhoto.id);
  assert.equal(sharedPhoto.angle, 'profile_right');
  assert.equal(sharedPhoto.sharedWithPartner, true);

  const upPrivate = await fetch(`${baseUrl}/api/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
    body: JSON.stringify({
      angle: 'front',
      weekPhase: 1,
      caption: 'Foto privada solo para mí',
      sharedWithPartner: false,
      takenAt: '2026-11-01',
      imageDataUrl: sampleDataUrl
    })
  });
  assert.equal(upPrivate.status, 200);
  const privatePhoto = await upPrivate.json();

  // 3. Carlos sees both of his photos
  const listOwnRes = await fetch(`${baseUrl}/api/photos`, {
    headers: { Authorization: `Bearer ${u1.token}` }
  });
  assert.equal(listOwnRes.status, 200);
  const listOwn = await listOwnRes.json();
  assert.equal(listOwn.myPhotos.length, 2);

  // 4. Ana (linked partner) sees only Carlos's shared photo in partnerPhotos
  const listAnaRes = await fetch(`${baseUrl}/api/photos`, {
    headers: { Authorization: `Bearer ${u2.token}` }
  });
  assert.equal(listAnaRes.status, 200);
  const listAna = await listAnaRes.json();
  assert.equal(listAna.partnerPhotos.length, 1);
  assert.equal(listAna.partnerPhotos[0].id, sharedPhoto.id);
  assert.equal(listAna.partnerPhotos[0].userName, 'Carlos');

  // 5. Ana can fetch the binary/redirect image of the shared photo, but NOT the private photo
  const imgSharedRes = await fetch(`${baseUrl}/api/photos/${sharedPhoto.id}/image?token=${encodeURIComponent(u2.token)}`);
  assert.equal(imgSharedRes.status, 200);

  const imgPrivateRes = await fetch(`${baseUrl}/api/photos/${privatePhoto.id}/image?token=${encodeURIComponent(u2.token)}`);
  assert.equal(imgPrivateRes.status, 403);

  // 6. Unlinked user (u3) cannot fetch even Carlos's shared photo
  const imgStrangerRes = await fetch(`${baseUrl}/api/photos/${sharedPhoto.id}/image?token=${encodeURIComponent(u3.token)}`);
  assert.equal(imgStrangerRes.status, 403);

  // 7. Carlos deletes his private photo
  const delRes = await fetch(`${baseUrl}/api/photos/${privatePhoto.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${u1.token}` }
  });
  assert.equal(delRes.status, 200);
});
