import { afterEach, describe, expect, test, vi } from "vitest";
import { MediaType } from "@/src/generated/prisma/enums";

describe("Jackett client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("normalizes search results into internal candidates", async () => {
    process.env.JACKETT_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Results: [
            {
              Title: "Big.Buck.Bunny.2008.1080p",
              MagnetUri: "magnet:?xt=urn:btih:abc123",
              Link: "https://example.test/file.torrent",
              Tracker: "publicdomain",
              Seeders: 10,
              Peers: 2,
              Size: 123456789,
            },
          ],
        }),
      }),
    );

    const { searchJackett } = await import("@/src/lib/jackett");
    const results = await searchJackett("Big Buck Bunny", MediaType.MOVIE);

    expect(results).toHaveLength(1);
    expect(results[0]?.infoHash).toBe("abc123");
    expect(results[0]?.seeders).toBe(10);
    expect(results[0]?.indexerKey).toBe("publicdomain");
  });
});
