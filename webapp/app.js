const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); try{tg.setHeaderColor('#07120c'); tg.setBackgroundColor('#07120c');}catch(e){} }

// ⚠️ ПОМЕНЯЙ на юзернейм твоего бота (без @)
const BOT_USERNAME = "GGURM_BOT";
const CHANNEL_USERNAME = "GGURMNEWS";
// Backend (мгновенные пополнения, общий баланс/лента, вывод). Пусто — офлайн-режим.
const BACKEND_URL = "https://ggurm-api.duckdns.org";
const PACKS = [[25,50],[50,100],[100,200],[500,1000]];
const FREE_CD_MS = 12 * 60 * 60 * 1000;
const SECRET_PRICE = 49;
const WD_MIN = 41, WD_DELAY_MS = 3600 * 1000;
let serverMode = false;

// ---------- ЗВУКИ ----------
function soundOn(){ return localStorage.getItem('ggurm_sound') !== '0'; }
let _AC = null;
function _ac(){ try{ if(!_AC) _AC = new (window.AudioContext||window.webkitAudioContext)(); if(_AC.state==='suspended') _AC.resume(); return _AC; }catch(e){ return null; } }
function tone(f, t0, d, type, g) {
  if (!soundOn()) return;
  try {
    const a = _ac(); if(!a) return;
    const o = a.createOscillator(), gn = a.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    gn.gain.setValueAtTime(g || .12, a.currentTime + t0);
    gn.gain.exponentialRampToValueAtTime(.001, a.currentTime + t0 + d);
    o.connect(gn); gn.connect(a.destination);
    o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + d);
  } catch(e){}
}
const sfx = { // спокойные, тихие
  click: () => tone(520, 0, .07, 'sine', .045),
  open:  () => { tone(330,0,.18,'sine',.06); tone(415,.12,.18,'sine',.06); tone(494,.24,.22,'sine',.06); },
  tick:  () => tone(700, 0, .04, 'sine', .028),
  win:   () => [523,587,659,784].forEach((f,i)=>tone(f,i*.14,.3,'sine',.07)),
  coin:  () => { tone(880,0,.1,'sine',.055); tone(1320,.09,.16,'sine',.05); },
  error: () => tone(220, 0, .25, 'sine', .055),
};
document.addEventListener('click', e => { if (e.target.closest('button')) sfx.click(); });

// ---------- USER ----------
const user = tg?.initDataUnsafe?.user || { first_name: 'Гость', username: 'guest', id: 0 };
const userName = (user.first_name || 'Гость') + (user.last_name ? ' ' + user.last_name : '');
const uid = user.id || 0;
document.getElementById('userName').textContent = userName;
document.getElementById('userName2').textContent = userName;
document.getElementById('userHandle').textContent = '@' + (user.username || 'guest') + ' • ID ' + uid;
document.getElementById('userHandle2').textContent = '@' + (user.username || 'guest') + ' • ID ' + uid;
document.getElementById('avatar').textContent = (userName[0] || 'G').toUpperCase();
document.getElementById('avatar2').textContent = (userName[0] || 'G').toUpperCase();
if (user.photo_url) {
  document.getElementById('avatar').innerHTML = `<img src="${user.photo_url}" alt="">`;
  document.getElementById('avatar2').innerHTML = `<img src="${user.photo_url}" alt="">`;
}
const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${uid}`;
document.getElementById('refLink').textContent = refLink;
document.getElementById('footerTag').textContent = '@' + BOT_USERNAME;

// ---------- ДАННЫЕ ----------
const GG_IMG = 'assets/ggcoin.png';
const FREE_ITEMS = [
  { name: '2 GG коина', img: GG_IMG, price: 2,  chance: 70,  worst: true },
  { name: '5 GG',       img: GG_IMG, price: 5,  chance: 15 },
  { name: '12 GG',      img: GG_IMG, price: 12, chance: 8 },
  { name: '30 GG',      img: GG_IMG, price: 30, chance: 4.5 },
  { name: '60 GG',      img: GG_IMG, price: 60, chance: 2.5 },
];
// Секретный: шансы как есть (сумма 86.98 — крутится по весам, добавь 4-й мем до 100%)
const MEMES = [
  { name: 'Векосини Сигмаини', letter: 'В', price: 98, chance: 3.5 },
  { name: "Aqua Bro's", letter: 'A', price: 165, chance: 0.45 },
  { name: 'Я Жирный Уэан', letter: 'Я', price: 45, chance: 14.5 },
  { name: 'Пельменичок Паучок', letter: 'П', price: 30, chance: 35 },
  { name: 'Анонимусный Куб', letter: 'А', price: 35, chance: 21.5 },
  { name: 'Бан', letter: 'Б', price: 25, chance: 40 },
];
const LUCKY_PRICE = 79;
const LUCKY_MEMES = [
  { name: 'Omega Lucky Block', letter: 'O', price: 700, chance: 0.5 },
  { name: 'Admin Lucky Block', letter: 'A', price: 35, chance: 40 },
];
const CASES = {
  free:   { title: 'БЕСПЛАТНЫЙ', name: 'Бесплатный', img: 'assets/cases/free.png', price: 0, drops: FREE_ITEMS },
  secret: { title: 'СЕКРЕТНЫЙ',  name: 'Секретный',  img: 'assets/cases/secret.png', price: SECRET_PRICE, drops: MEMES },
  lucky:  { title: 'ЛАКИ-БЛОК',  name: 'Лаки Блок',  img: 'assets/cases/lucky.png', price: LUCKY_PRICE, drops: LUCKY_MEMES },
};

// ---------- STATE ----------
let balance = parseInt(localStorage.getItem('ggurm_balance') ?? '0', 10);
let opened = parseInt(localStorage.getItem('ggurm_opened') ?? '0', 10);
let wonTotal = parseInt(localStorage.getItem('ggurm_won') ?? '0', 10);
let memes = JSON.parse(localStorage.getItem('ggurm_memes') || '[]'); // {id,name,letter,price,won_ts}
let feed = JSON.parse(localStorage.getItem('ggurm_feed') || '[]');
let freeCdUntil = parseInt(localStorage.getItem('ggurm_free_cd') || '0', 10);
let usedCodes = JSON.parse(localStorage.getItem('ggurm_used_codes') || '[]');
let outbox = JSON.parse(localStorage.getItem('ggurm_outbox') || '[]'); // офлайн-заработки для слияния
let depoBonus = localStorage.getItem('ggurm_depo_bonus') === '1';
function uuid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function queueOut(entry) { entry.id = entry.id || uuid(); outbox.push(entry); outbox = outbox.slice(-200); save(); }
async function flushOutbox() {
  if (!serverMode || !outbox.length) return;
  const r = await api('/api/merge', { entries: outbox });
  if (r && r.ok) {
    const done = new Set(r.applied || []);
    outbox = outbox.filter(e => !done.has(e.id));
    balance = r.balance; wonTotal = r.won; opened = Math.max(opened, r.opened || 0);
    freeSecret = r.free_secret || 0;
    save(); render(); await refreshInv();
  }
}
let questShared = false, questChannel = false, speed = 'slow', spinning = false;
let curCase = 'free', wdSel = null, freeSecret = 0;

function save() {
  localStorage.setItem('ggurm_balance', balance);
  localStorage.setItem('ggurm_opened', opened);
  localStorage.setItem('ggurm_won', wonTotal);
  localStorage.setItem('ggurm_memes', JSON.stringify(memes.slice(-100)));
  localStorage.setItem('ggurm_feed', JSON.stringify(feed.slice(0, 20)));
  localStorage.setItem('ggurm_free_cd', freeCdUntil);
  localStorage.setItem('ggurm_used_codes', JSON.stringify(usedCodes.slice(-50)));
  localStorage.setItem('ggurm_outbox', JSON.stringify(outbox.slice(-200)));
  localStorage.setItem('ggurm_depo_bonus', depoBonus ? '1' : '0');
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.add('hidden'), 2400);
}
function confirmDlg(title, text) {
  return new Promise(res => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmModal').classList.remove('hidden');
    document.getElementById('confirmYes').onclick = () => { document.getElementById('confirmModal').classList.add('hidden'); sfx.open(); res(true); };
    document.getElementById('confirmNo').onclick = () => { document.getElementById('confirmModal').classList.add('hidden'); res(false); };
  });
}
function iconHTML(it, cls) {
  if (it.img) return `<img class="${cls || 'prize-img'}" src="${it.img}" alt="">`;
  return `<div class="meme-tile ${cls || ''}"><b>${it.letter || 'М'}</b></div>`;
}
function rollW(items) {
  const total = items.reduce((s, i) => s + i.chance, 0);
  let r = Math.random() * total;
  for (const it of items) { if ((r -= it.chance) <= 0) return it; }
  return items[0];
}
function fmtLeft(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function fmtDT(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ---------- РЕНДЕР ----------
function render() {
  document.getElementById('balanceTop').textContent = balance;
  document.getElementById('balanceMain').textContent = balance;
  document.getElementById('statOpened').textContent = opened;
  document.getElementById('statWon').textContent = wonTotal + ' GG';
  renderDrops(); renderMemes(); renderFeed(); tickCd();
}
function renderDrops() {
  const items = CASES[curCase].drops;
  document.getElementById('dropGrid').innerHTML = items.map(it =>
    `<div class="drop${it.worst?' worst':''}">${iconHTML(it)}<div><b>${it.name}</b><small>${it.price} GG • ${it.chance}%</small></div></div>`).join('');
}
function renderMemes() {
  const el = document.getElementById('memeInv');
  const act = memes.filter(m => !m.status || m.status === 'active');
  if (!act.length) { el.innerHTML = '<div class="empty">Мемов пока нет — открой Секретный кейс</div>'; return; }
  el.innerHTML = act.map(m => `
    <div class="inv-item"><div class="meme-tile sm"><b>${m.letter}</b></div>
    <div class="inf"><b>${m.name}</b><small>${m.price} GG</small></div>
    <button class="inv-sell" data-sell="${m.id}">Продать</button>
    ${m.price >= WD_MIN ? `<button class="inv-wd" data-wd="${m.id}">Вывести</button>` : ''}</div>`).join('');
  el.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => sellMeme(b.dataset.sell));
  el.querySelectorAll('[data-wd]').forEach(b => b.onclick = () => openWd(b.dataset.wd));
}
function tickCd() {
  const btn = document.getElementById('openCaseBtn');
  if (curCase !== 'free') return;
  const left = freeCdUntil - Date.now();
  if (left <= 0) { btn.disabled = false; btn.textContent = 'ОТКРЫТЬ КЕЙС'; }
  else { btn.disabled = true; btn.textContent = 'ОТКРЫТЬ ЧЕРЕЗ ' + fmtLeft(left); }
}
setInterval(() => { if (curCase === 'free') tickCd(); }, 1000);

// ---------- ЛЕНТА ----------
function renderFeed() {
  const el = document.getElementById('liveFeed');
  feed = feed.filter(f => f.n);
  if (!feed.length) { el.innerHTML = '<div class="empty">Пока тихо — открой кейс и стань первым 🔥</div>'; return; }
  el.innerHTML = feed.map(f =>
    `<div class="live-item${f.p >= 60 ? ' top' : ''}">${f.e && String(f.e).startsWith('assets/') ? `<img class="live-img" src="${f.e}" alt="">` : `<div class="meme-tile xs"><b>${f.l || 'М'}</b></div>`}<div><b>${f.n}</b><small>${f.p} GG</small></div></div>`).join('');
}
function renderTop() {
  const el = document.getElementById('topFeed');
  if (!el) return;
  const day = Date.now() - 86400 * 1000;
  const top = feed.filter(f => f.p >= 70 && (f.ts || 0) >= day).sort((a,b) => b.p - a.p).slice(0, 10);
  el.innerHTML = top.length ? top.map((f,i) =>
    `<div class="live-item top"><div class="top-num">${i+1}</div>${f.e && String(f.e).startsWith('assets/') ? `<img class="live-img" src="${f.e}" alt="">` : `<div class="meme-tile xs"><b>${f.l || 'М'}</b></div>`}<div><b>${f.n}</b><small>${f.p} GG</small></div></div>`).join('')
    : '<div class="empty">Топ дня пуст — выбей от 70 GG и попади сюда</div>';
}
async function loadLive() {
  if (!serverMode) { renderTop(); return; }
  try {
    const r = await fetch(BACKEND_URL + '/api/feed', { cache: 'no-store' });
    const j = await r.json();
    if (j.ok && j.feed.length) {
      document.getElementById('liveFeed').innerHTML = j.feed.map(f =>
        `<div class="live-item${f.p >= 60 ? ' top' : ''}"><img class="live-img" src="${f.e || GG_IMG}" alt=""><div><b>${f.n}</b><small>${f.p} GG</small></div></div>`).join('');
    }
    const t = await (await fetch(BACKEND_URL + '/api/top', { cache: 'no-store' })).json();
    if (t.ok) {
      const el = document.getElementById('topFeed');
      el.innerHTML = t.top.length ? t.top.map((f,i) =>
        `<div class="live-item top"><div class="top-num">${i+1}</div><img class="live-img" src="${f.e || GG_IMG}" alt=""><div><b>${f.n}</b><small>${f.p} GG</small></div></div>`).join('')
        : '<div class="empty">Топ дня пуст — выбей от 70 GG и попади сюда</div>';
    }
  } catch(e) { renderTop(); }
}
async function api(path, body, method, timeoutMs) {
  if (!BACKEND_URL) { window._apiErr = 'no url'; return null; }
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    let r;
    if (method === 'GET') {
      r = await fetch(BACKEND_URL + path, { cache: 'no-store', signal: ctrl.signal });
    } else {
      r = await fetch(BACKEND_URL + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ initData: tg?.initData || '', ...(body||{}) }), signal: ctrl.signal });
    }
    clearTimeout(to);
    if (!r.ok) { window._apiErr = 'HTTP ' + r.status; return null; }
    window._apiErr = '';
    return await r.json();
  } catch(e) { clearTimeout(to); window._apiErr = 'сеть/таймаут'; return null; }
}
let _connecting = false;
async function initBackend() {
  if (!BACKEND_URL || serverMode || _connecting) return;
  if (!tg?.initData) { toast('Открой через Telegram, а не через браузер'); return; }
  _connecting = true;
  try {
    const h = await fetch(BACKEND_URL + '/api/health', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!h.ok) throw 0;
  } catch(e) {
    _connecting = false;
    toast('Сервер не отвечает с твоего устройства');
    setTimeout(() => { if (!serverMode) initBackend(); }, 20000);
    return;
  }
  let me = null;
  for (let i = 0; i < 4 && !me; i++) {
    me = await api('/api/me', null, null, 25000);
  }
  _connecting = false;
  if (!me || !me.ok) { // тихо ретраим в фоне
    setTimeout(() => { if (!serverMode) initBackend(); }, 20000);
    return;
  }
  serverMode = true;
  toast('Общий баланс подключён');
  if (!localStorage.getItem('ggurm_imported')) {
    const im = await api('/api/import', { balance, won: wonTotal });
    if (im && im.ok) {
      balance = im.balance; wonTotal = im.won; opened = Math.max(opened, im.opened || 0);
      if (memes.length) { await api('/api/import_memes', { items: memes }); memes = []; }
      outbox = [];
      localStorage.setItem('ggurm_imported', '1');
    }
  } else { balance = me.balance; wonTotal = me.won; opened = Math.max(opened, me.opened || 0); }
  freeSecret = me.free_secret || 0;
  document.getElementById('payBonusNote').textContent = me.bonus ? ' • +15% активно!' : '';
  save(); render(); await refreshInv(); refreshAdmin(); loadLive(); flushOutbox();
  setInterval(async () => {
    const m = await api('/api/me');
    if (m && m.ok && (m.balance !== balance || m.won !== wonTotal || (m.free_secret || 0) !== freeSecret)) {
      const grew = m.balance > balance;
      balance = m.balance; wonTotal = m.won; freeSecret = m.free_secret || 0; save(); render();
      if (grew) { toast('Баланс пополнен!'); sfx.coin(); tg?.HapticFeedback?.notificationOccurred('success'); }
    }
    flushOutbox();
  }, 8000);
}
async function refreshInv() {
  if (!serverMode) { renderMemes(); return; }
  const r = await api('/api/inventory');
  if (r && r.ok) {
    memes = r.items.filter(i => i.status === 'active').map(i => ({ id: i.id, name: i.name, letter: i.letter, price: i.price, won_ts: i.won_ts * 1000 }));
    renderMemes();
  }
}
function pushFeed(win) {
  const entry = win.img
    ? { n: userName, e: win.img, p: win.price, ts: Date.now() }
    : { n: win.name, l: win.letter, p: win.price, ts: Date.now() };
  feed.unshift(entry);
  feed = feed.slice(0, 20); save(); renderFeed(); renderTop();
  if (serverMode) fetch(BACKEND_URL + '/api/drop', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ initData: tg?.initData || '', name: win.name || userName, img: win.img || '', price: win.price }) }).then(()=>loadLive()).catch(()=>{});
}

// ---------- NAV ----------
function gotoTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tnav-btn').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const tn = document.querySelector(`.tnav-btn[data-goto="${name}"]`);
  if (tn) tn.classList.add('active');
  const dw = document.querySelector(`.drawer-item[data-goto="${name}"]`);
  if (dw) dw.classList.add('active');
  document.getElementById('drawerWrap').classList.add('hidden');
  if (name === 'upgrade') { upBet = null; refreshInv().then(paintUp).catch(paintUp); }
  if (name === 'settings' && typeof runDiag === 'function') { runDiag(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.getElementById('burgerBtn').onclick = () => document.getElementById('drawerWrap').classList.remove('hidden');
document.getElementById('drawerClose').onclick = () => document.getElementById('drawerWrap').classList.add('hidden');
document.getElementById('drawerBackdrop').onclick = () => document.getElementById('drawerWrap').classList.add('hidden');
document.getElementById('gearBtn').onclick = () => gotoTab('settings');
document.getElementById('drawerSupport').onclick = openSupport;
document.querySelectorAll('[data-goto]').forEach(btn => btn.onclick = () => gotoTab(btn.dataset.goto));
document.querySelectorAll('[data-soon]').forEach(btn => btn.onclick = () => { sfx.error(); toast(`${btn.dataset.soon} скоро появится`); });

// ---------- КЕЙС: детали ----------
function showDetail(id) {
  curCase = id;
  const c = CASES[id];
  document.getElementById('caseTitle').textContent = c.title;
  document.getElementById('caseName').textContent = c.name;
  document.getElementById('casePhoto').src = c.img;
  document.getElementById('casePlaceholder').innerHTML = id === 'lucky' ? '<div class="box-emoji">🎰</div>' : '';
  document.getElementById('caseMeta').innerHTML = id === 'free'
    ? '<div class="free-note">Бесплатный кейс • каждые 12 часов</div>'
    : `<div class="detail-meta single"><div><span>Цена</span><b>${c.price} GG</b></div></div>${id === 'secret' && freeSecret > 0 ? `<div class="free-note">Бесплатных открытий: ${freeSecret}</div>` : ''}`;
  const btn = document.getElementById('openCaseBtn');
  btn.disabled = false;
  btn.textContent = id === 'free' ? 'ОТКРЫТЬ КЕЙС' : `ОТКРЫТЬ ЗА ${c.price} GG`;
  renderDrops(); tickCd();
  gotoTab('case');
}
document.getElementById('openFreeCase').onclick = () => showDetail('free');
document.getElementById('openSecretCase').onclick = () => showDetail('secret');
document.getElementById('openLuckyCase').onclick = () => showDetail('lucky');
document.getElementById('freeBannerGo').onclick = () => showDetail('free');
document.querySelectorAll('.speed').forEach(b => b.onclick = () => {
  document.querySelectorAll('.speed').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); speed = b.dataset.speed;
});
function filterCases(q) {
  q = (q || '').toLowerCase();
  const match = (id, ...words) => {
    document.getElementById(id).style.display = (!q || words.some(w => w.includes(q))) ? '' : 'none';
  };
  match('openFreeCase', 'бесплатный', 'free');
  match('openSecretCase', 'секретный', 'secret');
  match('openLuckyCase', 'лаки', 'блок', 'lucky');
  document.querySelectorAll('#tab-cases .cat-block').forEach(sec => {
    const cards = [...sec.querySelectorAll('.case-card')];
    if (!cards.length) { sec.style.display = q ? 'none' : ''; return; } // пустые разделы прячем при поиске
    sec.style.display = cards.some(c => c.style.display !== 'none') ? '' : 'none';
  });
}
document.getElementById('caseSearch').oninput = e => filterCases(e.target.value);
document.getElementById('caseSearchHome').oninput = e => {
  filterCases(e.target.value);
  if (e.target.value.trim()) { gotoTab('cases'); document.getElementById('caseSearch').value = e.target.value; filterCases(e.target.value); }
};

// ---------- HERO / ОПЛАТА / ПРОМО ----------
document.getElementById('depositBtn').onclick = () => {
  if (serverMode && tg?.openInvoice) { // оплата внутри приложения, сумма своя
    const chips = document.getElementById('payChips');
    chips.innerHTML = [25, 50, 100, 500].map(s => `<button class="pay-chip" data-s="${s}">${s}</button>`).join('');
    chips.querySelectorAll('.pay-chip').forEach(b => b.onclick = () => {
      document.getElementById('payStars').value = b.dataset.s;
      updPayPreview();
    });
    document.getElementById('payStars').value = '';
    updPayPreview();
    document.getElementById('payModal').classList.remove('hidden');
    return;
  }
  const url = `https://t.me/${BOT_USERNAME}?start=deposit`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
  toast('Оплата звёздами — в чате с ботом. Чек вставь в ПРОМОКОД');
};
function updPayPreview() {
  const s = parseInt(document.getElementById('payStars').value, 10);
  document.getElementById('payPreview').textContent =
    (s >= 1 && s <= 10000) ? `${s} звёзд → ${s * 2} GG` : 'Введи количество звёзд (1–10000)';
}
document.getElementById('payClose').onclick = () => document.getElementById('payModal').classList.add('hidden');
document.getElementById('payTabStars').onclick = () => {
  document.getElementById('payTabStars').classList.add('active');
  document.getElementById('payTabMemes').classList.remove('active');
  document.getElementById('payStarsBox').classList.remove('hidden');
  document.getElementById('payMemesBox').classList.add('hidden');
};
document.getElementById('payTabMemes').onclick = () => {
  document.getElementById('payTabMemes').classList.add('active');
  document.getElementById('payTabStars').classList.remove('active');
  document.getElementById('payMemesBox').classList.remove('hidden');
  document.getElementById('payStarsBox').classList.add('hidden');
};
document.getElementById('payStars').oninput = updPayPreview;
document.getElementById('payGo').onclick = () => {
  const s = parseInt(document.getElementById('payStars').value, 10);
  if (!(s >= 1 && s <= 10000)) { sfx.error(); return toast('Введи от 1 до 10000 звёзд'); }
  buyPack(s);
};
async function buyPack(stars) {
  document.getElementById('payModal').classList.add('hidden');
  const inv = await api('/api/invoice', { stars });
  if (!inv || !inv.ok) { sfx.error(); return toast('Не получилось создать счёт'); }
  tg.openInvoice(inv.link, async (status) => {
    if (status === 'paid') {
      toast('Оплата прошла! Ждём зачисление…');
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const m = await api('/api/me');
        if (m && m.ok && m.balance > balance) {
          balance = m.balance; wonTotal = m.won; freeSecret = m.free_secret || 0; save(); render();
          toast(`Начислено! Баланс: ${balance} GG`); sfx.coin();
          tg?.HapticFeedback?.notificationOccurred('success');
          initBonusNote();
          return;
        }
      }
      toast('Платёж обрабатывается, баланс обновится сам');
    }
    else if (status === 'cancelled') toast('Оплата отменена');
    else if (status === 'failed') { sfx.error(); toast('Оплата не прошла'); }
  });
}
async function initBonusNote() {
  const m = await api('/api/me');
  if (m && m.ok) document.getElementById('payBonusNote').textContent = m.bonus ? ' • +15% активно!' : '';
}
document.getElementById('promoBtn').onclick = () => document.getElementById('promoModal').classList.remove('hidden');
document.getElementById('promoClose').onclick = () => document.getElementById('promoModal').classList.add('hidden');
document.getElementById('promoApply').onclick = async () => {
  const v = document.getElementById('promoInput').value.trim().toUpperCase();
  if (!v) return;
  if (serverMode) {
    const r = await api('/api/promo', { code: v });
    if (!r) { sfx.error(); return toast('Нет связи с сервером'); }
    if (r.ok && r.kind === 'bonus') { document.getElementById('promoModal').classList.add('hidden'); initBonusNote(); toast('Промокод применён: +15% к следующему пополнению!'); sfx.coin(); }
    else if (r.ok && r.kind === 'freecase') { document.getElementById('promoModal').classList.add('hidden'); toast('Промокод применён: бесплатный кейс доступен!'); sfx.coin(); }
    else if (r.ok && r.kind === 'secret') { document.getElementById('promoModal').classList.add('hidden'); toast('Промокод применён: +1 открытие Секретного!'); sfx.coin(); }
    else if (r.ok && r.kind === 'credit') { balance = r.balance; save(); render(); document.getElementById('promoModal').classList.add('hidden'); toast(`Баланс пополнен: +${r.gg} GG!`); sfx.coin(); }
    else if (r.error === 'used') { sfx.error(); toast('Этот чек уже использован'); }
    else if (r.error === 'already') toast('Промокод уже активен');
    else { sfx.error(); toast('Неверный промокод или чек'); }
    return;
  }
  if (v === 'GGURM') {
    if (depoBonus) return toast('Промокод уже активен: +15% к пополнению');
    depoBonus = true; save();
    document.getElementById('promoModal').classList.add('hidden');
    toast('Промокод применён: +15% к следующему пополнению!'); sfx.coin();
    return;
  }
  const m = v.match(/^GGDP-(\d+)-(\d+)-([0-9A-F]{4,12})$/);
  if (m && +m[1] === uid) {
    if (usedCodes.includes(v)) { sfx.error(); return toast('Этот чек уже использован'); }
    let g = parseInt(m[2], 10);
    if (depoBonus) { g = Math.floor(g * 1.15); depoBonus = false; }
    usedCodes.push(v); balance += g; wonTotal += g; queueOut({ kind: 'coins', amount: g }); save(); render();
    document.getElementById('promoModal').classList.add('hidden');
    toast(`Баланс пополнен: +${g} GG!`); sfx.coin();
    return;
  }
  sfx.error(); toast('Неверный промокод или чек');
};

// ---------- SHARE ----------
function openShare() {
  const text = encodeURIComponent('Открывай бесплатный кейс в GGУРМ каждые 12 часов!');
  const url = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}
document.getElementById('shareBtn2').onclick = openShare;
document.getElementById('copyRef').onclick = () => { navigator.clipboard?.writeText(refLink); toast('Ссылка скопирована!'); };

// ---------- QUEST (бесплатный кейс) ----------
document.getElementById('openCaseBtn').onclick = () => {
  if (spinning) return;
  if (curCase === 'free') {
    if (freeCdUntil > Date.now()) { sfx.error(); return toast('Следующий кейс через ' + fmtLeft(freeCdUntil - Date.now())); }
    questShared = false; questChannel = false;
    document.getElementById('questShareState').textContent = '→';
    document.getElementById('questShare').classList.remove('done');
    document.getElementById('questChannelState').textContent = '→';
    document.getElementById('questChannel').classList.remove('done');
    document.getElementById('questModal').classList.remove('hidden');
    if (serverMode) { // автопроверка подписки на канал
      api('/api/check_sub').then(r => {
        if (r && r.sub && !document.getElementById('questModal').classList.contains('hidden')) {
          questChannel = true;
          document.getElementById('questChannelState').textContent = '✓';
          document.getElementById('questChannel').classList.add('done');
          toast('Подписка найдена!');
        }
      });
    }
  } else {
    openPaid(curCase);
  }
};
document.getElementById('questClose').onclick = () => document.getElementById('questModal').classList.add('hidden');
document.getElementById('questShare').onclick = () => {
  openShare();
  questShared = true;
  document.getElementById('questShareState').textContent = '✓';
  document.getElementById('questShare').classList.add('done');
  toast('Вернись и нажми ГОТОВО');
};
document.getElementById('questChannel').onclick = () => {
  const url = `https://t.me/${CHANNEL_USERNAME}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
  questChannel = true;
  document.getElementById('questChannelState').textContent = '✓';
  document.getElementById('questChannel').classList.add('done');
};
document.getElementById('questDone').onclick = async () => {
  if (!questShared) { sfx.error(); return toast('Сначала поделись в любом чате'); }
  if (!questChannel) { sfx.error(); return toast('Сначала подпишись на канал'); }
  document.getElementById('questModal').classList.add('hidden');
  await spinFree();
};

// ---------- РУЛЕТКА ----------
async function animateRoulette(items, win, priceLine) {
  const wrap = document.getElementById('rouletteWrap');
  const track = document.getElementById('rouletteTrack');
  const status = document.getElementById('spinStatus');
  wrap.classList.remove('hidden');
  const strip = Array.from({length:40}, () => rollW(items));
  strip[34] = win;
  track.style.transition = 'none'; track.style.transform = 'translateX(0)';
  track.innerHTML = strip.map((it,i)=>`<div class="r-item ${i===34?'win':''}">${iconHTML(it)}<small>${priceLine(it)}</small></div>`).join('');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const dur = speed === 'fast' ? 1.8 : 5;
  track.style.transition = `transform ${dur}s cubic-bezier(.12,.8,.08,1)`;
  track.style.transform = `translateX(-${34*128 - (document.getElementById('roulette').clientWidth/2 - 60) + (Math.random()*40-20)}px)`;
  status.textContent = 'Крутим... удачи!';
  const tick = setInterval(sfx.tick, 130);
  await new Promise(r=>setTimeout(r, dur*1000+100));
  clearInterval(tick);
  return status;
}
function showWin(icon, name, sub, sell) {
  document.getElementById('winEmoji').innerHTML = icon;
  document.getElementById('winName').textContent = name;
  document.getElementById('winPrice').textContent = sub;
  const box = document.getElementById('winBtns');
  if (sell) {
    box.className = 'modal-btns';
    box.innerHTML = `<button class="btn-sell" id="sellWinBtn">ПРОДАТЬ ЗА ${sell.price} GG</button><button class="btn-keep" id="collectBtn">ЗАБРАТЬ</button>`;
    document.getElementById('sellWinBtn').onclick = () => sellWonMeme(sell);
    document.getElementById('collectBtn').onclick = closeWin;
  } else {
    box.className = 'modal-btns single';
    box.innerHTML = `<button class="btn-keep" id="collectBtn">ЗАБРАТЬ</button>`;
    document.getElementById('collectBtn').onclick = closeWin;
  }
  document.getElementById('winModal').classList.remove('hidden');
  sfx.win(); tg?.HapticFeedback?.notificationOccurred('success');
}
function closeWin() {
  document.getElementById('winModal').classList.add('hidden');
  toast('Уже в профиле');
}
let lastMeme = null;
async function sellWonMeme(sell) {
  if (serverMode && lastMeme && lastMeme.id) {
    const r = await api('/api/sell', { item_id: lastMeme.id });
    if (r && r.ok) { balance = r.balance; save(); render(); await refreshInv(); }
    else { sfx.error(); return toast('Не получилось продать'); }
  } else if (lastMeme) {
    const i = memes.findIndex(m => String(m.id) === String(lastMeme.id));
    if (i >= 0) { const [m] = memes.splice(i, 1); balance += m.price; wonTotal += m.price; queueOut({ kind: 'coins', amount: m.price }); save(); render(); }
  }
  lastMeme = null;
  document.getElementById('winModal').classList.add('hidden');
  toast('Мем продан'); sfx.coin();
}

async function spinFree() {
  if (spinning) return;
  if (freeCdUntil > Date.now()) { sfx.error(); return toast('Приходи позже'); }
  spinning = true; sfx.open();
  tg?.HapticFeedback?.impactOccurred('medium');
  let win;
  if (serverMode) {
    const r = await api('/api/open_free');
    if (!r || !r.ok) { spinning = false; sfx.error(); return toast(r && r.error === 'cooldown' ? 'Кейс ещё на перезарядке' : 'Нет связи с сервером'); }
    win = { name: r.price + ' GG', img: GG_IMG, price: r.price };
    freeCdUntil = Date.now() + FREE_CD_MS;
    opened += 1; balance = r.balance; wonTotal = r.won;
  } else {
    win = rollW(FREE_ITEMS);
    opened += 1; freeCdUntil = Date.now() + FREE_CD_MS;
    balance += win.price; wonTotal += win.price; queueOut({ kind: 'coins', amount: win.price });
  }
  save(); render();
  const status = await animateRoulette(FREE_ITEMS, win, it => it.price + ' GG');
  spinning = false; questShared = false; questChannel = false;
  pushFeed(win);
  status.textContent = `Выпало: ${win.name}! Следующий — через 12 часов`;
  showWin(iconHTML(win), win.name, `+${win.price} GG на балансе`);
}

async function openPaid(caseId) {
  const spec = CASES[caseId];
  if (!spec || spinning) return;
  if (serverMode) {
    const r = await api('/api/open_case', { case: caseId });
    if (!r || !r.ok) { sfx.error(); return toast(r && r.error === 'need ' + spec.price + ' GG' ? 'Не хватает GG — пополни баланс' : 'Нет связи с сервером'); }
    spinning = true; sfx.open();
    balance = r.balance; wonTotal = r.won; opened += 1; save(); render();
    const win = { name: r.item.name, letter: r.item.letter, price: r.item.price };
    lastMeme = { id: r.item.id };
    const status = await animateRoulette(spec.drops, win, it => it.price + ' GG');
    spinning = false;
    await refreshInv();
    pushFeed(win);
    status.textContent = `Выпало: ${win.name}! Мем в инвентаре`;
    showWin(iconHTML({letter: win.letter}, 'big'), win.name, 'мем в инвентаре', { price: win.price });
    return;
  }
  if (balance < spec.price) { sfx.error(); return toast('Не хватает GG — пополни баланс'); }
  spinning = true; sfx.open();
  balance -= spec.price;
  queueOut({ kind: 'coins', amount: -spec.price });
  const win = rollW(spec.drops);
  const item = { id: Date.now(), name: win.name, letter: win.letter, price: win.price, won_ts: Date.now() };
  memes.unshift(item);
  lastMeme = item;
  queueOut({ kind: 'meme', name: item.name, letter: item.letter, price: item.price });
  opened += 1; save(); render();
  const status = await animateRoulette(spec.drops, win, it => it.price + ' GG');
  spinning = false;
  pushFeed(win);
  status.textContent = `Выпало: ${win.name}! Мем в инвентаре`;
  showWin(iconHTML({letter: win.letter}, 'big'), win.name, 'мем в инвентаре', { price: win.price });
}

// ---------- ИНВЕНТАРЬ / ПРОДАЖА ----------
async function sellMeme(id) {
  if (serverMode) {
    const r = await api('/api/sell', { item_id: +id });
    if (r && r.ok) { balance = r.balance; save(); render(); await refreshInv(); toast('Мем продан'); sfx.coin(); }
    else { sfx.error(); toast('Не получилось продать'); }
    return;
  }
  const i = memes.findIndex(m => String(m.id) === String(id));
  if (i < 0) return;
  const [m] = memes.splice(i, 1);
  balance += m.price; wonTotal += m.price; queueOut({ kind: 'coins', amount: m.price }); save(); render();
  toast(`Продано за ${m.price} GG`); sfx.coin();
}
document.getElementById('sellAllBtn').onclick = async () => {
  const list = serverMode
    ? ((await api('/api/inventory'))?.items || []).filter(i => i.status === 'active')
    : memes.filter(m => !m.status || m.status === 'active');
  if (!list.length) return toast('Инвентарь пуст');
  const total = list.reduce((s, m) => s + m.price, 0);
  if (!await confirmDlg('Продать всё?', `Ты точно хочешь продать все мемы за ${total} GG?`)) return;
  if (serverMode) {
    const r = await api('/api/sell_all');
    if (r && r.ok) { balance = r.balance; save(); render(); await refreshInv(); }
  } else {
  memes = memes.filter(m => m.status && m.status !== 'active');
  balance += total; wonTotal += total; queueOut({ kind: 'coins', amount: total }); save(); render();
  }
  toast(`Продано всё за ${total} GG`); sfx.coin();
};

// ---------- ВЫВОД ----------
function toLocalInput(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function openWd(presetId) {
  wdSel = presetId ? String(presetId) : null;
  const list = serverMode ? memes : memes.filter(m => !m.status || m.status === 'active');
  const box = document.getElementById('wdItems');
  const avail = list.filter(m => m.price >= WD_MIN);
  box.innerHTML = list.length ? list.map(m => `
    <button class="wd-item${m.price < WD_MIN ? ' off' : ''}${String(m.id) === wdSel ? ' sel' : ''}" data-id="${m.id}" ${m.price < WD_MIN ? 'disabled' : ''}>
      <div class="meme-tile xs"><b>${m.letter}</b></div>
      <div><b>${m.name}</b><small>${m.price} GG${m.price < WD_MIN ? ' • только продажа' : ''}</small></div>
      ${String(m.id) === wdSel ? '<span class="qt-state">✓</span>' : ''}
    </button>`).join('') : '<div class="empty">Нет мемов для вывода — открой Секретный кейс</div>';
  box.querySelectorAll('.wd-item:not(.off)').forEach(b => b.onclick = () => openWd(b.dataset.id));
  if (wdSel) {
    const m = list.find(x => String(x.id) === String(wdSel));
    if (m) document.getElementById('wdWhen').min = toLocalInput(Math.max(Date.now() + 60000, (m.won_ts || Date.now()) + WD_DELAY_MS));
  }
  await loadWdHistory();
  document.getElementById('wdModal').classList.remove('hidden');
}
async function loadWdHistory() {
  const el = document.getElementById('wdHistory');
  if (!serverMode) { el.innerHTML = '<div class="empty">Нет связи с сервером, попробуй позже</div>'; return; }
  const r = await api('/api/withdraws');
  const st = { pending: 'ожидает времени', asked: 'подтверди в боте', confirmed: 'подтверждена', cancelled: 'отменена' };
  el.innerHTML = (r && r.ok && r.items.length) ? r.items.map(w =>
    `<div class="inv-item"><div><b>${w.name}</b><small>${fmtDT(w.slot_ts*1000)} • ${w.roblox} • ${st[w.status] || w.status}</small></div></div>`).join('')
    : '<div class="empty">Заявок пока нет</div>';
}
document.getElementById('withdrawOpenBtn').onclick = () => openWd(null);
document.getElementById('wdClose').onclick = () => document.getElementById('wdModal').classList.add('hidden');
document.getElementById('wdSubmit').onclick = async () => {
  if (!wdSel) { sfx.error(); return toast('Выбери мем для вывода'); }
  const nick = document.getElementById('wdNick').value.trim();
  if (nick.length < 2) { sfx.error(); return toast('Введи ник в Roblox'); }
  const when = new Date(document.getElementById('wdWhen').value).getTime();
  if (!when || isNaN(when)) { sfx.error(); return toast('Выбери дату и время'); }
  if (!serverMode) { sfx.error(); return toast('Нет связи с сервером, попробуй позже'); }
  const r = await api('/api/withdraw', { item_id: +wdSel, roblox: nick, slot_ts: Math.floor(when / 1000) });
  if (r && r.ok) {
    document.getElementById('wdModal').classList.add('hidden');
    await refreshInv(); await loadWdHistory();
    toast('Заявка отправлена! Подтвердишь вывод в боте, когда придёт время'); sfx.coin();
  } else {
    sfx.error();
    const errs = { too_cheap: 'Вывод от 41 GG', too_early: 'Раньше часа после выигрыша нельзя',
      hours: 'Вывод доступен с 12:00 до 22:00 МСК', one_active: 'У тебя уже есть активная заявка',
      hour_cd: 'Следующую заявку можно через час', no_nick: 'Введи ник в Roblox', past: 'Выбери будущее время',
      no_item: 'Мем уже в заявке или продан' };
    toast(errs[(r && (r.error || r.detail)) || ''] || 'Не получилось отправить заявку');
  }
};

// ---------- АПГРЕЙДЕР ----------
const UP_TARGETS = [
  { name: 'Векосик Жиросик', letter: 'В', price: 205 },
  { name: 'Кот Куки', letter: 'К', price: 675 },
  { name: 'Ждун', letter: 'Ж', price: 764 },
];
let upBet = null, upTarget = null, upBusy = false;
function upChance(bet, tgt) {
  if (!bet || !tgt || tgt.price <= 0) return 0;
  return Math.round(Math.min(95, bet.price / tgt.price * 100) * 10) / 10;
}
function paintUp() {
  const ch = upChance(upBet, upTarget);
  document.getElementById('upChance').textContent = (upBet && upTarget) ? ch + '%' : '—';
  document.getElementById('upWheel').style.background =
    `conic-gradient(var(--green) 0% ${ch}%, rgba(255,70,70,.85) ${ch}% 100%)`;
  document.getElementById('upBetBox').innerHTML = upBet
    ? `<div class="meme-tile"><b>${upBet.letter}</b></div><div><b>${upBet.name}</b><small>${upBet.price} GG</small></div>` : '<small>Выбрать из инвентаря ↓</small>';
  document.getElementById('upTargetBox').innerHTML = upTarget
    ? `<div class="meme-tile"><b>${upTarget.letter}</b></div><div><b>${upTarget.name}</b><small>${upTarget.price} GG</small></div>` : '<small>Выбрать цель +</small>';
  document.getElementById('upGo').disabled = !(upBet && upTarget) || upBusy;
  const inv = memes.filter(m => !m.status || m.status === 'active');
  document.getElementById('upInv').innerHTML = inv.length ? inv.map(m => `
    <button class="wd-item${upBet && String(upBet.id) === String(m.id) ? ' sel' : ''}" data-id="${m.id}">
      <div class="meme-tile xs"><b>${m.letter}</b></div>
      <div><b>${m.name}</b><small>${m.price} GG</small></div>
    </button>`).join('') : '<div class="empty">Инвентарь пуст</div>';
  document.getElementById('upInv').querySelectorAll('.wd-item').forEach(b => b.onclick = () => {
    const m = inv.find(x => String(x.id) === String(b.dataset.id));
    if (m) { upBet = m; paintUp(); }
  });
  const q = (document.getElementById('upSearch').value || '').toLowerCase();
  document.getElementById('upTargets').innerHTML = UP_TARGETS
    .filter(t => t.name.toLowerCase().includes(q))
    .map(t => {
      const c = upBet ? upChance(upBet, t) + '%' : '—%';
      return `<button class="wd-item${upTarget && upTarget.name === t.name ? ' sel' : ''}" data-n="${t.name}">
        <div class="meme-tile xs"><b>${t.letter}</b></div>
        <div><b>${t.name}</b><small>${t.price} GG • ${c}</small></div>
      </button>`;
    }).join('');
  document.getElementById('upTargets').querySelectorAll('.wd-item').forEach(b => b.onclick = () => {
    upTarget = UP_TARGETS.find(t => t.name === b.dataset.n) || null;
    paintUp();
  });
}
document.getElementById('upSearch').oninput = paintUp;
document.getElementById('upGo').onclick = async () => {
  if (upBusy || !upBet || !upTarget) return;
  upBusy = true; paintUp(); sfx.open();
  document.getElementById('upStatus').textContent = 'Крутим…';
  const ch = upChance(upBet, upTarget);
  let win, item = null;
  if (serverMode) {
    const r = await api('/api/upgrade', { item_id: upBet.id, target: upTarget.name });
    if (!r || !r.ok) { upBusy = false; paintUp(); sfx.error(); document.getElementById('upStatus').textContent = ''; return toast('Не получилось: мем уже использован?'); }
    win = r.win;
    if (win) { item = r.item; lastMeme = item; }
    await refreshInv();
  } else {
    win = Math.random() * 100 < ch;
    const i = memes.findIndex(m => String(m.id) === String(upBet.id));
    if (i >= 0) memes.splice(i, 1);
    if (win) {
      item = { id: Date.now(), name: upTarget.name, letter: upTarget.letter, price: upTarget.price, won_ts: Date.now(), status: 'active' };
      memes.unshift(item);
      lastMeme = item;
    }
    opened += 1; save(); render();
  }
  // стрелка крутится и встаёт в зелёную (выигрыш) или красную зону
  const needle = document.getElementById('upNeedle');
  const span = Math.max(ch * 3.6, 2);
  const target = win ? Math.random() * span : span + Math.random() * Math.max(360 - span, 2);
  needle.style.transition = 'none';
  needle.style.transform = 'translateY(-100%) rotate(0deg)';
  void needle.offsetWidth;
  const tick = setInterval(sfx.tick, 120);
  needle.style.transition = 'transform 2.2s cubic-bezier(.12,.8,.12,1)';
  needle.style.transform = `translateY(-100%) rotate(${5 * 360 + target}deg)`;
  await new Promise(r => setTimeout(r, 2300));
  clearInterval(tick);
  upBet = null; upBusy = false; paintUp();
  if (win && item) {
    pushFeed({ name: item.name, letter: item.letter, price: item.price });
    document.getElementById('upStatus').textContent = `Успех! Забрал ${item.name}`;
    showWin(iconHTML({ letter: item.letter }, 'big'), item.name, 'мем в инвентаре', { price: item.price });
    lastMeme = item;
  } else {
    document.getElementById('upStatus').textContent = 'Неудача — мем сгорел';
    sfx.error(); tg?.HapticFeedback?.notificationOccurred('error');
  }
};

// ---------- АДМИНКА ----------
let isAdmin = false;
async function refreshAdmin() {
  if (!serverMode) return;
  const r = await api('/api/admin_promos');
  const row = document.getElementById('adminRow');
  if (r && r.ok) {
    isAdmin = true; row.classList.remove('hidden');
    document.getElementById('admPromos').innerHTML = r.promos.length
      ? r.promos.map(p => { const what = p.kind === 'coins' ? p.amount + ' GG' : p.kind === 'bonus' ? '+15%' : p.kind === 'freecase' ? 'бесплатный кейс' : 'секретный кейс';
        return `<div class="inv-item"><div><b>${p.code}</b><small>${what} • осталось ${p.uses}</small></div></div>`; }).join('')
      : '<div class="empty">Промокодов пока нет</div>';
  } else { isAdmin = false; box.classList.add('hidden'); }
}
document.getElementById('admGive').onclick = async () => {
  const t = parseInt(document.getElementById('admUid').value, 10);
  const a = parseInt(document.getElementById('admAmt').value, 10);
  if (!t || !a) { sfx.error(); return toast('Введи ID и сумму'); }
  const r = await api('/api/admin_give', { target_id: t, amount: a });
  if (r && r.ok) { toast(`Выдано ${a} GG игроку ${t}`); sfx.coin(); }
  else { sfx.error(); toast('Не получилось'); }
};
document.getElementById('admPromo').onclick = async () => {
  const code = document.getElementById('admCode').value.trim().toUpperCase();
  const kind = document.getElementById('admKind').value;
  const amount = parseInt(document.getElementById('admPamt').value || '0', 10);
  const uses = parseInt(document.getElementById('admUses').value || '1', 10);
  if (!code) { sfx.error(); return toast('Введи код'); }
  const r = await api('/api/admin_promo', { code, kind, amount, uses });
  if (r && r.ok) { toast(`Промокод ${code} создан`); sfx.coin(); refreshAdmin(); }
  else { sfx.error(); toast('Код занят или неверные поля'); }
};
document.getElementById('admReset').onclick = async () => {
  const t = document.getElementById('admTarget').value.trim().toLowerCase() || 'all';
  if (!await confirmDlg('Сбросить КД?', t === 'all' ? 'Точно сбросить перезарядку ВСЕМ игрокам?' : `Точно сбросить перезарядку игроку ${t}?`)) return;
  const r = await api('/api/admin_reset_cd', { target: t });
  if (r && r.ok) toast(`Сброшено: ${r.n}`);
  else { sfx.error(); toast('Не получилось'); }
};
function paintSound() {
  document.getElementById('soundSwitch').classList.toggle('on', soundOn());
}
document.getElementById('soundRow').onclick = () => {
  localStorage.setItem('ggurm_sound', soundOn() ? '0' : '1');
  paintSound(); sfx.click();
  toast(soundOn() ? 'Звуки включены' : 'Звуки выключены');
};
async function runDiag() {
  const s = document.getElementById('diagServer');
  const t = document.getElementById('diagTg');
  t.textContent = tg?.initData ? 'есть' : 'НЕТ';
  t.style.color = tg?.initData ? '' : '#ff5555';
  s.textContent = 'проверка…';
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(BACKEND_URL + '/api/health', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(to);
    s.textContent = r.ok ? 'отвечает' : 'HTTP ' + r.status;
    s.style.color = r.ok ? '' : '#ff5555';
  } catch(e) {
    s.textContent = 'не отвечает: ' + (e && e.name === 'AbortError' ? 'таймаут' : 'сеть/SSL');
    s.style.color = '#ff5555';
  }
}
document.getElementById('diagRetry').onclick = runDiag;
// локальная панель (без сервера — только это устройство)
document.getElementById('locGive').onclick = () => {
  const n = parseInt(document.getElementById('locAmt').value, 10);
  if (!(n >= 1 && n <= 1000000000)) { sfx.error(); return toast('Введи сумму'); }
  balance += n; wonTotal += n; queueOut({ kind: 'coins', amount: n }); save(); render();
  toast(`Выдано себе: +${n} GG`); sfx.coin();
};
document.getElementById('locResetCd').onclick = () => {
  freeCdUntil = 0; save(); render(); toast('Перезарядка сброшена'); sfx.coin();
};

// ---------- SUPPORT (через чат с ботом) ----------
function openSupport() {
  document.getElementById('drawerWrap').classList.add('hidden');
  const url = `https://t.me/${BOT_USERNAME}?start=support`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
  toast('Открываю чат с ботом — напиши туда свою проблему');
}
document.getElementById('supportFab').onclick = openSupport;

// hero timer (идёт от метки — продолжается после ухода)
let heroEnd = parseInt(localStorage.getItem('ggurm_hero_end') || '0', 10);
if (!heroEnd || heroEnd < Date.now()) { heroEnd = Date.now() + 2*3600*1000; localStorage.setItem('ggurm_hero_end', heroEnd); }
setInterval(() => {
  let left = heroEnd - Date.now();
  if (left <= 0) { heroEnd = Date.now() + 2*3600*1000; localStorage.setItem('ggurm_hero_end', heroEnd); left = heroEnd - Date.now(); }
  document.getElementById('heroTimer').textContent = fmtLeft(left);
}, 1000);

document.getElementById('adminRow').onclick = () => {
  document.getElementById('adminModal').classList.remove('hidden');
  refreshAdmin();
};
document.getElementById('adminClose').onclick = () => document.getElementById('adminModal').classList.add('hidden');
paintSound();
render(); initBackend(); loadLive();
