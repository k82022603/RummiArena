import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/playtest-s4-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get("limit");
  let limit = 10;
  if (limitRaw) {
    const parsed = parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, 50);
    }
  }
  try {
    const runs = await getHistory(limit);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
