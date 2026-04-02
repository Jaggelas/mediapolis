import { getEnv } from "@/src/lib/env";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";

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

function getQbittorrentRequestHeaders(headers?: HeadersInit) {
  const env = getEnv();
  const origin = new URL(env.QBITTORRENT_BASE_URL).origin;
  const referer = env.QBITTORRENT_BASE_URL.endsWith("/")
    ? env.QBITTORRENT_BASE_URL
    : `${env.QBITTORRENT_BASE_URL}/`;

  return {
    ...(headers ?? {}),
    Origin: origin,
    Referer: referer,
  };
}

async function getSessionCookie() {
  if (sessionCookie) {
    debugLog("qbittorrent", "Reusing cached session cookie");
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
      ...getQbittorrentRequestHeaders(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const bodyPreview = (await response.text().catch(() => "")).slice(0, 200);
    debugError("qbittorrent", "Login failed", {
      status: response.status,
      baseUrl: env.QBITTORRENT_BASE_URL,
      bodyPreview,
    });
    throw new Error(
      bodyPreview
        ? `qBittorrent login failed with status ${response.status}: ${bodyPreview}`
        : `qBittorrent login failed with status ${response.status}`,
    );
  }

  const cookieHeader = response.headers.get("set-cookie");

  if (!cookieHeader) {
    debugError("qbittorrent", "Login succeeded without session cookie");
    throw new Error("qBittorrent login did not return a session cookie.");
  }

  sessionCookie = cookieHeader.split(";")[0];
  debugLog("qbittorrent", "Established new session cookie");
  return sessionCookie;
}

async function qbFetch(path: string, init?: RequestInit) {
  const env = getEnv();
  const cookie = await getSessionCookie();
  debugLog("qbittorrent", "Sending request", {
    path,
    method: init?.method ?? "GET",
  });
  const response = await fetch(`${env.QBITTORRENT_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getQbittorrentRequestHeaders(init?.headers),
      Cookie: cookie,
    },
    cache: "no-store",
  });

  if (response.status === 403) {
    sessionCookie = null;
    debugWarn("qbittorrent", "Session expired, retrying after clearing cookie", {
      path,
    });
    return qbFetch(path, init);
  }

  debugLog("qbittorrent", "Received response", {
    path,
    method: init?.method ?? "GET",
    status: response.status,
  });

  return response;
}

export async function addMagnetToQbittorrent(input: {
  magnetUri: string;
  category: string;
  savePath?: string;
}) {
  debugLog("qbittorrent", "Adding magnet", {
    category: input.category,
    savePath: input.savePath ?? getEnv().DOWNLOADS_INCOMING_DIR,
  });
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
  debugLog("qbittorrent", "Uploading torrent file", {
    category: input.category,
    fileName: input.file.name,
    savePath: input.savePath ?? getEnv().DOWNLOADS_INCOMING_DIR,
  });
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
  debugLog("qbittorrent", "Listing torrents", {
    category: category ?? null,
  });
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
    debugLog("qbittorrent", "Skipping delete because no hashes were provided");
    return;
  }

  debugLog("qbittorrent", "Removing torrents", {
    hashCount: hashes.length,
    deleteFiles: input.deleteFiles !== false,
  });

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
