FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot.py bot_handlers.py db.py server.py ./
CMD uvicorn server:app --host 0.0.0.0 --port $PORT
