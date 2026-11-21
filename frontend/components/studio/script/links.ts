import type { Source } from "./types";

export type Platform = Source["platform"];
export const PLATFORM_NAME: Record<Platform, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

const HOSTS: Record<Platform, string[]> = { youtube: ["youtube.com", "youtu.be"], tiktok: ["tiktok.com"], instagram: ["instagram.com"] };

export type LinkRow = { raw: string; platform: Platform | null; ok: boolean; reason: string };

function platformOf(host: string): Platform | null {
  for (const [platform, domains] of Object.entries(HOSTS)) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return platform as Platform;
  }
  return null;
}

/**
 * Mirrors the server's link rules so the user sees, as they paste, which links
 * will be read and why one will not. The server still decides.
 */
export function classifyLinks(text: string, known: string[], room: number): { rows: LinkRow[]; accepted: string[] } {
  const seen = new Set(known);
  const rows: LinkRow[] = [];
  const accepted: string[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let url: URL;
    try { url = new URL(raw); } catch { rows.push({ raw, platform: null, ok: false, reason: "ลิงก์ไม่ถูกต้อง" }); continue; }
    if (url.protocol !== "https:" && url.protocol !== "http:") { rows.push({ raw, platform: null, ok: false, reason: "ลิงก์ไม่ถูกต้อง" }); continue; }
    const platform = platformOf(url.hostname.toLowerCase());
    if (!platform) { rows.push({ raw, platform: null, ok: false, reason: "ไม่ใช่ YouTube TikTok หรือ Instagram" }); continue; }
    const key = url.toString();
    if (seen.has(key)) { rows.push({ raw, platform, ok: false, reason: "ลิงก์ซ้ำ" }); continue; }
    if (accepted.length >= room) { rows.push({ raw, platform, ok: false, reason: "เกินจำนวนคลิปสูงสุดของสไตล์" }); continue; }
    seen.add(key);
    accepted.push(key);
    rows.push({ raw, platform, ok: true, reason: "" });
  }
  return { rows, accepted };
}
