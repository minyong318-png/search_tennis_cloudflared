import { readFileSync } from "node:fs";
import { join } from "node:path";

export function load() {
  const file = join(process.cwd(), "daehoe", "data", "tournaments.json");
  const tournaments = JSON.parse(readFileSync(file, "utf8"));
  const updatedAt = tournaments
    .map((item) => item.updatedAt || item.crawledAt)
    .filter(Boolean)
    .sort()
    .at(-1) || "";

  return { tournaments, updatedAt };
}
