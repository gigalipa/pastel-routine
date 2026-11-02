const path = require('node:path');
const { hashPassword, verifyPassword, generateInviteCode } = require('./auth');
const { getCatalog, getVideoById, getQuotesForWeek } = require('./catalog');

function calculateStreak(datesDesc, todayDate) {
  if (!datesDesc || datesDesc.length === 0) return 0;
  const filtered = todayDate ? datesDesc.filter(d => d <= todayDate) : datesDesc;
  if (filtered.length === 0) return 0;
  const uniqueDates = Array.from(new Set(filtered)).sort().reverse();
  const toUtcMs = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const DAY_MS = 86400000;
  const todayMs = toUtcMs(todayDate);
  const latestMs = toUtcMs(uniqueDates[0]);
  const diffFromToday = Math.round((todayMs - latestMs) / DAY_MS);

  // If the latest check-in is older than yesterday, current active streak is 0
  if (diffFromToday > 1) return 0;

  let streak = 1;
  let prevMs = latestMs;
  for (let i = 1; i < uniqueDates.length; i++) {
    const currMs = toUtcMs(uniqueDates[i]);
    const gap = Math.round((prevMs - currMs) / DAY_MS);
    if (gap === 1) {
      streak++;
      prevMs = currMs;
    } else if (gap > 1) {
      break;
    }
  }
  return streak;
}

async function createAdapter({ databaseUrl, sqlitePath }) {
  if (databaseUrl) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
    });
    return {
      type: 'postgres',
      async exec(sql) {
        await pool.query(sql);
      },
      async query(sql, params = []) {
        let idx = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
        const res = await pool.query(pgSql, params);
        return res.rows;
      },
      async close() {
        await pool.end();
      }
    };
  }

  // Built-in Node.js SQLite
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = sqlitePath || path.join(__dirname, '..', 'pastel-routine.sqlite');
  const sqlite = new DatabaseSync(dbFile);
  return {
    type: 'sqlite',
    async exec(sql) {
      sqlite.exec(sql);
    },
    async query(sql, params = []) {
      const stmt = sqlite.prepare(sql);
      if (/^\s*(SELECT|RETURNING)/i.test(sql) || /RETURNING/i.test(sql)) {
        return stmt.all(...params);
      }
      stmt.run(...params);
      return [];
    },
    async close() {
      sqlite.close();
    }
  };
}

async function createDb(options = {}) {
  const adapter = await createAdapter({
    databaseUrl: options.sqlitePath ? null : (options.databaseUrl || process.env.DATABASE_URL),
    sqlitePath: options.sqlitePath
  });

  const isPg = adapter.type === 'postgres';
  const idType = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';

  await adapter.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id ${idType},
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      plan TEXT NOT NULL DEFAULT 'free',
      invite_code TEXT UNIQUE NOT NULL,
      current_week INTEGER NOT NULL DEFAULT 1,
      reminder_time TEXT NOT NULL DEFAULT '08:00',
      timezone TEXT NOT NULL DEFAULT 'America/Bogota',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id ${idType},
      user_id INTEGER NOT NULL,
      partner_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, partner_id)
    );

    CREATE TABLE IF NOT EXISTS video_progress (
      user_id INTEGER NOT NULL,
      video_id TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      notes TEXT DEFAULT '',
      PRIMARY KEY (user_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      week_phase INTEGER NOT NULL DEFAULT 1,
      completed_blocks TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS cheers (
      id ${idType},
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id ${idType},
      user_id INTEGER NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      keys_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS progress_photos (
      id ${idType},
      user_id INTEGER NOT NULL,
      angle TEXT NOT NULL DEFAULT 'front',
      week_phase INTEGER NOT NULL DEFAULT 1,
      caption TEXT DEFAULT '',
      shared_with_partner INTEGER NOT NULL DEFAULT 1,
      taken_at TEXT NOT NULL,
      storage_type TEXT NOT NULL DEFAULT 'db',
      object_key TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      data_url TEXT,
      created_at TEXT NOT NULL
    );
  `);

  function formatUser(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      plan: row.plan,
      inviteCode: row.invite_code,
      currentWeek: Number(row.current_week),
      reminderTime: row.reminder_time,
      timezone: row.timezone,
      createdAt: row.created_at
    };
  }

  async function registerUser({ email, displayName, password, timezone = 'America/Bogota' }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(displayName || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Por favor ingresa un correo o usuario válido con @.');
    }
    if (!cleanName) {
      throw new Error('Por favor ingresa tu nombre visible.');
    }
    if (!password || String(password).length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }

    const existing = await adapter.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      throw new Error('Ya existe una cuenta con ese correo.');
    }

    const countRows = await adapter.query('SELECT COUNT(*) as cnt FROM users');
    const totalUsers = Number(countRows[0].cnt || 0);
    const role = totalUsers === 0 ? 'admin' : 'member';

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const codeCollision = await adapter.query('SELECT id FROM users WHERE invite_code = ?', [inviteCode]);
      if (codeCollision.length === 0) break;
      inviteCode = generateInviteCode();
    }

    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();

    await adapter.query(
      `INSERT INTO users (email, display_name, password_hash, role, plan, invite_code, current_week, reminder_time, timezone, created_at)
       VALUES (?, ?, ?, ?, 'free', ?, 1, '08:00', ?, ?)`,
      [cleanEmail, cleanName, passwordHash, role, inviteCode, timezone || 'America/Bogota', now]
    );

    const created = await adapter.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    return formatUser(created[0]);
  }

  async function authenticateUser({ email, password }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rows = await adapter.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (rows.length === 0) {
      throw new Error('Credenciales incorrectas.');
    }
    const user = rows[0];
    if (!verifyPassword(password, user.password_hash)) {
      throw new Error('Credenciales incorrectas.');
    }
    return formatUser(user);
  }

  async function getUserById(userId) {
    const rows = await adapter.query('SELECT * FROM users WHERE id = ?', [Number(userId)]);
    return formatUser(rows[0]);
  }

  async function updateUserSettings(userId, { currentWeek, reminderTime, timezone, displayName }) {
    const user = await getUserById(userId);
    if (!user) throw new Error('Usuario no encontrado.');
    const nextWeek = [1, 2, 3].includes(Number(currentWeek)) ? Number(currentWeek) : user.currentWeek;
    const nextTime = reminderTime && /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : user.reminderTime;
    const nextTz = timezone ? String(timezone).trim() : user.timezone;
    const nextName = displayName ? String(displayName).trim() : user.displayName;

    await adapter.query(
      'UPDATE users SET current_week = ?, reminder_time = ?, timezone = ?, display_name = ? WHERE id = ?',
      [nextWeek, nextTime, nextTz, nextName, Number(userId)]
    );
    return getUserById(userId);
  }

  async function connectPartner(userId, inviteCode) {
    const cleanCode = String(inviteCode || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('Ingresa un código de invitación válido.');
    }
    const targetRows = await adapter.query('SELECT * FROM users WHERE invite_code = ?', [cleanCode]);
    if (targetRows.length === 0) {
      throw new Error('No se encontró ningún usuario con ese código de compañero.');
    }
    const partner = formatUser(targetRows[0]);
    if (partner.id === Number(userId)) {
      throw new Error('No puedes vincularte contigo mismo.');
    }

    const now = new Date().toISOString();
    const existingAB = await adapter.query(
      'SELECT id FROM connections WHERE user_id = ? AND partner_id = ?',
      [Number(userId), partner.id]
    );
    if (existingAB.length === 0) {
      await adapter.query(
        'INSERT INTO connections (user_id, partner_id, created_at) VALUES (?, ?, ?)',
        [Number(userId), partner.id, now]
      );
    }

    const existingBA = await adapter.query(
      'SELECT id FROM connections WHERE user_id = ? AND partner_id = ?',
      [partner.id, Number(userId)]
    );
    if (existingBA.length === 0) {
      await adapter.query(
        'INSERT INTO connections (user_id, partner_id, created_at) VALUES (?, ?, ?)',
        [partner.id, Number(userId), now]
      );
    }

    return partner;
  }

  async function ensureDailyBlocksChecked(userId, date, weekPhase, blockIds) {
    if (!blockIds || blockIds.length === 0) return;
    const cleanDate = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const existing = await adapter.query(
      'SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?',
      [Number(userId), cleanDate]
    );
    const now = new Date().toISOString();
    let blocks = [];
    if (existing.length > 0) {
      try {
        blocks = JSON.parse(existing[0].completed_blocks || '[]');
      } catch {
        blocks = [];
      }
      for (const bid of blockIds) {
        if (bid && !blocks.includes(bid)) blocks.push(bid);
      }
      await adapter.query(
        'UPDATE daily_checkins SET completed_blocks = ?, week_phase = ?, updated_at = ? WHERE user_id = ? AND date = ?',
        [JSON.stringify(blocks), Number(weekPhase) || 1, now, Number(userId), cleanDate]
      );
    } else {
      blocks = Array.from(new Set(blockIds.filter(Boolean)));
      await adapter.query(
        'INSERT INTO daily_checkins (user_id, date, week_phase, completed_blocks, updated_at) VALUES (?, ?, ?, ?, ?)',
        [Number(userId), cleanDate, Number(weekPhase) || 1, JSON.stringify(blocks), now]
      );
    }
  }

  async function toggleVideoProgress(userId, videoId, notes = '', extra = {}) {
    const video = getVideoById(videoId);
    if (!video) {
      const err = new Error(`Video no válido: ${videoId}`);
      err.statusCode = 400;
      throw err;
    }

    const existing = await adapter.query(
      'SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?',
      [Number(userId), videoId]
    );

    if (existing.length > 0 && (notes === undefined || notes === null)) {
      await adapter.query(
        'DELETE FROM video_progress WHERE user_id = ? AND video_id = ?',
        [Number(userId), videoId]
      );
      return { completed: false, videoId };
    }

    const now = new Date().toISOString();
    if (existing.length > 0) {
      await adapter.query(
        'UPDATE video_progress SET notes = ?, completed_at = ? WHERE user_id = ? AND video_id = ?',
        [String(notes || ''), now, Number(userId), videoId]
      );
    } else {
      await adapter.query(
        'INSERT INTO video_progress (user_id, video_id, completed_at, notes) VALUES (?, ?, ?, ?)',
        [Number(userId), videoId, now, String(notes || '')]
      );
    }

    // Also mark any matching daily checklist item(s) for the user's active week today
    const user = await getUserById(userId);
    const activeWeek = extra.weekPhase || (user ? user.currentWeek : 1) || 1;
    const catalog = getCatalog();
    const weekPlan = catalog.weeklyPlan[String(activeWeek)] || catalog.weeklyPlan['1'];
    const matchingBlocks = (weekPlan.dailyChecklist || [])
      .filter(item => item.videoId === videoId)
      .map(item => item.id);
    if (extra.blockId && !matchingBlocks.includes(extra.blockId)) {
      matchingBlocks.push(extra.blockId);
    }
    if (matchingBlocks.length > 0 && extra.date) {
      await ensureDailyBlocksChecked(userId, extra.date, activeWeek, matchingBlocks);
    }

    return { completed: true, videoId, completedAt: now, notes: String(notes || ''), checkedBlocks: matchingBlocks };
  }

  async function toggleDailyBlock(userId, date, weekPhase, blockId) {
    const cleanDate = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const existing = await adapter.query(
      'SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?',
      [Number(userId), cleanDate]
    );

    const now = new Date().toISOString();
    let blocks = [];
    if (existing.length > 0) {
      try {
        blocks = JSON.parse(existing[0].completed_blocks || '[]');
      } catch {
        blocks = [];
      }
      if (blocks.includes(blockId)) {
        blocks = blocks.filter(b => b !== blockId);
      } else {
        blocks.push(blockId);
      }
      await adapter.query(
        'UPDATE daily_checkins SET completed_blocks = ?, week_phase = ?, updated_at = ? WHERE user_id = ? AND date = ?',
        [JSON.stringify(blocks), Number(weekPhase) || 1, now, Number(userId), cleanDate]
      );
    } else {
      blocks = [blockId];
      await adapter.query(
        'INSERT INTO daily_checkins (user_id, date, week_phase, completed_blocks, updated_at) VALUES (?, ?, ?, ?, ?)',
        [Number(userId), cleanDate, Number(weekPhase) || 1, JSON.stringify(blocks), now]
      );
    }

    return { date: cleanDate, completedBlocks: blocks };
  }

  async function sendCheer(fromUserId, toUserId, message) {
    const cleanMsg = String(message || '').trim() || '👏 ¡Vamos con toda hoy en la rutina!';
    const conn = await adapter.query(
      'SELECT id FROM connections WHERE user_id = ? AND partner_id = ?',
      [Number(fromUserId), Number(toUserId)]
    );
    if (conn.length === 0) {
      const err = new Error('Solo puedes enviar ánimos a compañeros vinculados.');
      err.statusCode = 403;
      throw err;
    }
    const now = new Date().toISOString();
    await adapter.query(
      'INSERT INTO cheers (from_user_id, to_user_id, message, created_at) VALUES (?, ?, ?, ?)',
      [Number(fromUserId), Number(toUserId), cleanMsg, now]
    );
    return { fromUserId: Number(fromUserId), toUserId: Number(toUserId), message: cleanMsg, createdAt: now };
  }

  async function buildUserSummary(userId, todayDate) {
    const user = await getUserById(userId);
    const catalog = getCatalog();
    const progressRows = await adapter.query(
      'SELECT * FROM video_progress WHERE user_id = ? ORDER BY completed_at DESC',
      [Number(userId)]
    );
    const checkinRows = await adapter.query(
      'SELECT * FROM daily_checkins WHERE user_id = ? ORDER BY date DESC',
      [Number(userId)]
    );

    const activeDates = checkinRows
      .filter(r => {
        try {
          return JSON.parse(r.completed_blocks || '[]').length > 0;
        } catch {
          return false;
        }
      })
      .map(r => r.date);

    const streak = calculateStreak(activeDates, todayDate);
    const todayRow = checkinRows.find(r => r.date === todayDate);
    const todayBlocks = todayRow ? JSON.parse(todayRow.completed_blocks || '[]') : [];

    const completedSet = new Set(progressRows.map(r => r.video_id));
    const focusProgress = catalog.focuses.map(f => {
      const fVideos = catalog.videos.filter(v => v.focusId === f.id);
      const doneCount = fVideos.filter(v => completedSet.has(v.id)).length;
      return {
        focusId: f.id,
        title: f.title,
        completed: doneCount,
        total: fVideos.length,
        percent: fVideos.length ? Math.round((doneCount / fVideos.length) * 100) : 0
      };
    });

    const recentVideos = progressRows.slice(0, 4).map(r => {
      const v = getVideoById(r.video_id);
      return {
        videoId: r.video_id,
        title: v ? v.title : r.video_id,
        completedAt: r.completed_at,
        notes: r.notes
      };
    });

    return {
      user,
      streak,
      todayDate,
      todayBlocks,
      completedVideosCount: progressRows.length,
      totalVideosCount: catalog.videos.length,
      focusProgress,
      recentVideos,
      videoProgressMap: Object.fromEntries(
        progressRows.map(r => [r.video_id, { completedAt: r.completed_at, notes: r.notes }])
      ),
      recentCheckins: checkinRows.slice(0, 14).map(r => ({
        date: r.date,
        weekPhase: Number(r.week_phase),
        completedBlocks: JSON.parse(r.completed_blocks || '[]')
      }))
    };
  }

  async function getDashboardData(userId, todayDate = new Date().toISOString().slice(0, 10)) {
    const me = await buildUserSummary(userId, todayDate);
    const partnerLinks = await adapter.query(
      'SELECT partner_id FROM connections WHERE user_id = ? ORDER BY id ASC',
      [Number(userId)]
    );

    const partners = [];
    for (const link of partnerLinks) {
      const pSummary = await buildUserSummary(link.partner_id, todayDate);
      if (pSummary.user) {
        partners.push({
          id: pSummary.user.id,
          displayName: pSummary.user.displayName,
          currentWeek: pSummary.user.currentWeek,
          streak: pSummary.streak,
          todayBlocks: pSummary.todayBlocks,
          completedVideosCount: pSummary.completedVideosCount,
          totalVideosCount: pSummary.totalVideosCount,
          focusProgress: pSummary.focusProgress,
          recentVideos: pSummary.recentVideos
        });
      }
    }

    const cheerRows = await adapter.query(
      `SELECT c.*, u.display_name as from_name
       FROM cheers c
       JOIN users u ON u.id = c.from_user_id
       WHERE c.to_user_id = ?
       ORDER BY c.id DESC
       LIMIT 15`,
      [Number(userId)]
    );

    const cheers = cheerRows.map(r => ({
      id: Number(r.id),
      fromUserId: Number(r.from_user_id),
      fromName: r.from_name,
      message: r.message,
      createdAt: r.created_at
    }));

    const quotes = getQuotesForWeek(me.user.currentWeek);

    return {
      me,
      partners,
      cheers,
      quotes
    };
  }

  async function savePushSubscription(userId, subscription) {
    if (!subscription || !subscription.endpoint) {
      throw new Error('Suscripción Push inválida.');
    }
    const existing = await adapter.query(
      'SELECT id FROM push_subscriptions WHERE endpoint = ?',
      [subscription.endpoint]
    );
    const now = new Date().toISOString();
    const keysJson = JSON.stringify(subscription.keys || {});
    if (existing.length > 0) {
      await adapter.query(
        'UPDATE push_subscriptions SET user_id = ?, keys_json = ?, created_at = ? WHERE endpoint = ?',
        [Number(userId), keysJson, now, subscription.endpoint]
      );
    } else {
      await adapter.query(
        'INSERT INTO push_subscriptions (user_id, endpoint, keys_json, created_at) VALUES (?, ?, ?, ?)',
        [Number(userId), subscription.endpoint, keysJson, now]
      );
    }
    return { saved: true };
  }

  async function getPushSubscriptionsForUser(userId) {
    const rows = await adapter.query(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [Number(userId)]
    );
    return rows.map(r => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      endpoint: r.endpoint,
      keys: JSON.parse(r.keys_json || '{}')
    }));
  }

  async function getDueReminders(nowOrHhmm = new Date()) {
    const rows = await adapter.query(
      `SELECT u.id as user_id, u.display_name, u.current_week, u.reminder_time, u.timezone, p.endpoint, p.keys_json
       FROM users u
       JOIN push_subscriptions p ON p.user_id = u.id`
    );

    const matched = [];
    for (const r of rows) {
      let userHhmm = '';
      if (typeof nowOrHhmm === 'string') {
        userHhmm = nowOrHhmm;
      } else {
        try {
          userHhmm = new Intl.DateTimeFormat('en-GB', {
            timeZone: r.timezone || 'America/Bogota',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(nowOrHhmm);
        } catch {
          userHhmm = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Bogota',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(nowOrHhmm);
        }
      }
      if (userHhmm === r.reminder_time) {
        matched.push({
          userId: Number(r.user_id),
          displayName: r.display_name,
          currentWeek: Number(r.current_week),
          subscription: {
            endpoint: r.endpoint,
            keys: JSON.parse(r.keys_json || '{}')
          }
        });
      }
    }
    return matched;
  }

  async function getOrCreateVapidKeys(generateFn) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY
      };
    }
    const rows = await adapter.query('SELECT value FROM app_config WHERE key = ?', ['vapid_keys']);
    if (rows.length > 0) {
      return JSON.parse(rows[0].value);
    }
    const keys = generateFn();
    await adapter.query(
      'INSERT INTO app_config (key, value) VALUES (?, ?)',
      ['vapid_keys', JSON.stringify(keys)]
    );
    return keys;
  }

  function formatPhotoRow(row, userName) {
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      userName: userName || row.display_name || '',
      angle: row.angle,
      weekPhase: Number(row.week_phase),
      caption: row.caption || '',
      sharedWithPartner: Boolean(Number(row.shared_with_partner)),
      takenAt: row.taken_at,
      storageType: row.storage_type,
      objectKey: row.object_key,
      mimeType: row.mime_type,
      createdAt: row.created_at
    };
  }

  async function addProgressPhoto(userId, { angle = 'front', weekPhase = 1, caption = '', sharedWithPartner = true, takenAt, storageType, objectKey, mimeType, dataUrl }) {
    const validAngles = ['front', 'profile_right', 'profile_left', 'posture'];
    const cleanAngle = validAngles.includes(angle) ? angle : 'front';
    const cleanWeek = [1, 2, 3].includes(Number(weekPhase)) ? Number(weekPhase) : 1;
    const cleanDate = String(takenAt || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const sharedInt = sharedWithPartner ? 1 : 0;
    const now = new Date().toISOString();

    await adapter.query(
      `INSERT INTO progress_photos
       (user_id, angle, week_phase, caption, shared_with_partner, taken_at, storage_type, object_key, mime_type, data_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(userId), cleanAngle, cleanWeek, String(caption || '').trim(), sharedInt, cleanDate, storageType, objectKey, mimeType, dataUrl || null, now]
    );

    const rows = await adapter.query(
      'SELECT * FROM progress_photos WHERE user_id = ? AND object_key = ? ORDER BY id DESC LIMIT 1',
      [Number(userId), objectKey]
    );
    const user = await getUserById(userId);
    return formatPhotoRow(rows[0], user ? user.displayName : '');
  }

  async function listProgressPhotos(userId) {
    const me = await getUserById(userId);
    const myRows = await adapter.query(
      'SELECT * FROM progress_photos WHERE user_id = ? ORDER BY taken_at ASC, id ASC',
      [Number(userId)]
    );
    const myPhotos = myRows.map(r => formatPhotoRow(r, me ? me.displayName : ''));

    const partnerRows = await adapter.query(
      `SELECT p.*, u.display_name
       FROM progress_photos p
       JOIN connections c ON c.partner_id = p.user_id
       JOIN users u ON u.id = p.user_id
       WHERE c.user_id = ? AND p.shared_with_partner = 1
       ORDER BY p.taken_at DESC, p.id DESC`,
      [Number(userId)]
    );
    const partnerPhotos = partnerRows.map(r => formatPhotoRow(r, r.display_name));

    return { myPhotos, partnerPhotos };
  }

  async function getProgressPhotoForViewer(photoId, viewerUserId) {
    const rows = await adapter.query('SELECT * FROM progress_photos WHERE id = ?', [Number(photoId)]);
    if (rows.length === 0) return null;
    const photo = rows[0];
    if (Number(photo.user_id) === Number(viewerUserId)) {
      return photo;
    }
    if (Number(photo.shared_with_partner) !== 1) {
      const err = new Error('Esta foto es privada.');
      err.statusCode = 403;
      throw err;
    }
    const conn = await adapter.query(
      'SELECT id FROM connections WHERE user_id = ? AND partner_id = ?',
      [Number(viewerUserId), Number(photo.user_id)]
    );
    if (conn.length === 0) {
      const err = new Error('Solo los compañeros vinculados pueden ver esta foto.');
      err.statusCode = 403;
      throw err;
    }
    return photo;
  }

  async function deleteProgressPhoto(photoId, userId) {
    const rows = await adapter.query(
      'SELECT * FROM progress_photos WHERE id = ? AND user_id = ?',
      [Number(photoId), Number(userId)]
    );
    if (rows.length === 0) {
      const err = new Error('Foto no encontrada o sin permiso para borrarla.');
      err.statusCode = 404;
      throw err;
    }
    const photo = rows[0];
    await adapter.query('DELETE FROM progress_photos WHERE id = ?', [Number(photoId)]);
    return photo;
  }

  return {
    adapter,
    registerUser,
    authenticateUser,
    getUserById,
    updateUserSettings,
    connectPartner,
    toggleVideoProgress,
    toggleDailyBlock,
    sendCheer,
    getDashboardData,
    savePushSubscription,
    getPushSubscriptionsForUser,
    getDueReminders,
    getOrCreateVapidKeys,
    addProgressPhoto,
    listProgressPhotos,
    getProgressPhotoForViewer,
    deleteProgressPhoto,
    close: () => adapter.close()
  };
}

module.exports = {
  createDb,
  calculateStreak
};
