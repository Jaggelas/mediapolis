import { NextResponse } from "next/server";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { createManualDownload } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:uploads", "Rejected POST /api/uploads/torrent without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const magnetUri = String(formData.get("magnetUri") ?? "").trim();
  const requestTitle = String(formData.get("requestTitle") ?? "").trim();
  const file = formData.get("torrentFile");

  const torrentFile = file instanceof File && file.size > 0 ? file : undefined;

  debugLog("api:uploads", "Received manual import payload", {
    userId: session.sub,
    requestTitle: requestTitle || null,
    hasMagnetUri: Boolean(magnetUri),
    torrentFileName: torrentFile?.name ?? null,
  });

  if (!magnetUri && !torrentFile) {
    debugWarn("api:uploads", "Manual import rejected because no torrent source was provided", {
      userId: session.sub,
    });
    return NextResponse.json(
      { error: "Upload a torrent file or provide a magnet URI." },
      { status: 400 },
    );
  }

  try {
    const job = await createManualDownload({
      userId: session.sub,
      magnetUri: magnetUri || undefined,
      torrentFile,
      fileName: torrentFile?.name,
      requestTitle: requestTitle || undefined,
    });

    debugLog("api:uploads", "Manual import created download job", {
      userId: session.sub,
      downloadJobId: job.id,
      requestId: job.requestId,
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    debugError("api:uploads", "Manual import failed", error);
    return NextResponse.json({ error: "Failed to start manual import." }, { status: 500 });
  }
}
