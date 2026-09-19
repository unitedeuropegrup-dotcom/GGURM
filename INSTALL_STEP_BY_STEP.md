# Установка GGУРМ с нуля (Windows, 15 минут)

## 0. Что уже готово
У тебя уже есть папка:
`C:\Users\User\Documents\Default Project\ggurm-bot\`
- `bot.py` — бот
- `webapp/` — Mini App (index.html, style.css, app.js)

## 1. Поставь нормальный Python
У тебя сейчас заглушка от Microsoft Store — она не подойдёт.

1. Зайди на https://www.python.org/downloads/
2. Скачай Python 3.12, запусти установщик
3. ВАЖНО: поставь галочку `Add python.exe to PATH`, потом Install Now
4. Перезапусти PowerShell и проверь:
```powershell
python --version
pip --version
```
Должно показать версии, а не открывать Microsoft Store.

## 2. Установи библиотеки бота
```powershell
cd "C:\Users\User\Documents\Default Project\ggurm-bot"
pip install -r requirements.txt
```

## 3. Залей Mini App на Vercel (чтобы получить ссылку https://...)
Без этого кнопка в Telegram не откроется — Telegram пускает только HTTPS.

1. Зарегистрируйся на https://vercel.com (через GitHub — быстрее)
2. Нажми `Add New... → Project → Upload`
3. Перетащи мышкой папку `webapp` (именно её содержимое: index.html, style.css, app.js, assets)
   - Framework Preset: `Other`
   - Build Command: оставить пустым
4. Нажми `Deploy`, подожди 1 минуту
5. Скопируй ссылку вида `https://ggurm-xxx.vercel.app`
6. Открой её в браузере — должен открыться зелёный GGУРМ с кейсом TEST. Это и есть твой `WEBAPP_URL`.

## 4. Привяжи ссылку к боту
1. В Telegram открой @BotFather
2. `/mybots` → выбери своего бота → `Bot Settings` → `Menu Button`
3. Вставь ссылку с Vercel
4. Теперь в чате с ботом слева внизу появится кнопка Menu — она открывает Mini App.

## 5. Запусти бота
В PowerShell (токен бери из @BotFather, никому не показывай):
```powershell
cd "C:\Users\User\Documents\Default Project\ggurm-bot"
$env:BOT_TOKEN="вставь-токен-сюда"
$env:WEBAPP_URL="вставь-ссылку-с-vercel-сюда"
python bot.py
```
Увидишь: `✅ GGУРМ запущен. WebApp: https://...`

Не закрывай это окно — пока оно открыто, бот работает.

Проверка:
1. В Telegram найди своего бота, нажми `/start`
2. Должна прийти приветствие + кнопка `🟢 Открыть GGУРМ`
3. Жми — открывается Mini App, баланс 500 🪙, кейс TEST за 100 🪙.

Остановка: `Ctrl + C` в том же окне.

## 6. Как добавить фото кейса
1. Положи картинку сюда:
`ggurm-bot/webapp/assets/cases/test.png` (квадрат 512x512 идеально)
2. Заново залей папку `webapp` на Vercel (тот же проект → Redeploy) — фото подхватится само.

## 7. Частые ошибки
- `python` открывает Store → не тот Python, ставь с python.org + галочка PATH
- `No module named aiogram` → забыл `pip install -r requirements.txt`
- Кнопка не открывает приложение → в WEBAPP_URL нет `https://` или Vercel ещё деплоится
- `Unauthorized` → неверный BOT_TOKEN, скопируй заново из BotFather
- Бот молчит после закрытия PowerShell → так и должно быть, для 24/7 нужен хостинг (Railway / VPS). Скажи — распишу.

## 8. Безопасность
Токен который кидал в чат — после запуска сделай:
@BotFather → твой бот → `API Token` → `Revoke current token`, потом возьми новый и запускай с ним.
В файлы `.py` токен не пишем, только через `$env:BOT_TOKEN`.
