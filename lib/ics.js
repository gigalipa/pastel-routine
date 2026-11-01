function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function generateIcs({ displayName, reminderTime = '08:00', weekPhase = 1, weeklyPlan, appUrl = '' }) {
  const plan = weeklyPlan[String(weekPhase)] || weeklyPlan['1'];
  const [hh, mm] = (reminderTime || '08:00').split(':').map(n => String(n).padStart(2, '0'));
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');

  const dtStart = `${y}${m}${d}T${hh}${mm}00`;
  const endHour = String((Number(hh) + 1) % 24).padStart(2, '0');
  const dtEnd = `${y}${m}${d}T${endHour}${mm}00`;
  const dtStamp = `${y}${m}${d}T000000Z`;

  const checklistLines = (plan.dailyChecklist || [])
    .map((item, i) => `${i + 1}. ${item.title} (${item.duration})`)
    .join('\n');

  const description = [
    `Hola ${displayName || ''}, es hora de tu rutina diaria de Oscar Patel (${plan.title}).`,
    '',
    plan.description,
    '',
    'Checklist de hoy:',
    checklistLines,
    appUrl ? `\nAbre tu app: ${appUrl}` : ''
  ].join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pastel Routine//Oscar Patel Tracker//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:pastel-routine-week-${weekPhase}@pastelroutine.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeIcsText(`🌿 Rutina Oscar Patel — ${plan.title}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de tu rutina diaria de Oscar Patel',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n') + '\r\n';
}

module.exports = {
  generateIcs
};
