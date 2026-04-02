import { getEnv } from "@/src/lib/env";

type QbTorrentInfo = {
  hash: string;
  name: string;
  progress: number;
  size: number;
  total_size: number;
  save_path: string;
  state: string;
  category: string;
  completion_on: number;
};

let sessionCookie: string | null = null;

async function getSessionCookie() {
  if (sessionCookie) {
    return sessionCookie;
  }

  const env = getEnv();
  const body = new URLSearchParams({
    username: env.QBITTORRENT_USERNAME,
    password: env.QBITTORRENT_PASSWORD,
  });

  const response = await fetch(`${env.QBITTORRENT_BASE_URL}/api/v2/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`qBittorrent login failed with status ${response.status}`);
  }

  const cookieHeader = response.headers.get("set-cookie");

  if (!cookieHeader) {
    throw new Error("qBittorrent login did not return a session cookie.");
  }

  sessionCookie = cookieHeader.split(";")[0];
  return sessionCookie;
}

async function qbFetch(path: string, init?: RequestInit) {
  const env = getEnv();
  const cookie = await getSessionCookie();
  const response = await fetch(`${env.QBITTORRENT_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Cookie: cookie,
    },
    cache: "no-store",
  });

  if (response.status === 403) {
    sessionCookie = null;
    return qbFetch(path, init);
  }

  return response;
}

export async function addMagnetToQbittorrent(input: {
  magnetUri: string;
  category: string;
  savePath?: string;
}) {
  const body = new URLSearchParams({
    urls: input.magnetUri,
    category: input.category,
    savepath: input.savePath ?? getEnv().DOWNLOADS_INCOMING_DIR,
  });

  const response = await qbFetch("/api/v2/torrents/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to add magnet to qBittorrent (${response.status}).`);
  }
}

export async function addTorrentFileToQbittorrent(input: {
  file: File;
  category: string;
  savePath?: string;
}) {
  const formData = new FormData();
  formData.append("torrents", input.file);
  formData.append("category", input.category);
  formData.append("savepath", input.savePath ?? getEnv().DOWNLOADS_INCOMING_DIR);

  const response = await qbFetch("/api/v2/torrents/add", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to add torrent file to qBittorrent (${response.status}).`);
  }
}

export async function listQbittorrentTorrents(category?: string) {
  const query = new URLSearchParams();

  if (category) {
    query.set("category", category);
  }

  const response = await qbFetch(`/api/v2/torrents/info?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch qBittorrent torrents (${response.status}).`);
  }

  return (await response.json()) as QbTorrentInfo[];
}

export async function getQbittorrentTorrent(hash: string) {
  const torrents = await listQbittorrentTorrents();
  return torrents.find((torrent) => torrent.hash === hash) ?? null;
}

export async function removeQbittorrentTorrents(input: {
  hashes: string[];
  deleteFiles?: boolean;
}) {
  const hashes = input.hashes.filter(Boolean);

  if (hashes.length === 0) {
    return;
  }

  const body = new URLSearchParams({
    hashes: hashes.join("|"),
    deleteFiles: input.deleteFiles === false ? "false" : "true",
  });

  const response = await qbFetch("/api/v2/torrents/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to remove qBittorrent torrents (${response.status}).`);
  }
}
