import { NextResponse } from "next/server";

export function redirectResponse(location: string, status = 303) {
  return new NextResponse(null, {
    status,
    headers: {
      Location: location,
    },
  });
}
