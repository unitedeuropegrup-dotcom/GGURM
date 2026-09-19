"""
GGУРМ backend: API для Mini App + тот же бот (общая SQLite-база).
Запуск локально:  $env:BOT_TOKEN="..."; $env:WEBAPP_URL="https://...фронт..."; py -3 server.py
На хостинге: те же env + uvicorn server:app --host 0.0.0.0 --port $PORT
"""
import os
import hmac
import hashlib
import time
import json
import urllib.parse
import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from aiogram import Bot

import db
from bot_handlers import dp, configure, PACKAGES

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

_pack = {s: g for s, g in PACKAGES}


def check_init(init_data: str) -> dict | None:
    """Проверка подписи Telegram WebApp initData. Возвращает user или None."""
    try:
        pairs = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
        recv_hash = pairs.pop("hash", "")
        check = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        if hmac.new(secret, check.encode(), hashlib.sha256).hexdigest() != recv_hash:
            return None
        user = json.loads(pairs.get("user", "{}"))
        if abs(time.time() - int(pairs.get("auth_date", 0))) > 86400:
            return None
        return user
    except Exception:
        return None


def need_user(init_data: str) -> dict:
    if not BOT_TOKEN:
        raise HTTPException(500, "BOT_TOKEN не задан на сервере")
    u = check_init(init_data or "")
    if not u or "id" not in u:
        raise HTTPException(401, "bad initData")
    return u


class In(BaseModel):
    initData: str = ""


class ImportIn(BaseModel):
    initData: str = ""
    balance: int = 0
    won: int = 0


class PromoIn(BaseModel):
    initData: str = ""
    code: str = ""


class InvoiceIn(BaseModel):
    initData: str = ""
    stars: int = 0


class DropIn(BaseModel):
    initData: str = ""
    name: str = "Игрок"
    img: str = ""
    price: int = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    configure(WEBAPP_URL)
    task = None
    if BOT_TOKEN:
        bot = Bot(token=BOT_TOKEN)
        task = asyncio.create_task(dp.start_polling(bot))
        print("bot polling started")
    else:
        print("BOT_TOKEN пуст — бот не запущен, только API+статика")
    yield
    if task:
        task.cancel()


app = FastAPI(title="GGURM")
app.router.lifespan_context = lifespan


@app.post("/api/me")
def api_me(body: In):
    u = need_user(body.initData)
    return {"ok": True, **db.get_user(int(u["id"]))}


@app.post("/api/import")
def api_import(body: ImportIn):
    u = need_user(body.initData)
    return {"ok": True, **db.import_local(int(u["id"]), body.balance, body.won)}


@app.post("/api/promo")
def api_promo(body: PromoIn):
    u = need_user(body.initData)
    uid = int(u["id"])
    code = (body.code or "").strip().upper()
    if code == "GGURM":
        st = db.get_user(uid)
        if st["bonus"]:
            return {"ok": False, "error": "already"}
        db.set_bonus(uid, 1)
        return {"ok": True, "kind": "bonus"}
    import re
    m = re.match(r"^GGDP-(\d+)-(\d+)-([0-9A-F]{4,12})$", code)
    if m and int(m.group(1)) == uid:
        g = int(m.group(2))
        if db.use_code(code, uid, g):
            st = db.get_user(uid)
            if st["bonus"]:
                g = int(g * 1.15)
                db.set_bonus(uid, 0)
            bal = db.add_balance(uid, g)
            return {"ok": True, "kind": "credit", "gg": g, "balance": bal}
        return {"ok": False, "error": "used"}
    return {"ok": False, "error": "bad"}


@app.post("/api/invoice")
async def api_invoice(body: InvoiceIn):
    u = need_user(body.initData)
    uid = int(u["id"])
    if body.stars not in _pack:
        raise HTTPException(400, "no package")
    base = _pack[body.stars]
    st = db.get_user(uid)
    bonus = 1 if st["bonus"] else 0
    payload = f"app_{uid}_{body.stars}_{base}_{bonus}"
    async with httpx.AsyncClient(timeout=20) as cl:
        r = await cl.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink",
            json={"title": f"{base} GG коинов",
                  "description": f"Пополнение GGУРМ: {body.stars} ⭐ = {base} GG",
                  "payload": payload,
                  "currency": "XTR",
                  "prices": [{"label": f"{base} GG", "amount": body.stars}]},
        )
        data = r.json()
    if not data.get("ok"):
        raise HTTPException(502, f"invoice: {data}")
    return {"ok": True, "link": data["result"], "bonus": bool(bonus)}


@app.post("/api/drop")
def api_drop(body: DropIn):
    u = need_user(body.initData)
    db.push_feed(int(u["id"]), body.name, body.img, body.price)
    return {"ok": True}


@app.get("/api/feed")
def api_feed():
    return {"ok": True, "feed": db.get_feed(20)}


@app.get("/api/health")
def health():
    return {"ok": True}


if os.path.isdir(WEBAPP_DIR):
    app.mount("/", StaticFiles(directory=WEBAPP_DIR, html=True), name="webapp")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
