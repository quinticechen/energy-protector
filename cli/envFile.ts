import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Env files the CLI reads, lowest priority first. */
export const ENV_FILES = [".env", ".env.local"] as const;

/** Sets `key=value` in dotenv text, replacing an existing (even empty) line or appending one. */
export function setEnvValue(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const separator = content === "" || content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}${line}\n`;
}

export function loadEnvFiles(): void {
  // Later files win, so load in reverse and let process.loadEnvFile keep the first value set.
  for (const file of [...ENV_FILES].reverse()) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

/** Writes a value into the highest-priority env file that exists (or .env). */
export function saveEnvValue(key: string, value: string): string {
  const file = [...ENV_FILES].reverse().find((name) => existsSync(name)) ?? ".env";
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(file, setEnvValue(content, key, value), { mode: 0o600 });
  return file;
}
