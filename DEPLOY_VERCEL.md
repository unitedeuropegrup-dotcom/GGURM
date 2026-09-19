# Деплой GGУРМ Mini App на Vercel (5 минут)

Папка Mini App: `ggurm-bot/webapp/` — чистый статический сайт, билдить ничего не надо.

## Вариант A — через сайт (без терминала)
1. Зайди на vercel.com → Sign Up (через GitHub)
2. Add New → Project → Upload: перетащи папку `webapp/` (только её содержимое: index.html, style.css, app.js, assets/)
3. Framework Preset: `Other`, Build Command: пусто, Output: `.`
4. Deploy → получишь URL вида `https://ggurm.vercel.app`
5. Проверь в браузере: должен открыться зелёный интерфейс с кейсом TEST

## Вариант B — через терминал
```powershell
cd ggurm-bot/webapp
npx vercel --prod
# первый раз: Login + Scope + Project name = ggurm
```

## Дальше — привязать к боту
1. @BotFather → /mybots → твой бот → Bot Settings → Menu Button → вставь URL с Vercel
2. Запуск бота у себя на ПК:
```powershell
cd ggurm-bot
pip install -r requirements.txt
$env:BOT_TOKEN="токен-от-BotFather"
$env:WEBAPP_URL="https://ggurm.vercel.app"
python bot.py
```
3. В Telegram: /start → кнопка `🟢 Открыть GGУРМ` + Menu Button снизу

## Фото кейса
После деплоя картинку можно просто заменить:
`webapp/assets/cases/test.png` → коммит / повторный Deploy, сайт сам подхватит.

## Важно про токен
Токен который ты кидал в чат — пересоздай после настройки:
@BotFather → /mybots → API Token → Revoke current token.
В код токен не вписываем, только через `$env:BOT_TOKEN`.
