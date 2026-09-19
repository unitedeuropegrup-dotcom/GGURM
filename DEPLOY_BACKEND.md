# Backend GGУРМ на хостинг (для мгновенных пополнений и общей ленты)

Локально сервер уже проверен. Чтобы оплата работала «моментально», backend должен крутиться 24/7 с HTTPS. Вариант — Render (free).

## 1. Залей код на GitHub
```powershell
cd "C:\Users\User\Documents\Default Project\ggurm-bot"
git init; git add -A; git commit -m "ggurm"
# создай пустой репозиторий на github.com (без README), потом:
git remote add origin https://github.com/ТВОЙ-НИК/ggurm.git
git push -u origin master
```

## 2. Создай Web Service на Render
1. render.com → New → Web Service → выбери репозиторий `ggurm`
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Env Vars:
   - `BOT_TOKEN` = токен бота
   - `WEBAPP_URL` = `https://webapp-seven-gilt.vercel.app`
5. Deploy → получишь URL вида `https://ggurm-api.onrender.com`

## 3. Свяжи фронт с backend
В `webapp/app.js` вставь URL в `BACKEND_URL`:
```js
const BACKEND_URL = "https://ggurm-api.onrender.com";
```
```powershell
cd "C:\Users\User\Documents\Default Project\ggurm-bot\webapp"
npx vercel --prod --yes
```

## 4. Проверка
1. Останови бота на ПК (иначе два бота будут драться за апдейты).
2. В Mini App жми ПОПОЛНИТЬ → пакет → оплата звёздами внутри → GG падают сами за пару секунд.
3. Лента «Лучший дроп» станет общей для всех игроков.

## Заметки
- База SQLite живёт на диске Render (при редеплое может обнулиться — позже переедем на Postgres).
- Первый вход переносит локальный баланс в общий автоматически (один раз).
- Без backend приложение работает в офлайн-режиме как раньше (оплата через чат + чек).
