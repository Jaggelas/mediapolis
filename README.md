# Mediapolis

Mediapolis is a Docker-first Ubuntu media request server built with Next.js, Prisma, PostgreSQL, qBittorrent, and Plex-style media organization.

## Features

- LAN-accessible login for phones and desktops.
- Media request queue with periodic lawful indexer searching through Jackett.
- AI-assisted release title matching with review queue fallback.
- Manual torrent file and magnet import flow.
- qBittorrent download orchestration and progress tracking.
- Automatic Plex-compatible movie and TV folder placement.
- Responsive dashboard, requests, downloads, and settings screens.

## Stack

- Next.js App Router with TypeScript
- Prisma ORM + PostgreSQL
- Database-driven polling worker
- qBittorrent Web API integration
- TMDB metadata lookup
- OpenAI-compatible release scoring fallback

## Local Development

1. Copy `.env.example` to `.env` and adjust values for your machine.
2. Generate the Prisma client:

```bash
npm run prisma:generate
```

3. Start the web app and worker in separate terminals:

```bash
npm run dev
npm run dev:worker
```

4. Open `http://localhost:3000`.

## Docker Deployment

Use Docker Compose as the primary runtime:

```bash
docker compose up -d --build
```

For Ubuntu bind-mount deployment:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Detailed setup steps live in `docs/ubuntu-deploy.md` and `docs/configuration.md`.

## Database

- Prisma schema: `prisma/schema.prisma`
- Baseline migration: `prisma/migrations/20260402064500_init_media_server/migration.sql`
- Seed admin user:

```bash
npm run prisma:seed
```

## Testing

```bash
npm run lint
npm run test
npm run test:e2e
```

## Important Scope Note

This project is intended for lawful/public-domain torrent discovery or user-supplied torrent/magnet imports. Configure Jackett only with indexers you are permitted to use.
