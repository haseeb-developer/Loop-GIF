FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd -r -u 10001 app && mkdir -p /data/media /data/sources /data/tmp && chown -R app /data
COPY app ./app
USER app
EXPOSE 8000
# Single process on purpose: rate limiter and job pool are in-process (see README "Scaling").
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
