#!/usr/bin/env bash
# Provisions and hardens the SLOMP VPS (ADR-13, SL-144). Idempotent, run as root:
#   sudo bash provision.sh
# Every account in ADMINS must already log in with an SSH key: password login
# is turned off at the end and an account without a key would be locked out.
set -euo pipefail

ADMINS="${ADMINS:-juan katalina}"

[[ "$(id -u)" == 0 ]] || { echo "Run with sudo." >&2; exit 1; }
for u in $ADMINS; do
  grep -qE '^(ssh-|ecdsa-)' "/home/$u/.ssh/authorized_keys" 2>/dev/null \
    || { echo "$u has no SSH key in /home/$u/.ssh/authorized_keys, aborting." >&2; exit 1; }
done

timedatectl set-timezone UTC

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 unattended-upgrades ufw
systemctl enable --now docker
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' \
  > /etc/apt/apt.conf.d/20auto-upgrades

# 2 GiB of swap: with 3.8 GiB of RAM, a bulk LibreOffice run can otherwise get
# the containers OOM-killed (SL-145).
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile

# deploy runs the containers: no sudo, docker group (root-equivalent, see Docker docs).
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
for u in $ADMINS; do cat "/home/$u/.ssh/authorized_keys"; done | sort -u > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# sshd keeps the first value it reads, so 00- wins over cloud-init's 50- file.
cat > /etc/ssh/sshd_config.d/00-slomp.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
mkdir -p /run/sshd
sshd -t
systemctl try-reload-or-restart ssh

# Docker publishes ports through its own iptables chain and skips these rules:
# the production compose must bind internal services to 127.0.0.1 (SL-145).
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

ufw status verbose
docker --version
docker compose version
