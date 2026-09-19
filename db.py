"""Общая SQLite-база бота и backend: баланс, чеки, лента дропа."""
import os
import sqlite3
import threading
import time

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "ggurm.db"))
_lock = threading.Lock()
START_BALANCE = 0
WITHDRAW_MIN = 41  # вывод мемов только от 41 GG
WITHDRAW_DELAY = 3600  # не раньше часа после выигрыша


def _conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_db():
    with _lock, _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS users(
            tg_id INTEGER PRIMARY KEY, balance INTEGER DEFAULT 0,
            won INTEGER DEFAULT 0, opened INTEGER DEFAULT 0,
            bonus INTEGER DEFAULT 0, imported INTEGER DEFAULT 0)""")
        c.execute("""CREATE TABLE IF NOT EXISTS used_codes(
            code TEXT PRIMARY KEY, tg_id INTEGER, gg INTEGER, ts INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS feed(
            id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER,
            name TEXT, img TEXT, price INTEGER, ts INTEGER)""")
        try:
            c.execute("ALTER TABLE feed ADD COLUMN ts INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        for col in ("free_cd INTEGER DEFAULT 0",):
            try:
                c.execute(f"ALTER TABLE users ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass
        c.execute("""CREATE TABLE IF NOT EXISTS inventory(
            id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER,
            name TEXT, letter TEXT, price INTEGER, won_ts INTEGER,
            status TEXT DEFAULT 'active')""")
        c.execute("""CREATE TABLE IF NOT EXISTS withdraws(
            id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, item_id INTEGER,
            name TEXT, price INTEGER, roblox TEXT, slot_ts INTEGER,
            status TEXT DEFAULT 'pending', created_ts INTEGER)""")


def get_user(tg_id: int) -> dict:
    with _lock, _conn() as c:
        row = c.execute("SELECT balance, won, opened, bonus, imported FROM users WHERE tg_id=?",
                        (tg_id,)).fetchone()
        if not row:
            c.execute("INSERT INTO users(tg_id, balance) VALUES(?,?)", (tg_id, START_BALANCE))
            return {"balance": START_BALANCE, "won": 0, "opened": 0, "bonus": 0, "imported": 0}
        return {"balance": row[0], "won": row[1], "opened": row[2], "bonus": row[3], "imported": row[4]}


def add_balance(tg_id: int, gg: int) -> int:
    get_user(tg_id)
    with _lock, _conn() as c:
        c.execute("UPDATE users SET balance=balance+?, won=won+? WHERE tg_id=?", (gg, gg, tg_id))
        return c.execute("SELECT balance FROM users WHERE tg_id=?", (tg_id,)).fetchone()[0]


def import_local(tg_id: int, balance: int, won: int) -> dict:
    """Одноразовый перенос локального баланса в общий (при первом входе)."""
    u = get_user(tg_id)
    if u["imported"]:
        return u
    balance = max(0, min(int(balance or 0), 100_000_000))
    won = max(0, min(int(won or 0), 100_000_000))
    with _lock, _conn() as c:
        c.execute("UPDATE users SET balance=balance+?, won=won+?, imported=1 WHERE tg_id=?",
                  (balance, won, tg_id))
    return get_user(tg_id)


def set_bonus(tg_id: int, v: int):
    get_user(tg_id)
    with _lock, _conn() as c:
        c.execute("UPDATE users SET bonus=? WHERE tg_id=?", (1 if v else 0, tg_id))


def add_open(tg_id: int):
    get_user(tg_id)
    with _lock, _conn() as c:
        c.execute("UPDATE users SET opened=opened+1 WHERE tg_id=?", (tg_id,))


def use_code(code: str, tg_id: int, gg: int) -> bool:
    with _lock, _conn() as c:
        try:
            c.execute("INSERT INTO used_codes(code, tg_id, gg, ts) VALUES(?,?,?,?)",
                      (code, tg_id, gg, int(time.time())))
            return True
        except sqlite3.IntegrityError:
            return False


def push_feed(tg_id: int, name: str, img: str, price: int):
    with _lock, _conn() as c:
        c.execute("INSERT INTO feed(tg_id, name, img, price, ts) VALUES(?,?,?,?,?)",
                  (tg_id, (name or "Игрок")[:40], (img or "")[:200], int(price or 0), int(time.time())))
        c.execute("DELETE FROM feed WHERE id NOT IN (SELECT id FROM feed ORDER BY id DESC LIMIT 30)")


def get_feed(limit: int = 20) -> list:
    with _lock, _conn() as c:
        rows = c.execute("SELECT name, img, price FROM feed ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{"n": r[0], "e": r[1], "p": r[2]} for r in rows]


def get_top(min_price: int = 70, period_s: int = 86400, limit: int = 10) -> list:
    """Лучшие дропы за период (по умолчанию день, от 70 GG)."""
    import time as _t
    with _lock, _conn() as c:
        rows = c.execute(
            "SELECT name, img, price FROM feed WHERE price>=? AND ts>=? ORDER BY price DESC, id DESC LIMIT ?",
            (min_price, int(_t.time()) - period_s, limit)).fetchall()
    return [{"n": r[0], "e": r[1], "p": r[2]} for r in rows]


# ---------- мемы / вывод ----------
def deduct_balance(tg_id: int, amount: int):
    """Списать GG. Возвращает новый баланс или None если не хватает."""
    get_user(tg_id)
    with _lock, _conn() as c:
        bal = c.execute("SELECT balance FROM users WHERE tg_id=?", (tg_id,)).fetchone()[0]
        if bal < amount:
            return None
        c.execute("UPDATE users SET balance=balance-? WHERE tg_id=?", (amount, tg_id))
        return bal - amount


def set_free_cd(tg_id: int, ts: int):
    get_user(tg_id)
    with _lock, _conn() as c:
        c.execute("UPDATE users SET free_cd=? WHERE tg_id=?", (ts, tg_id))


def inv_add(tg_id: int, name: str, letter: str, price: int) -> int:
    with _lock, _conn() as c:
        cur = c.execute("INSERT INTO inventory(tg_id, name, letter, price, won_ts) VALUES(?,?,?,?,?)",
                        (tg_id, name, letter, price, int(time.time())))
        return cur.lastrowid


def inv_list(tg_id: int) -> list:
    with _lock, _conn() as c:
        rows = c.execute("SELECT id, name, letter, price, won_ts, status FROM inventory WHERE tg_id=? ORDER BY id DESC",
                         (tg_id,)).fetchall()
    return [{"id": r[0], "name": r[1], "letter": r[2], "price": r[3], "won_ts": r[4], "status": r[5]} for r in rows]


def inv_get(item_id: int, tg_id: int):
    with _lock, _conn() as c:
        r = c.execute("SELECT id, name, letter, price, won_ts, status FROM inventory WHERE id=? AND tg_id=?",
                      (item_id, tg_id)).fetchone()
    return {"id": r[0], "name": r[1], "letter": r[2], "price": r[3], "won_ts": r[4], "status": r[5]} if r else None


def inv_sell(item_id: int, tg_id: int):
    it = inv_get(item_id, tg_id)
    if not it or it["status"] != "active":
        return None
    with _lock, _conn() as c:
        c.execute("UPDATE inventory SET status='sold' WHERE id=?", (item_id,))
    return add_balance(tg_id, it["price"])


def inv_sell_all(tg_id: int) -> int:
    items = [i for i in inv_list(tg_id) if i["status"] == "active"]
    total = 0
    for it in items:
        if inv_sell(it["id"], tg_id) is not None:
            total += it["price"]
    return total


def wd_create(tg_id: int, item_id: int, roblox: str, slot_ts: int):
    """Создать заявку. Возвращает (заявка | None, ошибка | None)."""
    it = inv_get(item_id, tg_id)
    if not it or it["status"] != "active":
        return None, "no_item"
    if it["price"] < WITHDRAW_MIN:
        return None, "too_cheap"
    now = int(time.time())
    if slot_ts < it["won_ts"] + WITHDRAW_DELAY:
        return None, "too_early"
    if slot_ts <= now:
        return None, "past"
    roblox = (roblox or "").strip()[:32]
    if len(roblox) < 2:
        return None, "no_nick"
    with _lock, _conn() as c:
        c.execute("UPDATE inventory SET status='withdraw_pending' WHERE id=?", (item_id,))
        cur = c.execute("""INSERT INTO withdraws(tg_id, item_id, name, price, roblox, slot_ts, created_ts)
                           VALUES(?,?,?,?,?,?,?)""",
                        (tg_id, item_id, it["name"], it["price"], roblox, slot_ts, now))
        wid = cur.lastrowid
    return {"id": wid, "name": it["name"], "price": it["price"], "roblox": roblox, "slot_ts": slot_ts}, None


def wd_due(now: int) -> list:
    with _lock, _conn() as c:
        rows = c.execute("SELECT id, tg_id, name, price, roblox, slot_ts FROM withdraws WHERE status='pending' AND slot_ts<=?",
                         (now,)).fetchall()
    return [{"id": r[0], "tg_id": r[1], "name": r[2], "price": r[3], "roblox": r[4], "slot_ts": r[5]} for r in rows]


def wd_get(wid: int):
    with _lock, _conn() as c:
        r = c.execute("SELECT id, tg_id, item_id, name, price, roblox, slot_ts, status FROM withdraws WHERE id=?",
                      (wid,)).fetchone()
    return {"id": r[0], "tg_id": r[1], "item_id": r[2], "name": r[3], "price": r[4],
            "roblox": r[5], "slot_ts": r[6], "status": r[7]} if r else None


def wd_set_status(wid: int, status: str):
    with _lock, _conn() as c:
        c.execute("UPDATE withdraws SET status=? WHERE id=?", (status, wid))
    if status == "cancelled":
        w = wd_get(wid)
        if w:
            with _lock, _conn() as c:
                c.execute("UPDATE inventory SET status='active' WHERE id=?", (w["item_id"],))


def wd_history(tg_id: int) -> list:
    with _lock, _conn() as c:
        rows = c.execute("SELECT id, name, price, roblox, slot_ts, status FROM withdraws WHERE tg_id=? ORDER BY id DESC LIMIT 20",
                         (tg_id,)).fetchall()
    return [{"id": r[0], "name": r[1], "price": r[2], "roblox": r[3], "slot_ts": r[4], "status": r[5]} for r in rows]
