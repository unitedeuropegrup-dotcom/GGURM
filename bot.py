"""
GGУРМ — локальный запуск бота (та же логика и БД, что у server.py).
  py -3 -m pip install -r requirements.txt
  $env:BOT_TOKEN="..."; $env:WEBAPP_URL="https://..."; py -3 bot.py
"""
import os
import asyncio
import logging
from aiogram import Bot
import db
from bot_handlers import dp, configure

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

logging.basicConfig(level=logging.INFO)


async def main():
    if not BOT_TOKEN or "ВСТАВЬ" in BOT_TOKEN:
        print("❌ Нет токена. Запусти так: $env:BOT_TOKEN='твой-токен'; $env:WEBAPP_URL='https://...'; py -3 bot.py")
        return
    if not WEBAPP_URL.startswith("https://"):
        print(f"⚠️ WEBAPP_URL сейчас '{WEBAPP_URL}' — для Mini App нужен HTTPS.")
    db.init_db()
    configure(WEBAPP_URL)
    bot = Bot(token=BOT_TOKEN)
    print(f"✅ GGУРМ запущен. WebApp: {WEBAPP_URL or 'не задан'}")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
