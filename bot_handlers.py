"""Хендлеры бота GGУРМ. Используются и локальным bot.py, и server.py (общая БД)."""
from aiogram import Dispatcher, types, F
from aiogram.filters import CommandStart, Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, LabeledPrice
from aiogram import Bot
import logging
import os
import secrets
import db

log = logging.getLogger("ggurm")
ADMIN_ID = int(os.getenv("ADMIN_ID", "5355350906") or 0)  # создатель бота @nojexo
ADMIN_USERNAMES = {u.strip().lower() for u in os.getenv("ADMIN_USERNAMES", "nojexo").split(",") if u.strip()}


def is_admin(u: types.User) -> bool:
    if ADMIN_ID and u.id == ADMIN_ID:
        return True
    return bool(u.username) and u.username.lower() in ADMIN_USERNAMES


# Приватный режим: бот отвечает только владельцу
PRIVATE_MODE = os.getenv("PRIVATE_MODE", "1") == "1"


from aiogram import BaseMiddleware


class PrivateMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if not PRIVATE_MODE or not ADMIN_ID and not ADMIN_USERNAMES:
            return await handler(event, data)
        u = data.get("event_from_user")
        if u and is_admin(u):
            return await handler(event, data)
        if isinstance(event, types.Message):
            await event.answer("Бот работает только у владельца.")
        elif isinstance(event, types.CallbackQuery):
            await event.answer("Недоступно.", show_alert=True)
        return None


dp.update.middleware(PrivateMiddleware())
# USE_CODES=0 (по умолчанию): GG начисляются сразу в общую БД (нужен server.py онлайн).
# USE_CODES=1: после оплаты бот выдаёт чек GGDP-... (офлайн-режим без backend).
USE_CODES = os.getenv("USE_CODES", "0") == "1"

WEBAPP_URL = ""
STAR_RATE = 2  # 1 звезда = 2 GG
PACKAGES = [(25, 50), (50, 100), (100, 200), (500, 1000)]  # (звёзды, GG)

dp = Dispatcher()


def configure(webapp_url: str):
    global WEBAPP_URL
    WEBAPP_URL = webapp_url or ""


def main_kb():
    if not WEBAPP_URL.startswith("https://"):
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Пополнить за звёзды", callback_data="deposit")],
        ])
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Открыть GGУРМ", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton(text="Бесплатный кейс", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton(text="Пополнить за звёзды", callback_data="deposit")],
    ])


def deposit_kb():
    rows = [[InlineKeyboardButton(text=f"{s} звёзд → {g} GG", callback_data=f"buy:{s}:{g}")]
            for s, g in PACKAGES]
    if WEBAPP_URL.startswith("https://"):
        rows.append([InlineKeyboardButton(text="Открыть GGУРМ", web_app=WebAppInfo(url=WEBAPP_URL))])
    return InlineKeyboardMarkup(inline_keyboard=rows)


DEPOSIT_TEXT = (
    "<b>Пополнение за звёзды</b>\n\n"
    f"Курс: <b>1 звезда = {STAR_RATE} GG</b>\n"
    "Промокод <b>GGURM</b> даёт +15% (вводится в приложении, в разделе ПРОМОКОД).\n\n"
    "Выбери пакет:"
)


async def show_deposit(message: types.Message):
    await message.answer(DEPOSIT_TEXT, parse_mode="HTML", reply_markup=deposit_kb())


@dp.message(CommandStart())
async def start(m: types.Message, command: CommandStart):
    args = command.args or ""
    if args.startswith("deposit"):
        return await show_deposit(m)
    if args.startswith("support"):
        await m.answer("Опишите вашу проблему и мы постараемся её решить.")
    rows = []
    if WEBAPP_URL.startswith("https://"):
        rows.append([InlineKeyboardButton(text="🚀 Играть!", web_app=WebAppInfo(url=WEBAPP_URL))])
    rows.append([InlineKeyboardButton(text="📢 Новости", url="https://t.me/GGURMNEWS"),
                 InlineKeyboardButton(text="💬 Поддержка", callback_data="support")])
    kb = InlineKeyboardMarkup(inline_keyboard=rows)
    ref = ""
    if args.startswith("ref_"):
        ref = "\nТы пришёл по реферальной ссылке — удачи в кейсах!"
    text = (
        f"Добро пожаловать в GGУРМ!{ref}\n\n"
        "Первые официальные кейсы!\n"
        "» Открывай кейсы\n"
        "» Забирай бесплатный кейс каждые 12 часов\n"
        "» Пополняй баланс за звёзды\n\n"
        "Испытай удачу с нами!"
    )
    await m.answer(text, reply_markup=kb)


@dp.callback_query(F.data == "support")
async def cb_support_btn(cq: types.CallbackQuery):
    await cq.answer()
    await cq.message.answer("Опишите вашу проблему и мы постараемся её решить.")


@dp.message(Command("deposit"))
async def cmd_deposit(m: types.Message):
    await show_deposit(m)


@dp.message(Command("memes"))
async def cmd_memes(m: types.Message):
    items = [i for i in db.inv_list(m.from_user.id) if i["status"] == "active"]
    if not items:
        return await m.answer("Инвентарь пуст. Мемы падают из Секретного кейса в приложении.")
    lines = [f"• {i['name']} — {i['price']} GG" for i in items[:30]]
    total = sum(i["price"] for i in items)
    await m.answer("Твои мемы:\n" + "\n".join(lines) + f"\n\nВсего: {len(items)} шт на {total} GG")


@dp.callback_query(F.data == "no_url")
async def no_url(cq: types.CallbackQuery):
    await cq.answer("Сначала задеплой webapp/ на Vercel и задай WEBAPP_URL", show_alert=True)


@dp.callback_query(F.data == "deposit")
async def cb_deposit(cq: types.CallbackQuery):
    await cq.answer()
    await show_deposit(cq.message)


@dp.callback_query(F.data.startswith("buy:"))
async def cb_buy(cq: types.CallbackQuery, bot: Bot):
    try:
        _, s, g = cq.data.split(":")
        s, g = int(s), int(g)
    except ValueError:
        return await cq.answer("Ошибка пакета", show_alert=True)
    if (s, g) not in PACKAGES:
        return await cq.answer("Такого пакета нет", show_alert=True)
    await cq.answer()
    try:
        await bot.send_invoice(
            chat_id=cq.message.chat.id,
            title=f"{g} GG коинов",
            description=f"Пополнение баланса GGУРМ: {s} ⭐ = {g} GG",
            payload=f"gg_{cq.from_user.id}_{s}_{g}",
            currency="XTR",
            prices=[LabeledPrice(label=f"{g} GG", amount=s)],
            provider_token="",
        )
    except Exception as e:
        log.exception("send_invoice failed")
        await cq.message.answer("Не получилось создать счёт. Попробуй позже или напиши в поддержку.")


@dp.pre_checkout_query()
async def pre_checkout(q: types.PreCheckoutQuery):
    await q.answer(ok=True)


@dp.message(F.successful_payment)
async def success(m: types.Message):
    """Оплата прошла — GG падают на баланс моментально (общая БД)."""
    sp = m.successful_payment
    uid, g = m.from_user.id, 0
    parts = (sp.invoice_payload or "").split("_")
    try:
        if len(parts) == 5 and parts[0] == "app":
            # app_<uid>_<stars>_<base>_<bonusflag> — счёт из Mini App
            uid, base = int(parts[1]), int(parts[3])
            g = base
            u = db.get_user(uid)
            if parts[4] == "1" and u["bonus"]:
                g = int(base * 1.15)
                db.set_bonus(uid, 0)
        elif len(parts) == 4 and parts[0] == "gg":
            # gg_<uid>_<stars>_<gg> — счёт из чата
            uid, g = int(parts[1]), int(parts[3])
    except (ValueError, IndexError):
        uid, g = m.from_user.id, 0
    if g > 0:
        if USE_CODES:
            code = f"GGDP-{uid}-{g}-{secrets.token_hex(3).upper()}"
            await m.answer(
                f"Оплата прошла: <b>{sp.total_amount} звёзд → {g} GG</b>!\n\n"
                f"Твой чек:\n<code>{code}</code>\n\n"
                "Вставь его в приложении: Главная → ПРОМОКОД — и GG упадут на баланс.",
                parse_mode="HTML",
            )
            return
        u = db.get_user(uid)
        if u["bonus"]:
            g = int(g * 1.15)
            db.set_bonus(uid, 0)
        new_bal = db.add_balance(uid, g)
        await m.answer(
            f"Оплата прошла: <b>{sp.total_amount} звёзд → {g} GG</b>!\n\n"
            f"Баланс: <b>{new_bal} GG</b> — уже в приложении, обнови Mini App.",
            parse_mode="HTML",
        )
    else:
        await m.answer("Оплата прошла, но пакет не распознан — напиши в поддержку.", parse_mode="HTML")


@dp.callback_query(F.data.startswith("yes_wd:"))
async def cb_yes_wd(cq: types.CallbackQuery, bot: Bot):
    try:
        wid = int(cq.data.split(":")[1])
    except (ValueError, IndexError):
        return await cq.answer()
    w = db.wd_get(wid)
    if not w or w["tg_id"] != cq.from_user.id or w["status"] != "asked":
        return await cq.answer("Заявка уже обработана")
    db.wd_set_status(wid, "confirmed")
    await cq.answer()
    try:
        await cq.message.edit_text(f'Вывод подтверждён: "{w["name"]}". Ожидай трейд в игре.')
    except Exception:
        pass
    if ADMIN_ID:
        await bot.send_message(ADMIN_ID, f"Игрок {w['tg_id']} подтверждает вывод: {w['name']} ({w['price']} GG), Roblox: {w['roblox']}")


@dp.callback_query(F.data.startswith("no_wd:"))
async def cb_no_wd(cq: types.CallbackQuery, bot: Bot):
    try:
        wid = int(cq.data.split(":")[1])
    except (ValueError, IndexError):
        return await cq.answer()
    w = db.wd_get(wid)
    if not w or w["tg_id"] != cq.from_user.id or w["status"] != "asked":
        return await cq.answer("Заявка уже обработана")
    db.wd_set_status(wid, "cancelled")
    await cq.answer()
    try:
        await cq.message.edit_text(f'Вывод "{w["name"]}" отменён. Мем возвращён в инвентарь.')
    except Exception:
        pass
    if ADMIN_ID:
        await bot.send_message(ADMIN_ID, f"Игрок {w['tg_id']} отказался от вывода: {w['name']} ({w['price']} GG)")


pending_reply: dict[int, int] = {}  # admin_id -> user_id, кому отвечает админ


def _who(u: types.User) -> str:
    if u.username:
        return f"@{u.username} [id {u.id}]"
    name = (u.full_name or "Игрок").strip() or "Игрок"
    return f"{name} [id {u.id}]"


@dp.callback_query(F.data.startswith("reply:"))
async def cb_reply(cq: types.CallbackQuery):
    if not is_admin(cq.from_user):
        return await cq.answer("Только для админа")
    try:
        target = int(cq.data.split(":")[1])
    except (ValueError, IndexError):
        return await cq.answer()
    pending_reply[cq.from_user.id] = target
    await cq.answer()
    await cq.message.answer(f"Напиши ответ пользователю [id {target}] следующим сообщением.")


async def _to_admin(bot: Bot, user: types.User, text: str):
    if not ADMIN_ID:
        return False
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Ответить", callback_data=f"reply:{user.id}")]])
    await bot.send_message(ADMIN_ID, f"Сообщение от {_who(user)}:\n\n{text}", reply_markup=kb)
    return True


KEYWORDS = {"баланс", "профиль", "кейс", "бесплатный", "кейсы", "пополнить", "депозит", "звезды", "звёзды"}


@dp.message(F.text)
async def support_catcher(m: types.Message, bot: Bot):
    # ответ админа пользователю
    if is_admin(m.from_user) and m.from_user.id in pending_reply:
        target = pending_reply.pop(m.from_user.id)
        try:
            await bot.send_message(target, f"Ответ поддержки:\n\n{m.text}")
            await m.answer("Ответ отправлен.")
        except Exception:
            await m.answer("Не получилось доставить ответ.")
        return
    if is_admin(m.from_user):
        pass  # свои сообщения тоже пересылаем себе
    elif not ADMIN_ID and not ADMIN_USERNAMES:
        await m.answer("Поддержка пока не настроена.")
        return
    if (m.text or "").strip().lower() in KEYWORDS:
        return await fallback(m)
    if (m.text or "").startswith("/"):
        return
    try:
        await _to_admin(bot, m.from_user, m.text or "")
    except Exception:
        log.exception("support forward failed")
        await m.answer("Не получилось отправить. Попробуй позже.")
        return
    await m.answer("Сообщение отправлено. Админ ответит сюда.")


@dp.message(F.photo)
async def support_photo(m: types.Message, bot: Bot):
    if not ADMIN_ID:
        return
    try:
        await bot.forward_message(ADMIN_ID, m.chat.id, m.message_id)
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Ответить", callback_data=f"reply:{m.from_user.id}")]])
        await bot.send_message(ADMIN_ID, f"Фото от {_who(m.from_user)}. Подпись: {m.caption or '—'}", reply_markup=kb)
        await m.answer("Сообщение отправлено. Админ ответит сюда.")
    except Exception:
        log.exception("support photo failed")


@dp.message(Command("support"))
async def cmd_support(m: types.Message):
    await m.answer("Опишите вашу проблему и мы постараемся её решить.")


@dp.message(F.text.lower().in_({"баланс", "профиль", "кейс", "бесплатный", "кейсы", "пополнить", "депозит", "звезды", "звёзды"}))
async def fallback(m: types.Message):
    await m.answer("Жми кнопку, чтобы открыть GGУРМ 👇", reply_markup=main_kb())
