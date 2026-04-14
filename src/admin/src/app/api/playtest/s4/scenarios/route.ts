import { NextResponse } from "next/server";
import { loadScenarios } from "@/lib/playtest-s4-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const scenarios = await loadScenarios();
    return NextResponse.json({ scenarios });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
