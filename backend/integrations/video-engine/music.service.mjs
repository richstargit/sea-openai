import { fetchPublic as fetch, stagePublic } from "./runtime.mjs"
import { logger } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { addCredit, dirOf, projectIdOf, who } from "./video-studio.service.mjs"
const USABLE = new Set(['cc0', 'by', 'by-sa']);
const LONGEST_MS = 10 * 60_000;
export function usableTracks(raw, leastSeconds) {
    return raw.flatMap((track) => track.id &&
        USABLE.has(track.license ?? '') &&
        (track.duration ?? 0) >= leastSeconds * 1000 &&
        (track.duration ?? 0) <= LONGEST_MS &&
        /^https:\/\/[^\s'"`$\\]+$/.test(track.url ?? '')
        ? [
            {
                id: track.id,
                title: track.title ?? 'Untitled',
                creator: track.creator ?? 'unknown',
                license: `CC ${(track.license ?? '').toUpperCase()}${track.license_version ? ` ${track.license_version}` : ''}`,
                seconds: Math.round((track.duration ?? 0) / 1000),
                url: track.url ?? '',
                page: track.foreign_landing_url ?? track.url ?? '',
                tags: (track.tags ?? []).flatMap((tag) => (tag.name ? [tag.name] : [])).slice(0, 6),
            },
        ]
        : []);
}
export function interleaved(lists, limit) {
    const seen = new Set();
    const out = [];
    for (let at = 0; out.length < limit && lists.some((list) => at < list.length); at++) {
        for (const list of lists) {
            const track = list[at];
            if (!track || seen.has(track.id) || out.length >= limit)
                continue;
            seen.add(track.id);
            out.push(track);
        }
    }
    return out;
}
export async function findMusic(words, leastSeconds, limit = 10) {
    const genres = [...new Set(words.flatMap((word) => word.toLowerCase().split(/[^a-z]+/)).filter((word) => word.length >= 2 && word.length <= 20))].slice(0, 3);
    const lists = await Promise.all(genres.map(async (genre) => {
        const found = (await fetch(`https://api.openverse.org/v1/audio/?q=${encodeURIComponent(genre)}&license_type=commercial&category=music&page_size=20`, { signal: AbortSignal.timeout(15_000) })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null));
        return usableTracks(found?.results ?? [], leastSeconds).sort((left, right) => Number(right.tags.includes('instrumental')) - Number(left.tags.includes('instrumental')));
    }));
    return interleaved(lists, limit);
}
const found = new Map();
const KEPT_MS = 30 * 60_000;
export function rememberTracks(userId, tracks) {
    for (const [key, entry] of found)
        if (Date.now() - entry.at > KEPT_MS)
            found.delete(key);
    for (const track of tracks)
        found.set(`${userId}:${track.id}`, { track, at: Date.now() });
}
export const rememberedTrack = (userId, id) => found.get(`${userId}:${id}`)?.track ?? null;
export async function addMusic(userId, projectId, track) {
    projectIdOf(projectId);
    const name = `music-${track.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || Math.random().toString(36).slice(2, 8)}.mp3`;
    const path = `${dirOf(projectId)}/assets/${name}`;
    await stagePublic(track.url,`${dirOf(projectId)}/assets`,name);
    const got = await sandbox.exec(who(userId), {
        command: `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${path}" | grep -q audio`,
        timeoutMs: 150_000,
    });
    if (got.exitCode !== 0) {
        await sandbox.exec(who(userId), { command: `rm -f "${path}"`, timeoutMs: 15_000 }).catch(() => undefined);
        logger.warn('VIDEO_MUSIC_FETCH_FAILED', { id: track.id, error: got.stderr.slice(-200) });
        throw new Error('The track could not be downloaded; search again and pick another.');
    }
    const credit = track.license === 'CC CC0' ? null : `"${track.title}" by ${track.creator}, ${track.license}, ${track.page}`;
    if (credit)
        await addCredit(userId, projectId, `${name}: ${credit}`).catch(() => undefined);
    return { name, seconds: (await lengthOf(userId, projectId, name)) ?? track.seconds, credit };
}
async function lengthOf(userId, projectId, name) {
    const probe = await sandbox.exec(who(userId), { command: `ffprobe -v error -show_entries format=duration -of csv=p=0 "${dirOf(projectId)}/assets/${name}"`, timeoutMs: 15_000 }).catch(() => null);
    const seconds = Number.parseFloat(probe?.stdout ?? '');
    return Number.isFinite(seconds) ? Math.round(seconds * 10) / 10 : null;
}
