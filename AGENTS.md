# AGENTS.md — GGУРМ

Telegram Mini App + бот с кейсами в стиле Brainrot Battle. Зелёная неоновая тема.

## Структура
- `bot_handlers.py`: /start — приветствие без эмоджи + кнопки Играть/Новости (t.me/GGURMNEWS)/Поддержка. Оплата звёздами 1⭐=2GG (USE_CODES=1 — чеки GGDP, 0 — сразу в БД).
- `webapp/index.html` — 4 таба: Главная (профиль+баланс GG+баннер бесплатного), Кейсы (поиск+сетка), Детали кейса (фото, КД, рулетка, дропы), Профиль (реф-ссылка). Открытие бесплатного — через модалку заданий. Выигрыш = GG сразу на баланс (инвентаря/продажи нет).
- `webapp/style.css` — тёмно-зелёная тема, переменные `--green:#22ff88`, мобильная вёрстка + сайдбар ленты на ПК, нижнее меню, FAB поддержки.
- `webapp/app.js` — localStorage: `ggurm_balance` (старт 500 GG), `ggurm_opened`, `ggurm_won`, `ggurm_inv`, `ggurm_feed` (только реальные выигрыши игрока), `ggurm_free_cd` (КД 12ч), `ggurm_promo_used` (GGURM → +50 GG один раз). Бесплатный кейс: 8 призов, худший 2 GG — 69%. Открытие через модалку заданий (репост; каждый раз заново). `BOT_USERNAME` и `LIVE_API_URL` вверху — заполнить позже (backend для общей ленты и проверки репоста).
- `webapp/assets/cases/free.png` — иконка бесплатного кейса (фон вырезан, PNG+alpha); `webapp/assets/ggcoin.png` — иконка GG-монеты везде (шапка, баланс, цены, дропы, рулетка, выигрыш, лента); `webapp/assets/logo.jpg` — логотип в шапке и верхнем меню. Таймер КД — текстом на кнопке ОТКРЫТЬ (блока «Доступен» нет).
- `.vscode/launch.json` — F5 запуск бота (env подставить локально), `tasks.json` — preview и установка зависимостей.

## Оплата звёздами (1⭐=2GG)
- `bot.py`: пакеты 25/50/100/500⭐ → 50/100/200/1000 GG. Кнопка «💳 Пополнить за ⭐» → `send_invoice` (XTR, provider_token=""), `pre_checkout` ok, `successful_payment` → бот выдаёт чек `GGDP-<uid>-<gg>-<hex>`.
- Mini App: ПОПОЛНИТЬ → диплинк `?start=deposit` в чат бота. Чек вводится в ПРОМОКОД: проверка uid + одноразовость (`ggurm_used_codes`). GGURM — не монеты, а +15% к следующему чеку (`ggurm_depo_bonus`, сгорает).

## Команды
```powershell
# зависимости бота (использовать py -3, а не python-стаб из Store)
py -3 -m pip install -r requirements.txt
# preview Mini App (уже запущен как Job ggurm-preview на :8000)
# запуск бота
$env:BOT_TOKEN="..."; $env:WEBAPP_URL="https://..."; py -3 bot.py
```

## Правила для агента
- Токен никогда не вписывать в код, только env. Не выводить токен в чат/логи.
- Новые кейсы: карточка в `index.html` + запись в `ITEMS` в `app.js` + фото в `assets/cases/<name>.png`.
- Стиль держать зелёный неон, русский язык интерфейса, mobile-first.
- Баланс пока локальный (localStorage); backend — следующий этап, не ломать текущий API.
