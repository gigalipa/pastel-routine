const fs = require('node:fs');
const path = require('node:path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const QUOTES_PATH = path.join(__dirname, '..', 'data', 'quotes.json');

let cachedCatalog = null;
let cachedQuotes = null;

function getCatalog() {
  if (!cachedCatalog) {
    cachedCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  }
  return cachedCatalog;
}

function reloadCatalog() {
  cachedCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return cachedCatalog;
}

function getVideoById(videoId) {
  const catalog = getCatalog();
  return catalog.videos.find(v => v.id === videoId) || null;
}

function getQuotesForWeek(weekNumber = 1, topic = null) {
  if (!cachedQuotes) {
    cachedQuotes = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8'));
  }
  const wk = Number(weekNumber) || 1;
  let list = cachedQuotes.filter(q => q.week === wk || q.topic === 'couple');
  if (topic) {
    const byTopic = list.filter(q => q.topic === topic);
    if (byTopic.length > 0) list = byTopic;
  }
  return list.length > 0 ? list : cachedQuotes;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function syncFromGoogleSheet(spreadsheetId = '1_9I1Y-rphLZZqZnszklEOGl3bxvUzjX72nr5oyRWq3E') {
  const catalog = getCatalog();
  const sheetNames = [
    { id: 1, name: '1. Cara y Ortotropía' },
    { id: 2, name: '2. Postura y Cuerpo' },
    { id: 3, name: '3. Fascia y Sistema Nervioso' },
    { id: 4, name: '4. Mentalidad e Integrales' }
  ];

  const updatedVideos = [];
  for (const sheet of sheetNames) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet.name)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`No se pudo descargar la hoja ${sheet.name} (${res.status})`);
    }
    const csvText = await res.text();
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvLine(lines[r]);
      if (cols.length < 6) continue;

      let positionLabel, title, description, category, focusTags, originRaw, videoUrl;
      if (cols.length >= 7) {
        [positionLabel, title, description, category, focusTags, originRaw, videoUrl] = cols;
      } else {
        [positionLabel, title, description, category, focusTags, videoUrl] = cols;
        originRaw = 'Oscar Patel';
      }

      const posMatch = positionLabel.match(/^(\d+)/);
      const position = posMatch ? parseInt(posMatch[1], 10) : r;
      const ytMatch = videoUrl ? videoUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/) : null;
      const youtubeId = ytMatch ? ytMatch[1] : '';
      const id = `e${sheet.id}-p${position}`;
      const existing = catalog.videos.find(v => v.id === id);

      const origin = (originRaw && originRaw.toLowerCase().includes('health is looks'))
        ? 'Health Is Looks'
        : 'Oscar Patel';

      updatedVideos.push({
        id,
        focusId: sheet.id,
        focusTitle: sheet.name,
        position,
        positionLabel,
        title,
        description,
        category,
        focusTags,
        origin,
        originRaw: originRaw || 'Oscar Patel',
        url: videoUrl,
        youtubeId,
        recommendedWeek: existing ? existing.recommendedWeek : null,
        weekRole: existing ? existing.weekRole : null
      });
    }
  }

  if (updatedVideos.length > 0) {
    catalog.spreadsheetId = spreadsheetId;
    catalog.videos = updatedVideos;
    catalog.updatedAt = new Date().toISOString();
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    reloadCatalog();
  }
  return catalog;
}

module.exports = {
  getCatalog,
  reloadCatalog,
  getVideoById,
  getQuotesForWeek,
  syncFromGoogleSheet
};
