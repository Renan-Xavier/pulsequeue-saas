import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";

export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      ok: true,
      service: "pulsequeue-saas",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "pulsequeue-saas",
        database: "error",
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 }
    );
  }
}
