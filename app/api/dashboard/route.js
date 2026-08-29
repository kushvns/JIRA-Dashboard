import { NextResponse } from "next/server";
import { buildDashboardData } from "../../../lib/jira";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await buildDashboardData();
    const seconds = Math.max(0, Number(process.env.JIRA_CACHE_SECONDS || 0));
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": seconds
          ? `private, max-age=0, s-maxage=${seconds}, stale-while-revalidate=30`
          : "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Dashboard API error", error);
    return NextResponse.json(
      { error: "Unable to load Jira data", detail: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
