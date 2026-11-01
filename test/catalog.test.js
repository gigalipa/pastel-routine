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
