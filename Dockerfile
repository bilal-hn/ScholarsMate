# =============================================================================
# STAGE 1: FRONTEND BUILD (React + Vite)
# =============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
COPY .env* ./
ARG VITE_GOOGLE_CLIENT_ID=1006343471088-k89pd7kusa1lasi2i1e04792gb6fghc4.apps.googleusercontent.com
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# =============================================================================
# STAGE 2: PRODUCTION FASTAPI BACKEND & SPA SERVER
# =============================================================================
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system runtime & build dependencies, fontconfig, and Tectonic LaTeX engine
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    fontconfig \
    libfontconfig1 \
    libharfbuzz0b \
    libgraphite2-3 \
    && (curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh -s -- -b /usr/local/bin || \
        (curl -fsSL https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz | tar -xz -C /usr/local/bin/)) \
    && chmod +x /usr/local/bin/tectonic \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (use CPU-only PyTorch to avoid 4GB+ of useless Nvidia CUDA packages on EC2)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY backend/ ./backend/
COPY .env* ./

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create persistent storage directories
RUN mkdir -p /app/data/uploads /app/chroma_db

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
