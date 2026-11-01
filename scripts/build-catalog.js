const fs = require('node:fs');
const path = require('node:path');

const rawPath = 'C:\\Users\\peraz\\.gemini\\antigravity\\brain\\f7d9506a-5c1d-4665-a1a9-3519f60228aa\\.system_generated\\steps\\11\\output.txt';
const rawText = fs.readFileSync(rawPath, 'utf8');

const focusDefs = [
  { id: 1, key: '--- 1. Cara y Ortotropía ---', title: '1. Cara y Ortotropía', subtitle: 'Postura lingual, deglución, masticación, drenaje linfático y remodelación maxilar', icon: '✨', color: '#e8a598' },
  { id: 2, key: '--- 2. Postura y Cuerpo ---', title: '2. Postura y Cuerpo', subtitle: 'Conexión pie-cráneo, pelvis, postura al dormir, cuello y simetría corporal', icon: '🧘', color: '#9ab89d' },
  { id: 3, key: '--- 3. Fascia y Sistema Nervioso ---', title: '3. Fascia y Sistema Nervioso', subtitle: 'Regulación vagal, respiración Backbreathing, liberación de trauma y Fasciapulling', icon: '🌿', color: '#8fb4c9' },
  { id: 4, key: '--- 4. Mentalidad e Integrales ---', title: '4. Mentalidad e Integrales', subtitle: 'Transformación personal, hábitos pilares diarios y la guía maestra 2026', icon: '🌟', color: '#d6b88d' }
];

const videos = [];

for (let i = 0; i < focusDefs.length; i++) {
  const current = focusDefs[i];
  const next = focusDefs[i + 1];
  const startIdx = rawText.indexOf(current.key) + current.key.length;
  const endIdx = next ? rawText.indexOf(next.key) : rawText.length;
  const jsonText = rawText.slice(startIdx, endIdx).trim();
  const rows = JSON.parse(jsonText);

  for (let r = 1; r < rows.length; r++) {
    const [positionLabel, title, description, category, focusTags, url] = rows[r];
    const posMatch = positionLabel.match(/^(\d+)/);
    const position = posMatch ? parseInt(posMatch[1], 10) : r;
    const ytMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const youtubeId = ytMatch ? ytMatch[1] : '';
    const id = `e${current.id}-p${position}`;

    let recommendedWeek = null;
    let weekRole = null;
    if (current.id === 4 && position === 6) {
      recommendedWeek = 1;
      weekRole = 'Mapa General (Semana 1 y Cierre)';
    } else if (current.id === 3 && position >= 1 && position <= 8) {
      recommendedWeek = 1;
      weekRole = 'Semana 1: Respiración Backbreathing y Regulación Nerviosa';
    } else if (current.id === 1 && position >= 1 && position <= 7) {
      recommendedWeek = 1;
      weekRole = 'Semana 1: Postura Lingual y Deglución';
    } else if (current.id === 3 && position === 14) {
      recommendedWeek = 2;
      weekRole = 'Semana 2: Rutina Diaria de 6 Minutos de Fascia';
    } else if (current.id === 2 && [3, 9, 10].includes(position)) {
      recommendedWeek = 2;
      weekRole = 'Semana 2: Corrección de Cuello y Postura de Pies';
    } else if (current.id === 3 && position === 15) {
      recommendedWeek = 3;
      weekRole = 'Semana 3+: Masterclass de Fasciapulling';
    } else if (current.id === 1 && position === 30) {
      recommendedWeek = 3;
      weekRole = 'Semana 3+: Rutina 5 Minutos de Thumbpulling 2.0';
    }

    videos.push({
      id,
      focusId: current.id,
      focusTitle: current.title,
      position,
      positionLabel,
      title,
      description,
      category,
      focusTags,
      url,
      youtubeId,
      recommendedWeek,
      weekRole
    });
  }
}

const weeklyPlan = {
  '1': {
    week: 1,
    title: 'Semana 1: Conciencia y Calma',
    subtitle: 'Regulación del sistema nervioso, respiración Backbreathing y postura lingual en reposo',
    description: 'Ve la Posición 6 del Enfoque 4 (Full 2026 Guide) como mapa general y aplica únicamente los videos de Posición 1 a 8 del Enfoque 3 (Respiración Backbreathing y regulación del sistema nervioso) junto con las Posiciones 1 a 7 del Enfoque 1 (Postura lingual y deglución).',
    safetyWarning: null,
    coreVideoIds: ['e4-p6', 'e3-p4', 'e3-p6', 'e3-p7', 'e1-p6', 'e1-p7'],
    videoIds: [
      'e4-p6',
      'e3-p1', 'e3-p2', 'e3-p3', 'e3-p4', 'e3-p5', 'e3-p6', 'e3-p7', 'e3-p8',
      'e1-p1', 'e1-p2', 'e1-p3', 'e1-p4', 'e1-p5', 'e1-p6', 'e1-p7'
    ],
    dailyChecklist: [
      { id: 'w1-map', title: 'Mapa General (1 vez en la semana): Full 2026 Guide', videoId: 'e4-p6', duration: '45 min' },
      { id: 'w1-breath', title: 'Práctica de Respiración Backbreathing (360° dorsal)', videoId: 'e3-p4', duration: '5 min' },
      { id: 'w1-nervous', title: 'Reinicio del Sistema Nervioso y Nervio Vago', videoId: 'e3-p7', duration: '8 min' },
      { id: 'w1-tongue', title: 'Postura Lingual por Succión Natural (Sin apretar dientes)', videoId: 'e1-p6', duration: 'Hábito continuo' },
      { id: 'w1-swallow', title: 'Deglución Correcta sin usar Mejillas', videoId: 'e1-p7', duration: 'En cada comida' }
    ]
  },
  '2': {
    week: 2,
    title: 'Semana 2: Desbloqueo Corporal y Fascial',
    subtitle: 'Hidratación de fascia superficial, corrección de cuello adelantado y activación del arco plantar',
    description: 'Incorpora la Rutina de 6 minutos de Fascia (Posición 14 del Enfoque 3) y la corrección de cuello y postura de pies (Posiciones 3, 9 y 10 del Enfoque 2), manteniendo la calma respiratoria y postura lingual de la Semana 1.',
    safetyWarning: null,
    coreVideoIds: ['e3-p14', 'e2-p3', 'e2-p9', 'e2-p10'],
    videoIds: [
      'e3-p14', 'e2-p3', 'e2-p9', 'e2-p10',
      'e3-p4', 'e1-p6', 'e1-p7'
    ],
    dailyChecklist: [
      { id: 'w2-fascia6', title: 'Rutina Diaria de 6 Minutos de Liberación de Fascia', videoId: 'e3-p14', duration: '6 min' },
      { id: 'w2-feet', title: 'Activación del Tendón del Dedo Gordo y Arco Plantar', videoId: 'e2-p3', duration: '5 min' },
      { id: 'w2-neck', title: 'Corrección de Cuello Adelantado (Forward Head Posture)', videoId: 'e2-p9', duration: '6 min' },
      { id: 'w2-sitting', title: 'Desbloqueo Postural por Sedentarismo (Cadera y Tórax)', videoId: 'e2-p10', duration: '10 min' },
      { id: 'w2-base', title: 'Mantener Hábitos Base: Backbreathing + Succión Lingual', videoId: 'e3-p4', duration: 'Todo el día' }
    ]
  },
  '3': {
    week: 3,
    title: 'Semana 3 en adelante: Remodelación Activa',
    subtitle: 'Fasciapulling craneal profundo y protocolo diario de Thumbpulling 2.0',
    description: 'Una vez que no exista tensión mandibular ni cervical, integra la Masterclass de Fasciapulling (Posición 15 del Enfoque 3) y la Rutina de 5 minutos de Thumbpulling 2.0 (Posición 30 del Enfoque 1).',
    safetyWarning: 'Importante: Realiza esta fase únicamente cuando NO exista tensión mandibular (ATM) ni cervical. Si sientes rigidez en el cuello o mandíbula, vuelve unos días a la Semana 1 y 2 para soltar la fascia y calmar el sistema nervioso.',
    coreVideoIds: ['e3-p15', 'e1-p30'],
    videoIds: [
      'e3-p15', 'e1-p30',
      'e3-p14', 'e2-p3', 'e2-p9', 'e1-p6'
    ],
    dailyChecklist: [
      { id: 'w3-safety', title: 'Chequeo de Calma: Mandíbula y cuello libres de tensión + Backbreathing', videoId: 'e3-p6', duration: '2 min' },
      { id: 'w3-fasciapulling', title: 'Masterclass de Fasciapulling (Remodelación Miofascial)', videoId: 'e3-p15', duration: '23 min' },
      { id: 'w3-thumbpulling', title: 'Rutina Diaria de 5 Minutos de Thumbpulling 2.0', videoId: 'e1-p30', duration: '5 min' },
      { id: 'w3-posture', title: 'Mantenimiento Postural: Pisada activa y Lengua en paladar', videoId: 'e2-p3', duration: 'Todo el día' }
    ]
  }
};

const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'catalog.json'),
  JSON.stringify({
    spreadsheetId: '1UAVeVGK7lRMrI5H0Aj7MjdEeoOE4R_rJx0ZeSduc4Qw',
    updatedAt: new Date().toISOString(),
    focuses: focusDefs.map(({ id, title, subtitle, icon, color }) => ({ id, title, subtitle, icon, color })),
    weeklyPlan,
    videos
  }, null, 2),
  'utf8'
);

console.log(`Built catalog.json with ${videos.length} videos.`);
