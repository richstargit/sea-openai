export const CAMERA_MOVES = ['static','push-in','pull-out','pan-left','pan-right','tilt-up','crane-up','orbit','handheld','tracking','crash-zoom','dolly-zoom','whip-pan'];
import { AppError } from "./runtime.mjs"
import { uploadFile } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { clipFile, clipStatus, startClip, startJob, startRestyle } from "./runtime.mjs"
import { blenderTag } from "./blender-designer.mjs"
import { drawnImage } from "./video-images.service.mjs"
import { wordClips } from "./three-scene.mjs"
import { captionsFor, cuesOf, placedOnTimeline, timelineEnd } from "./video-make.service.mjs"
import { addAsset, dirOf, ensureFonts, listAssets, projectIdOf, who, withoutPlaceholder } from "./video-studio.service.mjs"
import { speakText } from "./runtime.mjs"
import { limiter } from "./limiter.mjs"
const pages = new Map();
function onPage(ownerId, projectId, work) {
    const key = `${ownerId}:${projectId}`;
    const turn = pages.get(key) ?? limiter(1);
    pages.set(key, turn);
    return turn(work);
}
const AVATAR_MODEL = 'heygen-avatar-video';
const PRESENTER = 'A photo-real portrait photograph of one real person about to speak to the camera: head and shoulders, facing the lens, mouth closed, the face fully visible and evenly lit, in a setting that fits them; no text, no logo. The person:';
export async function startAvatarVideo(userId, role, projectId, input, ownerId = userId) {
    projectIdOf(projectId);
    const script = input.script.trim();
    if (!input.look && !input.image) {
        const seconds = Math.max(3, Math.min(120, Math.ceil(script.split(/\s+/).length / 2.5)));
        return startJob(userId, role, { model: AVATAR_MODEL, prompt: script, seconds });
    }
    if (!input.voice)
        throw new AppError('BAD_REQUEST', { key: 'af-video-avatar-voice', message: 'Pick a voice that fits the person.' });
    const frame = await frameOf(ownerId, projectId);
    const name = input.image ?? (await drawnImage(userId, role, ownerId, projectId, `${PRESENTER} ${input.look}`, [], { size: frame === '9:16' ? '1024x1536' : '1536x1024' }))?.name;
    if (!name)
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-image', message: 'The presenter could not be drawn.' });
    const image = await projectPicture(ownerId, projectId, name);
    const sound = await speakText(userId, role, projectId, { text: script, voice: input.voice }, ownerId);
    const path = `${dirOf(projectId)}/assets/${sound.name}`;
    const audio = await sandbox.readFile(who(ownerId), path, 40 * 1024 * 1024);
    await sandbox.exec(who(ownerId), { command: `rm -f "${path}"`, timeoutMs: 15_000 }).catch(() => undefined);
    return startJob(userId, role, { model: AVATAR_MODEL, prompt: script, seconds: Math.max(3, Math.ceil(sound.duration ?? 0)), image, audio: audio.toString('base64'), aspect_ratio: frame });
}
export const placePresenter = (ownerId, projectId, asset, script) => onPage(ownerId, projectId, () => presenterPlaced(ownerId, projectId, asset, script));
async function presenterPlaced(ownerId, projectId, asset, script) {
    const index = withoutPlaceholder((await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000)).toString('utf8'));
    const start = timelineEnd(index);
    const seconds = Math.round((asset.duration ?? 0) * 100) / 100;
    const key = asset.name.replace(/\.\w+$/, '');
    const clips = [
        `<video id="clip-${key}" class="lupo-fill" src="assets/${asset.name}" data-start="${start}" data-duration="${seconds}" data-track-index="1" playsinline data-has-audio="true"></video>`,
        ...captionsFor(script, start, seconds, key),
    ];
    await ensureFonts(ownerId, projectId).catch(() => undefined);
    await sandbox.writeFiles(who(ownerId), dirOf(projectId), [{ path: 'index.html', bytes: Buffer.from(placedOnTimeline(index, clips, start + seconds)) }]);
    return { start, seconds };
}
export const placeBlender = (ownerId, projectId, input) => onPage(ownerId, projectId, async () => {
    const index = withoutPlaceholder((await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000)).toString('utf8'));
    const start = Math.round((input.start ?? timelineEnd(index)) * 100) / 100;
    const seconds = Math.round(input.asset.duration * 100) / 100;
    const key = `bl-${Date.now().toString(36)}`;
    const clips = [blenderTag(input.asset, input.alpha, seconds, start, key, 1), ...wordClips(key, input.words, start)];
    if (input.words.length > 0)
        await ensureFonts(ownerId, projectId).catch(() => undefined);
    await sandbox.writeFiles(who(ownerId), dirOf(projectId), [{ path: 'index.html', bytes: Buffer.from(placedOnTimeline(index, clips, Math.max(timelineEnd(index), start + seconds))) }]);
    return { id: `clip-${key}`, start, seconds };
});
export const replaceClip = (ownerId, projectId, from, to) => onPage(ownerId, projectId, async () => {
    const index = (await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000)).toString('utf8');
    const { page, swapped } = restyledPage(index, from, to);
    if (swapped > 0)
        await sandbox.writeFiles(who(ownerId), dirOf(projectId), [{ path: 'index.html', bytes: Buffer.from(page) }]);
    return swapped;
});
export function restyledPage(index, from, to) {
    let swapped = 0;
    const page = index.replace(new RegExp(`<video\\b[^>]*\\ssrc="assets/${from.replace(/\./g, '\\.')}"[^>]*>`, 'g'), (tag) => {
        swapped += 1;
        const old = Number(/\sdata-duration="([\d.]+)"/.exec(tag)?.[1] ?? 0);
        const length = to.duration === null || old === 0 ? old : Math.min(old, Math.round(to.duration * 100) / 100);
        return tag
            .replace(`src="assets/${from}"`, `src="assets/${to.name}"`)
            .replace(/\sdata-duration="[\d.]+"/, ` data-duration="${length}"`)
            .replace(' muted data-volume="0"', ' data-has-audio="true"');
    });
    return { page, swapped };
}
export function captionClips(index, asset, srt) {
    const cues = cuesOf(srt);
    let page = index;
    const clips = [];
    for (const [position, [tag]] of [...index.matchAll(new RegExp(`<(?:audio|video)\\b[^>]*\\ssrc="assets/${asset.replace(/\./g, '\\.')}"[^>]*>`, 'g'))].entries()) {
        const of = (name, none) => Number(new RegExp(`\\s${name}="([\\d.]+)"`).exec(tag)?.[1] ?? none);
        const id = /\sid="([\w-]+)"/.exec(tag)?.[1] ?? `${asset.replace(/\W/g, '-')}-${position + 1}`;
        const [at, from, rate] = [of('data-start', 0), of('data-media-start', 0), of('data-playback-rate', 1) || 1];
        const to = from + of('data-duration', 0) * rate;
        page = page.replace(new RegExp(`<div id="cap-${id}-\\d+-\\d+"[^>]*>[^<]*</div>\\n?`, 'g'), '');
        cues
            .filter((cue) => cue.end > from && cue.start < to)
            .forEach((cue, n) => {
            const start = Math.max(cue.start, from);
            clips.push(...captionsFor(cue.text, at + (start - from) / rate, (Math.min(cue.end, to) - start) / rate, `${id}-${n + 1}`));
        });
    }
    return { page, clips };
}
export const placeCaptions = (ownerId, projectId, asset, srt) => onPage(ownerId, projectId, async () => {
    const index = withoutPlaceholder((await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000)).toString('utf8'));
    const { page, clips } = captionClips(index, asset, srt);
    if (clips.length === 0)
        throw new AppError('BAD_REQUEST', { key: 'af-video-captions-unplaced', message: `assets/${asset} is not on the timeline yet: place it first (video_place), then ask for its captions again.` });
    await ensureFonts(ownerId, projectId).catch(() => undefined);
    await sandbox.writeFiles(who(ownerId), dirOf(projectId), [{ path: 'index.html', bytes: Buffer.from(placedOnTimeline(page, clips, timelineEnd(page))) }]);
    return clips.length;
});
export const placeAsset = (ownerId, projectId, input) => onPage(ownerId, projectId, () => assetPlaced(ownerId, projectId, input));
async function assetPlaced(ownerId, projectId, input) {
    projectIdOf(projectId);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(input.file))
        throw new AppError('BAD_REQUEST', { key: 'af-video-asset-name' });
    if(input.file.endsWith('.html')){
      const page=await sandbox.readFile(who(ownerId),dirOf(projectId)+'/compositions/'+input.file,500000);
      const source=page.toString('utf8');
      const composition=/data-composition-id="([a-zA-Z0-9_-]+)"/.exec(source)?.[1];
      if(!composition)throw new AppError('BAD_REQUEST',{key:'so-video-invalid-composition'});
      const index=(await sandbox.readFile(who(ownerId),dirOf(projectId)+'/index.html',4000000)).toString('utf8');
      const start=input.start??timelineEnd(index);
      const seconds=input.seconds??Number(/data-duration="([\d.]+)"/.exec(source)?.[1]||3);
      const track=input.track??1;
      const id='scene-'+Math.random().toString(36).slice(2,9);
      const clip=`<div id="${id}" data-composition-id="${composition}" data-composition-src="compositions/${input.file}" data-start="${start}" data-duration="${seconds}" data-track-index="${track}"></div>`;
      await sandbox.writeFiles(who(ownerId),dirOf(projectId),[{path:'index.html',bytes:Buffer.from(placedOnTimeline(index,[clip],Math.max(timelineEnd(index),start+seconds)))}]);
      return {id,start,seconds,track};
    }
    const asset = (await listAssets(ownerId, projectId)).find((entry) => entry.name === input.file);
    if (!asset)
        throw new AppError('NOT_FOUND', { key: 'af-video-asset-missing', message: `assets/${input.file} is not in the project.` });
    const index = withoutPlaceholder((await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000)).toString('utf8'));
    const start = Math.round((input.start ?? timelineEnd(index)) * 100) / 100;
    const seconds = Math.round((input.seconds ?? (asset.kind === 'image' ? 3 : (asset.duration ?? 3))) * 100) / 100;
    const track = input.track ?? (asset.kind === 'audio' ? 10 : 1);
    const id = `clip-${input.file.replace(/\.\w+$/, '').replace(/\./g, '-')}-${Date.now().toString(36)}`;
    const timing = `data-start="${start}" data-duration="${seconds}" data-track-index="${track}"`;
    const clip = asset.kind === 'image'
        ? `<img id="${id}" class="clip lupo-fill" src="assets/${input.file}" ${timing} data-fit="cover">`
        : asset.kind === 'audio'
            ? `<audio id="${id}" src="assets/${input.file}" ${timing} data-volume="1"></audio>`
            : `<video id="${id}" class="lupo-fill" src="assets/${input.file}" ${timing} data-media-start="0" data-fit="cover" playsinline${input.sound ? ' data-has-audio="true"' : ' muted data-volume="0"'}></video>`;
    await sandbox.writeFiles(who(ownerId), dirOf(projectId), [{ path: 'index.html', bytes: Buffer.from(placedOnTimeline(index, [clip], Math.max(timelineEnd(index), start + seconds))) }]);
    return { id, start, seconds, track };
}
const LIPSYNC_MODEL = 'heygen-lipsync';
const LIPSYNC_MAX_BYTES = 30 * 1024 * 1024;
export async function startLipsync(userId, role, projectId, input, ownerId = userId) {
    projectIdOf(projectId);
    for (const name of [input.video, input.audio])
        if (!/^[A-Za-z0-9._-]{1,120}$/.test(name))
            throw new AppError('BAD_REQUEST', { key: 'af-video-asset-name' });
    const owner = { userId: ownerId, threadId: 'video-studio' };
    const dir = `/home/user/workspace/video-projects/${projectId}/assets`;
    const tag = Date.now().toString(36);
    const made = await sandbox.exec(owner, {
        command: `cd "${dir}" && ffmpeg -y -v error -i "${input.audio}" -vn -c:a libmp3lame -b:a 160k /tmp/ls-${tag}.mp3 && { [ $(stat -c %s "${input.video}") -le ${LIPSYNC_MAX_BYTES} ] && cp "${input.video}" /tmp/ls-${tag}.mp4 || ffmpeg -y -v error -i "${input.video}" -vf "scale=-2:'min(720,ih)'" -c:v libx264 -preset veryfast -crf 26 -c:a aac /tmp/ls-${tag}.mp4; }`,
        timeoutMs: 240_000,
    });
    if (made.exitCode !== 0)
        throw new AppError('BAD_REQUEST', { key: 'af-video-lipsync-files', message: made.stderr.slice(-200) });
    const video = await sandbox.readFile(owner, `/tmp/ls-${tag}.mp4`, 40 * 1024 * 1024);
    const audio = await sandbox.readFile(owner, `/tmp/ls-${tag}.mp3`, 40 * 1024 * 1024);
    await sandbox.exec(owner, { command: `rm -f /tmp/ls-${tag}.mp4 /tmp/ls-${tag}.mp3`, timeoutMs: 15_000 }).catch(() => undefined);
    return startJob(userId, role, { model: LIPSYNC_MODEL, prompt: `Lipsync ${input.video} to ${input.audio}`, video: video.toString('base64'), audio: audio.toString('base64') });
}
export async function startAiVideo(userId, role, projectId, input, ownerId = userId) {
    projectIdOf(projectId);
    const image = input.after ? await projectPicture(ownerId, projectId, input.after.clip, input.after.at) : input.image ? await projectPicture(ownerId, projectId, input.image) : undefined;
    const last = input.endImage ? await projectPicture(ownerId, projectId, input.endImage) : undefined;
    return startClip(userId, role, { prompt: input.prompt, seconds: input.seconds, camera: input.camera, image, lastImage: last }, await frameOf(ownerId, projectId));
}
const RESTYLE_MOST_SECONDS = 15;
const RESTYLE_MOST_BYTES = 30 * 1024 * 1024;
const FRAMES_LEAST_SECONDS = 3;
const FRAMES_MOST_SECONDS = 10;
export function restyleMode(seconds, lock) {
    if (seconds > RESTYLE_MOST_SECONDS)
        throw new AppError('BAD_REQUEST', { key: 'af-video-restyle-long', message: `The AI repaints a video of ${RESTYLE_MOST_SECONDS} seconds at most; this one is ${Math.ceil(seconds)}. Render it in parts of up to ${FRAMES_MOST_SECONDS} seconds.` });
    if (lock === 'video')
        return 'video';
    if (seconds <= FRAMES_MOST_SECONDS)
        return 'frames';
    if (lock === 'frames')
        throw new AppError('BAD_REQUEST', { key: 'af-video-restyle-frames-long', message: `Between two frames the model makes ${FRAMES_MOST_SECONDS} seconds at most; this guide is ${Math.ceil(seconds)}. Render it in parts of up to ${FRAMES_MOST_SECONDS} seconds, or ask for lock "video".` });
    return 'video';
}
const REDRAW = 'Redraw this exact frame as a real photograph: the same composition, framing, camera angle, subject pose and position of everything as in the reference; only the look changes (materials, light, atmosphere, realism). ';
export async function startAiRestyle(userId, role, projectId, input, ownerId = userId) {
    projectIdOf(projectId);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(input.source))
        throw new AppError('BAD_REQUEST', { key: 'af-video-asset-name' });
    const owner = who(ownerId);
    const path = `${dirOf(projectId)}/assets/${input.source}`;
    const probe = await sandbox.exec(owner, { command: `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`, timeoutMs: 30_000 });
    const seconds = Number.parseFloat(probe.stdout);
    if (probe.exitCode !== 0 || !Number.isFinite(seconds))
        throw new AppError('BAD_REQUEST', { key: 'af-video-restyle-source', message: 'This file is not a video that can be read.' });
    if (restyleMode(seconds, input.lock ?? 'auto') === 'video') {
        const bytes = await sandbox.readFile(owner, path, RESTYLE_MOST_BYTES);
        return startRestyle(userId, role, { prompt: input.prompt, video: bytes.toString('base64') });
    }
    const tag = Date.now().toString(36);
    const frames = [`rs-${tag}-first.png`, `rs-${tag}-last.png`];
    const taken = await sandbox.exec(owner, {
        command: `cd "${dirOf(projectId)}/assets" && ffmpeg -y -v error -i "${input.source}" -frames:v 1 "${frames[0]}" && ffmpeg -y -v error -sseof -0.15 -i "${input.source}" -update 1 -frames:v 1 "${frames[1]}"`,
        timeoutMs: 60_000,
    });
    if (taken.exitCode !== 0)
        throw new AppError('BAD_REQUEST', { key: 'af-video-restyle-frames', message: taken.stderr.slice(-200) });
    try {
        const size = (await frameOf(ownerId, projectId)) === '9:16' ? '1024x1536' : '1536x1024';
        const [first, last] = await Promise.all(frames.map((name) => drawnImage(userId, role, ownerId, projectId, `${REDRAW}${input.prompt}`, [name], { size })));
        if (!first || !last)
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-restyle-frames', message: 'The first and last frame of the guide could not be redrawn.' });
        const length = Math.min(FRAMES_MOST_SECONDS, Math.max(FRAMES_LEAST_SECONDS, Math.round(seconds)));
        return await startAiVideo(userId, role, projectId, { prompt: input.prompt, seconds: length, camera: 'static', image: first.name, endImage: last.name }, ownerId);
    }
    finally {
        await sandbox.exec(owner, { command: `cd "${dirOf(projectId)}/assets" && rm -f "${frames[0]}" "${frames[1]}"`, timeoutMs: 15_000 }).catch(() => undefined);
    }
}
async function projectPicture(ownerId, projectId, name, at) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(name))
        throw new AppError('BAD_REQUEST', { key: 'af-video-asset-name' });
    const owner = who(ownerId);
    const path = `${dirOf(projectId)}/assets/${name}`;
    let bytes = at === undefined ? await sandbox.readFile(owner, path, 8 * 1024 * 1024) : Buffer.alloc(0);
    const png = bytes.subarray(0, 4).toString('hex') === '89504e47';
    const jpeg = bytes.subarray(0, 2).toString('hex') === 'ffd8';
    if (!png && !jpeg) {
        const converted = `/tmp/veo-${Date.now().toString(36)}.png`;
        const made = await sandbox.exec(owner, { command: `ffmpeg -y -v error ${at === undefined ? '' : `-ss ${Number(at) || 0} `}-i "${path}" -frames:v 1 "${converted}"`, timeoutMs: 60_000 });
        if (made.exitCode !== 0)
            throw new AppError('BAD_REQUEST', { key: 'af-video-ai-image', message: 'This picture could not be read.' });
        bytes = await sandbox.readFile(owner, converted, 8 * 1024 * 1024);
        await sandbox.exec(owner, { command: `rm -f "${converted}"`, timeoutMs: 15_000 }).catch(() => undefined);
    }
    return bytes.toString('base64');
}
async function frameOf(ownerId, projectId) {
    const index = await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000).then((bytes) => bytes.toString('utf8'), () => '');
    const width = Number(/data-width="(\d+)"/.exec(index)?.[1] ?? 1920);
    const height = Number(/data-height="(\d+)"/.exec(index)?.[1] ?? 1080);
    return height > width ? '9:16' : '16:9';
}
const finished = new Map();
const ready = new Set();
const working = new Set();
const KEPT_MAX = 1000;
function trimmed(kept) {
    for (const old of kept.keys()) {
        if (kept.size <= KEPT_MAX)
            break;
        kept.delete(old);
    }
}
export async function aiVideoStatus(userId, role, projectId, jobId, ownerId = userId) {
    projectIdOf(projectId);
    const key = `${userId}:${jobId}`;
    const kept = finished.get(key);
    if (kept)
        return kept;
    if (working.has(key))
        return { state: 'running' };
    working.add(key);
    try {
        if (!ready.has(key)) {
            const status = await clipStatus(userId, role, jobId);
            if (status.state === 'running')
                return status;
            if (status.state === 'failed') {
                finished.set(key, status);
                trimmed(finished);
                return status;
            }
            ready.add(key);
            trimmed(ready);
        }
        const bytes = await clipFile(userId, role, jobId);
        const stored = await uploadFile({
            ownerId: userId,
            origin: 'generated',
            fileName: `ai-video-${Date.now().toString(36)}.mp4`,
            mimeType: 'video/mp4',
            bytes,
        });
        const done = { state: 'done', asset: await addAsset(ownerId, projectId, stored.publicId, userId) };
        finished.set(key, done);
        trimmed(finished);
        ready.delete(key);
        return done;
    }
    finally {
        working.delete(key);
    }
}
