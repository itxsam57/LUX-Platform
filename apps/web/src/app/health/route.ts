import { NextResponse } from "next/server";
import { FOUNDATION_SLICE } from "../../lib/foundation";

export function GET() {
  return NextResponse.json({
    service: "lux-web",
    status: FOUNDATION_SLICE.healthStatus,
    buildSlice: FOUNDATION_SLICE.number,
    timestamp: new Date().toISOString(),
  });
}
