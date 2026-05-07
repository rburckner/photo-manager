#!/usr/bin/env bash
#
# Photo Manager environment check
# Run on the host to verify everything is configured for the container.
#
set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
warn=0
fail=0

ok()   { echo -e "  ${GREEN}[OK]${NC}    $1"; ((pass++)); }
skip() { echo -e "  ${YELLOW}[WARN]${NC}  $1"; ((warn++)); }
err()  { echo -e "  ${RED}[FAIL]${NC}  $1"; ((fail++)); }

echo "========================================"
echo " Photo Manager — Environment Check"
echo "========================================"
echo ""

# ── Docker ──
echo "Docker:"
if command -v docker &>/dev/null; then
  ok "docker is installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
else
  err "docker is not installed"
fi

if docker info &>/dev/null 2>&1; then
  ok "docker daemon is running"
else
  err "docker daemon is not running or current user lacks permissions"
fi

if command -v docker compose &>/dev/null || docker compose version &>/dev/null 2>&1; then
  ok "docker compose is available"
else
  err "docker compose is not available"
fi
echo ""

# ── NAS mount ──
echo "NAS mount:"
NAS_PATH="${PM_MEDIA_ROOT:-/run/user/1000/gvfs/smb-share:server=wd.personal.hq.millabs.net,share=photos}"
if [ -d "$NAS_PATH" ]; then
  file_count=$(find "$NAS_PATH" -maxdepth 1 -type f -o -type d 2>/dev/null | head -5 | wc -l)
  if [ "$file_count" -gt 0 ]; then
    ok "NAS is mounted and readable at $NAS_PATH"
  else
    skip "NAS path exists but appears empty: $NAS_PATH"
  fi
else
  err "NAS not mounted at $NAS_PATH"
  echo "         Set PM_MEDIA_ROOT or mount the NAS share"
fi
echo ""

# ── Ports ──
echo "Port availability:"
for port in 80 8200; do
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
    skip "Port $port is already in use (will conflict with photo-manager)"
  else
    ok "Port $port is available"
  fi
done

# Check UDP 1900
if ss -ulnp 2>/dev/null | grep -q ":1900 " || netstat -ulnp 2>/dev/null | grep -q ":1900 "; then
  skip "UDP port 1900 is already in use (SSDP — another DLNA server running?)"
else
  ok "UDP port 1900 is available (SSDP discovery)"
fi
echo ""

# ── Firewall ──
echo "Firewall:"
if command -v ufw &>/dev/null; then
  ufw_status=$(sudo ufw status 2>/dev/null || echo "unknown")
  if echo "$ufw_status" | grep -q "inactive"; then
    ok "ufw is inactive (no firewall blocking)"
  elif echo "$ufw_status" | grep -q "active"; then
    echo "  ufw is active — checking rules:"
    for port in 80 8200; do
      if echo "$ufw_status" | grep -q "$port"; then
        ok "  Port $port is allowed in ufw"
      else
        err "  Port $port is NOT allowed in ufw — run: sudo ufw allow $port/tcp"
      fi
    done
    if echo "$ufw_status" | grep -q "1900"; then
      ok "  Port 1900/udp is allowed in ufw"
    else
      skip "  Port 1900/udp is NOT in ufw — DLNA discovery may not work. Run: sudo ufw allow 1900/udp"
    fi
  else
    skip "Could not determine ufw status (need sudo?)"
  fi
elif command -v firewall-cmd &>/dev/null; then
  # firewalld (Fedora/RHEL)
  if firewall-cmd --state 2>/dev/null | grep -q "running"; then
    echo "  firewalld is active — checking rules:"
    for port in 80 8200; do
      if firewall-cmd --query-port="${port}/tcp" 2>/dev/null; then
        ok "  Port $port/tcp is allowed"
      else
        err "  Port $port/tcp is NOT allowed — run: sudo firewall-cmd --add-port=${port}/tcp --permanent"
      fi
    done
  else
    ok "firewalld is not running"
  fi
else
  # Check iptables directly
  if command -v iptables &>/dev/null; then
    drop_rules=$(sudo iptables -L INPUT -n 2>/dev/null | grep -c "DROP\|REJECT" || echo "0")
    if [ "$drop_rules" -gt 0 ]; then
      skip "iptables has $drop_rules DROP/REJECT rules — verify ports 80, 8200, 1900/udp are allowed"
    else
      ok "No iptables DROP/REJECT rules found on INPUT chain"
    fi
  else
    ok "No firewall detected"
  fi
fi
echo ""

# ── Container status (if already running) ──
echo "Container status:"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "photo-manager"; then
  ok "photo-manager container is running"

  # Test HTTP
  if curl -sf http://localhost:80/health &>/dev/null; then
    ok "Web server responding on port 80"
  else
    err "Web server not responding on port 80"
  fi

  # Test DLNA
  if curl -sf http://localhost:8200/description.xml &>/dev/null; then
    ok "DLNA server responding on port 8200"
  else
    skip "DLNA server not responding on port 8200"
  fi
else
  skip "photo-manager container is not running (run: docker compose up -d)"
fi
echo ""

# ── Network connectivity (from other devices) ──
echo "Network:"
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LOCAL_IP" ]; then
  ok "Local IP: $LOCAL_IP"
  echo ""
  echo "  Access from other devices on this network:"
  echo "    Web UI:     http://${LOCAL_IP}/"
  echo "    TV Mode:    http://${LOCAL_IP}/tv"
  echo "    DLNA:       Auto-discovered as 'Photo Manager'"
else
  skip "Could not determine local IP"
fi
echo ""

# ── Summary ──
echo "========================================"
echo -e " Results: ${GREEN}${pass} passed${NC}, ${YELLOW}${warn} warnings${NC}, ${RED}${fail} failed${NC}"
echo "========================================"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
