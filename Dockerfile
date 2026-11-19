# =============================================================================
# STAGE 1: FRONTEND BUILD (React + Vite)
# =============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
COPY .env ./
RUN npm run build

# =============================================================================
# STAGE 2: PRODUCTION FASTAPI BACKEND & SPA SERVER
# =============================================================================
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system runtime & build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY backend/ ./backend/
COPY .env ./.env

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create persistent storage directories
RUN mkdir -p /app/data/uploads /app/chroma_db

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
