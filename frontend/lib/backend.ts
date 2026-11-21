export const backendOrigin = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8080";
// SnapPromo Live detection service (demo/): catalog + realtime detection. The browser reaches its API through
// Next (/live-api, /live-images) and embeds its live page directly from this origin.
export const liveDetectOrigin = process.env.LIVE_DETECT_ORIGIN || "http://127.0.0.1:3030";
export const publicLiveDetectOrigin = process.env.NEXT_PUBLIC_LIVE_DETECT_ORIGIN || "http://127.0.0.1:3030";
