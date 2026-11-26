#!/usr/bin/env bash
# One-time home-server setup for maeth. Run on the server through sudo:
#   ssh -t user@host 'sudo bash -s' < deploy/server-setup.sh
# Safe to run again: it does not duplicate the folder, the unit or the Caddy block.
#
# What it does:
#   - /srv/maeth (owned by whoever deploys, so `npm run deploy` needs no sudo),
#     with releases/ and shared/ (shared/.env holds the server's secrets);
#   - the maeth-api systemd unit: runs current/api.mjs as that user, on
#     127.0.0.1:3110, restarting whenever it exits (that is how a deploy
#     swaps the code in);
#   - a Caddy route: /maeth/api/* to the API, everything else under /maeth/
#     from current/web.
set -euo pipefail

owner=${SUDO_USER:?run through sudo}
home=$(getent passwd "$owner" | cut -d: -f6)
root=/srv/maeth
port=3110
unit=/etc/systemd/system/maeth-api.service
caddyfile=/etc/caddy/Caddyfile
marker='# maeth'

node=$(ls -1d "$home"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n 1)
[ -x "$node" ] || { echo "no node under $home/.nvm" >&2; exit 1; }

install -d -o "$owner" -g "$owner" -m 755 "$root" "$root/releases"
install -d -o "$owner" -g "$owner" -m 700 "$root/shared"

cat > "$unit.new" <<EOF
[Unit]
Description=Maeth API
After=network-online.target
Wants=network-online.target
# A deploy restarts it on purpose, and before the first deploy there is nothing
# to run yet: never give up retrying as if it were a crash loop.
StartLimitIntervalSec=0

[Service]
Type=simple
User=$owner
WorkingDirectory=$root/shared
Environment=NODE_ENV=production
Environment=API_HOST=127.0.0.1
Environment=API_PORT=$port
ExecStart=$node $root/current/api.mjs
Restart=always
RestartSec=1

[Install]
WantedBy=multi-user.target
EOF
mv "$unit.new" "$unit"
systemctl daemon-reload
systemctl enable --now maeth-api.service

if ! grep -qF "$marker" "$caddyfile"; then
  cp "$caddyfile" "$caddyfile.bak-maeth-$(date +%Y%m%d%H%M%S)"
  block=$(cat <<'EOF'
	# maeth — client from /srv/maeth/current/web, API on 127.0.0.1:3110.
	# Deploy: npm run deploy in the game's repository.
	redir /maeth /maeth/ 308
	handle /maeth/api/* {
		uri strip_prefix /maeth
		encode zstd gzip
		reverse_proxy 127.0.0.1:3110
	}
	handle_path /maeth/* {
		root * /srv/maeth/current/web
		encode zstd gzip
		# Hashed bundles never change; index.html changes with every deploy.
		header /assets/* Cache-Control "public, max-age=31536000, immutable"
		# Models, boards and art keep their names across deploys: a day, then revalidate (ETag).
		@media path /models/* /boards/* /pic/* /pieces/* /coin1.webp /coin2.webp
		header @media Cache-Control "public, max-age=86400"
		@page path / /index.html
		header @page Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
EOF
)
  # Before the catch-all `handle {` at the end, like the other games.
  awk -v block="$block" '
    !done && /^\thandle \{/ { print block; done = 1 }
    { print }
    END { if (!done) exit 1 }
  ' "$caddyfile" > "$caddyfile.new" || { echo 'no catch-all "handle {" found in Caddyfile' >&2; rm -f "$caddyfile.new"; exit 1; }
  caddy validate --adapter caddyfile --config "$caddyfile.new"
  chmod 644 "$caddyfile.new"
  mv "$caddyfile.new" "$caddyfile"
fi

systemctl reload caddy
echo "ready: $root owned by $owner, maeth-api enabled (keeps retrying until the first deploy brings current/api.mjs), Caddy serves /maeth/"
