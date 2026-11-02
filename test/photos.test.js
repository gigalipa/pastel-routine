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

  // 7. Ana likes and comments on Carlos's shared photo
  const likeRes = await fetch(`${baseUrl}/api/photos/${sharedPhoto.id}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u2.token}` }
  });
  assert.equal(likeRes.status, 200);
  const likeData = await likeRes.json();
  assert.equal(likeData.liked, true);
  assert.equal(likeData.likesCount, 1);

  const commentRes = await fetch(`${baseUrl}/api/photos/${sharedPhoto.id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u2.token}` },
    body: JSON.stringify({ comment: '¡Se nota muchísimo el cambio en el cuello!' })
  });
  assert.equal(commentRes.status, 200);
  const commentData = await commentRes.json();
  assert.equal(commentData.userName, 'Ana');
  assert.equal(commentData.comment, '¡Se nota muchísimo el cambio en el cuello!');

  // Unlinked user (u3) cannot like or comment on Carlos's shared photo
  const strangerLikeRes = await fetch(`${baseUrl}/api/photos/${sharedPhoto.id}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u3.token}` }
  });
  assert.equal(strangerLikeRes.status, 403);

  // Ana cannot like Carlos's private photo
  const privLikeRes = await fetch(`${baseUrl}/api/photos/${privatePhoto.id}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${u2.token}` }
  });
  assert.equal(privLikeRes.status, 403);

  // Verify Carlos sees Ana's like and comment on his photo
  const listOwnAfter = await (await fetch(`${baseUrl}/api/photos`, {
    headers: { Authorization: `Bearer ${u1.token}` }
  })).json();
  const updatedShared = listOwnAfter.myPhotos.find(p => p.id === sharedPhoto.id);
  assert.equal(updatedShared.likesCount, 1);
  assert.deepEqual(updatedShared.likedByNames, ['Ana']);
  assert.equal(updatedShared.comments.length, 1);
  assert.equal(updatedShared.comments[0].comment, '¡Se nota muchísimo el cambio en el cuello!');

  // 8. Carlos deletes his private photo
  const delRes = await fetch(`${baseUrl}/api/photos/${privatePhoto.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${u1.token}` }
  });
  assert.equal(delRes.status, 200);
});
