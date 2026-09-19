"""Общая SQLite-база бота и backend: баланс, чеки, лента дропа."""
import os
import sqlite3
import threading
import time

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "ggurm.db"))
_lock = threading.Lock()
START_BALANCE = 500


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
