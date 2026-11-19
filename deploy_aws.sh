#!/usr/bin/env bash
set -e

echo "=================================================="
echo "    ScholarsMate AWS Production Deployment        "
echo "=================================================="

# 1. Update system packages
echo "[1/5] Updating system packages..."
sudo apt-get update
sudo apt-get install -y git curl ufw ca-certificates

# 2. Configure Swap (Crucial for t2.micro/t3.micro with 1GB RAM to prevent build OOM crashes)
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
if [ "${SWAP_TOTAL:-0}" -lt 1024 ]; then
    echo "[2/5] Creating 2GB swap space for Docker build stability..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
fi

# 3. Install Docker & Docker Compose if not installed
if ! command -v docker &> /dev/null; then
    echo "[3/5] Installing Docker Engine..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER"
    rm get-docker.sh
fi

# 4. Disable host ufw so it doesn't conflict with Docker port forwarding (AWS Security Group handles the firewall)
echo "[4/5] Ensuring UFW firewall does not block Docker traffic..."
sudo ufw disable || true

# 5. Launch Container via Docker Compose
echo "[5/5] Building and launching ScholarsMate & Caddy SSL containers..."
if [ ! -f .env ]; then
    echo "Creating template .env file..."
    touch .env
fi
sudo docker compose down || true
sudo docker compose up -d --build

SERVER_IP=$(curl -s http://checkip.amazonaws.com || echo "16.179.193.122")
echo "=================================================="
echo "Deployment Finished Successfully with HTTPS!"
echo "Open ScholarsMate securely in your browser:"
echo "https://${SERVER_IP}.sslip.io"
echo "=================================================="
