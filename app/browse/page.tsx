import { AppShell } from "@/src/components/app-shell";
import { BrowseSearch } from "@/src/components/browse-search";
import { requireSession } from "@/src/lib/session";

export default async function BrowsePage() {
  const session = await requireSession();

  return (
    <AppShell
      title="Browse"
      description="Search movies and TV series by poster, then kick off the request and download flow from a single page."
      displayName={session.displayName}
    >
      <BrowseSearch />
    </AppShell>
  );
}
