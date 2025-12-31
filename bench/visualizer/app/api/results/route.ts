import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function GET() {
  const resultsDir = join(process.cwd(), "..", "results");
  
  if (!existsSync(resultsDir)) {
    return NextResponse.json({ results: [] });
  }

  try {
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

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to load results:", error);
    return NextResponse.json({ results: [] });
  }
}
