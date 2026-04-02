import { AppShell } from "@/src/components/app-shell";
import { DownloadFeed } from "@/src/components/download-feed";
import { getDownloadFeed } from "@/src/lib/request-service";
import { requireSession } from "@/src/lib/session";

export default async function DownloadsPage() {
  const session = await requireSession();
  const downloads = await getDownloadFeed();

  return (
    <AppShell
      title="Downloads"
      description="Watch qBittorrent progress in near real time and verify where each completed item is heading inside your Plex libraries."
      displayName={session.displayName}
    >
      <div className="grid gap-6">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-white">Live transfer feed</h2>
            <p className="mt-1 text-sm text-slate-300">
              This stream refreshes from the server worker so phones and desktops on the LAN see the same status updates.
            </p>
          </div>
          <DownloadFeed initialItems={downloads} />
        </section>
      </div>
    </AppShell>
  );
}
