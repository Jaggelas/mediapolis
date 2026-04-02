# Ubuntu Docker Deployment

## 1. Install prerequisites

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
```

Install Docker Engine and the Compose plugin according to the current Docker Ubuntu instructions.

## 2. Prepare host folders

```bash
sudo mkdir -p /srv/mediapolis/downloads/incoming
sudo mkdir -p /srv/mediapolis/media/movies
sudo mkdir -p /srv/mediapolis/media/tv
sudo chown -R $USER:$USER /srv/mediapolis
```

## 3. Configure environment

```bash
cp .env.example .env
```

Update at least these values:

- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `TMDB_API_KEY`
- `OPENAI_API_KEY` if AI matching is desired
- `JACKETT_BASE_URL`
- `JACKETT_API_KEY`
- `QBITTORRENT_BASE_URL`
- `QBITTORRENT_USERNAME`
- `QBITTORRENT_PASSWORD`
- `HOST_DOWNLOADS_INCOMING`
- `HOST_PLEX_MOVIES_DIR`
- `HOST_PLEX_TV_DIR`

Leave `SESSION_COOKIE_SECURE` unset to auto-detect based on whether users access the app over HTTP or HTTPS. If you know the app will only be served over plain `http://SERVER_IP` on your LAN, setting it to `false` is also valid.

## 4. Build and start containers

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 5. Run migrations and seed the admin account

```bash
docker compose exec app-web npx prisma migrate deploy
docker compose exec app-web npm run prisma:seed
```

If you are bootstrapping a fresh environment without an applied database yet, you can apply the baseline SQL manually before `migrate deploy`.

## 6. Verify health

```bash
curl http://SERVER_IP/api/health
```

Then sign in from a browser on the same LAN at `http://SERVER_IP`.

## 7. Upgrades

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec app-web npx prisma migrate deploy
```

## 8. Backups

- PostgreSQL: snapshot the `postgres_data` volume or run `pg_dump`.
- Media folders: back up `/srv/mediapolis/media` and `/srv/mediapolis/downloads`.
- `.env`: keep a secure copy of runtime secrets and integration settings.
