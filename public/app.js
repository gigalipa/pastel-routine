const state = {
  token: localStorage.getItem('pastel_token') || null,
  authMode: 'login',
  catalog: null,
  dashboard: null,
  photos: { myPhotos: [], partnerPhotos: [] },
  compareAngle: 'all',
  beforePhotoId: null,
  afterPhotoId: null,
  activeWeek: 1,
  activeFocus: 1,
  quoteIndex: 0,
  modalVideoId: null
};

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const res = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
}

async function loadInitialData() {
  state.catalog = await api('/api/catalog');
  if (!state.token) {
    renderAuth();
    return;
  }
  try {
    await refreshDashboard();
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    document.getElementById('bottomNav').classList.remove('hidden');
    document.getElementById('userHeaderInfo').classList.remove('hidden');
  } catch {
    state.token = null;
    localStorage.removeItem('pastel_token');
    renderAuth();
  }
}

async function refreshDashboard() {
  const today = getLocalToday();
  const [dash, photos] = await Promise.all([
    api(`/api/dashboard?date=${today}`),
    api('/api/photos')
  ]);
  state.dashboard = dash;
  state.photos = photos;
  state.activeWeek = state.dashboard.me.user.currentWeek || 1;
  renderAll();
}

function renderAuth() {
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('appContent').classList.add('hidden');
  document.getElementById('bottomNav').classList.add('hidden');
  document.getElementById('userHeaderInfo').classList.add('hidden');
}

function renderAll() {
  if (!state.dashboard || !state.catalog) return;
  const { me, partners, cheers, quotes } = state.dashboard;

  document.getElementById('streakBadge').textContent = `🔥 ${me.streak} ${me.streak === 1 ? 'día' : 'días'}`;
  document.getElementById('todayDateLabel').textContent = `Hoy: ${me.todayDate}`;

  // Quotes
  if (quotes && quotes.length > 0) {
    const q = quotes[state.quoteIndex % quotes.length];
    document.getElementById('dailyQuoteText').textContent = `“${q.text}”`;
    document.getElementById('dailyQuoteAuthor').textContent = q.author;
  }

  // Partner Quick Strip in Today view
  const strip = document.getElementById('partnerQuickStrip');
  if (partners.length > 0) {
    const p = partners[0];
    const doneToday = p.todayBlocks.length;
    const safeName = escapeHtml(p.displayName);
    strip.classList.remove('hidden');
    strip.innerHTML = `
      <div>
        <strong>🤝 ${safeName}</strong> (Semana ${p.currentWeek} · 🔥 ${p.streak}d)<br/>
        <span class="muted">${doneToday > 0 ? `✅ Ya completó ${doneToday} bloque(s) hoy` : '⏳ Aún no registra bloques hoy'} · ${p.completedVideosCount}/${p.totalVideosCount} videos vistos</span>
      </div>
      <button class="btn btn-sm" type="button" onclick="quickCheer(${Number(p.id)}, '${safeName}')">
        👏 Enviar ánimo
      </button>
    `;
  } else {
    strip.classList.add('hidden');
  }

  renderTodayView();
  renderLibraryView();
  renderPartnersView(partners, cheers, me.user.inviteCode);
  renderPhotosView();
  renderSettingsView(me.user);
}

const ANGLE_LABELS = {
  front: 'Frente',
  profile_right: 'Perfil Der.',
  profile_left: 'Perfil Izq.',
  posture: 'Postura'
};

function photoImgUrl(photoId) {
  return `/api/photos/${Number(photoId)}/image?token=${encodeURIComponent(state.token || '')}`;
}

function renderPhotosView() {
  const { myPhotos, partnerPhotos } = state.photos || { myPhotos: [], partnerPhotos: [] };

  document.querySelectorAll('#compareAngleTabs .pill-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.angle === state.compareAngle);
  });

  const filteredMine = state.compareAngle === 'all'
    ? myPhotos
    : myPhotos.filter(p => p.angle === state.compareAngle);

  const compEl = document.getElementById('beforeAfterContainer');
  if (filteredMine.length === 0) {
    compEl.innerHTML = `<p class="muted" style="padding:12px 0;">Sube tu primera foto abajo para activar el comparador Antes y Después.</p>`;
  } else {
    const firstPhoto = filteredMine.find(p => p.id === Number(state.beforePhotoId)) || filteredMine[0];
    const lastPhoto = filteredMine.find(p => p.id === Number(state.afterPhotoId)) || filteredMine[filteredMine.length - 1];

    const optionsBefore = filteredMine.map(p =>
      `<option value="${p.id}" ${p.id === firstPhoto.id ? 'selected' : ''}>${p.takenAt} · Sem ${p.weekPhase} (${ANGLE_LABELS[p.angle] || p.angle})</option>`
    ).join('');

    const optionsAfter = filteredMine.map(p =>
      `<option value="${p.id}" ${p.id === lastPhoto.id ? 'selected' : ''}>${p.takenAt} · Sem ${p.weekPhase} (${ANGLE_LABELS[p.angle] || p.angle})</option>`
    ).join('');

    compEl.innerHTML = `
      <div class="compare-grid">
        <div class="compare-box">
          <strong>ANTES</strong>
          <select onchange="setBeforePhoto(this.value)" style="margin-top:6px; font-size:0.8rem; padding:6px;">${optionsBefore}</select>
          <img src="${photoImgUrl(firstPhoto.id)}" alt="Antes" loading="lazy" />
          <div class="muted" style="font-size:0.78rem; margin-top:4px;">${escapeHtml(firstPhoto.caption || `Semana ${firstPhoto.weekPhase}`)}</div>
        </div>
        <div class="compare-box">
          <strong>DESPUÉS</strong>
          <select onchange="setAfterPhoto(this.value)" style="margin-top:6px; font-size:0.8rem; padding:6px;">${optionsAfter}</select>
          <img src="${photoImgUrl(lastPhoto.id)}" alt="Después" loading="lazy" />
          <div class="muted" style="font-size:0.78rem; margin-top:4px;">${escapeHtml(lastPhoto.caption || `Semana ${lastPhoto.weekPhase}`)}</div>
        </div>
      </div>
    `;
  }

  const myGal = document.getElementById('myPhotosGallery');
  if (myPhotos.length === 0) {
    myGal.innerHTML = `<p class="muted">Aún no has subido fotos de tu proceso.</p>`;
  } else {
    myGal.innerHTML = myPhotos.slice().reverse().map(p => `
      <div class="photo-card">
        <img src="${photoImgUrl(p.id)}" alt="Foto" loading="lazy" />
        <div class="photo-card-body">
          <strong>${ANGLE_LABELS[p.angle] || p.angle} · Sem ${p.weekPhase}</strong>
          <div class="muted" style="font-size:0.75rem;">${p.takenAt} ${p.sharedWithPartner ? '· 👁️ Compartida' : '· 🔒 Privada'}</div>
          ${p.caption ? `<div style="margin-top:4px;">${escapeHtml(p.caption)}</div>` : ''}
          <button class="btn btn-secondary btn-sm" style="margin-top:6px; width:100%; color:#a64141;" type="button" onclick="removePhoto(${p.id})">
            🗑 Eliminar
          </button>
        </div>
      </div>
    `).join('');
  }

  const partGal = document.getElementById('partnerPhotosGallery');
  if (partnerPhotos.length === 0) {
    partGal.innerHTML = `<p class="muted">Tus compañeros aún no han compartido fotos.</p>`;
  } else {
    partGal.innerHTML = partnerPhotos.map(p => `
      <div class="photo-card">
        <img src="${photoImgUrl(p.id)}" alt="Foto compañero" loading="lazy" />
        <div class="photo-card-body">
          <strong>${escapeHtml(p.userName)} · Sem ${p.weekPhase}</strong>
          <div class="muted" style="font-size:0.75rem;">${ANGLE_LABELS[p.angle] || p.angle} · ${p.takenAt}</div>
          ${p.caption ? `<div style="margin-top:4px;">${escapeHtml(p.caption)}</div>` : ''}
          <button class="btn btn-sm" style="margin-top:6px; width:100%;" type="button" onclick="sendCustomCheer(${p.userId}, '📸 ¡Increíble tu foto de avance de la Semana ${p.weekPhase}!')">
            👏 Felicitar
          </button>
        </div>
      </div>
    `).join('');
  }
}

function compressImageFile(file, maxDim = 1080, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Archivo de imagen no válido.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderTodayView() {
  const { me } = state.dashboard;
  const weekPlan = state.catalog.weeklyPlan[String(state.activeWeek)] || state.catalog.weeklyPlan['1'];

  document.querySelectorAll('#weekSelectorTabs .pill-tab').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.week) === Number(state.activeWeek));
  });

  document.getElementById('weekPlanTitle').textContent = weekPlan.title;
  document.getElementById('weekPlanDesc').textContent = weekPlan.description;

  const safetyEl = document.getElementById('weekSafetyBanner');
  if (weekPlan.safetyWarning) {
    safetyEl.textContent = `⚠️ ${weekPlan.safetyWarning}`;
    safetyEl.classList.remove('hidden');
  } else {
    safetyEl.classList.add('hidden');
  }

  // Daily Checklist
  const checklistEl = document.getElementById('dailyChecklistContainer');
  checklistEl.innerHTML = weekPlan.dailyChecklist.map(item => {
    const isDone = me.todayBlocks.includes(item.id);
    const video = state.catalog.videos.find(v => v.id === item.videoId);
    return `
      <div class="checklist-item ${isDone ? 'done' : ''}">
        <button class="check-btn" type="button" onclick="toggleDailyChecklist('${item.id}')" title="Marcar práctica de hoy">
          ✓
        </button>
        <div class="item-body">
          <div class="item-title">${item.title}</div>
          <div>
            <span class="badge">⏱ ${item.duration}</span>
            ${video ? `<span class="badge">${video.focusTitle}</span>` : ''}
          </div>
        </div>
        ${video ? `<button class="btn btn-secondary btn-sm" type="button" onclick="openVideoModal('${video.id}')">▶ Ver video</button>` : ''}
      </div>
    `;
  }).join('');

  // Week Videos
  const weekVideosEl = document.getElementById('weekVideosContainer');
  const weekVids = weekPlan.videoIds
    .map(id => state.catalog.videos.find(v => v.id === id))
    .filter(Boolean);

  weekVideosEl.innerHTML = weekVids.map(v => renderVideoRow(v)).join('');
}

function renderVideoRow(v) {
  const { me } = state.dashboard;
  const prog = me.videoProgressMap[v.id];
  const isDone = Boolean(prog);
  return `
    <div class="video-item ${isDone ? 'done' : ''}">
      <button class="check-btn" type="button" onclick="toggleVideoQuick('${v.id}', ${isDone})" title="Marcar video como visto/aprendido">
        ✓
      </button>
      <div class="item-body" onclick="openVideoModal('${v.id}')" style="cursor:pointer;">
        <div class="item-title">${v.positionLabel} — ${v.title}</div>
        <p class="muted" style="font-size:0.84rem; margin-bottom:4px;">${v.description}</p>
        <div>
          <span class="badge">${v.category}</span>
          ${v.recommendedWeek ? `<span class="badge badge-week">Semana ${v.recommendedWeek}</span>` : ''}
          ${prog && prog.notes ? `<span class="badge">📝 Con nota</span>` : ''}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" onclick="openVideoModal('${v.id}')">▶ Ver</button>
    </div>
  `;
}

function renderLibraryView() {
  const { me } = state.dashboard;
  const pctGlobal = Math.round((me.completedVideosCount / me.totalVideosCount) * 100) || 0;
  document.getElementById('globalProgressSummary').innerHTML = `
    <div style="display:flex; justify-content:space-between; font-size:0.88rem; font-weight:600;">
      <span>Progreso Total del Catálogo</span>
      <span>${me.completedVideosCount} / ${me.totalVideosCount} videos (${pctGlobal}%)</span>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pctGlobal}%"></div>
    </div>
  `;

  const focusTabsEl = document.getElementById('focusSelectorTabs');
  focusTabsEl.innerHTML = state.catalog.focuses.map(f => {
    const fp = me.focusProgress.find(x => x.focusId === f.id) || { completed: 0, total: 0 };
    return `
      <button class="pill-tab ${state.activeFocus === f.id ? 'active' : ''}" type="button" onclick="selectFocus(${f.id})">
        ${f.icon} ${f.title} (${fp.completed}/${fp.total})
      </button>
    `;
  }).join('');

  const query = (document.getElementById('searchVideosInput').value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('filterStatusSelect').value;

  const filtered = state.catalog.videos.filter(v => {
    if (!query && v.focusId !== state.activeFocus) return false;
    const isDone = Boolean(me.videoProgressMap[v.id]);
    if (statusFilter === 'pending' && isDone) return false;
    if (statusFilter === 'done' && !isDone) return false;
    if (query) {
      const hay = `${v.title} ${v.description} ${v.category} ${v.positionLabel}`.toLowerCase();
      return hay.includes(query);
    }
    return true;
  });

  const listEl = document.getElementById('libraryVideosList');
  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="muted" style="padding:16px 0; text-align:center;">No hay videos que coincidan con este filtro.</p>`;
  } else {
    listEl.innerHTML = filtered.map(v => renderVideoRow(v)).join('');
  }
}

function renderPartnersView(partners, cheers, inviteCode) {
  document.getElementById('myInviteCodeInput').value = inviteCode || '';

  const pContainer = document.getElementById('partnersListContainer');
  if (partners.length === 0) {
    pContainer.innerHTML = `
      <div class="card">
        <p class="muted">Aún no has vinculado ningún compañero. Pídele a tu esposa o familiar su código <strong>PATEL-XXXX</strong> e ingrésalo arriba para ver el progreso mutuo.</p>
      </div>
    `;
  } else {
    pContainer.innerHTML = partners.map(p => {
      const pct = Math.round((p.completedVideosCount / p.totalVideosCount) * 100) || 0;
      const focusBars = p.focusProgress.map(fp => `
        <div style="margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
            <span>${fp.title}</span>
            <span>${fp.completed}/${fp.total} (${fp.percent}%)</span>
          </div>
          <div class="progress-bar-wrap" style="height:6px; margin:3px 0;">
            <div class="progress-bar-fill" style="width:${fp.percent}%"></div>
          </div>
        </div>
      `).join('');

      const recentVids = p.recentVideos.length > 0
        ? p.recentVideos.map(rv => `<li style="font-size:0.84rem; margin-left:16px;">${escapeHtml(rv.title)}</li>`).join('')
        : '<li class="muted" style="font-size:0.84rem; margin-left:16px;">Sin videos marcados aún</li>';

      const safePartnerName = escapeHtml(p.displayName);

      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
              <h3>${safePartnerName}</h3>
              <span class="badge badge-week">Semana ${p.currentWeek}</span>
              <span class="badge">${p.todayBlocks.length > 0 ? `✅ ${p.todayBlocks.length} bloque(s) hoy` : '⏳ Pendiente hoy'}</span>
            </div>
            <span class="streak-pill">🔥 ${p.streak} días</span>
          </div>

          <div style="font-size:0.88rem; font-weight:600; margin-top:8px;">
            Avance total: ${p.completedVideosCount} / ${p.totalVideosCount} videos (${pct}%)
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>

          <div style="margin-top:10px;">${focusBars}</div>

          <div style="margin-top:10px;">
            <strong style="font-size:0.85rem;">Últimos videos completados:</strong>
            <ul style="margin-top:4px;">${recentVids}</ul>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:14px;">
            <button class="btn btn-sm" type="button" onclick="sendCustomCheer(${Number(p.id)}, '👏 ¡Orgulloso de tu constancia hoy!')">
              👏 ¡Gran constancia!
            </button>
            <button class="btn btn-secondary btn-sm" type="button" onclick="sendCustomCheer(${Number(p.id)}, '🌿 Recuerda relajar la mandíbula y respirar hacia la espalda (Backbreathing)')">
              🌿 Recordar Backbreathing
            </button>
            <button class="btn btn-secondary btn-sm" type="button" onclick="promptCheer(${Number(p.id)}, '${safePartnerName}')">
              ✍️ Mensaje personalizado
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  const cheersEl = document.getElementById('cheersHistoryContainer');
  if (!cheers || cheers.length === 0) {
    cheersEl.innerHTML = `<p class="muted">Aún no has recibido mensajes de ánimo.</p>`;
  } else {
    cheersEl.innerHTML = cheers.map(c => `
      <div style="padding:10px 0; border-bottom:1px solid var(--border);">
        <strong>${escapeHtml(c.fromName)}:</strong> ${escapeHtml(c.message)}
        <div class="muted" style="font-size:0.76rem;">${new Date(c.createdAt).toLocaleString()}</div>
      </div>
    `).join('');
  }
}

function renderSettingsView(user) {
  document.getElementById('settingsName').value = user.displayName || '';
  document.getElementById('settingsTime').value = user.reminderTime || '08:00';
  document.getElementById('adminCard').classList.toggle('hidden', user.role !== 'admin');
}

// Actions
window.selectFocus = function(focusId) {
  state.activeFocus = focusId;
  renderLibraryView();
};

window.setBeforePhoto = function(id) {
  state.beforePhotoId = Number(id);
  renderPhotosView();
};

window.setAfterPhoto = function(id) {
  state.afterPhotoId = Number(id);
  renderPhotosView();
};

window.removePhoto = async function(photoId) {
  try {
    await api(`/api/photos/${Number(photoId)}`, { method: 'DELETE' });
    await refreshDashboard();
    showToast('🗑 Foto eliminada');
  } catch (err) {
    showToast(err.message);
  }
};

window.toggleDailyChecklist = async function(blockId) {
  try {
    await api('/api/progress/daily', {
      method: 'POST',
      body: { date: getLocalToday(), weekPhase: state.activeWeek, blockId }
    });
    await refreshDashboard();
  } catch (err) {
    showToast(err.message);
  }
};

window.toggleVideoQuick = async function(videoId, currentlyDone) {
  try {
    await api('/api/progress/video', {
      method: 'POST',
      body: { videoId, notes: currentlyDone ? null : '' }
    });
    await refreshDashboard();
    showToast(currentlyDone ? 'Video desmarcado' : '✓ Video marcado como aprendido');
  } catch (err) {
    showToast(err.message);
  }
};

window.openVideoModal = function(videoId) {
  const video = state.catalog.videos.find(v => v.id === videoId);
  if (!video) return;
  state.modalVideoId = videoId;

  const prog = state.dashboard.me.videoProgressMap[videoId];
  document.getElementById('modalVideoBadge').textContent = `${video.focusTitle} · ${video.positionLabel}`;
  document.getElementById('modalVideoTitle').textContent = video.title;
  document.getElementById('modalVideoDesc').textContent = video.description;
  document.getElementById('modalVideoNotes').value = prog ? prog.notes || '' : '';
  document.getElementById('modalYoutubeLink').href = video.url;

  const btn = document.getElementById('modalToggleCompleteBtn');
  btn.textContent = prog ? '💾 Guardar nota / Desmarcar' : '✓ Marcar como visto y guardar nota';

  const frame = document.getElementById('modalVideoFrame');
  if (video.youtubeId) {
    frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${video.youtubeId}?rel=0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
  } else {
    frame.innerHTML = '';
  }

  document.getElementById('videoModal').classList.remove('hidden');
};

window.quickCheer = async function(partnerId, name) {
  await sendCustomCheer(partnerId, `👏 ¡Vamos con toda hoy en la rutina, ${name}!`);
};

window.sendCustomCheer = async function(toUserId, message) {
  try {
    await api('/api/cheers', {
      method: 'POST',
      body: { toUserId, message }
    });
    showToast('💌 ¡Ánimo enviado a tu compañero!');
  } catch (err) {
    showToast(err.message);
  }
};

window.promptCheer = async function(toUserId, name) {
  const msg = window.prompt(`Escribe un mensaje motivador para ${name}:`, '🌟 ¡Excelente avance esta semana!');
  if (msg && msg.trim()) {
    await sendCustomCheer(toUserId, msg.trim());
  }
};

// Event Listeners
document.getElementById('tabLoginBtn').addEventListener('click', () => {
  state.authMode = 'login';
  document.getElementById('tabLoginBtn').classList.add('active');
  document.getElementById('tabRegisterBtn').classList.remove('active');
  document.getElementById('registerNameGroup').classList.add('hidden');
  document.getElementById('authSubmitBtn').textContent = 'Entrar a mi rutina';
});

document.getElementById('tabRegisterBtn').addEventListener('click', () => {
  state.authMode = 'register';
  document.getElementById('tabRegisterBtn').classList.add('active');
  document.getElementById('tabLoginBtn').classList.remove('active');
  document.getElementById('registerNameGroup').classList.remove('hidden');
  document.getElementById('authSubmitBtn').textContent = 'Crear mi cuenta';
});

document.getElementById('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const displayName = document.getElementById('authName').value;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';

  try {
    const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const res = await api(endpoint, {
      method: 'POST',
      body: { email, password, displayName, timezone }
    });
    state.token = res.token;
    localStorage.setItem('pastel_token', res.token);
    await loadInitialData();
    showToast(`¡Bienvenido/a, ${res.user.displayName}!`);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('nextQuoteBtn').addEventListener('click', () => {
  state.quoteIndex++;
  renderAll();
});

document.querySelectorAll('#weekSelectorTabs .pill-tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    const nextWeek = Number(btn.dataset.week);
    state.activeWeek = nextWeek;
    try {
      await api('/api/settings', {
        method: 'POST',
        body: { currentWeek: nextWeek }
      });
      await refreshDashboard();
      showToast(`Cambiado a Semana ${nextWeek}`);
    } catch (err) {
      showToast(err.message);
    }
  });
});

document.getElementById('searchVideosInput').addEventListener('input', () => renderLibraryView());
document.getElementById('filterStatusSelect').addEventListener('change', () => renderLibraryView());

document.getElementById('copyInviteBtn').addEventListener('click', () => {
  const code = document.getElementById('myInviteCodeInput').value;
  navigator.clipboard?.writeText(code);
  showToast(`Código ${code} copiado`);
});

document.getElementById('connectPartnerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const code = document.getElementById('partnerCodeInput').value;
  try {
    const res = await api('/api/partners/connect', {
      method: 'POST',
      body: { inviteCode: code }
    });
    document.getElementById('partnerCodeInput').value = '';
    await refreshDashboard();
    showToast(`🤝 Vinculado con ${res.partner.displayName}`);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const displayName = document.getElementById('settingsName').value;
  const reminderTime = document.getElementById('settingsTime').value;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';
  try {
    await api('/api/settings', {
      method: 'POST',
      body: { displayName, reminderTime, timezone }
    });
    await refreshDashboard();
    showToast('Ajustes guardados');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('enablePushBtn').addEventListener('click', async () => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Tu navegador no soporta Notificaciones Push nativas.');
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      throw new Error('Permiso de notificaciones denegado.');
    }
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api('/api/vapid-public-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await api('/api/push/subscribe', {
      method: 'POST',
      body: { subscription: sub }
    });
    showToast('📲 ¡Notificaciones Push activadas en este dispositivo!');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('testPushBtn').addEventListener('click', async () => {
  try {
    const res = await api('/api/push/test', { method: 'POST' });
    if (res.sent > 0) {
      showToast('✨ Notificación enviada');
    } else {
      showToast(`Frase: "${res.quote.text}" (Activa Push primero para recibirla en el sistema)`);
    }
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('downloadIcsBtn').addEventListener('click', () => {
  if (!state.token) return;
  window.location.href = `/api/calendar.ics?token=${encodeURIComponent(state.token)}`;
});

document.getElementById('syncSheetBtn').addEventListener('click', async () => {
  try {
    showToast('Sincronizando con Google Sheet...');
    const res = await api('/api/admin/sync-sheet', { method: 'POST' });
    state.catalog = await api('/api/catalog');
    renderAll();
    showToast(`✅ Catálogo actualizado (${res.count} videos)`);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  state.token = null;
  localStorage.removeItem('pastel_token');
  renderAuth();
});

document.getElementById('closeModalBtn').addEventListener('click', () => {
  document.getElementById('modalVideoFrame').innerHTML = '';
  document.getElementById('videoModal').classList.add('hidden');
});

document.getElementById('modalToggleCompleteBtn').addEventListener('click', async () => {
  if (!state.modalVideoId) return;
  const notes = document.getElementById('modalVideoNotes').value.trim();
  const isAlreadyDone = Boolean(state.dashboard.me.videoProgressMap[state.modalVideoId]);
  try {
    await api('/api/progress/video', {
      method: 'POST',
      body: {
        videoId: state.modalVideoId,
        notes: isAlreadyDone && !notes ? null : notes
      }
    });
    document.getElementById('modalVideoFrame').innerHTML = '';
    document.getElementById('videoModal').classList.add('hidden');
    await refreshDashboard();
    showToast('Progreso actualizado');
  } catch (err) {
    showToast(err.message);
  }
});

document.querySelectorAll('#bottomNav .nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('#bottomNav .nav-btn').forEach(b => b.classList.toggle('active', b === btn));
    ['Today', 'Library', 'Partners', 'Photos', 'Settings'].forEach(name => {
      document.getElementById(`view${name}`).classList.toggle('hidden', name !== tab);
    });
  });
});

document.querySelectorAll('#compareAngleTabs .pill-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    state.compareAngle = btn.dataset.angle;
    state.beforePhotoId = null;
    state.afterPhotoId = null;
    renderPhotosView();
  });
});

document.getElementById('uploadPhotoForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fileInput = document.getElementById('photoFileInput');
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const btn = document.getElementById('uploadPhotoBtn');
  btn.disabled = true;
  btn.textContent = 'Optimizando y guardando...';

  try {
    const imageDataUrl = await compressImageFile(file);
    await api('/api/photos', {
      method: 'POST',
      body: {
        angle: document.getElementById('photoAngleSelect').value,
        weekPhase: Number(document.getElementById('photoWeekSelect').value),
        caption: document.getElementById('photoCaptionInput').value,
        sharedWithPartner: document.getElementById('photoShareCheckbox').checked,
        takenAt: getLocalToday(),
        imageDataUrl
      }
    });
    fileInput.value = '';
    document.getElementById('photoCaptionInput').value = '';
    await refreshDashboard();
    showToast('📸 ¡Foto de proceso guardada!');
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Guardar Foto de Proceso';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

loadInitialData();
