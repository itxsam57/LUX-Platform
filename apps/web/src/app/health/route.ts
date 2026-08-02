import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "lux-web",
    status: "ok",
    buildSlice: 0,
    timestamp: new Date().toISOString(),
  });
}
