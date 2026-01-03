import { NextResponse } from "next/server";

// Disable caching - always read fresh results
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Check if we're on Vercel
const IS_VERCEL = process.env.VERCEL === '1';

export async function GET() {
  // On Vercel, we don't have access to the local results files
  // Return empty results with a message
  if (IS_VERCEL) {
    return NextResponse.json({
      results: [],
      message: "Results viewer requires local filesystem access. Use the CLI to run benchmarks locally, or try the Play mode!"
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  }

  // Local development - read from filesystem
  try {
    const { readdir, readFile } = await import("fs/promises");
    const { join } = await import("path");
    const { existsSync } = await import("fs");

    const resultsDir = join(process.cwd(), "..", "results");

    if (!existsSync(resultsDir)) {
      return NextResponse.json({ results: [] }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      });
    }

    const files = await readdir(resultsDir);
    const jsonFiles = files.filter(f => f.endsWith(".json"));

    const results = await Promise.all(
      jsonFiles.map(async (file) => {
        const content = await readFile(join(resultsDir, file), "utf-8");
        return JSON.parse(content);
      })
    );

    // Sort by timestamp descending (newest first)
    results.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error) {
    console.error("Failed to load results:", error);
    return NextResponse.json({ results: [] }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  }
}
