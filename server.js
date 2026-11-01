const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');
const { createDb } = require('./lib/db');
const { signToken, verifyToken } = require('./lib/auth');
const { getCatalog, getQuotesForWeek, syncFromGoogleSheet } = require('./lib/catalog');
const { generateIcs } = require('./lib/ics');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function getAuthPayload(req, urlObj) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return verifyToken(token);
  }
  const queryToken = urlObj.searchParams.get('token');
  if (queryToken) {
    return verifyToken(queryToken);
  }
  return null;
}

async function createAppServer(options = {}) {
  const db = await createDb(options);
  const vapidKeys = await db.getOrCreateVapidKeys(() => webpush.generateVAPIDKeys());

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hola@pastelroutine.app',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  async function notifyUserDevices(userId, payloadObj) {
    const subs = await db.getPushSubscriptionsForUser(userId);
    const payloadStr = JSON.stringify(payloadObj);
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payloadStr
        );
        sent++;
      } catch {
        // Ignore expired subscription endpoints
      }
    }
    return sent;
  }

  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = urlObj.pathname;

      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, status: 'healthy' });
      }

      if (pathname === '/api/catalog' && req.method === 'GET') {
        return sendJson(res, 200, getCatalog());
      }

      if (pathname === '/api/vapid-public-key' && req.method === 'GET') {
        return sendJson(res, 200, { publicKey: vapidKeys.publicKey });
      }

      if (pathname === '/api/auth/register' && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
          const user = await db.registerUser(body);
          const token = signToken({ id: user.id, email: user.email, role: user.role });
          return sendJson(res, 200, { token, user });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
          const user = await db.authenticateUser(body);
          const token = signToken({ id: user.id, email: user.email, role: user.role });
          return sendJson(res, 200, { token, user });
        } catch (err) {
          return sendJson(res, 401, { error: err.message });
        }
      }

      if (pathname === '/api/calendar.ics' && req.method === 'GET') {
        const auth = getAuthPayload(req, urlObj);
        if (!auth) return sendJson(res, 401, { error: 'No autorizado' });
        const user = await db.getUserById(auth.id);
        if (!user) return sendJson(res, 401, { error: 'Usuario no encontrado' });

        const catalog = getCatalog();
        const icsContent = generateIcs({
          displayName: user.displayName,
          reminderTime: user.reminderTime,
          weekPhase: user.currentWeek,
          weeklyPlan: catalog.weeklyPlan,
          appUrl: `https://${req.headers.host || 'localhost'}`
        });

        res.writeHead(200, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="rutina-oscar-patel-semana-${user.currentWeek}.ics"`
        });
        return res.end(icsContent);
      }

      if (pathname.startsWith('/api/')) {
        const auth = getAuthPayload(req, urlObj);
        if (!auth) {
          return sendJson(res, 401, { error: 'Sesión requerida' });
        }

        if (pathname === '/api/dashboard' && req.method === 'GET') {
          const today = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);
          const dashboard = await db.getDashboardData(auth.id, today);
          return sendJson(res, 200, dashboard);
        }

        if (pathname === '/api/settings' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const updated = await db.updateUserSettings(auth.id, body);
          return sendJson(res, 200, { user: updated });
        }

        if (pathname === '/api/partners/connect' && req.method === 'POST') {
          const body = await readJsonBody(req);
          try {
            const partner = await db.connectPartner(auth.id, body.inviteCode);
            const me = await db.getUserById(auth.id);
            await notifyUserDevices(partner.id, {
              title: '🤝 ¡Nuevo vínculo en Pastel Routine!',
              body: `${me.displayName} se ha vinculado contigo para compartir su progreso.`
            });
            return sendJson(res, 200, { partner });
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        if (pathname === '/api/progress/video' && req.method === 'POST') {
          const body = await readJsonBody(req);
          try {
            const result = await db.toggleVideoProgress(auth.id, body.videoId, body.notes);
            return sendJson(res, 200, result);
          } catch (err) {
            return sendJson(res, err.statusCode || 400, { error: err.message });
          }
        }

        if (pathname === '/api/progress/daily' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await db.toggleDailyBlock(auth.id, body.date, body.weekPhase, body.blockId);
          return sendJson(res, 200, result);
        }

        if (pathname === '/api/cheers' && req.method === 'POST') {
          const body = await readJsonBody(req);
          try {
            const cheer = await db.sendCheer(auth.id, body.toUserId, body.message);
            const me = await db.getUserById(auth.id);
            await notifyUserDevices(body.toUserId, {
              title: `💌 Ánimo de ${me.displayName}`,
              body: cheer.message
            });
            return sendJson(res, 200, cheer);
          } catch (err) {
            return sendJson(res, err.statusCode || 400, { error: err.message });
          }
        }

        if (pathname === '/api/push/subscribe' && req.method === 'POST') {
          const body = await readJsonBody(req);
          try {
            const resSub = await db.savePushSubscription(auth.id, body.subscription);
            return sendJson(res, 200, resSub);
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        if (pathname === '/api/push/test' && req.method === 'POST') {
          const me = await db.getUserById(auth.id);
          const quotes = getQuotesForWeek(me.currentWeek);
          const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
          const sent = await notifyUserDevices(auth.id, {
            title: `🌿 Recordatorio Semana ${me.currentWeek} — Pastel Routine`,
            body: randomQuote.text
          });
          return sendJson(res, 200, { sent, quote: randomQuote });
        }

        if (pathname === '/api/admin/sync-sheet' && req.method === 'POST') {
          const me = await db.getUserById(auth.id);
          if (!me || me.role !== 'admin') {
            return sendJson(res, 403, { error: 'Solo el administrador puede sincronizar el Google Sheet.' });
          }
          try {
            const updatedCatalog = await syncFromGoogleSheet();
            return sendJson(res, 200, { ok: true, count: updatedCatalog.videos.length, updatedAt: updatedCatalog.updatedAt });
          } catch (err) {
            return sendJson(res, 500, { error: err.message });
          }
        }

        return sendJson(res, 404, { error: 'Endpoint no encontrado' });
      }

      // Serve static files from public/
      let safePath = pathname === '/' ? '/index.html' : pathname;
      safePath = path.normalize(safePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(publicDir, safePath);

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Error interno del servidor' });
    }
  });

  // Periodic reminder check every 60 seconds
  let lastMinuteTriggered = '';
  const reminderInterval = setInterval(async () => {
    try {
      const now = new Date();
      const minuteKey = now.toISOString().slice(0, 16);
      if (minuteKey === lastMinuteTriggered) return;
      lastMinuteTriggered = minuteKey;

      const dueList = await db.getDueReminders(now);
      for (const item of dueList) {
        const quotes = getQuotesForWeek(item.currentWeek);
        const quote = quotes[Math.floor(Math.random() * quotes.length)];
        try {
          await webpush.sendNotification(
            item.subscription,
            JSON.stringify({
              title: `🌿 Hola ${item.displayName}, hora de tu rutina (Semana ${item.currentWeek})`,
              body: quote.text
            })
          );
        } catch {
          // Ignore failed push endpoints
        }
      }
    } catch {
      // Ignore background errors
    }
  }, 30000);
  reminderInterval.unref();

  return {
    server,
    db,
    start(port = process.env.PORT || 3000) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
          resolve(server.address().port);
        });
      });
    },
    async close() {
      clearInterval(reminderInterval);
      await new Promise(resolve => server.close(resolve));
      await db.close();
    }
  };
}

if (require.main === module) {
  createAppServer().then(app => {
    const port = process.env.PORT || 3000;
    app.start(port).then(actualPort => {
      console.log(`🌿 Pastel Routine PWA ejecutándose en http://localhost:${actualPort}`);
    });
  });
}

module.exports = {
  createAppServer
};
