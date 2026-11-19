#!/usr/bin/env bash
set -e

echo "=================================================="
echo "    ScholarsMate AWS Production Deployment        "
echo "=================================================="

# 1. Update system packages
echo "[1/4] Updating system packages..."
sudo apt-get update
sudo apt-get install -y git curl ufw ca-certificates

# 2. Install Docker & Docker Compose if not installed
if ! command -v docker &> /dev/null; then
    echo "[2/4] Installing Docker Engine..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER"
    rm get-docker.sh
fi

# 3. Configure Basic Firewall (UFW)
echo "[3/4] Configuring firewall (ports 22, 80, 443)..."
sudo ufw allow OpenSSH || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
echo "y" | sudo ufw enable || true

# 4. Launch Container via Docker Compose
echo "[4/4] Building and launching ScholarsMate container on port 80..."
sudo docker compose down || true
sudo docker compose up -d --build

SERVER_IP=$(curl -s http://checkip.amazonaws.com || echo "your-server-ip")
echo "=================================================="
echo "Deployment Finished Successfully!"
echo "Open ScholarsMate in your browser:"
echo "http://${SERVER_IP}"
echo "=================================================="
