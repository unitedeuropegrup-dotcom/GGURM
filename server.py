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
ADMIN_ID = int(os.getenv("ADMIN_ID", "5355350906") or 0)  # создатель бота @nojexo
ADMIN_USERNAMES = {u.strip().lower() for u in os.getenv("ADMIN_USERNAMES", "nojexo").split(",") if u.strip()}


def is_admin(uid: int, username: str | None) -> bool:
    if ADMIN_ID and int(uid) == ADMIN_ID:
        return True
    return bool(username) and username.lower() in ADMIN_USERNAMES
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

FREE_CD_MS = 12 * 3600
SECRET_PRICE = 89
STAR_RATE = 2  # 1 звезда = 2 GG
FREE_W = [(2, 70), (5, 15), (12, 8), (30, 4.5), (60, 2.5)]
SECRET_W = [("Мем Из 2026", "М", 39, 49), ("Акула Пон", "А", 48, 27.98), ("Векосини Сигмаини", "В", 98, 3.5)]
UPGRADE_TARGETS = [
    {"name": "Векосик Жиросик", "letter": "В", "price": 790},
    {"name": "Кот Куки", "letter": "К", "price": 675},
    {"name": "Ждун", "letter": "Ж", "price": 764},
]


def upgrade_chance(bet_price: int, target_price: int) -> float:
    if target_price <= 0 or bet_price <= 0:
        return 0.0
    return round(min(95.0, bet_price / target_price * 100), 1)

_bot = None


async def notify_admin(text: str):
    if ADMIN_ID and _bot:
        try:
            await _bot.send_message(ADMIN_ID, text)
        except Exception as e:
            print("notify_admin fail:", e)
    else:
        print("ADMIN:", text)


def roll_w(items):
    import random
    total = sum(w for *_, w in items)
    r = random.random() * total
    for it in items:
        r -= it[-1]
        if r <= 0:
            return it
    return items[0]


def fmt_ts(ts: int) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(ts).strftime("%d.%m %H:%M")


async def reminder_loop():
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    while True:
        try:
            import time as _t
            for w in db.wd_due(int(_t.time())):
                kb = InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text="Да", callback_data=f"yes_wd:{w['id']}"),
                    InlineKeyboardButton(text="Нет", callback_data=f"no_wd:{w['id']}"),
                ]])
                if _bot:
                    await _bot.send_message(
                        w["tg_id"],
                        f'Вы точно хотите вывести "{w["name"]}" в "{fmt_ts(w["slot_ts"])}"?',
                        reply_markup=kb)
                db.wd_set_status(w["id"], "asked")
        except Exception as e:
            print("reminder_loop:", e)
        await asyncio.sleep(30)

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
    global _bot
    db.init_db()
    configure(WEBAPP_URL)
    task = None
    sched = None
    if BOT_TOKEN:
        _bot = Bot(token=BOT_TOKEN)
        task = asyncio.create_task(dp.start_polling(_bot))
        sched = asyncio.create_task(reminder_loop())
        print("bot polling started")
    else:
        print("BOT_TOKEN пуст — бот не запущен, только API+статика")
    yield
    if task:
        task.cancel()
    if sched:
        sched.cancel()


app = FastAPI(title="GGURM")
app.router.lifespan_context = lifespan


@app.post("/api/me")
def api_me(body: In):
    u = need_user(body.initData)
    st = db.get_user(int(u["id"]))
    return {"ok": True, "is_admin": is_admin(int(u["id"]), u.get("username")), **st}


def need_admin(init_data: str) -> int:
    u = need_user(init_data)
    if not is_admin(int(u["id"]), u.get("username")):
        raise HTTPException(403, "not admin")
    return int(u["id"])


class GiveIn(BaseModel):
    initData: str = ""
    target_id: int = 0
    amount: int = 0


class PromoCreateIn(BaseModel):
    initData: str = ""
    code: str = ""
    kind: str = "coins"
    amount: int = 0
    uses: int = 1


class ResetCdIn(BaseModel):
    initData: str = ""
    target: str = "all"  # "all" или telegram id


@app.post("/api/admin_give")
def api_admin_give(body: GiveIn):
    need_admin(body.initData)
    if body.target_id <= 0 or body.amount <= 0 or body.amount > 1_000_000_000:
        raise HTTPException(400, "bad args")
    return {"ok": True, "balance": db.add_balance(body.target_id, body.amount)}


@app.post("/api/admin_promo")
def api_admin_promo(body: PromoCreateIn):
    need_admin(body.initData)
    if not db.promo_create(body.code, body.kind, body.amount, body.uses):
        raise HTTPException(400, "bad promo (код занят или неверные поля)")
    return {"ok": True, "promos": db.promo_list()}


@app.post("/api/admin_promos")
def api_admin_promos(body: In):
    need_admin(body.initData)
    return {"ok": True, "promos": db.promo_list()}


@app.post("/api/admin_reset_cd")
def api_admin_reset_cd(body: ResetCdIn):
    need_admin(body.initData)
    import sqlite3 as _sq
    from db import _conn, _lock
    with _lock, _conn() as c:
        if body.target == "all":
            cur = c.execute("UPDATE users SET free_cd=0")
        else:
            cur = c.execute("UPDATE users SET free_cd=0 WHERE tg_id=?", (int(body.target or 0),))
    return {"ok": True, "n": cur.rowcount}


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
    custom = db.promo_redeem(code)
    if custom:
        kind, amount = custom
        if kind == "bonus":
            db.set_bonus(uid, 1)
            return {"ok": True, "kind": "bonus"}
        if kind == "freecase":
            from db import _conn as _c2, _lock as _l2
            with _l2, _c2() as c:
                c.execute("UPDATE users SET free_cd=0 WHERE tg_id=?", (uid,))
            return {"ok": True, "kind": "freecase"}
        if kind == "secret":
            from db import _conn as _c3, _lock as _l3
            with _l3, _c3() as c:
                c.execute("UPDATE users SET free_secret=free_secret+1 WHERE tg_id=?", (uid,))
            return {"ok": True, "kind": "secret"}
        st = db.get_user(uid)
        if st["bonus"]:
            amount = int(amount * 1.15)
            db.set_bonus(uid, 0)
        bal = db.add_balance(uid, amount)
        return {"ok": True, "kind": "credit", "gg": amount, "balance": bal}
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
    if not (1 <= body.stars <= 10000):
        raise HTTPException(400, "stars 1..10000")
    base = body.stars * STAR_RATE
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


@app.get("/api/top")
def api_top():
    return {"ok": True, "top": db.get_top(70, 86400, 10)}


class MemeIn(BaseModel):
    initData: str = ""
    items: list = []


@app.post("/api/open_free")
async def api_open_free(body: In):
    import time as _t
    u = need_user(body.initData)
    uid = int(u["id"])
    st = db.get_user(uid)
    if st.get("free_cd", 0) > int(_t.time()):
        raise HTTPException(429, "cooldown")
    price = roll_w(FREE_W)[0]
    bal = db.add_balance(uid, price)
    db.set_free_cd(uid, int(_t.time()) + FREE_CD_MS)
    st2 = db.get_user(uid)
    db.push_feed(uid, u.get("first_name", "Игрок"), "assets/ggcoin.png", price)
    return {"ok": True, "price": price, "balance": bal, "won": st2["won"]}


@app.post("/api/open_secret")
def api_open_secret(body: In):
    u = need_user(body.initData)
    uid = int(u["id"])
    st0 = db.get_user(uid)
    free_open = (st0.get("free_secret") or 0) > 0
    if free_open:
        from db import _conn as _c4, _lock as _l4
        with _l4, _c4() as c:
            c.execute("UPDATE users SET free_secret=free_secret-1 WHERE tg_id=?", (uid,))
        bal = st0["balance"]
    else:
        bal = db.deduct_balance(uid, SECRET_PRICE)
        if bal is None:
            raise HTTPException(402, "need 89 GG")
    name, letter, price, _w = roll_w(SECRET_W)
    item_id = db.inv_add(uid, name, letter, price)
    from db import _conn, _lock
    with _lock, _conn() as c:
        c.execute("UPDATE users SET opened=opened+1 WHERE tg_id=?", (uid,))
    st = db.get_user(uid)
    db.push_feed(uid, u.get("first_name", "Игрок"), "", price)
    return {"ok": True, "item": {"id": item_id, "name": name, "letter": letter, "price": price},
            "balance": bal, "won": st["won"]}


@app.post("/api/import_memes")
def api_import_memes(body: MemeIn):
    u = need_user(body.initData)
    uid = int(u["id"])
    import time as _t
    n = 0
    for it in (body.items or [])[:50]:
        try:
            db.inv_add(uid, str(it.get("name", "Мем"))[:40], str(it.get("letter", "М"))[:2],
                       int(it.get("price", 0)))
            n += 1
        except Exception:
            pass
    return {"ok": True, "n": n}


@app.post("/api/inventory")
def api_inventory(body: In):
    u = need_user(body.initData)
    return {"ok": True, "items": db.inv_list(int(u["id"]))}


class SellIn(BaseModel):
    initData: str = ""
    item_id: int = 0


@app.post("/api/sell")
def api_sell(body: SellIn):
    u = need_user(body.initData)
    bal = db.inv_sell(int(body.item_id), int(u["id"]))
    if bal is None:
        raise HTTPException(400, "no item")
    return {"ok": True, "balance": bal}


class SellAllIn(BaseModel):
    initData: str = ""


@app.post("/api/sell_all")
def api_sell_all(body: SellAllIn):
    u = need_user(body.initData)
    total = db.inv_sell_all(int(u["id"]))
    st = db.get_user(int(u["id"]))
    return {"ok": True, "total": total, "balance": st["balance"]}


class WdIn(BaseModel):
    initData: str = ""
    item_id: int = 0
    roblox: str = ""
    slot_ts: int = 0


class UpIn(BaseModel):
    initData: str = ""
    item_id: int = 0
    target: str = ""


@app.post("/api/upgrade_targets")
def api_upgrade_targets(body: In):
    need_user(body.initData)
    return {"ok": True, "targets": UPGRADE_TARGETS}


@app.post("/api/upgrade")
def api_upgrade(body: UpIn):
    import random as _rnd
    u = need_user(body.initData)
    uid = int(u["id"])
    tgt = next((t for t in UPGRADE_TARGETS if t["name"] == body.target), None)
    if not tgt:
        raise HTTPException(400, "no target")
    bet = db.inv_consume(body.item_id, uid)
    if not bet:
        raise HTTPException(400, "no item")
    chance = upgrade_chance(bet["price"], tgt["price"])
    win = _rnd.random() * 100 < chance
    item = None
    if win:
        iid = db.inv_add(uid, tgt["name"], tgt["letter"], tgt["price"])
        item = {"id": iid, "name": tgt["name"], "letter": tgt["letter"], "price": tgt["price"]}
        db.push_feed(uid, u.get("first_name", "Игрок"), "", tgt["price"])
    from db import _conn, _lock
    with _lock, _conn() as c:
        c.execute("UPDATE users SET opened=opened+1 WHERE tg_id=?", (uid,))
    return {"ok": True, "win": win, "chance": chance, "item": item}


@app.post("/api/withdraw")
async def api_withdraw(body: WdIn):
    u = need_user(body.initData)
    uid = int(u["id"])
    wd, err = db.wd_create(uid, body.item_id, body.roblox, body.slot_ts)
    if err:
        raise HTTPException(400, err)
    await notify_admin(
        f"Новая заявка на вывод #{wd['id']}: {wd['name']} ({wd['price']} GG), "
        f"игрок {uid}, Roblox: {wd['roblox']}, время: {fmt_ts(wd['slot_ts'])}")
    return {"ok": True, "id": wd["id"]}


@app.post("/api/withdraws")
def api_withdraws(body: In):
    u = need_user(body.initData)
    return {"ok": True, "items": db.wd_history(int(u["id"]))}


@app.get("/api/health")
def health():
    return {"ok": True}


if os.path.isdir(WEBAPP_DIR):
    app.mount("/", StaticFiles(directory=WEBAPP_DIR, html=True), name="webapp")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
