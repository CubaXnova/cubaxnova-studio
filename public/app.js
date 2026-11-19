/* CubaXnova Studio — interfaz web (sin framework, a propósito: fácil de leer y modificar). */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
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
  if (t.dataset.tab === 'chats') loadChats();
}));
$$('.bottomnav button').forEach((b) => b.addEventListener('click', () => {
  $('.layout').dataset.view = b.dataset.view;
  $$('.bottomnav button').forEach((x) => x.classList.toggle('active', x === b));
  if (b.dataset.view === 'terminal') setTimeout(fitTerm, 50);
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
  if (li) { await openChat(li.dataset.open); loadChats(); $$('.bottomnav button')[1].click(); }
});
$('#newChat').addEventListener('click', () => { newChat(); loadChats(); $$('.bottomnav button')[1].click(); });

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
    if (m.role === 'user') addMsg('user', 'Tú', m.text);
    else if (m.role === 'assistant') addMsg('', name(m.agent), m.text);
    else if (m.role === 'subagent') addMsg('sub', name(m.agent), m.text);
    else if (m.role === 'delegation') addDelegation(name(m.agent), m.text);
    else if (m.role === 'error') addMsg('err', 'Error', m.text);
  }
}

/* ---------------- Chat en vivo ---------------- */
const box = $('#messages');
const scroll = () => { box.scrollTop = box.scrollHeight; };
function clearEmpty() { $('.empty', box)?.remove(); }
function addMsg(cls, who, text) {
  clearEmpty();
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  el.innerHTML = `<div class="who">${esc(who)}</div><div class="body">${cls === 'user' ? esc(text).replace(/\n/g, '<br>') : md(text)}</div>`;
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
function connectChat() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/chat`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'attach', chatId }));
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'chat') {
      if (!pendingSend) return;
      pendingSend = false; chatId = ev.chatId; store.set('chatId', chatId); return;
    }
    if (ev.chatId && ev.chatId !== chatId) return; // es de otro chat
    if (ev.type === 'running') { setBusy(true); thinkingEl.textContent = 'Trabajando (sigue en el servidor)'; box.appendChild(thinkingEl); scroll(); }
    else if (ev.type === 'turn') { activity = null; items.clear(); thinkingEl.textContent = `${ev.name} trabajando`; box.appendChild(thinkingEl); scroll(); }
    else if (ev.type === 'item') showItem(ev.agent, ev.item);
    else if (ev.type === 'message') { if (ev.text) addMsg(ev.sub ? 'sub' : '', ev.name, ev.text); activity = null; }
    else if (ev.type === 'delegation') { addDelegation(ev.name, ev.task); activity = null; items.clear(); thinkingEl.textContent = `${ev.name} trabajando`; box.appendChild(thinkingEl); }
    else if (ev.type === 'error') addMsg('err', 'Error', ev.text);
    else if (ev.type === 'idle') setBusy(false);
  };
  ws.onclose = () => { thinkingEl.remove(); setTimeout(connectChat, 2000); };
}
function setBusy(v) {
  busy = v;
  $('#send').classList.toggle('hidden', v);
  $('#stop').classList.toggle('hidden', !v);
  if (!v) thinkingEl.remove();
}

const input = $('#input');
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 200)}px`; });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width: 900px)').matches) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy || ws?.readyState !== 1) return;
  addMsg('user', 'Tú', text);
  pendingSend = true;
  ws.send(JSON.stringify({ type: 'send', text, chatId, agent: $('#agentSelect').value }));
  input.value = ''; input.style.height = 'auto';
  setBusy(true);
});
$('#stop').addEventListener('click', () => ws?.send(JSON.stringify({ type: 'stop' })));

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
  const s = await api('/status').catch(() => null);
  const el = $('#status');
  if (!s) return;
  const ok = /logged in/i.test(s.codex);
  el.textContent = ok ? `Codex conectado · ${s.sandbox}` : 'Codex sin conectar';
  el.title = `${s.codex}\nDirectorio: ${s.workspace}`;
  el.className = `status ${ok ? 'ok' : 'bad'}`;
}
let started = false;
async function start() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (started) return;
  started = true;
  await loadLibrary();
  if (chatId) await openChat(chatId);
  connectChat(); startTerminal(); loadStatus();
}
fetch('/api/me').then((r) => r.json()).then((m) => (m.authed ? start() : showLogin()));
