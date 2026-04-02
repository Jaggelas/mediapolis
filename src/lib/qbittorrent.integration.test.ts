import { afterEach, describe, expect, test, vi } from "vitest";

describe("qBittorrent client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("logs in and posts magnet urls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => "SID=abc123; HttpOnly",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    vi.stubGlobal("fetch", fetchMock);

    const { addMagnetToQbittorrent } = await import("@/src/lib/qbittorrent");
    await addMagnetToQbittorrent({
      magnetUri: "magnet:?xt=urn:btih:abc123",
      category: "request-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    expect(String(secondCall?.[0])).toContain("/api/v2/torrents/add");
  });

  test("removes torrents by hash", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => "SID=abc123; HttpOnly",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    vi.stubGlobal("fetch", fetchMock);

    const { removeQbittorrentTorrents } = await import("@/src/lib/qbittorrent");
    await removeQbittorrentTorrents({
      hashes: ["abc123", "def456"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    expect(String(secondCall?.[0])).toContain("/api/v2/torrents/delete");
  });
});
