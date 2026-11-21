import { fetchPublic as fetch } from "./runtime.mjs"
import { randomUUID } from "node:crypto"
import { drawPicture } from "./runtime.mjs"
import { logger } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { addCredit, dirOf, smallJpeg, who } from "./video-studio.service.mjs"
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const AGENT = 'AstraflowVideo/1.0 (video editor; contact via astraflow)';
const MAX_BYTES = 8 * 1024 * 1024;
const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const strip = (text) => text.replace(/<[^>]*>/g, '').trim().slice(0, 120);
async function save(ownerId, projectId, name, bytes, credit) {
    const dir = `${dirOf(projectId)}/assets`;
    await sandbox.writeFiles(who(ownerId), dir, [{ path: name, bytes }]);
    if (credit)
        await addCredit(ownerId, projectId, `${name}: ${credit}`).catch(() => undefined);
    return { name, kind: 'image', duration: null, hasAudio: false };
}
export async function webImage(ownerId, projectId, query) {
    try {
        const url = `${COMMONS}?${new URLSearchParams({
            action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${query} filetype:bitmap`, gsrlimit: '12',
            prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1600',
        })}`;
        const found = (await (await fetch(url, { headers: { 'user-agent': AGENT }, signal: AbortSignal.timeout(20_000) })).json());
        const pick = Object.values(found.query?.pages ?? {})
            .map((page) => ({ page, info: page.imageinfo?.[0] }))
            .find(({ info }) => info && OK_MIME.has(info.mime) && info.width >= 900 && info.width >= info.height);
        if (!pick?.info)
            return null;
        const file = await fetch(pick.info.thumburl ?? pick.info.url, { headers: { 'user-agent': AGENT }, signal: AbortSignal.timeout(60_000) });
        if (!file.ok) {
            logger.warn('VIDEO_WEB_IMAGE_FAILED', { query, error: `download answered ${file.status}` });
            return null;
        }
        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.length === 0 || bytes.length > MAX_BYTES) {
            logger.warn('VIDEO_WEB_IMAGE_FAILED', { query, error: `file of ${bytes.length} bytes` });
            return null;
        }
        const meta = pick.info.extmetadata;
        const ext = pick.info.mime === 'image/png' ? 'png' : pick.info.mime === 'image/webp' ? 'webp' : 'jpg';
        return await save(ownerId, projectId, `web-${randomUUID().slice(0, 6)}.${ext}`, bytes, `${pick.page.title} · ${strip(meta?.Artist?.value ?? 'unknown')} · ${meta?.LicenseShortName?.value ?? 'free licence'} · commons.wikimedia.org`);
    }
    catch (error) {
        logger.warn('VIDEO_WEB_IMAGE_FAILED', { query, error: error instanceof Error ? error.message : String(error) });
        return null;
    }
}
async function referenceOf(ownerId, projectId, name) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(name))
        return null;
    return smallJpeg(ownerId, `${dirOf(projectId)}/assets/${name}`, 1280, 4);
}
async function cutOut(ownerId, projectId, name) {
    const file = `${dirOf(projectId)}/assets/${name}`;
    const done = await sandbox.exec(who(ownerId), {
        command: `ffmpeg -y -v error -i "${file}" -vf "colorkey=0xFF00FF:0.32:0.12,format=rgba" "${file}.cut.png" && mv "${file}.cut.png" "${file}"`,
        timeoutMs: 60_000,
    });
    if (done.exitCode === 0)
        return true;
    logger.warn('VIDEO_CUTOUT_FAILED', { name, error: done.stderr.slice(-200) });
    await sandbox.exec(who(ownerId), { command: `rm -f "${file}" "${file}.cut.png"`, timeoutMs: 15_000 }).catch(() => undefined);
    return false;
}
export async function drawnImage(userId, role, ownerId, projectId, prompt, references = [], options = {}) {
    const size = options.size ?? '1536x1024';
    const matched = options.palette && options.palette.length > 0 ? `${prompt}. Use colours that belong with these (the video's own): ${options.palette.join(', ')}.` : prompt;
    const words = options.cutout ? `${matched}. Flat clean style, the subject centred with margin around it, on a plain pure magenta (#FF00FF) background, no shadow, no gradient, no border.` : matched;
    try {
        const refs = (await Promise.all(references.slice(0, 4).map((name) => referenceOf(ownerId, projectId, name)))).filter((entry) => entry !== null);
        const drawn = await drawPicture({ userId, role, prompt: words, size, ...(refs.length > 0 ? { references: refs } : {}), logContext: { project: projectId } });
        const ext = drawn.mimeType.includes('jpeg') ? 'jpg' : drawn.mimeType.includes('webp') ? 'webp' : 'png';
        const name = `gen-${randomUUID().slice(0, 6)}.${options.cutout ? 'png' : ext}`;
        const asset = await save(ownerId, projectId, name, drawn.bytes);
        if (options.cutout && !(await cutOut(ownerId, projectId, name)))
            return null;
        return asset;
    }
    catch (error) {
        logger.warn('VIDEO_DRAWN_IMAGE_FAILED', { error: error instanceof Error ? error.message : String(error) });
        return null;
    }
}
