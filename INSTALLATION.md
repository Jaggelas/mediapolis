# Mediapolis Installation Guide

This is a complete from-scratch installation guide for Mediapolis on a brand-new Linux or Windows machine.

It assumes:

- the machine has no project files yet
- Docker is not installed yet
- Git may not be installed yet
- Mediapolis will be run with Docker Compose
- qBittorrent, Jackett, and Plex will either run on the same machine or be reachable on your LAN

Mediapolis itself runs these containers:

- `app-web`
- `app-worker`
- `postgres`

You will connect it to:

- qBittorrent
- Jackett
- Plex folders

## What You Need Before Starting

Prepare these items before installing:

- Your Mediapolis repository URL or a copy of the project files
- A local network IP for the server, for example `192.168.1.50`
- TMDB API key
- OpenAI-compatible API key if you want AI matching enabled
- Decide whether qBittorrent, Jackett, and Plex will run on this host or on another reachable machine
- The final folders Plex should scan for movies and TV shows

If you follow the install sections later in this guide, you will create the qBittorrent credentials and Jackett API key during setup.

## Ports and Network Notes

By default this project exposes:

- `80` for the web UI when using `docker-compose.prod.yml`

The app also needs to reach:

- qBittorrent Web UI
- Jackett
- Plex library folders on disk

Important networking rule:

- If qBittorrent or Jackett are outside the same Compose stack, do not blindly use `localhost`.
- From inside Docker, `localhost` means the container itself.
- Use the server LAN IP or `host.docker.internal` when appropriate.
- On Linux Docker hosts, `host.docker.internal` usually requires `extra_hosts: ["host.docker.internal:host-gateway"]` on the app services.

## Directory Layout Used In This Guide

Linux host folders:

```text
/opt/mediapolis
/srv/mediapolis/downloads/incoming
/srv/mediapolis/media/movies
/srv/mediapolis/media/tv
```

Windows host folders:

```text
C:/mediapolis-app
C:/mediapolis/downloads/incoming
C:/mediapolis/media/movies
C:/mediapolis/media/tv
```

## Part 1: Fresh Ubuntu Linux Server

This section assumes Ubuntu 22.04 or newer.

### Step 1: Log in and update the OS

Run:

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

After reboot, log in again.

### Step 2: Install basic utilities

Run:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git nano ufw
```

Verify Git:

```bash
git --version
```

### Step 3: Install Docker Engine and Docker Compose

Create Docker's package key directory:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
```

Download the Docker GPG key:

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

Add the Docker package repository:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Enable Docker at boot:

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

Add your user to the Docker group:

```bash
sudo usermod -aG docker $USER
```

Log out completely and log back in. Then verify:

```bash
docker --version
docker compose version
docker info
```

### Step 4: Open firewall access for the web UI

If you use `ufw`, allow HTTP:

```bash
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

If your environment uses another firewall or cloud security group, allow inbound TCP `80`.

### Step 5: Create the host folders

Run:

```bash
sudo mkdir -p /srv/mediapolis/downloads/incoming
sudo mkdir -p /srv/mediapolis/media/movies
sudo mkdir -p /srv/mediapolis/media/tv
sudo chown -R $USER:$USER /srv/mediapolis
```

Verify:

```bash
ls -la /srv/mediapolis
ls -la /srv/mediapolis/downloads
ls -la /srv/mediapolis/media
```

### Linux: Install qBittorrent, Jackett, and Plex on this host

If these services already exist on another machine, skip this section and continue to `Step 6`.

This guide assumes the following local service ports:

- qBittorrent Web UI: `8080`
- Jackett: `9117`
- Plex: `32400`

If you want to reach those services from another device on your LAN, open those ports in `ufw` now:

```bash
sudo ufw allow 8080/tcp
sudo ufw allow 9117/tcp
sudo ufw allow 32400/tcp
```

Install qBittorrent:

```bash
sudo apt update
sudo apt install -y qbittorrent-nox
sudo tee /etc/systemd/system/qbittorrent-nox.service > /dev/null <<'EOF'
[Unit]
Description=qBittorrent-nox
After=network-online.target

[Service]
Type=simple
User=YOUR_USERNAME
Group=YOUR_USERNAME
UMask=002
ExecStart=/usr/bin/qbittorrent-nox --webui-port=8080 --confirm-legal-notice
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now qbittorrent-nox
sudo systemctl status qbittorrent-nox --no-pager
```

Replace `YOUR_USERNAME` with the Linux account that owns `/srv/mediapolis`.

Then open:

```text
http://SERVER_IP:8080
```

qBittorrent usually starts with `admin` / `adminadmin` and asks you to change that password on first sign-in.

Install Jackett using the official Linux AMD64 package:

```bash
sudo apt install -y wget
cd /opt
sudo rm -rf /opt/Jackett
wget -O - -o /dev/stderr https://github.com/Jackett/Jackett/releases/latest/download/Jackett.Binaries.LinuxAMDx64.tar.gz | sudo tar -xz
cd /opt/Jackett
sudo chown -R $(whoami):$(id -g) /opt/Jackett
sudo ./install_service_systemd.sh
sudo systemctl enable --now jackett
sudo systemctl status jackett --no-pager
```

Then open:

```text
http://SERVER_IP:9117
```

Install Plex Media Server:

```bash
curl -LsSf https://repo.plex.tv/scripts/setupRepo.sh | sudo bash
sudo apt update
sudo apt install -y plexmediaserver
sudo usermod -aG $USER plex
sudo systemctl enable --now plexmediaserver
sudo systemctl status plexmediaserver --no-pager
```

Then open:

```text
http://SERVER_IP:32400/web
```

Sign in to Plex and complete the initial server claim. If Plex cannot see the Mediapolis library folders later, grant the `plex` service account read access to `/srv/mediapolis/media`.

### Step 6: Download the project files

Create the app folder:

```bash
sudo mkdir -p /opt/mediapolis
sudo chown -R $USER:$USER /opt/mediapolis
cd /opt/
```

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL> .
```

Verify the files exist:

```bash
ls
```

You should see at least:

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `.env.example`

### Step 7: Create the runtime configuration file

Copy the example env file:

```bash
cp .env.example .env
```

Open it in an editor:

```bash
nano .env
```

Set every required value.

Use this Linux-oriented template:

```env
DATABASE_URL="postgresql://mediapolis:mediapolis@postgres:5432/mediapolis?schema=public"
SHADOW_DATABASE_URL="postgresql://mediapolis:mediapolis@postgres:5432/mediapolis_shadow?schema=public"
SESSION_SECRET="replace-this-with-a-long-random-secret-at-least-32-characters"
# Leave unset to auto-detect HTTP vs HTTPS, or set to false for plain LAN HTTP.
# SESSION_COOKIE_SECURE="true"
ADMIN_EMAIL="admin@example.local"
ADMIN_PASSWORD="change-this-password"
TMDB_API_KEY="your_tmdb_key"
OPENAI_API_KEY="your_openai_key_or_leave_blank"
OPENAI_MODEL="gpt-4.1-mini"
JACKETT_BASE_URL="http://host.docker.internal:9117"
JACKETT_API_KEY="your_jackett_api_key"
JACKETT_INDEXER="all"
QBITTORRENT_BASE_URL="http://host.docker.internal:8080"
QBITTORRENT_USERNAME="admin"
QBITTORRENT_PASSWORD="your_qbittorrent_password"
PLEX_MOVIES_DIR="/media/movies"
PLEX_TV_DIR="/media/tv"
DOWNLOADS_INCOMING_DIR="/downloads/incoming"
AUTO_DOWNLOAD_THRESHOLD="0.86"
SEARCH_INTERVAL_MINUTES="15"
POLL_INTERVAL_SECONDS="30"
ALLOW_AUTO_DOWNLOADS="true"
NEXT_PUBLIC_APP_NAME="Mediapolis"
HOST_DOWNLOADS_INCOMING="/srv/mediapolis/downloads/incoming"
HOST_PLEX_MOVIES_DIR="/srv/mediapolis/media/movies"
HOST_PLEX_TV_DIR="/srv/mediapolis/media/tv"
```

Save and exit.

Important value notes:

- `DATABASE_URL` should stay pointed at `postgres` because that service runs inside Compose.
- Leave `SESSION_COOKIE_SECURE` unset to auto-detect based on the incoming request protocol. Set it to `false` if users will only access the app over plain `http://SERVER_IP`.
- `JACKETT_BASE_URL` and `QBITTORRENT_BASE_URL` should point to whatever address the containers can reach.
- When Jackett or qBittorrent run on the same Linux host as Docker, `http://host.docker.internal:<port>` works well once the app services include `extra_hosts: ["host.docker.internal:host-gateway"]`.
- If you prefer, you can still use the Linux server LAN IP instead.
- `PLEX_MOVIES_DIR`, `PLEX_TV_DIR`, and `DOWNLOADS_INCOMING_DIR` are container paths.
- `HOST_*` values are the actual Linux host paths.

### Step 8: Start the containers

Build and start everything:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Watch startup state:

```bash
docker compose ps
```

If something failed immediately, inspect logs:

```bash
docker compose logs app-web
docker compose logs app-worker
docker compose logs postgres
```

### Step 9: Apply the database migration

Run:

```bash
docker compose exec app-web npx prisma migrate deploy
```

If that fails because the database is not reachable, inspect:

```bash
docker compose logs postgres
docker compose logs app-web
```

### Step 10: Seed the admin account

Run:

```bash
docker compose exec app-web npm run prisma:seed
```

This creates or updates:

- the admin user from `ADMIN_EMAIL`
- the admin password from `ADMIN_PASSWORD`
- a default Jackett indexer profile

### Step 11: Verify the server is healthy

Run:

```bash
curl http://127.0.0.1/api/health
```

Then run from another machine if needed:

```bash
curl http://SERVER_IP/api/health
```

Expected result:

- JSON containing `"ok": true`

### Step 12: Open the app

From the server:

```text
http://127.0.0.1
```

From another phone or computer on the LAN:

```text
http://SERVER_IP
```

Log in with:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### Step 13: First-time verification inside the UI

After login:

1. Open `Settings`.
2. Confirm the app paths are correct.
3. Confirm Jackett/qBittorrent/TMDB/OpenAI values are present as expected.
4. Open `Requests`.
5. Submit a test request.
6. Confirm the worker starts searching.
7. Confirm completed downloads move into the Plex folders.

### Step 14: Reboot behavior

The containers use restart policy `unless-stopped`, so they should come back automatically after a reboot.

To test:

```bash
sudo reboot
```

After the server comes back:

```bash
docker compose ps
```

### Step 15: Upgrade later

When you update the code:

```bash
cd /opt/mediapolis
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec app-web npx prisma migrate deploy
```

## Part 2: Fresh Windows Machine

This section assumes Windows 11 or Windows Server where Docker Desktop is allowed.

### Step 1: Install Windows updates

Run Windows Update completely and reboot if prompted.

### Step 2: Install Git for Windows

Download and install:

- [https://git-scm.com/download/win](https://git-scm.com/download/win)

During installation, the default options are usually fine.

After installation, open PowerShell and verify:

```powershell
git --version
```

### Step 3: Install Docker Desktop

Download and install:

- [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

During setup:

- enable WSL2 integration if prompted
- allow required Windows features to be installed
- reboot if Docker asks for it

After reboot, start Docker Desktop and wait until it shows it is running.

Verify in PowerShell:

```powershell
docker --version
docker compose version
docker info
```

### Step 4: Create the host folders

In PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path "C:\mediapolis-app"
New-Item -ItemType Directory -Force -Path "C:\mediapolis\downloads\incoming"
New-Item -ItemType Directory -Force -Path "C:\mediapolis\media\movies"
New-Item -ItemType Directory -Force -Path "C:\mediapolis\media\tv"
```

Verify:

```powershell
Get-ChildItem "C:\mediapolis"
```

### Step 5: Allow Docker Desktop to access the drive

Open Docker Desktop and ensure the drive containing:

- `C:\mediapolis-app`
- `C:\mediapolis`

is shared/accessible for bind mounts.

### Windows: Install qBittorrent, Jackett, and Plex on this host

If these services already exist on another machine, skip this section and continue to `Step 6`.

Install qBittorrent for Windows from the official download page:

- [https://www.qbittorrent.org/download](https://www.qbittorrent.org/download)

During qBittorrent setup and first launch:

1. Open `Tools` -> `Options`.
2. In `Web UI`, enable the Web User Interface.
3. Set a known username and password.
4. Keep port `8080` or update `.env` later to match your chosen port.
5. In `Downloads`, set the default save path to `C:\mediapolis\downloads\incoming`.

Install Jackett from the official releases page:

- [https://github.com/Jackett/Jackett/releases/latest](https://github.com/Jackett/Jackett/releases/latest)

Use `Jackett.Installer.Windows.exe` if you want a standard install. During setup, allow it to run as a Windows service if that option is offered.

After install, browse to:

```text
http://127.0.0.1:9117
```

Install Plex Media Server from the official downloads page:

- [https://www.plex.tv/media-server-downloads/](https://www.plex.tv/media-server-downloads/)

After install, sign in and claim the server in:

```text
http://127.0.0.1:32400/web
```

If Windows Defender Firewall prompts you for access, allow private network access for qBittorrent, Jackett, and Plex. If you want to use them from another device on your LAN, confirm ports `8080`, `9117`, and `32400` are allowed on the private network profile.

### Step 6: Download the project

In PowerShell:

```powershell
cd C:\mediapolis-app
git clone <YOUR_REPOSITORY_URL> .
```

Verify:

```powershell
Get-ChildItem
```

### Step 7: Create the runtime configuration file on Windows

Copy the example:

```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor and use a Windows-oriented configuration like this:

```env
DATABASE_URL="postgresql://mediapolis:mediapolis@postgres:5432/mediapolis?schema=public"
SHADOW_DATABASE_URL="postgresql://mediapolis:mediapolis@postgres:5432/mediapolis_shadow?schema=public"
SESSION_SECRET="replace-this-with-a-long-random-secret-at-least-32-characters"
ADMIN_EMAIL="admin@example.local"
ADMIN_PASSWORD="change-this-password"
TMDB_API_KEY="your_tmdb_key"
OPENAI_API_KEY="your_openai_key_or_leave_blank"
OPENAI_MODEL="gpt-4.1-mini"
JACKETT_BASE_URL="http://host.docker.internal:9117"
JACKETT_API_KEY="your_jackett_api_key"
JACKETT_INDEXER="all"
QBITTORRENT_BASE_URL="http://host.docker.internal:8080"
QBITTORRENT_USERNAME="admin"
QBITTORRENT_PASSWORD="your_qbittorrent_password"
PLEX_MOVIES_DIR="/media/movies"
PLEX_TV_DIR="/media/tv"
DOWNLOADS_INCOMING_DIR="/downloads/incoming"
AUTO_DOWNLOAD_THRESHOLD="0.86"
SEARCH_INTERVAL_MINUTES="15"
POLL_INTERVAL_SECONDS="30"
ALLOW_AUTO_DOWNLOADS="true"
NEXT_PUBLIC_APP_NAME="Mediapolis"
HOST_DOWNLOADS_INCOMING="C:/mediapolis/downloads/incoming"
HOST_PLEX_MOVIES_DIR="C:/mediapolis/media/movies"
HOST_PLEX_TV_DIR="C:/mediapolis/media/tv"
```

Important Windows notes:

- Use forward slashes in Docker bind mount paths.
- If qBittorrent and Jackett run on the Windows host, `host.docker.internal` is usually easiest.
- If they run on another machine, use that machine's LAN IP instead.

### Step 8: Start the containers on Windows

In PowerShell:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Check status:

```powershell
docker compose ps
```

If any service failed:

```powershell
docker compose logs app-web
docker compose logs app-worker
docker compose logs postgres
```

### Step 9: Apply the database migration on Windows

```powershell
docker compose exec app-web npx prisma migrate deploy
```

### Step 10: Seed the admin account on Windows

```powershell
docker compose exec app-web npm run prisma:seed
```

### Step 11: Verify the server

From the same machine:

```text
http://localhost
```

From another device on the LAN:

```text
http://WINDOWS_SERVER_IP
```

Health endpoint:

```powershell
Invoke-WebRequest http://localhost/api/health
```

### Step 12: First-time verification in the UI

After login:

1. Open `Settings`.
2. Confirm the environment values look correct.
3. Submit a test request.
4. Confirm the worker starts processing.
5. Confirm completed files land in your Windows Plex folders.

## Configure qBittorrent Correctly

Before Mediapolis can download anything, qBittorrent must be ready.

Minimum requirements:

- qBittorrent is installed and running
- Web UI is enabled
- The Web UI port is reachable from the Mediapolis containers
- The username and password in `.env` are correct

In qBittorrent:

1. Open settings.
2. Enable Web UI.
3. Set a known username and password.
4. Confirm the port, usually `8080`.
5. Set the default save path to the Mediapolis incoming folder.
6. Linux incoming path: `/srv/mediapolis/downloads/incoming`.
7. Windows incoming path: `C:\mediapolis\downloads\incoming`.
8. Make sure the incoming downloads path is writable.
9. If qBittorrent is not on the same machine as Mediapolis, use that machine's LAN IP in `QBITTORRENT_BASE_URL`.
10. Verify you can sign in manually with the same username and password you plan to put in `.env`.

## Configure Jackett Correctly

Before Mediapolis can search, Jackett must be ready.

Minimum requirements:

- Jackett is installed and running
- You can open the Jackett web page
- You copied the API key into `.env`
- You configured at least one allowed indexer

In Jackett:

1. Open the dashboard.
2. Add and test your indexers.
3. Copy the API key.
4. Put that key into `JACKETT_API_KEY`.
5. Set `JACKETT_BASE_URL` to the address the Mediapolis containers can reach.
6. Use `http://host.docker.internal:9117` when Jackett runs on the Docker host and your Compose services include the `host-gateway` mapping.
7. Use `http://SERVER_IP:9117` when Jackett runs on another machine on your LAN, or when you prefer using the Linux host LAN IP directly.
8. Keep note of the indexer slug you want in `JACKETT_INDEXER`, or use `all` to search every enabled indexer.

## Configure Plex Correctly

Plex must point to the same host folders Mediapolis writes into.

Movies library path:

- Linux: `/srv/mediapolis/media/movies`
- Windows: `C:\mediapolis\media\movies`

TV library path:

- Linux: `/srv/mediapolis/media/tv`
- Windows: `C:\mediapolis\media\tv`

In Plex:

1. Add one `Movies` library that points to the movies path above.
2. Add one `TV Shows` library that points to the TV path above.
3. Let Plex finish its initial scan before testing a Mediapolis download.
4. If Plex runs on another machine, share and mount the same folders there before adding the libraries.

If Plex is on another machine, make sure those folders are shared and mounted appropriately before using them with Mediapolis.

## Troubleshooting

### The site does not open

Check:

```bash
docker compose ps
docker compose logs app-web
```

Also confirm:

- Docker is running
- port `80` is open
- no other app is already using port `80`

### The worker never searches

Check:

```bash
docker compose logs app-worker
```

Also confirm:

- PostgreSQL is running
- the request was actually created in the UI

### Prisma migration fails

Check:

- `DATABASE_URL`
- `postgres` container health
- whether the database was manually edited earlier

Inspect:

```bash
docker compose logs postgres
docker compose logs app-web
```

### qBittorrent cannot be reached

Usually this means:

- wrong `QBITTORRENT_BASE_URL`
- wrong credentials
- firewall block
- using `localhost` incorrectly from inside Docker

### Jackett cannot be reached

Usually this means:

- wrong `JACKETT_BASE_URL`
- wrong `JACKETT_API_KEY`
- firewall block
- using `localhost` incorrectly from inside Docker

### Completed files are not moved into Plex folders

Check:

- `HOST_DOWNLOADS_INCOMING`
- `HOST_PLEX_MOVIES_DIR`
- `HOST_PLEX_TV_DIR`
- the folders actually exist
- the container can write to them
- qBittorrent is downloading into the same incoming location Mediapolis expects

## Backup Checklist

Back up these items regularly:

- the project `.env`
- PostgreSQL data
- the incoming downloads folder
- the Plex movie folder
- the Plex TV folder

Linux paths in this guide:

- `/opt/mediapolis`
- `/srv/mediapolis`

Windows paths in this guide:

- `C:/mediapolis-app`
- `C:/mediapolis`

## Related Project Files

- `README.md`
- `docs/ubuntu-deploy.md`
- `docs/configuration.md`
