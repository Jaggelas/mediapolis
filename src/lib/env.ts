import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ path: path.resolve(process.cwd(), '.env'), override: true });

const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	DATABASE_URL: z.string().min(1),
	SHADOW_DATABASE_URL: z.string().min(1),
	SESSION_SECRET: z.string().min(32),
	SESSION_COOKIE_SECURE: z.coerce.boolean().optional(),
	ADMIN_EMAIL: z.string().email(),
	ADMIN_PASSWORD: z.string().min(8),
	TMDB_API_KEY: z.string().optional().default(''),
	OPENAI_API_KEY: z.string().optional().default(''),
	OPENAI_MODEL: z.string().optional().default('gpt-4.1-mini'),
	OPENAI_MATCH_MAX_CANDIDATES: z.coerce.number().int().min(0).default(20),
	OPENAI_MATCH_MIN_HEURISTIC: z.coerce.number().min(0).max(1).default(0.6),
	JACKETT_BASE_URL: z.string().url(),
	JACKETT_API_KEY: z.string().optional().default(''),
	JACKETT_INDEXER: z.string().optional().default('all'),
	QBITTORRENT_BASE_URL: z.string().url(),
	QBITTORRENT_USERNAME: z.string().min(1),
	QBITTORRENT_PASSWORD: z.string().min(1),
	APP_UID: z.string().optional().default(''),
	APP_GID: z.string().optional().default(''),
	PLEX_MOVIES_DIR: z.string().min(1),
	PLEX_TV_DIR: z.string().min(1),
	DOWNLOADS_INCOMING_DIR: z.string().min(1),
	HOST_PLEX_MOVIES_DIR: z.string().optional().default(''),
	HOST_PLEX_TV_DIR: z.string().optional().default(''),
	HOST_DOWNLOADS_INCOMING: z.string().optional().default(''),
	AUTO_DOWNLOAD_THRESHOLD: z.coerce.number().min(0).max(1).default(0.86),
	SEARCH_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
	POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
	ALLOW_AUTO_DOWNLOADS: z.coerce.boolean().default(true),
	NEXT_PUBLIC_APP_NAME: z.string().default('Mediapolis')
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
	if (cachedEnv) {
		return cachedEnv;
	}

	cachedEnv = envSchema.parse(process.env);
	return cachedEnv;
}
