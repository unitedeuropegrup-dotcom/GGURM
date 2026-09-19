const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); try{tg.setHeaderColor('#07120c'); tg.setBackgroundColor('#07120c');}catch(e){} }

// ⚠️ ПОМЕНЯЙ на юзернейм твоего бота (без @), например "ggurm_bot"
const BOT_USERNAME = "ggurm_bot";
const CHANNEL_USERNAME = "GGURMNEWS";
// Backend для мгновенных пополнений и общей ленты. Пока пусто — работает офлайн-режим.
// После хостинга server.py вставь сюда URL, например "https://ggurm-api.onrender.com"
const BACKEND_URL = "";
const PACKS = [[25,50],[50,100],[100,200],[500,1000]]; // звёзды -> GG
const FREE_CD_MS = 12 * 60 * 60 * 1000; // раз в 12 часов
let serverMode = false;

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
if (user.photo_url) { // настоящая аватарка из Telegram
  document.getElementById('avatar').innerHTML = `<img src="${user.photo_url}" alt="">`;
  document.getElementById('avatar2').innerHTML = `<img src="${user.photo_url}" alt="">`;
}

const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${uid}`;
document.getElementById('refLink').textContent = refLink;
document.getElementById('footerTag').textContent = '@' + BOT_USERNAME;

// ---------- STATE ----------
let balance = parseInt(localStorage.getItem('ggurm_balance') ?? '500', 10);
let opened = parseInt(localStorage.getItem('ggurm_opened') ?? '0', 10);
let wonTotal = parseInt(localStorage.getItem('ggurm_won') ?? '0', 10);
let inventory = JSON.parse(localStorage.getItem('ggurm_inv') || '[]');
let feed = JSON.parse(localStorage.getItem('ggurm_feed') || '[]'); // только реальные выигрыши
let freeCdUntil = parseInt(localStorage.getItem('ggurm_free_cd') || '0', 10);
let usedCodes = JSON.parse(localStorage.getItem('ggurm_used_codes') || '[]');
let depoBonus = localStorage.getItem('ggurm_depo_bonus') === '1'; // GGURM: +15% к следующему пополнению
let questShared = false, questChannel = false, pendingWin = null, speed = 'slow', spinning = false;

// Бесплатный кейс: худший приз 2 GG — 69%. Иконка призов — монета GG.
const GG_IMG = 'assets/ggcoin.png';
const ITEMS = [
  { name: '2 GG коина',  img: GG_IMG, price: 2,    chance: 69,  worst: true },
  { name: '5 GG',        img: GG_IMG, price: 5,    chance: 15 },
  { name: '12 GG',       img: GG_IMG, price: 12,   chance: 8 },
  { name: '30 GG',       img: GG_IMG, price: 30,   chance: 4 },
  { name: '60 GG',       img: GG_IMG, price: 60,   chance: 2 },
  { name: '150 GG',      img: GG_IMG, price: 150,  chance: 1.2 },
  { name: '300 GG',      img: GG_IMG, price: 300,  chance: 0.5 },
  { name: '1000 GG',     img: GG_IMG, price: 1000, chance: 0.3 },
];

function save() {
  localStorage.setItem('ggurm_balance', balance);
  localStorage.setItem('ggurm_opened', opened);
  localStorage.setItem('ggurm_won', wonTotal);
  localStorage.setItem('ggurm_inv', JSON.stringify(inventory));
  localStorage.setItem('ggurm_feed', JSON.stringify(feed.slice(0, 20)));
  localStorage.setItem('ggurm_free_cd', freeCdUntil);
  localStorage.setItem('ggurm_used_codes', JSON.stringify(usedCodes.slice(-50)));
  localStorage.setItem('ggurm_depo_bonus', depoBonus ? '1' : '0');
}
function render() {
  document.getElementById('balanceTop').textContent = balance;
  document.getElementById('balanceMain').textContent = balance;
  document.getElementById('statOpened').textContent = opened;
  document.getElementById('statWon').textContent = wonTotal + ' GG';
  document.getElementById('dropGrid').innerHTML = ITEMS.map(it =>
    `<div class="drop${it.worst?' worst':''}"><img class="prize-img" src="${it.img}" alt=""><div><b>${it.name}</b><small>${it.price} GG • ${it.chance}%</small></div></div>`).join('');
  renderFeed(); tickCd();
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.add('hidden'), 2400);
}
function rollItem() {
  const total = ITEMS.reduce((s, i) => s + i.chance, 0);
  let r = Math.random() * total;
  for (const it of ITEMS) { if ((r -= it.chance) <= 0) return it; }
  return ITEMS[0];
}
function fmtLeft(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function tickCd() {
  const btn = document.getElementById('openCaseBtn');
  const left = freeCdUntil - Date.now();
  if (left <= 0) { btn.disabled = false; btn.textContent = 'ОТКРЫТЬ КЕЙС'; }
  else { btn.disabled = true; btn.textContent = 'ОТКРЫТЬ ЧЕРЕЗ ' + fmtLeft(left); }
}
setInterval(tickCd, 1000);

// ---------- ЛЕНТА: только реальные дропы ----------
function renderFeed() {
  const el = document.getElementById('liveFeed');
  feed = feed.filter(f => f.e && String(f.e).startsWith('assets/')); // отсекаем старые эмодзи-записи
  if (!feed.length) { el.innerHTML = '<div class="empty">Пока тихо — открой кейс и стань первым 🔥</div>'; return; }
  el.innerHTML = feed.map(f =>
    `<div class="live-item${f.p >= 150 ? ' top' : ''}"><img class="live-img" src="${f.e}" alt=""><div><b>${f.n}</b><small>${f.p} GG</small></div></div>`).join('');
}
async function loadLive() {
  if (!serverMode) return; // офлайн: только свои выигрыши
  try {
    const r = await fetch(BACKEND_URL + '/api/feed', { cache: 'no-store' });
    const j = await r.json();
    if (j.ok && j.feed.length) {
      document.getElementById('liveFeed').innerHTML = j.feed.map(f =>
        `<div class="live-item${f.p >= 150 ? ' top' : ''}"><img class="live-img" src="${f.e}" alt=""><div><b>${f.n}</b><small>${f.p} GG</small></div></div>`).join('');
    }
  } catch(e) { /* тихо */ }
}
async function api(path, body) {
  if (!BACKEND_URL) return null;
  try {
    const r = await fetch(BACKEND_URL + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ initData: tg?.initData || '', ...(body||{}) }) });
    return await r.json();
  } catch(e) { return null; }
}
async function initBackend() {
  if (!BACKEND_URL || !tg?.initData) return;
  const me = await api('/api/me');
  if (!me || !me.ok) return;
  serverMode = true;
  if (!localStorage.getItem('ggurm_imported')) { // одноразовый перенос локального баланса
    const im = await api('/api/import', { balance, won: wonTotal });
    if (im && im.ok) { balance = im.balance; wonTotal = im.won; opened = Math.max(opened, im.opened || 0); localStorage.setItem('ggurm_imported', '1'); }
  } else { balance = me.balance; wonTotal = me.won; opened = Math.max(opened, me.opened || 0); }
  document.getElementById('payBonusNote').textContent = me.bonus ? ' • +15% активно!' : '';
  save(); render(); loadLive();
  setInterval(async () => { // баланс сам подтягивается (например после оплаты)
    const m = await api('/api/me');
    if (m && m.ok && (m.balance !== balance || m.won !== wonTotal)) {
      const grew = m.balance > balance;
      balance = m.balance; wonTotal = m.won; save(); render();
      if (grew) { toast('Баланс пополнен! 💰'); tg?.HapticFeedback?.notificationOccurred('success'); }
    }
  }, 8000);
}
function pushFeed(win) {
  feed.unshift({ n: userName, e: win.img, p: win.price });
  feed = feed.slice(0, 20); save(); renderFeed();
  if (serverMode) fetch(BACKEND_URL + '/api/drop', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ initData: tg?.initData || '', name: userName, img: win.img, price: win.price }) }).then(()=>loadLive()).catch(()=>{});
}

// ---------- NAV ----------
function gotoTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tnav-btn').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const nav = document.querySelector(`.nav-btn[data-goto="${name}"]`);
  if (nav) nav.classList.add('active');
  const tn = document.querySelector(`.tnav-btn[data-goto="${name}"]`);
  if (tn) tn.classList.add('active');
  const dw = document.querySelector(`.drawer-item[data-goto="${name}"]`);
  if (dw) dw.classList.add('active');
  document.getElementById('drawerWrap').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// drawer + gear
document.getElementById('burgerBtn').onclick = () => document.getElementById('drawerWrap').classList.remove('hidden');
document.getElementById('drawerClose').onclick = () => document.getElementById('drawerWrap').classList.add('hidden');
document.getElementById('drawerBackdrop').onclick = () => document.getElementById('drawerWrap').classList.add('hidden');
document.getElementById('gearBtn').onclick = () => gotoTab('profile');
document.getElementById('drawerSupport').onclick = () => { document.getElementById('drawerWrap').classList.add('hidden'); toast('Поддержка скоро появится 💬'); };
document.querySelectorAll('[data-goto]').forEach(btn => btn.onclick = () => gotoTab(btn.dataset.goto));
document.querySelectorAll('[data-soon]').forEach(btn => btn.onclick = () => toast(`${btn.dataset.soon} скоро появится 🚧`));
function showDetail() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-case').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.getElementById('openFreeCase').onclick = showDetail;
document.getElementById('freeBannerGo').onclick = showDetail;
document.querySelectorAll('.speed').forEach(b => b.onclick = () => {
  document.querySelectorAll('.speed').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); speed = b.dataset.speed;
});
function filterCases(q) {
  q = q.toLowerCase();
  document.getElementById('openFreeCase').style.display = ('бесплатный'.includes(q) || q === '') ? '' : 'none';
}
document.getElementById('caseSearch').oninput = e => filterCases(e.target.value);
document.getElementById('caseSearchHome').oninput = e => {
  filterCases(e.target.value);
  if (e.target.value.trim()) { document.querySelector('.nav-btn[data-goto="cases"]').click(); document.getElementById('caseSearch').value = e.target.value; filterCases(e.target.value); }
};

// ---------- HERO ----------
document.getElementById('depositBtn').onclick = () => {
  if (serverMode && tg?.openInvoice) { // оплата внутри приложения
    document.getElementById('payPacks').innerHTML = PACKS.map(([s,g]) =>
      `<button class="pay-pack" data-s="${s}"><b>⭐ ${s}</b><span>→ ${g} GG</span></button>`).join('');
    document.querySelectorAll('.pay-pack').forEach(b => b.onclick = () => buyPack(+b.dataset.s));
    document.getElementById('payModal').classList.remove('hidden');
    return;
  }
  const url = `https://t.me/${BOT_USERNAME}?start=deposit`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
  toast('Оплата звёздами — в чате с ботом ⭐ Чек вставь в ПРОМОКОД');
};
document.getElementById('payClose').onclick = () => document.getElementById('payModal').classList.add('hidden');
async function buyPack(stars) {
  document.getElementById('payModal').classList.add('hidden');
  const inv = await api('/api/invoice', { stars });
  if (!inv || !inv.ok) return toast('Не получилось создать счёт 😕');
  if (inv.bonus) toast('К счёту применится +15%!');
  tg.openInvoice(inv.link, async (status) => {
    if (status === 'paid') {
      toast('Оплата прошла! Ждём зачисление… ⏳');
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const m = await api('/api/me');
        if (m && m.ok && m.balance > balance) {
          balance = m.balance; wonTotal = m.won; save(); render();
          toast(`Начислено! Баланс: ${balance} GG 💰`);
          tg?.HapticFeedback?.notificationOccurred('success');
          initBonusNote();
          return;
        }
      }
      toast('Платёж обрабатывается, баланс обновится сам');
    }
    else if (status === 'cancelled') toast('Оплата отменена');
    else if (status === 'failed') toast('Оплата не прошла 😕');
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
  if (serverMode) { // всё проверяет сервер
    const r = await api('/api/promo', { code: v });
    if (!r) return toast('Нет связи с сервером 😕');
    if (r.ok && r.kind === 'bonus') { document.getElementById('promoModal').classList.add('hidden'); initBonusNote(); toast('Промокод применён: +15% к следующему пополнению!'); tg?.HapticFeedback?.notificationOccurred('success'); }
    else if (r.ok && r.kind === 'credit') { balance = r.balance; save(); render(); document.getElementById('promoModal').classList.add('hidden'); toast(`Баланс пополнен: +${r.gg} GG!`); tg?.HapticFeedback?.notificationOccurred('success'); }
    else if (r.error === 'used') toast('Этот чек уже использован');
    else if (r.error === 'already') toast('Промокод уже активен');
    else toast('Неверный промокод или чек');
    return;
  }
  // GGURM — не монеты, а +15% к следующему пополнению
  if (v === 'GGURM') {
    if (depoBonus) return toast('Промокод уже активен: +15% к пополнению');
    depoBonus = true; save();
    document.getElementById('promoModal').classList.add('hidden');
    toast('Промокод применён: +15% к следующему пополнению!');
    tg?.HapticFeedback?.notificationOccurred('success');
    return;
  }
  // Чек пополнения из чата бота: GGDP-<uid>-<gg>-<hex>
  const m = v.match(/^GGDP-(\d+)-(\d+)-([0-9A-F]{4,12})$/);
  if (m && +m[1] === uid) {
    if (usedCodes.includes(v)) return toast('Этот чек уже использован');
    let g = parseInt(m[2], 10);
    if (depoBonus) { g = Math.floor(g * 1.15); depoBonus = false; toast('Применён бонус +15%!'); }
    usedCodes.push(v); balance += g; wonTotal += g; save(); render();
    document.getElementById('promoModal').classList.add('hidden');
    toast(`Баланс пополнен: +${g} GG!`);
    tg?.HapticFeedback?.notificationOccurred('success');
    return;
  }
  toast('Неверный промокод или чек');
};

// ---------- SHARE ----------
function openShare() {
  const text = encodeURIComponent('🎁 Открывай бесплатный кейс в GGУРМ каждые 12 часов!');
  const url = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}
document.getElementById('shareBtn2').onclick = openShare;
document.getElementById('copyRef').onclick = () => { navigator.clipboard?.writeText(refLink); toast('Ссылка скопирована!'); };

// ---------- QUEST MODAL (как на скрине: задания перед прокрутом) ----------
document.getElementById('openCaseBtn').onclick = () => {
  if (spinning) return;
  if (freeCdUntil > Date.now()) return toast('Следующий кейс через ' + fmtLeft(freeCdUntil - Date.now()) + ' ⏳');
  questShared = false; questChannel = false;
  document.getElementById('questShareState').textContent = '→';
  document.getElementById('questShare').classList.remove('done');
  document.getElementById('questChannelState').textContent = '→';
  document.getElementById('questChannel').classList.remove('done');
  document.getElementById('questModal').classList.remove('hidden');
};
document.getElementById('questClose').onclick = () => document.getElementById('questModal').classList.add('hidden');
document.getElementById('questShare').onclick = () => {
  openShare();
  questShared = true; // без backend проверить репост нельзя — верим нажатию, проверка будет с сервером
  document.getElementById('questShareState').textContent = '✓';
  document.getElementById('questShare').classList.add('done');
  toast('Вернись и нажми ГОТОВО 👇');
};
document.getElementById('questChannel').onclick = () => {
  const url = `https://t.me/${CHANNEL_USERNAME}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
  questChannel = true; // без backend проверить подписку нельзя — верим нажатию
  document.getElementById('questChannelState').textContent = '✓';
  document.getElementById('questChannel').classList.add('done');
};
document.getElementById('questDone').onclick = async () => {
  if (!questShared) return toast('Сначала поделись в любом чате 📤');
  if (!questChannel) return toast('Сначала подпишись на канал 📢');
  document.getElementById('questModal').classList.add('hidden');
  await spinFree();
};

// ---------- SPIN ----------
async function spinFree() {
  if (spinning) return;
  if (freeCdUntil > Date.now()) return toast('Приходи через ' + fmtLeft(freeCdUntil - Date.now()));
  spinning = true;
  tg?.HapticFeedback?.impactOccurred('medium');
  const win = rollItem();
  const wrap = document.getElementById('rouletteWrap');
  const track = document.getElementById('rouletteTrack');
  const status = document.getElementById('spinStatus');
  wrap.classList.remove('hidden');
  const strip = Array.from({length:40}, rollItem);
  strip[34] = win;
  track.style.transition = 'none'; track.style.transform = 'translateX(0)';
  track.innerHTML = strip.map((it,i)=>`<div class="r-item ${i===34?'win':''}"><img class="prize-img" src="${it.img}" alt=""><small>${it.price} GG</small></div>`).join('');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const dur = speed === 'fast' ? 1.8 : 5;
  track.style.transition = `transform ${dur}s cubic-bezier(.12,.8,.08,1)`;
  const itemW = 94;
  const target = 34*itemW - (document.getElementById('roulette').clientWidth/2 - 43) + (Math.random()*40-20);
  track.style.transform = `translateX(-${target}px)`;
  status.textContent = 'Крутим... удачи! 🍀';
  await new Promise(r=>setTimeout(r, dur*1000+100));
  spinning = false; questShared = false; questChannel = false;
  opened += 1; freeCdUntil = Date.now() + FREE_CD_MS;
  balance += win.price; wonTotal += win.price; // GG сразу на баланс, продавать нечего
  save(); render();
  pushFeed(win);
  status.textContent = `Выпало: ${win.name}! Следующий — через 12 часов ⏳`;
  pendingWin = null;
  document.getElementById('winEmoji').innerHTML = `<img class="win-img" src="${win.img}" alt="GG">`;
  document.getElementById('winName').textContent = win.name;
  document.getElementById('winPrice').textContent = `+${win.price} GG на балансе`;
  document.getElementById('winModal').classList.remove('hidden');
  tg?.HapticFeedback?.notificationOccurred('success');
}
document.getElementById('collectBtn').onclick = () => {
  document.getElementById('winModal').classList.add('hidden');
  toast('GG уже на балансе 💰');
};

// ---------- SUPPORT (заглушка) ----------
document.getElementById('supportFab').onclick = () => toast('Поддержка скоро появится 💬');

// hero timer
let heroSec = 1*3600 + 52*60 + 2;
setInterval(() => {
  heroSec = heroSec > 0 ? heroSec - 1 : 2*3600;
  document.getElementById('heroTimer').textContent =
    `${String(Math.floor(heroSec/3600)).padStart(2,'0')}:${String(Math.floor(heroSec%3600/60)).padStart(2,'0')}:${String(heroSec%60).padStart(2,'0')}`;
}, 1000);

// misc (кнопка сброса убрана из профиля)

render(); initBackend(); loadLive();
