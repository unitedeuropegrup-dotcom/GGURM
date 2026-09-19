# 🟢 GGУРМ — Telegram Mini App (кейсы как Brainrot Battle)

Зелёный интерфейс: профиль, монеты 🪙, 1 кейс TEST.

## Структура
```
ggurm-bot/
  bot.py              — телеграм-бот (кнопка WebApp)
  requirements.txt
  .env.example
  webapp/
    index.html        — интерфейс
    style.css         — зелёный стиль
    app.js            — баланс, рулетка, инвентарь
    assets/cases/
      test.png        ← СЮДА положишь фото кейса TEST
```

## Как добавить фото кейса
1. Сохрани картинку как `webapp/assets/cases/test.png` (квадрат 512x512 лучше всего)
2. Всё — сайт сам подхватит её вместо 📦-заглушки. Код менять не надо.

То же самое для будущих кейсов: `assets/cases/dragon.png` и т.д.

## Запуск Mini App локально (тест)
```powershell
cd ggurm-bot/webapp
python -m http.server 8000
# открыть http://localhost:8000
```

## Запуск бота
1. Создай бота через @BotFather, получи токен
2. Залей папку `webapp/` на хостинг с HTTPS (Vercel / GitHub Pages / свой сервер)
3. Включи WebApp: @BotFather → /mybots → Bot Settings → Menu Button → URL = твой WEBAPP_URL
```powershell
cd ggurm-bot
pip install -r requirements.txt
$env:BOT_TOKEN="твой-токен"
$env:WEBAPP_URL="https://твой-домен/"
python bot.py
```

## Что уже работает
- Профиль подтягивается из Telegram (имя, username, аватар-буква)
- Баланс 500 старт, хранится в localStorage
- Бонус +100 (кд 2 мин для теста, поменяй в app.js на 2 часа)
- Кейс TEST: 8 предметов, шансы, рулетка (медленная/быстрая), x1/x3/x5
- Выигрыш: продать / оставить, инвентарь с продажей
- Нижняя навигация: Главная / TEST кейс / Профиль

## Что дальше (когда скажешь)
- Backend (Python/Firebase) чтобы баланс был общий, а не локальный
- Больше кейсов + твои фото
- Апгрейдер / батл / дайсы как в Brainrot Battle
- Промокоды, рефералка
