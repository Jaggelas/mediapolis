# Configuration Reference

## Core application

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `SHADOW_DATABASE_URL`: Shadow DB connection string for Prisma development workflows.
- `SESSION_SECRET`: Long random secret for signing auth cookies.
- `ADMIN_EMAIL`: Seeded admin account email.
- `ADMIN_PASSWORD`: Seeded admin account password.
- `NEXT_PUBLIC_APP_NAME`: Browser-visible application name.

## Matching and search

- `TMDB_API_KEY`: TMDB metadata lookup key.
- `OPENAI_API_KEY`: Optional AI model key for release disambiguation.
- `OPENAI_MODEL`: AI model name used by the matcher.
- `AUTO_DOWNLOAD_THRESHOLD`: Confidence threshold for unattended start.
- `SEARCH_INTERVAL_MINUTES`: How often pending requests are re-queued for search.
- `POLL_INTERVAL_SECONDS`: How often active qBittorrent jobs are polled.
- `ALLOW_AUTO_DOWNLOADS`: Enables or disables automatic download start.

## Jackett

- `JACKETT_BASE_URL`: Base URL for Jackett.
- `JACKETT_API_KEY`: API key from Jackett.
- `JACKETT_INDEXER`: Indexer path segment, usually `all` or a specific indexer key.

## qBittorrent

- `QBITTORRENT_BASE_URL`: Base URL for qBittorrent Web UI.
- `QBITTORRENT_USERNAME`: qBittorrent username.
- `QBITTORRENT_PASSWORD`: qBittorrent password.

## Filesystem and Plex

- `DOWNLOADS_INCOMING_DIR`: Worker-visible incoming download root.
- `PLEX_MOVIES_DIR`: Worker-visible Plex movies library path.
- `PLEX_TV_DIR`: Worker-visible Plex TV library path.

## Docker host overrides

These are only used by `docker-compose.prod.yml`:

- `HOST_DOWNLOADS_INCOMING`
- `HOST_PLEX_MOVIES_DIR`
- `HOST_PLEX_TV_DIR`

## Seed behavior

`npm run prisma:seed` creates or updates:

- The admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- A default `IndexerProfile` using `JACKETT_INDEXER`

## Operational notes

- The app is built for lawful/public-domain indexer use or user-supplied uploads.
- If `OPENAI_API_KEY` is blank, the matcher falls back to deterministic heuristics.
- If `TMDB_API_KEY` is blank, metadata lookup is skipped and requests still work with title-based matching.
- Background work is handled by the app worker process polling PostgreSQL instead of Redis/BullMQ.
