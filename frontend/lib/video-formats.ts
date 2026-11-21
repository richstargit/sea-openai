export type VideoSize = { width: number; height: number };

// Output presets, rather than upload limits imposed by any platform.
export const videoFormats = [
  { id: "landscape", label: "แนวนอน", ratio: "16:9", width: 1920, height: 1080, channels: "YouTube · Facebook" },
  { id: "portrait", label: "แนวตั้ง", ratio: "9:16", width: 1080, height: 1920, channels: "Shorts · Reels · Stories" },
  { id: "square", label: "จัตุรัส", ratio: "1:1", width: 1080, height: 1080, channels: "Instagram · Facebook" },
  { id: "feed", label: "แนวตั้งสำหรับฟีด", ratio: "4:5", width: 1080, height: 1350, channels: "Instagram · Facebook" },
  { id: "classic", label: "คลาสสิก", ratio: "4:3", width: 1440, height: 1080, channels: "คลิปและพรีเซนเทชัน" },
  { id: "cinema", label: "จอกว้าง", ratio: "21:9", width: 2520, height: 1080, channels: "คลิปจอกว้าง" },
] as const;

export function isValidVideoSize(width: number, height: number) {
  return [width, height].every((value) => Number.isInteger(value) && value >= 64 && value <= 7680);
}

export function videoRatio({ width, height }: VideoSize): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}
