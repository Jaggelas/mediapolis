import { NextResponse } from "next/server";
import { createManualDownload } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const magnetUri = String(formData.get("magnetUri") ?? "").trim();
  const requestTitle = String(formData.get("requestTitle") ?? "").trim();
  const file = formData.get("torrentFile");

  const torrentFile = file instanceof File && file.size > 0 ? file : undefined;

  if (!magnetUri && !torrentFile) {
    return NextResponse.json(
      { error: "Upload a torrent file or provide a magnet URI." },
      { status: 400 },
    );
  }

  const job = await createManualDownload({
    userId: session.sub,
    magnetUri: magnetUri || undefined,
    torrentFile,
    fileName: torrentFile?.name,
    requestTitle: requestTitle || undefined,
  });

  return NextResponse.json(job, { status: 201 });
}
