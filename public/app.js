/* CubaXnova Studio — interfaz web (sin framework, a propósito: fácil de leer y modificar). */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const fileUrl = (p, dl) => `/api/files?path=${encodeURIComponent(p)}${dl ? '&download=1' : ''}`;
// Convierte los enlaces a archivos locales en enlaces que abren el archivo, y muestra las imágenes dentro del chat.
function md(s) {
  const tpl = document.createElement('template');
  tpl.innerHTML = DOMPurify.sanitize(marked.parse(String(s ?? '')));
  for (const a of tpl.content.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; continue; }
    const url = `/api/files?path=${encodeURIComponent(href)}`;
    a.href = url; a.target = '_blank';
    if (IMG_RE.test(href.split('#')[0])) {
      const img = document.createElement('img');
      img.src = url; img.className = 'preview'; img.alt = href;
      img.onerror = () => img.remove();
      a.after(img);
    }
  }
  for (const img of tpl.content.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!/^(https?:|data:|\/api\/files)/i.test(src)) img.src = `/api/files?path=${encodeURIComponent(src)}`;
  }
  return tpl.innerHTML;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('No autenticado'); }
  if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

let library = { agents: [], skills: [] };
let provider = store.get('provider') === 'claude' ? 'claude' : 'codex';
let statusInfo = null;
function renderBrain() {
  const b = $('#brainBtn');
  b.textContent = provider === 'claude' ? '🧠 Claude' : '🧠 Codex';
  b.className = `btn ghost brain ${provider}`;
  b.title = provider === 'claude'
    ? `Cerebro: Claude Code${statusInfo && !statusInfo.claudeOk ? ' (sin sesión: npm run claude-login)' : ''}. Toca para cambiar a Codex.`
    : 'Cerebro: Codex. Toca para cambiar a Claude Code.';
}
let chatId = store.get('chatId');
let busy = false;

/* ---------------- Login ---------------- */
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#password').focus(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try { await api('/login', { method: 'POST', body: { password: $('#password').value } }); start(); }
  catch (err) { $('#loginError').textContent = err.message; }
});
$('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); location.reload(); });

/* ---------------- Navegación ---------------- */
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.tabpane').forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${t.dataset.tab}`));
  if (t.dataset.tab === 'chats') { loadChats(); loadSettings(); }
  if (t.dataset.tab === 'files') loadFiles(currentDir);
}));
const openTab = (name) => $(`.tab[data-tab="${name}"]`).click();
$$('.bottomnav button').forEach((b) => b.addEventListener('click', () => {
  $('.layout').dataset.view = b.dataset.view;
  $$('.bottomnav button').forEach((x) => x.classList.toggle('active', x === b));
  if (b.dataset.view === 'terminal') setTimeout(fitTerm, 50);
  if (b.dataset.view === 'files') openTab('files');
  if (b.dataset.view === 'library' && $('.tab.active')?.dataset.tab === 'files') openTab('agents');
}));

/* ---------------- Librería: agentes y skills ---------------- */
async function loadLibrary() {
  library = await api('/library');
  renderAgents(); renderSkills(); renderAgentSelect();
}

function itemHTML(x, kind) {
  const badge = kind === 'agent'
    ? `<span class="badge ${x.role === 'principal' ? 'main' : ''}">${x.role}</span>`
    : `<span class="badge">${esc(x.source.replace('github.com/', ''))}</span>`;
  return `<li class="item ${x.enabled ? '' : 'off'}">
    <div class="name">${esc(x.name)} ${badge}</div>
    <div class="actions">
      <label class="switch" title="${x.enabled ? 'Desactivar' : 'Activar'}"><input type="checkbox" data-toggle="${kind}:${x.id}" ${x.enabled ? 'checked' : ''}><span></span></label>
      ${x.builtin ? '' : `<button class="icon-btn" data-del="${kind}:${x.id}" title="Eliminar">✕</button>`}
    </div>
    <div class="desc">${esc(x.description)}</div>
  </li>`;
}
function renderAgents() { $('#agentList').innerHTML = library.agents.map((a) => itemHTML(a, 'agent')).join('') || '<p class="muted">No hay agentes.</p>'; }
function renderSkills() { $('#skillList').innerHTML = [...library.skills].sort((a, b) => b.enabled - a.enabled).map((s) => itemHTML(s, 'skill')).join('') || '<p class="muted">No hay skills.</p>'; }
function renderAgentSelect() {
  const enabled = library.agents.filter((a) => a.enabled);
  const mains = enabled.filter((a) => a.role === 'principal');
  const opts = mains.length ? mains : enabled;
  const prev = store.get('agent');
  $('#agentSelect').innerHTML = opts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  if (opts.some((a) => a.id === prev)) $('#agentSelect').value = prev;
}
$('#agentSelect').addEventListener('change', (e) => store.set('agent', e.target.value));

document.addEventListener('change', async (e) => {
  const t = e.target.dataset?.toggle;
  if (!t) return;
  const [kind, id] = t.split(':');
  try { await api(`/${kind}s/${id}/toggle`, { method: 'POST', body: { enabled: e.target.checked } }); }
  catch (err) { alert(err.message); }
  loadLibrary();
});
document.addEventListener('click', async (e) => {
  if (e.target.classList?.contains('desc')) e.target.classList.toggle('open');
  const d = e.target.dataset?.del;
  if (!d) return;
  const [kind, id] = d.split(':');
  if (!confirm(`¿Eliminar ${kind === 'agent' ? 'el agente' : 'la skill'} "${id}"? Se borra del disco.`)) return;
  try { await api(`/${kind}s/${id}`, { method: 'DELETE' }); } catch (err) { alert(err.message); }
  loadLibrary();
});

const formData = (f) => Object.fromEntries(new FormData(f).entries());
$('#agentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/agents', { method: 'POST', body: formData(e.target) }); e.target.reset(); e.target.closest('details').open = false; loadLibrary(); }
  catch (err) { alert(err.message); }
});
$('#skillForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/skills', { method: 'POST', body: formData(e.target) }); e.target.reset(); e.target.closest('details').open = false; loadLibrary(); }
  catch (err) { alert(err.message); }
});
$('#importPreset').addEventListener('change', (e) => {
  const custom = e.target.value === 'custom';
  $$('#importForm input').forEach((i) => i.classList.toggle('hidden', !custom));
});
$('#importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const preset = $('#importPreset').value;
  const [repo, path] = preset === 'custom' ? [e.target.repo.value.trim(), e.target.path.value.trim()] : preset.split('|');
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Importando…';
  try {
    const r = await api('/skills/import', { method: 'POST', body: { repo, path } });
    alert(r.imported.length ? `Importadas ${r.imported.length} skills (desactivadas). Actívalas las que quieras.` : 'No había skills nuevas.');
    loadLibrary();
  } catch (err) { alert(err.message); }
  btn.disabled = false; btn.textContent = 'Importar (llegan desactivadas)';
});

/* ---------------- Chats guardados ---------------- */
async function loadChats() {
  const chats = await api('/chats');
  $('#chatList').innerHTML = chats.map((c) => `<li class="item chat-item ${c.id === chatId ? 'current' : ''}" data-open="${c.id}">
    <div class="name">${esc(c.title || 'Sin título')}</div>
    <div class="actions"><button class="icon-btn" data-delchat="${c.id}" title="Borrar">✕</button></div>
    <div class="desc">${new Date(c.updated).toLocaleString()}</div></li>`).join('') || '<p class="muted">Aún no hay chats.</p>';
}
$('#chatList').addEventListener('click', async (e) => {
  const del = e.target.dataset.delchat;
  if (del) {
    e.stopPropagation();
    if (!confirm('¿Borrar este chat?')) return;
    await api(`/chats/${del}`, { method: 'DELETE' });
    if (del === chatId) newChat();
    return loadChats();
  }
  const li = e.target.closest('[data-open]');
  if (li) { await openChat(li.dataset.open); loadChats(); $('.bottomnav [data-view="chat"]').click(); }
});
$('#newChat').addEventListener('click', () => { newChat(); loadChats(); $('.bottomnav [data-view="chat"]').click(); });

function newChat() {
  chatId = null; store.set('chatId', null); setBusy(false);
  $('#messages').innerHTML = `<div class="empty"><h2>¿En qué trabajamos hoy?</h2><p class="muted">El agente principal reparte el trabajo entre los subagentes activos. Tú das las indicaciones.</p></div>`;
}
async function openChat(id) {
  const c = await api(`/chats/${id}`).catch(() => null);
  if (!c || !c.messages) return newChat();
  chatId = c.id; store.set('chatId', chatId);
  setBusy(false);
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'attach', chatId }));
  $('#messages').innerHTML = '';
  const name = (id2) => library.agents.find((a) => a.id === id2)?.name || id2;
  for (const m of c.messages) {
    if (m.role === 'user') addMsg('user', 'Tú', m.text, m.files || []);
    else if (m.role === 'assistant') addMsg('', name(m.agent), m.text);
    else if (m.role === 'subagent') addMsg('sub', name(m.agent), m.text);
    else if (m.role === 'delegation') addDelegation(name(m.agent), m.text);
    else if (m.role === 'error') addMsg('err', 'Error', m.text);
    else if (m.role === 'snapshot') addSnapshot(m);
  }
}

/* ---------------- Chat en vivo ---------------- */
const box = $('#messages');
const scroll = () => { box.scrollTop = box.scrollHeight; };
function clearEmpty() { $('.empty', box)?.remove(); }
function addMsg(cls, who, text, files = []) {
  clearEmpty();
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  const speakBtn = cls === 'user' || cls === 'err' || !('speechSynthesis' in window) ? '' : '<button class="speak" title="Leer en voz alta">🔊</button>';
  const filesHtml = files.length ? `<div class="files">${files.map((f) => (IMG_RE.test(f)
    ? `<a href="${fileUrl(f)}" target="_blank"><img src="${fileUrl(f)}" alt=""></a>`
    : `<a class="doc" href="${fileUrl(f)}" target="_blank">📄 ${esc(f.split('/').pop())}</a>`)).join('')}</div>` : '';
  el.innerHTML = `<div class="who">${esc(who)} ${speakBtn}</div><div class="body">${cls === 'user' ? esc(text).replace(/\n/g, '<br>') : md(text)}${filesHtml}</div>`;
  el.querySelector('.speak')?.addEventListener('click', () => speak(el.querySelector('.body').innerText));
  box.appendChild(el); scroll();
}
function addDelegation(name, task) {
  clearEmpty();
  const el = document.createElement('div');
  el.className = 'delegation';
  el.innerHTML = `↳ Delegado a <b>${esc(name)}</b>: ${esc(task)}`;
  box.appendChild(el); scroll();
}
let activity = null;
function activityBox() {
  if (!activity) { activity = document.createElement('div'); activity.className = 'activity'; box.appendChild(activity); }
  return activity;
}
const items = new Map();
function showItem(agent, it) {
  if (it.kind === 'agent_message') return; // se muestra completo al final
  const key = `${agent}:${it.id}`;
  let el = items.get(key);
  if (!el) { el = document.createElement('details'); items.set(key, el); activityBox().appendChild(el); }
  let title = ''; let detail = '';
  if (it.kind === 'command_execution') {
    const st = it.exitCode == null ? '…' : it.exitCode === 0 ? '<span class="ok">✔</span>' : `<span class="fail">✘ ${it.exitCode}</span>`;
    title = `${st} $ ${esc(it.command)}`; detail = it.output;
  } else if (it.kind === 'file_change') { title = `✎ ${esc((it.changes || []).join(', '))}`; }
  else if (it.kind === 'reasoning') { title = `💭 ${esc((it.text || '').split('\n')[0].slice(0, 120))}`; detail = it.text; }
  else if (it.kind === 'todo_list') { title = '☐ plan'; detail = (it.items || []).join('\n'); }
  else { title = `${esc(it.kind)} ${esc(it.text || '')}`; }
  el.innerHTML = `<summary>[${esc(agent)}] ${title}</summary>${detail ? `<pre>${esc(detail)}</pre>` : ''}`;
  box.appendChild(thinkingEl); scroll();
}
const thinkingEl = Object.assign(document.createElement('div'), { className: 'thinking', textContent: 'Trabajando' });

let ws;
let pendingSend = false;
let lastLiveAnswer = '';
let wantVoice = false;
let autoRead = store.get('autoRead') === '1';
const VOICE_RE = /(l[eé]e(me|melo|lo)|en voz alta|d[ií]melo en voz|h[aá]blame|resp[oó]ndeme en voz)/i;
function connectChat() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/chat`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'attach', chatId }));
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'queue') { renderQueue(ev.items, ev.running); return; }
    if (ev.type === 'queued') { pendingSend = false; addNote(`⏳ En cola (posición ${ev.position}). Empezará cuando termine la tarea actual.`); return; }
    if (ev.type === 'chat') {
      if (!pendingSend) return;
      pendingSend = false; chatId = ev.chatId; store.set('chatId', chatId); return;
    }
    if (ev.chatId && ev.chatId !== chatId) return; // es de otro chat
    if (ev.type === 'running') { setBusy(true); thinkingEl.textContent = 'Trabajando (sigue en el servidor)'; box.appendChild(thinkingEl); scroll(); }
    else if (ev.type === 'turn') { activity = null; items.clear(); thinkingEl.textContent = `${ev.name} trabajando`; box.appendChild(thinkingEl); scroll(); }
    else if (ev.type === 'item') showItem(ev.agent, ev.item);
    else if (ev.type === 'message') {
      if (ev.text) addMsg(ev.sub ? 'sub' : '', ev.name, ev.text);
      activity = null;
      if (!ev.sub && ev.text) lastLiveAnswer = ev.text;
    }
    else if (ev.type === 'delegation') { addDelegation(ev.name, ev.task); activity = null; items.clear(); thinkingEl.textContent = `${ev.name} trabajando`; box.appendChild(thinkingEl); }
    else if (ev.type === 'error') addMsg('err', 'Error', ev.text);
    else if (ev.type === 'idle') {
      setBusy(false);
      // Leer en voz alta la respuesta final si está activado o si lo pediste en el mensaje.
      if (lastLiveAnswer && !ev.quiet && (autoRead || wantVoice)) speak(lastLiveAnswer, true);
      lastLiveAnswer = ''; wantVoice = false;
    }
    else if (ev.type === 'snapshot') addSnapshot(ev);
  };
  ws.onclose = () => { thinkingEl.remove(); setTimeout(connectChat, 2000); };
}
function setBusy(v) {
  busy = v;
  // Enviar sigue visible: si hay una tarea en marcha, el mensaje va a la cola.
  $('#stop').classList.toggle('hidden', !v);
  if (!v) thinkingEl.remove();
}

const input = $('#input');
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 200)}px`; });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width: 900px)').matches) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if ((!text && !attachments.length) || ws?.readyState !== 1) return;
  if (attachments.some((a) => !a.path)) return; // aún subiendo
  const files = attachments.map((a) => a.path);
  addMsg('user', 'Tú', text || 'Mira los archivos adjuntos.', files);
  pendingSend = true;
  if (VOICE_RE.test(text)) wantVoice = true;
  ws.send(JSON.stringify({ type: 'send', text, files, chatId, provider, agent: $('#agentSelect').value }));
  input.value = ''; input.style.height = 'auto';
  attachments = []; renderAttachments();
  setBusy(true);
});

/* ---------------- Adjuntar archivos ---------------- */
let attachments = []; // { name, path|null, preview }
function renderAttachments() {
  const row = $('#attachRow');
  row.classList.toggle('hidden', !attachments.length);
  row.innerHTML = attachments.map((a, i) => `<div class="chip ${a.path ? '' : 'up'}">
    ${a.preview ? `<img src="${a.preview}" alt="">` : '📄'}<span>${esc(a.path ? a.name : 'Subiendo…')}</span>
    <button type="button" data-rm="${i}" title="Quitar">✕</button></div>`).join('');
}
$('#attachRow').addEventListener('click', (e) => {
  if (e.target.dataset.rm !== undefined) { attachments.splice(+e.target.dataset.rm, 1); renderAttachments(); }
});
async function uploadFiles(list) {
  for (const file of list) {
    if (file.size > 25 * 1024 * 1024) { alert(`${file.name} pasa de 25 MB`); continue; }
    const a = { name: file.name, path: null, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' };
    attachments.push(a); renderAttachments();
    try {
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al subir');
      a.path = data.path;
    } catch (err) {
      attachments = attachments.filter((x) => x !== a);
      alert(`No se pudo subir ${file.name}: ${err.message}`);
    }
    renderAttachments();
  }
}
$('#attachBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => { uploadFiles([...e.target.files]); e.target.value = ''; });
// Pegar una captura con Ctrl+V en el cuadro de texto
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); uploadFiles(files); }
});

/* ---------------- Voz: dictar y escuchar ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
if (SR) {
  $('#micBtn').classList.remove('hidden');
  $('#micBtn').addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.continuous = true;
    const before = input.value ? `${input.value.trim()} ` : '';
    rec.onresult = (ev) => {
      let txt = '';
      for (const r of ev.results) txt += r[0].transcript;
      input.value = before + txt;
      input.dispatchEvent(new Event('input'));
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed') alert('Permite el micrófono para esta página en el navegador.');
      else if (ev.error === 'network') alert('El dictado necesita conexión con el servicio de voz del navegador y no está disponible. Usa el micrófono del teclado del móvil.');
    };
    rec.onend = () => { rec = null; $('#micBtn').classList.remove('rec'); };
    $('#micBtn').classList.add('rec');
    rec.start();
  });
}
function speak(text, auto = false) {
  if (!('speechSynthesis' in window)) return;
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); if (!auto) return; } // pulsar otra vez = parar
  const u = new SpeechSynthesisUtterance(text.replace(/[#*`_>|]/g, ' ').slice(0, 4000));
  u.lang = 'es-ES';
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('es'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

$('#stop').addEventListener('click', () => ws?.send(JSON.stringify({ type: 'stop' })));

/* ---------------- Cola de tareas ---------------- */
function addNote(text) {
  clearEmpty();
  const el = document.createElement('div');
  el.className = 'delegation';
  el.textContent = text;
  box.appendChild(el); scroll();
}
function renderQueue(items, running) {
  const q = $('#queueBox');
  if (!items.length) { q.classList.add('hidden'); q.innerHTML = ''; }
  else {
    q.classList.remove('hidden');
    q.innerHTML = `<div class="q-title">Cola: ${items.length} tarea${items.length > 1 ? 's' : ''} esperando${running ? ` · ahora: <span class="q-run">${esc(running.title)}</span>` : ''}</div>`
      + items.map((it, i) => `<div class="q-item"><b>${i + 1}.</b><span title="${esc(it.text)}">${esc(it.text)}</span>
        <button class="icon-btn" data-unqueue="${esc(it.id)}" title="Quitar de la cola">✕</button></div>`).join('');
  }
  $('#send').textContent = running ? 'A la cola' : 'Enviar';
  $('#send').classList.remove('hidden');
}
$('#queueBox').addEventListener('click', (e) => {
  const id = e.target.dataset.unqueue;
  if (id && ws?.readyState === 1) ws.send(JSON.stringify({ type: 'unqueue', id }));
});

/* ---------------- Avisos por Telegram ---------------- */
function tgMsg(text, ok) { const el = $('#tgMsg'); el.textContent = text; el.className = `tiny ${ok ? 'ok' : 'bad'}`; }
async function loadSettings() {
  const st = await api('/settings').catch(() => null);
  if (!st) return;
  $('#tgState').textContent = st.telegramConfigured ? 'activo' : 'sin configurar';
  $('#tgState').classList.toggle('ok', st.telegramConfigured);
  $('#tgToken').placeholder = st.telegramToken || 'Token del bot (123456:ABC…)';
  $('#tgMode').value = st.notifyOn;
}
$('#tgSave').addEventListener('click', async () => {
  try { await api('/settings', { method: 'POST', body: { telegramToken: $('#tgToken').value.trim() } }); $('#tgToken').value = ''; tgMsg('Token guardado. Ahora escríbele "hola" a tu bot y pulsa Detectar.', true); loadSettings(); }
  catch (err) { tgMsg(err.message); }
});
$('#tgDetect').addEventListener('click', async () => {
  try { const r = await api('/telegram/detect', { method: 'POST' }); tgMsg(`Chat detectado${r.name ? `: ${r.name}` : ''}. Pulsa Enviar prueba.`, true); loadSettings(); }
  catch (err) { tgMsg(err.message); }
});
$('#tgTest').addEventListener('click', async () => {
  try { await api('/telegram/test', { method: 'POST' }); tgMsg('Mensaje enviado. Mira tu Telegram.', true); }
  catch (err) { tgMsg(err.message); }
});
$('#tgMode').addEventListener('change', async (e) => {
  try { await api('/settings', { method: 'POST', body: { notifyOn: e.target.value } }); tgMsg('Guardado.', true); } catch (err) { tgMsg(err.message); }
});

/* ---------------- Archivos (galería) ---------------- */
let currentDir = store.get('filesDir') || '';
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
async function loadFiles(dir = '') {
  let data;
  try { data = await api(`/files?path=${encodeURIComponent(dir || '.')}`); }
  catch { if (dir) return loadFiles(''); return; }
  if (!data.entries) return;
  currentDir = data.dir; store.set('filesDir', currentDir);
  const parts = currentDir ? currentDir.split('/') : [];
  $('#crumbs').innerHTML = `<button data-dir="">workspace</button>` + parts.map((p, i) =>
    `<span>/</span><button data-dir="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('');
  const rel = (n) => (currentDir ? `${currentDir}/${n}` : n);
  $('#fileGrid').innerHTML = data.entries.map((f) => {
    if (f.dir) return `<div class="fcard" data-dir="${esc(rel(f.name))}"><div class="thumb">📁</div><div class="fname">${esc(f.name)}</div></div>`;
    const img = IMG_RE.test(f.name);
    const small = img && /_(micro|small)\./i.test(f.name);
    return `<div class="fcard" data-open="${esc(rel(f.name))}">
      <div class="thumb ${small ? 'small' : ''}">${img ? `<img loading="lazy" src="${fileUrl(rel(f.name))}" alt="">` : '📄'}</div>
      <div class="fname" title="${esc(f.name)}">${esc(f.name)}</div>
      <div class="fmeta"><span>${kb(f.size)}</span><a href="${fileUrl(rel(f.name), 1)}" download title="Descargar">⬇</a></div></div>`;
  }).join('') || '<p class="file-empty">Carpeta vacía.</p>';
}
$('#crumbs').addEventListener('click', (e) => { if (e.target.dataset.dir !== undefined) loadFiles(e.target.dataset.dir); });
$('#fileGrid').addEventListener('click', (e) => {
  if (e.target.closest('a')) return; // descarga
  const card = e.target.closest('.fcard');
  if (!card) return;
  if (card.dataset.dir !== undefined) loadFiles(card.dataset.dir);
  else window.open(fileUrl(card.dataset.open), '_blank');
});
$('#filesReload').addEventListener('click', () => loadFiles(currentDir));

/* ---------------- Cerebro: Codex o Claude ---------------- */
$('#brainBtn').addEventListener('click', () => {
  provider = provider === 'codex' ? 'claude' : 'codex';
  store.set('provider', provider);
  renderBrain();
  if (provider === 'claude' && statusInfo && !statusInfo.claudeOk) {
    addNote(statusInfo.claude === 'no instalado'
      ? '⚠ Claude Code no está instalado en el servidor (o pon su ruta en CLAUDE_BIN). Mientras, usa Codex.'
      : '⚠ Claude Code aún no tiene sesión para Studio. En la Terminal escribe: npm run claude-login');
  } else addNote(`🧠 Ahora trabaja ${provider === 'claude' ? 'Claude Code' : 'Codex'}. Al cambiar de cerebro empieza una conversación nueva con él dentro de este chat.`);
});

/* ---------------- Deshacer (fotos del workspace) ---------------- */
const ST = { A: 'nuevo', M: 'cambiado', D: 'borrado', R: 'renombrado' };
function addSnapshot(m) {
  clearEmpty();
  const el = document.createElement('div');
  el.className = `snap ${m.undone ? 'undone' : ''}`;
  const n = m.files?.length || 0;
  el.innerHTML = `<div class="row"><span>📸 Esta tarea cambió <b>${n}</b> archivo${n === 1 ? '' : 's'}</span>
    ${m.undone ? '<b>↶ Deshecho</b>' : '<button class="btn small undo">↶ Deshacer</button>'}</div>
    <details><summary class="muted tiny">Ver archivos</summary><ul>${(m.files || []).map((f) =>
      `<li><span class="st-${esc(f.status)}">${ST[f.status] || esc(f.status)}</span> ${esc(f.path)}</li>`).join('')}</ul></details>`;
  el.querySelector('.undo')?.addEventListener('click', async (e) => {
    if (!confirm(`¿Deshacer los cambios de esta tarea? Se restauran ${n} archivo(s) a como estaban antes.`)) return;
    e.target.disabled = true;
    try {
      await api('/undo', { method: 'POST', body: { chatId, hash: m.hash } });
      el.classList.add('undone');
      e.target.outerHTML = '<b>↶ Deshecho</b>';
    } catch (err) { alert(err.message); e.target.disabled = false; }
  });
  box.appendChild(el); scroll();
}

/* ---------------- App instalable (PWA) ---------------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

/* ---------------- Avisos en el móvil (Web Push) y lectura automática ---------------- */
function pushMsg(t, ok) { const el = $('#pushMsg'); el.textContent = t; el.className = `tiny ${ok ? 'ok' : 'bad'}`; }
const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function refreshPushState() {
  let on = false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    on = Boolean(await reg?.pushManager?.getSubscription()) && Notification.permission === 'granted';
  } catch { /* sin soporte */ }
  $('#pushState').textContent = on ? 'activos' : 'apagados';
  $('#pushState').classList.toggle('ok', on);
  $('#pushOn').textContent = on ? '🔕 Desactivar avisos en este móvil' : '🔔 Activar avisos en este móvil';
  return on;
}
$('#pushOn').addEventListener('click', async () => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite avisos. Usa Chrome y la app instalada.');
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing && Notification.permission === 'granted') {
      await api('/push/unsubscribe', { method: 'POST', body: { endpoint: existing.endpoint } });
      await existing.unsubscribe();
      pushMsg('Avisos desactivados en este móvil.', true);
      return refreshPushState();
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('No diste permiso. Actívalo en Ajustes del móvil → Apps → Chrome/Studio → Notificaciones.');
    const { key } = await api('/push/key');
    const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
    pushMsg('Avisos activados. Pulsa "Enviar aviso de prueba".', true);
    refreshPushState();
  } catch (err) { pushMsg(err.message); }
});
$('#pushTest').addEventListener('click', async () => {
  try { await api('/push/test', { method: 'POST' }); pushMsg('Aviso enviado. Mira tus notificaciones.', true); }
  catch (err) { pushMsg(err.message); }
});
$('#autoRead').checked = autoRead;
$('#autoRead').addEventListener('change', (e) => {
  autoRead = e.target.checked; store.set('autoRead', autoRead ? '1' : null);
  if (autoRead) speak('Listo. Leeré las respuestas en voz alta.', true);
});
// Al tocar una notificación: abrir ese chat.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open') {
    const id = new URL(e.data.url, location.origin).searchParams.get('chat');
    if (id) { openChat(id); $('.bottomnav [data-view="chat"]').click(); }
  }
});

/* ---------------- Terminal ---------------- */
let term; let fit; let tws;
function fitTerm() {
  if (!fit || !$('#terminal').offsetParent) return;
  try { fit.fit(); } catch { return; }
  if (tws?.readyState === 1) tws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
}
function startTerminal() {
  term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace', theme: { background: '#0a0d11' }, scrollback: 5000 });
  fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($('#terminal'));
  term.onData((d) => tws?.readyState === 1 && tws.send(JSON.stringify({ type: 'input', data: d })));
  const connect = () => {
    tws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/terminal?id=main`);
    tws.onopen = () => { term.reset(); fitTerm(); };
    tws.onmessage = (e) => term.write(e.data);
    tws.onclose = () => setTimeout(connect, 2000);
  };
  connect();
  new ResizeObserver(fitTerm).observe($('#terminal'));
  $('#termFit').addEventListener('click', fitTerm);
  // Teclas especiales para el móvil
  $$('[data-key]').forEach((b) => b.addEventListener('click', () => {
    const seq = JSON.parse(`"${b.dataset.key}"`);
    if (tws?.readyState === 1) tws.send(JSON.stringify({ type: 'input', data: seq }));
    term.focus();
  }));
}

/* ---------------- Inicio ---------------- */
async function loadStatus() {
  const st = await api('/status').catch(() => null);
  const el = $('#status');
  if (!st) return;
  statusInfo = st;
  el.textContent = `Codex ${st.codexOk ? '✔' : '✘'} · Claude ${st.claudeOk ? '✔' : '✘'}`;
  el.title = `Codex: ${st.codex}\nClaude: ${st.claude}\nDirectorio: ${st.workspace}\nPermisos: ${st.sandbox}`;
  el.className = `status ${st.codexOk || st.claudeOk ? 'ok' : 'bad'}`;
  renderBrain();
}
let started = false;
async function start() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (started) return;
  started = true;
  renderBrain();
  await loadLibrary();
  const fromUrl = new URLSearchParams(location.search).get('chat');
  if (fromUrl) { chatId = fromUrl; history.replaceState(null, '', '/'); }
  if (chatId) await openChat(chatId);
  connectChat(); startTerminal(); loadStatus(); refreshPushState();
}
fetch('/api/me').then((r) => r.json()).then((m) => (m.authed ? start() : showLogin()));
