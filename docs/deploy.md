# Deploying Klatchr (Cycle 7.4)

Klatchr runs as a **single container** (see `Dockerfile`) that serves the built
web bundle **and** the WebSocket on one port/origin. This is the as-built
procedure for the live instance.

- **Live:** <https://klatchr.duckdns.org>
- **Host:** an Oracle Cloud **Always-Free `VM.Standard.E2.1.Micro`** (AMD, 1 vCPU /
  1 GB), running the image directly behind **Caddy** for automatic Let's Encrypt
  TLS → public `https` / `wss`. Free forever, always-on, not a developer machine.

> **Why not the ARM VM + Coolify?** The roomier Oracle `A1.Flex` (ARM) shape is
> stuck in a permanent "out of host capacity" state, and Coolify needs ~2 GB. The
> AMD micro is always available; 1 GB is enough with a swap file and a plain
> Docker + Caddy setup (no panel). GCP `e2-micro` is an equivalent free fallback.

## What runs where

| Piece | Role |
|---|---|
| Oracle E2.1.Micro VM | The always-on host (1 vCPU / 1 GB, Always-Free). |
| 2 GB swap file | Headroom so 1 GB can build **and** run the image. |
| Docker | Builds + runs the image on `127.0.0.1:8080` (localhost only). |
| Caddy | Public on 80/443; reverse-proxies to the container and manages the cert. Passes WebSocket upgrades through. |
| DuckDNS | `klatchr.duckdns.org` → the VM's public IP (a cert needs a name, not an IP). |

## Prerequisites

- An Oracle Cloud account with a VCN that has internet connectivity (the VCN
  wizard's "Create VCN with Internet Connectivity" builds one).
- A DuckDNS subdomain pointed at the VM's public IP.

## One-time setup

### 1. Create the VM

Compute → Instances → Create. Image **Ubuntu 22.04+** (see the focal note below),
shape **`VM.Standard.E2.1.Micro`** (Always-Free-eligible), your VCN's **public
subnet**, **Assign a public IPv4 address = Yes**. Save the SSH private key. Note
the **public IP** (`<VM_IP>`).

### 2. Point DuckDNS at it

At <https://www.duckdns.org>: add a subdomain (e.g. `klatchr`) and set its current
IP to `<VM_IP>`. Verify from your machine: `dig +short klatchr.duckdns.org` prints
`<VM_IP>`.

### 3. Open the firewall — **both layers**

Oracle blocks traffic in two independent places; open **80** and **443** in both.

**A — Oracle console:** your VCN → Security Lists → Default Security List → Add
Ingress Rules (Source `0.0.0.0/0`, TCP): one for `80`, one for `443`.

**B — on the VM** (Oracle's Ubuntu ships a locked-down iptables):

```bash
ssh -i <path-to-key> ubuntu@<VM_IP>        # chmod 600 the key first if SSH refuses it

sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 4. Swap (so 1 GB is enough)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                                     # Swap should show 2.0Gi
```

### 5. Docker + build + run

```bash
sudo apt install -y docker.io               # see the focal note — this, not get.docker.com
git clone https://github.com/ramazankarisan/klatchr.git
cd klatchr
sudo docker build -t klatchr .              # a few minutes on 1 GB; swap covers it
sudo docker run -d --restart unless-stopped --name klatchr -p 127.0.0.1:8080:8080 klatchr
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/   # expect 200
```

Binding to `127.0.0.1` keeps the raw container off the internet — only Caddy faces
the world, with TLS. `--restart unless-stopped` survives reboots.

### 6. Caddy = automatic HTTPS/WSS

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Then the whole config is:

```bash
echo 'klatchr.duckdns.org {
    reverse_proxy 127.0.0.1:8080
}' | sudo tee /etc/caddy/Caddyfile

sudo systemctl reload caddy
sudo journalctl -u caddy -f                 # wait for "certificate obtained", then Ctrl-C
```

### 7. Verify

Open <https://klatchr.duckdns.org> (padlock = TLS live). Host a room on a laptop,
join from two phones, play a round. Drop wifi on a phone → the "Reconnecting…"
indicator shows, then it heals and keeps its seat (7.2). Reload the host tab
mid-round → the same room resumes within the grace window (7.1).

## Updating / redeploying

There is no git-push automation on this path. To ship a new version, SSH in and:

```bash
cd klatchr
git pull
sudo docker build -t klatchr .
sudo docker rm -f klatchr
sudo docker run -d --restart unless-stopped --name klatchr -p 127.0.0.1:8080:8080 klatchr
```

**Live rooms are in memory (rule 7)** — a redeploy or a VM reboot ends any game in
progress. That is acceptable: "available for everyone" means the *server* is always
reachable, not that a round survives a restart.

## Gotchas we actually hit

- **`get.docker.com` fails** on the VM's Ubuntu 20.04 (focal, EOL) — it tries to
  install a package that doesn't exist for focal. Use `sudo apt install -y
  docker.io` instead (older Docker, builds + runs the image fine).
- **`UNPROTECTED PRIVATE KEY FILE`** on SSH → `chmod 600 <key>`, then retry.
- **`docker run` must be one line** — if it wraps in the terminal, the image name
  can land on its own line and error as `command not found`.
- **Container returns `000` right after start** — it's still booting (tsx + Nest on
  1 GB takes ~10 s). `docker logs klatchr` shows Nest starting; retry the curl.
- **`docker build` gets OOM-killed** (even with swap): build on a bigger machine and
  ship the image — `docker save klatchr | gzip > klatchr.tar.gz`, `scp` it up, then
  `gunzip -c klatchr.tar.gz | sudo docker load` and `docker run` as in step 5.

## Notes

- **OS is EOL.** The live VM is on Ubuntu 20.04 (focal), which no longer gets
  security patches. Fine for a stateless party server; recreate on Ubuntu 22.04/24.04
  (redo steps 3–6) if you want OS updates.
- **Same-origin URL.** The image bakes `VITE_WS_URL=same-origin`
  (`apps/web/.env.production`), so the browser talks to `wss://<its-own-host>` — no
  host is hardcoded (rule 6). `PORT` and `WEB_DIST` are set in the `Dockerfile`.
- **Alternative host.** GCP `e2-micro` (us-west1/central1/east1) is the same 1 GB
  free-forever VM; steps 3–6 are identical, only the VM creation and firewall
  console differ.
