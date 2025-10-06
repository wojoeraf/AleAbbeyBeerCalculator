# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# App-Dir + non-root user
WORKDIR /app
RUN useradd -u 10001 -ms /bin/bash appuser

# pre cache deps
COPY requirements.txt .
RUN pip install -r requirements.txt

# App-Code
COPY . .

# Standard-Port for Fly (Service listnes on 8080)
EXPOSE 8080

# run as Non-Root user
USER appuser

# Gunicorn: 1–4 Worker, depends on RAM. Start with 2 is ok.
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "2", "app:app"]
