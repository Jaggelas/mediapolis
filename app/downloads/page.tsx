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
        <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-white">Live transfer feed</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This stream refreshes from the server worker so phones and desktops on the LAN see the same status updates.
            </p>
          </div>
          <DownloadFeed initialItems={downloads} />
        </section>
      </div>
    </AppShell>
  );
}
