import { plannedEffects } from "./runtime.mjs"
import { STUDIO_SANDBOX } from "./runtime.mjs"
import { randomUUID } from "node:crypto"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import sharp from 'sharp';
import { agentConfig } from "./runtime.mjs"
import { downloadAttachment } from "./runtime.mjs"
import { textOf } from "./runtime.mjs"
import { transcribe, isBudgetExhausted } from "./runtime.mjs"
import { videoModel } from "./runtime.mjs"
import { AppError } from "./runtime.mjs"
import { logger } from "./runtime.mjs"
import { uploadFile } from "./runtime.mjs"
import { sandbox, fetchPublic } from "./runtime.mjs"
export const WORKSPACE = '/home/node/workspace';
const THREAD = STUDIO_SANDBOX;
export const PROXY_FILE = '.proxy.sh';
export const PROXY_SCRIPT = `cd "$1" 2>/dev/null && [ -f "$2" ] || exit 0
f="$2"; lock="/tmp/proxy-$(printf '%s' "$PWD/$f" | md5sum | cut -c1-16)"
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock"' EXIT
mkdir -p .proxy
if ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt:stream_tags=alpha_mode -of default=nw=1 "$f" | grep -q -i -E 'alpha_mode=1|pix_fmt=yuva'; then
  nice -n 10 ffmpeg -y -loglevel error -c:v libvpx-vp9 -i "$f" -map 0:v:0 -vf "scale=w='trunc(iw*min(1,720/min(iw,ih))/2)*2':h=-2,fps=30" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 38 -deadline realtime -cpu-used 8 -row-mt 1 -an ".proxy/$f.tmp.webm" && mv ".proxy/$f.tmp.webm" ".proxy/$f.webm" || { rm -f ".proxy/$f.tmp.webm"; touch ".proxy/$f.light"; }
  exit 0
fi
if [ "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height,avg_frame_rate,bit_rate -of default=nw=1 "$f" | awk -F= '{v[$1]=$2} END {split(v["avg_frame_rate"], r, "/"); fps = r[2] ? r[1] / r[2] : 99; short = v["width"] < v["height"] ? v["width"] : v["height"]; print (v["codec_name"] == "h264" && v["pix_fmt"] == "yuv420p" && short <= 1080 && fps <= 31 && v["bit_rate"] + 0 <= 8000000) ? "light" : "heavy"}')" = "light" ] && [ "$(ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -read_intervals %+6 -of csv=p=0 "$f" | awk -F, 'NR>1 && $1-p>gap {gap=$1-p} {p=$1} END {print (NR>1 && gap<=1.1) ? "near" : "far"}')" = "near" ]; then touch ".proxy/$f.light"; exit 0; fi
nice -n 10 ffmpeg -y -loglevel error -i "$f" -map 0:v:0 -map "0:a?" -vf "scale=w='trunc(iw*min(1,1080/min(iw,ih))/2)*2':h=-2,fps=30" -c:v libx264 -preset ultrafast -crf 23 -maxrate 6M -bufsize 12M -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart ".proxy/$f.tmp.mp4" && mv ".proxy/$f.tmp.mp4" ".proxy/$f.mp4" || { rm -f ".proxy/$f.tmp.mp4"; touch ".proxy/$f.light"; }
`;
export const HF = 'hyperframes';
export const PROJECTS = `${WORKSPACE}/video-projects`;
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_HTML = 2_000_000;
export const who = (userId) => ({ userId, threadId: THREAD });
export function projectIdOf(raw) {
    if (typeof raw !== 'string' || !PROJECT_ID.test(raw))
        throw new AppError('BAD_REQUEST', { key: 'af-video-project-id' });
    return raw;
}
export const dirOf = (projectId) => `${PROJECTS}/${projectIdOf(projectId)}`;
const NAME_MAX = 80;
const slug = (name) => name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
async function writeMeta(userId, projectId, meta) {
    await sandbox.writeFiles(who(userId), dirOf(projectId), [
        { path: 'meta.json', bytes: Buffer.from(JSON.stringify(meta)) },
    ]);
    forgetList(userId);
}
const listed = new Map();
export function forgetList(userId) {
    listed.delete(userId);
}
const PLACEHOLDER = /\s*<h1\b[^>]*\bid="title"[^>]*>\s*Title\s*<\/h1>/;
const SAMPLE = /\s*<div\b[^>]*\bdata-lupo-placeholder\b[^>]*>[^<]*<\/div>/g;
export function addCredit(ownerId, projectId, line) {
    const dir = dirOf(projectId);
    return serially(`${ownerId}:${projectId}`, async () => {
        const credits = await sandbox.readFile(who(ownerId), `${dir}/credits.txt`, 1_000_000).then((bytes) => bytes.toString('utf8'), () => '');
        await sandbox.writeFiles(who(ownerId), dir, [{ path: 'credits.txt', bytes: Buffer.from(`${credits}${credits && !credits.endsWith('\n') ? '\n' : ''}${line.replace(/\s+/g, ' ')}\n`) }]);
    });
}
const chains = new Map();
export function serially(key, work) {
    const run = (chains.get(key) ?? Promise.resolve()).then(work);
    const tail = run.then(() => undefined, () => undefined);
    chains.set(key, tail);
    void tail.then(() => chains.get(key) === tail && chains.delete(key));
    return run;
}
export const withoutPlaceholder = (html) => html.replace(PLACEHOLDER, '').replace(SAMPLE, '');
async function freshId(userId, stem) {
    for (let tries = 0; tries < 10; tries++) {
        const id = `${stem}-${Math.random().toString(36).slice(2, 6)}`;
        if ((await sandbox.exec(who(userId), { command: `test -e ${dirOf(id)}`, timeoutMs: 15_000 })).exitCode !== 0)
            return id;
    }
    return `${stem}-${randomUUID().slice(0, 8)}`;
}
export async function createProject(userId, rawName) {
    const name = rawName.trim().slice(0, NAME_MAX) || 'Untitled video';
    const id = await freshId(userId, slug(name) || 'video');
    const made = await sandbox.exec(who(userId), {
        command: `mkdir -p ${PROJECTS} && cd ${PROJECTS} && HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 ${HF} init ${id} --non-interactive`,
        timeoutMs: 180_000,
    });
    if (made.exitCode !== 0)
        throw new AppError('INTERNAL_SERVER_ERROR', {
            key: 'af-video-project-create',
            details: { log: (made.stderr || made.stdout).slice(-800) },
        });
    const index = (await sandbox.readFile(who(userId), `${dirOf(id)}/index.html`, MAX_HTML)).toString('utf8');
    await sandbox.writeFiles(who(userId), dirOf(id), [{ path: 'index.html', bytes: Buffer.from(withoutPlaceholder(index)) }]);
    const createdAt = new Date().toISOString();
    await writeMeta(userId, id, { name, createdAt });
    return { id, name, thumbnail: null, createdAt, updatedAt: createdAt, duration: 10 };
}
const KINDS = {
    mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', m4v: 'video',
    mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio',
    png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image',
};
const kindOf = (name) => KINDS[/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''] ?? null;
export async function listAssets(userId, projectId) {
    const probed = await sandbox.exec(who(userId), {
        command: `cd ${dirOf(projectId)}/assets 2>/dev/null || exit 0; touch .probes; stat -c '%Y|%n' -- * 2>/dev/null | awk -F'|' 'FILENAME == ".probes" { known[$1 "|" $2] = $0; next } { print (($0 in known) ? known[$0] : "?" $0) }' .probes - > .probes.list.$$; { grep -v '^?' .probes.list.$$; grep '^?' .probes.list.$$ | cut -c2- | { while IFS='|' read -r m f; do [ -f "$f" ] || continue; while [ "$(jobs -rp | wc -l)" -ge 6 ]; do wait -n; done; (p=$(ffprobe -v error -show_entries stream=codec_type:format=duration -of csv=p=0 "$f" 2>/dev/null); echo "$m|$f|$(echo "$p" | grep -E '^[0-9.]+$' | head -1)|$(echo "$p" | grep -m1 -x audio)") & done; wait; }; } > .probes.$$; mv .probes.$$ .probes; rm -f .probes.list.$$; cat .probes`,
        timeoutMs: 60_000,
    });
    return probed.stdout.split('\n').flatMap((line) => {
        const [, name = '', length = '', sound = ''] = line.split('|');
        const kind = kindOf(name);
        const seconds = Number.parseFloat(length);
        return kind
            ?
                [{ name, kind, duration: kind !== 'image' && Number.isFinite(seconds) ? seconds : null, hasAudio: sound.trim() === 'audio' }]
            : [];
    });
}
async function toEditable(userId, projectId, name, keep = false) {
    const target = `${name.replace(/\.[^.]+$/, '')}.mp4`;
    const into = (codecs) => `ffmpeg -y -loglevel error -i "${name}" -map 0:v:0 -map "0:a?" ${codecs} -movflags +faststart "${target}.tmp.mp4"`;
    await sandbox.writeFiles(who(userId), WORKSPACE, [{ path: PROXY_FILE, bytes: Buffer.from(PROXY_SCRIPT) }]);
    const made = await sandbox
        .exec(who(userId), {
        command: keep ? `cd ${dirOf(projectId)}/assets && (setsid nohup sh ${WORKSPACE}/${PROXY_FILE} "$PWD" "${name}" > /dev/null 2>&1 < /dev/null &)` : `cd ${dirOf(projectId)}/assets && if { ${into('-c copy')} || ${into('-c:v copy -c:a aac -b:a 192k')} || nice -n 10 ${into('-c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k')}; } && mv "${target}.tmp.mp4" "${target}"; then f="${target}"; [ "${name}" = "${target}" ] || rm "${name}"; ok=0; else rm -f "${target}.tmp.mp4"; f="${name}"; ok=1; fi; (setsid nohup sh ${WORKSPACE}/${PROXY_FILE} "$PWD" "$f" > /dev/null 2>&1 < /dev/null &); exit $ok`,
        timeoutMs: 600_000,
    })
        .catch(() => null);
    return !keep && made?.exitCode === 0 ? target : name;
}
export async function addAsset(userId, projectId, fileId, from = userId, keep = false) {
    const sources = `${dirOf(projectId)}/assets/.sources`;
    const traced = /^[\w-]{1,120}$/.test(fileId);
    const had = traced ? (await sandbox.exec(who(userId), { command: `awk -F'|' -v id='${fileId}' '$1 == id { n = $2 } END { print n }' "${sources}" 2>/dev/null`, timeoutMs: 15_000 }).catch(() => null))?.stdout.trim() : '';
    const before = had ? (await listAssets(userId, projectId)).find((asset) => asset.name === had) : undefined;
    if (before)
        return before;
    const file = await downloadAttachment(from, fileId);
    const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'media';
    const original = `${Date.now().toString(36)}-${safe}`;
    const kind = kindOf(original);
    if (!kind)
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', { key: 'af-video-asset-type' });
    await sandbox.writeFiles(who(userId), `${dirOf(projectId)}/assets`, [{ path: original, bytes: file.bytes }]);
    const name = kind === 'video' ? await toEditable(userId, projectId, original, keep) : original;
    if (traced)
        await sandbox.exec(who(userId), { command: `echo '${fileId}|${name}' >> "${sources}"`, timeoutMs: 15_000 }).catch(() => undefined);
    const found = (await listAssets(userId, projectId)).find((asset) => asset.name === name);
    return found ?? { name, kind, duration: null, hasAudio: false };
}
const unescapeAttr = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escapeText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const withoutBackdrop = (html) => html.replace(/[ \t]*(?:-webkit-)?backdrop-filter\s*:[^;}"]*;?/g, '');
export function withTyping(html) {
    const sets = [];
    const letters = new Intl.Segmenter('th', { granularity: 'grapheme' });
    const at = (seconds) => Math.round(seconds * 100) / 100;
    const marked = html.replace(/<(div|span|p)\b([^>]*?)\sdata-typing="([\d.]+)(?:\s*,\s*([\d.]+))?"([^>]*)>([^<]+)<\/\1>/g, (whole, tag, before, from, length, after, text) => {
        const attributes = `${before}${after}`;
        const id = /\sid="([^"]+)"/.exec(attributes)?.[1];
        const parts = [...letters.segment(unescapeAttr(text).trim())].map((part) => part.segment);
        if (!id || parts.length === 0)
            return whole;
        const start = Number(from);
        const each = (Number(length) || parts.length * 0.07) / parts.length;
        parts.forEach((_, n) => sets.push(`tl.set("#${id}-k${n}",{display:"inline"},${at(start + each * n)});`));
        const end = Number(/\sdata-start="([\d.]+)"/.exec(attributes)?.[1] ?? 0) + Number(/\sdata-duration="([\d.]+)"/.exec(attributes)?.[1] ?? 0);
        for (let t = start + each * parts.length + 0.35, on = false; t < end - 0.05; t += 0.35, on = !on)
            sets.push(`tl.set("#${id}-caret",{opacity:${on ? 1 : 0}},${at(t)});`);
        const shown = parts.map((part, n) => `<span id="${id}-k${n}" style="display:none">${escapeText(part)}</span>`).join('');
        return `<${tag}${attributes}>${shown}<span id="${id}-caret" style="display:inline-block;width:.07em;height:.95em;margin-left:.05em;vertical-align:-.12em;background:currentColor;border-radius:.03em"></span></${tag}>`;
    });
    if (sets.length === 0)
        return html;
    return marked.replace(/(gsap\.timeline\([\s\S]*?)(<\/script>)/, (_, script, close) => `${script}\n${sets.join('\n')}\n${close}`);
}
export async function sendFromSandbox(userId, file, input) {
    const bytes = await sandbox.readFile(who(userId),file,100*1024*1024);
    return uploadFile({...input,bytes});
}
export const SCENE_DESIGN = [
    '- Make it look designed, like a well-designed video of this kind: a clear hierarchy, 2–3 colours, a background clip that fills the frame (a gradient, or the user\'s picture covering it), staggered entrances, a little overlap between beats.',
    '- Depth, not a flat slide: build the background from layers, each its own clip: a base gradient (linear-gradient with two or three close tones of the palette), one or two large soft colour blobs (border-radius:50%, opacity .2–.35, filter:blur(110px)) that drift slowly with tl.to over the whole scene, and a dark edge vignette (radial-gradient to rgba(0,0,0,.45)). A picture of the project is used full-bleed (object-fit:cover) with a slow push (scale 1 to 1.08 over the scene) and a gradient overlay clip (rgba(0,0,0,.35) to transparent) so text stays readable; or as a rounded card (border-radius:28px, box-shadow:0 24px 70px rgba(0,0,0,.4)) beside the words.',
    '- When the look is "brand film": the look of a top brand ad. One hero a moment, big and centred: the product\'s real interface rebuilt as a crisp live copy (a phone with its screen, or UI cards floating at depth, tilted a little with transformPerspective), its pieces arriving in turn (a search typed, a result, a price, a button pressed, a route drawing on a map); a soft glow of the brand colour behind it, everything around it out of focus (blurred copies, depth of field); the camera always moving slowly in (scale 1 to 1.08) and the moment turning into the next (the hero shrinks, flies or morphs into what comes after) rather than cutting. Type is rare and heavy: two to four words in white, the full stop in the brand colour, words rising in one by one. A logo card is the mark glowing on the brand colour with the tagline under it, small.',
    '- When the look is "product pastel" (any other look follows its own family instead): less, done well, the look of a premium product motion video. Each moment has one hero (a big glossy 3D clay icon or a picture of the files, a pastel card, or the key word) with plenty of empty space around it. The background is a vivid mesh gradient (three or four saturated hues, such as tangerine, hot pink, violet and sky, as large blurred fields that drift slowly) or a clean white canvas, with at most one dark scene for contrast; never a muted tint of one colour. Type is clean and sure: the hero word huge (180–260px) and sliding in, a headline with one key word in a gradient or the accent colour, one short line under it, and a small pill (a black Learn more → button, a red or green stat chip). Product touches tell the story: a cursor that glides in and clicks (scale .9 then 1), a text-selection box with corner handles or a typing caret round the key word, a toggle that switches. Feature cards are pastel, each in its own tint (mint, butter, peach, sky, rose; border-radius 32–40px; a long soft shadow), a big glossy 3D icon (a picture of the project when there is one) filling the top half, a title and one line below, and they arrive in a cover-flow: the new card slides in from the right while the earlier ones step left and turn back in depth (rotationY 25–40 with transformPerspective). Moments hand over fast, about every two seconds: a whip (the next thing slides in from 120% with filter blur 14px to 0 in .35 s), a swoosh of colour across the frame, a card flying on into the next beat. Micro-interactions tell the story: words typed letter by letter with a blinking caret, a stretched word (Moooore) racing past, a toggle that switches on, checkmarks ticking in one by one, a cursor gliding to a button and clicking, a selection box with corner handles snapping round the key word. Beats change ground: clean white, the vivid gradient, and at most one dark scene with soft rainbow light rays fanning behind its hero; the last beat is the brand alone, its name or logo centred on its own colour. At most two small accents, and only ones the subject owns (a few coins falling for money, a thin orbit line round two badges); never decoration for its own sake: no bursts, confetti, scattered dots, squiggles, ropes, rings, arrows or slices unless the brief asks for that look.',
    '- Depth, as the best motion edits have it without a 3D engine: layers at several depths that move at different speeds as the camera pushes or pans (parallax), perspective and rotateX/rotateY with transformPerspective on cards and screens, soft long shadows, glow on what is lit (a blurred copy of the accent behind it), glossy pictures standing in for objects, and light that sweeps or blooms on the beat.',
    '- Premium, like the best edits on TikTok: every scene follows the look\'s one layout system, so the video reads as one piece (the same places for the kicker, the headline, the hero and the labels, the same type sizes); headlines heavy display type, 110 to 150 px on a 1080-wide frame, two lines at most, the key line in the accent; secondary text 36 to 48 px and never thin; a fine film grain and a soft vignette over the ground for depth; one hero, everything else small and quiet; motion eased like a real product (long smooth settles, power3 or expo out; never linear, never bouncy), elements arriving a beat apart, never all at once; a fast move carries motion blur (a blur that follows its speed), shapes morph or assemble into the hero; each moment tells one action (a choice is picked, a dart hits, a logo assembles); UI is drawn like the real product (clean sans type, 20 to 28 px corners, hairline borders, soft long shadows, one glowing accent tag), real cut-out photos rather than flat placeholders, and no empty boxes standing in for content.',
    '- The voice-over has its own captions: never write the spoken sentence as a headline too. Show what the words cannot: the key word alone, the number, the offer, a shape or a picture.',
    '- The key number or offer is the hero: big (180–280px) and clean, alone with a soft glow or on a glass pill, rising in with expo.out or counting up; no burst, stamp or particles.',
    '- Type with taste: one headline weight (800, letter-spacing:-0.02em, line-height:1.08), a lighter supporting line (400–500, 60–70% opacity), one accent colour for a key word or a thin accent bar; at most two sizes per scene. Words sit on cards with border-radius 24–40px and a soft shadow when the background is busy. Short words: a headline of 2–6 words, a support line of at most 12.',
    '- Motion with intent: each element comes in on its own beat (y 50–80px with opacity 0, duration .6–.9, ease "power3.out" or "expo.out"; a bar grows with scaleX 0 to 1 and transformOrigin "left center"; a picture card from scale .92), staggered 0.12–0.2 s apart, and the previous beat leaves (opacity 0, y -30) as the next arrives. Never everything at once, never static for more than two seconds.',
    '- Use the palette and mood in the brief for every scene so the video looks like one piece; if none is given, choose one palette (a deep background, a bright accent, a near-white text colour) and keep it.',
];
export const SCENE_PROMPT = [
    'You write one HyperFrames scene: a sub-composition HTML file for a video editor. Reply with the HTML file only, no explanation, no code fence.',
    'The file is exactly this shape, with __NAME__ written as it is (it is replaced):',
    '<!doctype html><html><head><meta charset="UTF-8"></head><body><template><style>…</style><div id="root" data-composition-id="__NAME__" data-start="0" data-width="__W__" data-height="__H__" data-duration="__D__">…clips…</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines["__NAME__"]=tl;…tweens on tl…</script></template></body></html>',
    'Rules:',
    '- Everything the scene shows is a clip: an element with class="clip" and data-start (seconds), data-duration (seconds) and data-track-index (a whole number; a higher number is on top). Text goes in div or h1/p clips; give them position:absolute and a real size and place.',
    '- Files of the project are used by path: <img class="clip" src="assets/NAME.png" …>, <video class="clip" src="assets/NAME.mp4" muted playsinline data-media-start="0" …>, <audio src="assets/NAME.mp3" data-start data-duration data-track-index data-volume="1">. Use only the files listed, with their exact names; never invent a file or an address.',
    '- Do not nest clips. Every clip is a direct child of the root, placed with position:absolute and left, top, width, height in px (centre text with text-align and a line-height, not with a flex wrapper), with its own unique id. A card is one clip for its box and its words and pictures are clips of their own on top of it. Then the user can pick and move each element alone in the editor.',
    '- Words that sit on a shape, ring, badge or card share its exact centre: the text clip has the same left + width/2 and top + height/2 as the shape, and a one-line text has its height equal to its line-height, so it sits in the middle. Size every line to fit its box: about 0.6 × font-size per letter (Thai: count the letters on the line, not the marks above or below it), and keep at least 40px between the words and the edge of the shape around them. Keep words at least 7% of the width from the sides; on a tall frame also 11% of the height from the top and 16% from the bottom (the app buttons and captions sit there).',
    '- Plan the layout on a grid before writing: give each text clip a left, top, width and height (px) with room for all its words on its lines, and never let two text or picture clips overlap each other (a clip may sit on a card or a background clip, but not on another text). Check the sum of the heights of a column against the frame height.',
    '- The script builds the scene\'s one paused timeline any way the design needs (loops, functions, onUpdate, SVG or canvas drawn from the timeline\'s time, the motion recipes\' own code), as long as every frame depends only on the time it is seeked to: fromTo with explicit from-states, nothing carried over from the frame before. Plain tl.to, tl.from, tl.fromTo and tl.set calls on "#id" targets with literal values let the editor hand each move to the user, so they are the way for the moves that need no more.',
    '- All motion is on the one paused timeline tl (tl.from, tl.to, tl.fromTo with a position in seconds). Never use Math.random, Date.now, setTimeout, CSS animations, repeat:-1 or an external script or font link (only a registry block\'s own GSAP or three.js from cdn.jsdelivr.net, or its lib/ script). The scene lasts __D__ seconds: spread the motion over all of it, and the last thing on screen holds to the end.',
    '- Size for a __W__x__H__ frame, in px: headlines 80–140px, body text 40–60px, margins at least 8% of the width, and nothing outside the frame. Keep text readable against what is behind it (a dark or light panel behind the words when over a picture).',
    '- Fonts: font-family:"Kanit",sans-serif for every text (its faces are loaded for you, do not declare them): font-weight 800 for headlines and numbers, 500 for everything else, no other weight. Write the text in the language the user wrote in.',
    '- A Thai phrase is one text clip: Thai has no spaces between its words, so it is never split into word or letter clips (that breaks its vowels and tone marks and leaves gaps); animate it whole (a pop, a slide, a mask wipe, or typed).',
    '- Typing (in any language): give the text clip data-typing="AT,SECONDS" (AT the scene second it starts, SECONDS how long it takes) and nothing else: its letters then come one by one with a blinking caret right after the last one. Never type with a mask, clip-path, width or a caret of your own: they drift apart and cut letters in half.',
    '- Few words, big: every text clip is a few words on one or two lines (at most about 6 words, 40 letters), never a sentence or a paragraph and never the spoken words in a box: the voice-over has captions of its own.',
    '- The bottom band of the frame, from 80% to 95% of its height, is where the captions are drawn: no words there (a background or decoration may pass behind).',
    '- Decoration stays in the background and the margins, in the palette colours at opacity .3–.8 (never black, grey or plain white blocks), beside or behind the content and never crossing words, cards or pictures; no connector line runs through another element. Leave about a third of the frame empty around the main element so it breathes.',
    '- A scene longer than 30 seconds is a story told in beats of about 5 to 8 seconds, each with its own headline or picture and its own entrance, one beat handing over to the next, so the whole length is used and nothing sits still for long.',
    ...SCENE_DESIGN,
].join('\n');
export const SCENE_DESIGNER = process.env.AGENT_SCENE_MODEL?.trim() || null;
export const SCENE_MAX_SECONDS = 600;
const OVERLOADED = /\b(503|529|429)\b|overload|unavailable|rate.?limit/i;
export async function retryOverloaded(ask, backoffMs = 2000) {
    for (let tried = 0;; tried++) {
        try {
            return await ask();
        }
        catch (error) {
            const text = error instanceof Error ? `${error.message} ${String(error.status ?? '')}` : String(error);
            if (tried >= 2 || isBudgetExhausted(error) || !OVERLOADED.test(text))
                throw error;
            await new Promise((resolve) => setTimeout(resolve, backoffMs * (tried + 1)));
        }
    }
}
export async function cardScene(userId, projectId, text, seconds, over = false) {
    const dir = dirOf(projectId);
    const index = (await sandbox.readFile(who(userId), `${dir}/index.html`, MAX_HTML)).toString('utf8');
    const width = Number(/data-width="(\d+)"/.exec(index)?.[1] ?? 1920);
    const height = Number(/data-height="(\d+)"/.exec(index)?.[1] ?? 1080);
    const name = `ai-${Math.random().toString(36).slice(2, 7)}`;
    const duration = Math.min(SCENE_MAX_SECONDS, Math.max(3, Math.round(seconds)));
    const safe = text.slice(0, 160).replace(/[<>&"]/g, ' ');
    const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><template><style>#${name}-bg{position:absolute;left:0;top:0;width:${width}px;height:${height}px;background:#0f172a}#${name}-t{position:absolute;left:${Math.round(width * 0.1)}px;top:${Math.round(height * 0.35)}px;width:${Math.round(width * 0.8)}px;font-family:Kanit,sans-serif;font-weight:700;font-size:${Math.round(width * 0.04)}px;line-height:1.3;color:#fff;text-align:center}</style><div id="${name}" data-composition-id="${name}" data-start="0" data-width="${width}" data-height="${height}" data-duration="${duration}"><div id="${name}-bg" class="clip" data-start="0" data-duration="${duration}" data-track-index="0"></div><div id="${name}-t" class="clip" data-start="0" data-duration="${duration}" data-track-index="1">${safe}</div></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines["${name}"]=tl;tl.from("#${name}-t",{opacity:0,y:30,duration:0.6,ease:"power3.out"},0);</script></template></body></html>`;
    await ensureFonts(userId, projectId).catch(() => undefined);
    const card = over ? html.replace('background:#0f172a', `background:${safe.trim() ? 'rgba(0,0,0,.4)' : 'transparent'}`) : html;
    await sandbox.writeFiles(who(userId), `${dir}/compositions`, [{ path: `${name}.html`, bytes: Buffer.from(card) }]);
    return { name, snippet: `<div data-composition-id="${name}" data-composition-src="compositions/${name}.html" data-start="0" data-duration="${duration}" data-track-index="0" data-width="${width}" data-height="${height}"></div>`, duration };
}
export function withRules(html, css) {
    let out = html;
    for (const [, id, body] of css.matchAll(/#([\w-]+)\s*\{([^}]*)\}/g)) {
        const props = (text) => new Map(text.split(';').map((pair) => pair.split(':')).filter((pair) => pair.length >= 2).map(([key, ...value]) => [key.trim(), value.join(':').trim()]));
        const join = (map) => [...map].map(([key, value]) => `${key}:${value}`).join(';');
        const tag = new RegExp(`<[a-z0-9]+\\b[^>]*\\sid="${id}"[^>]*>`).exec(out)?.[0];
        const inline = tag ? /\sstyle="([^"]*)"/.exec(tag)?.[1] : undefined;
        if (tag && inline !== undefined) {
            const style = join(new Map([...props(inline), ...props(body)]));
            out = out.replace(tag, () => tag.replace(/\sstyle="[^"]*"/, ` style="${style}"`));
            continue;
        }
        const own = new RegExp(`#${id}\\s*\\{([^}]*)\\}`);
        const found = own.exec(out);
        const merged = new Map([...(found ? props(found[1]) : new Map()), ...props(body)]);
        const rule = `#${id}{${join(merged)}}`;
        out = found ? out.replace(own, () => rule) : out.replace('</style>', () => `${rule}</style>`);
    }
    for (const [, id, words] of css.matchAll(/^#([\w-]+)\s*=>\s*(.+)$/gm)) {
        const safe = words.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out = out.replace(new RegExp(`(<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>)[\\s\\S]*?(<\\/\\2>)`), (_, open, _tag, close) => `${open}${safe}${close}`);
    }
    return out;
}
const LOOK_PROMPT = 'You are a senior motion designer checking one frame of a finished scene as it plays. Fix only what you can see is wrong: words crossed or covered by a line, shape, picture or other words; words cut by the frame edge or by their card; words too small to read (under about 2.6% of the frame height) or faint against what is behind them; a crowded corner; something hanging off the frame by accident; words or a card lying across the face or the main subject of a picture; a picture squeezed or stretched out of its shape (give it back its own proportion). Keep the design, palette and layout otherwise. Reply with fixes only, no other text and no code fence: one #id{...} rule for each clip you move or resize (left, top, width, height, font-size in px, or opacity), and #id => fewer words for a text that reads as a sentence. Reply OK when the frame already looks clean.';
export async function polishScene(userId, role, projectId, name, frame, input) {
    const path = `${dirOf(projectId)}/compositions/${name}.html`;
    const html = (await sandbox.readFile(who(userId), path, MAX_HTML)).toString('utf8');
    const width = Number(/data-width="(\d+)"/.exec(html)?.[1] ?? 1920);
    const height = Number(/data-height="(\d+)"/.exec(html)?.[1] ?? 1080);
    const style = /<style\b[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const clips = (html.match(/<[a-z0-9]+\b[^>]*\sclass="[^"]*\bclip\b[^"]*"[^>]*>(?:[^<]{0,80})/g) ?? []).join('\n').slice(0, 14_000);
    const model = await videoModel({ alias: SCENE_DESIGNER ?? input.model ?? agentConfig().videoModel, userId, role, maxTokens: 24_000 }, input.effort, true);
    const reply = textOf((await model.invoke([
        new SystemMessage(LOOK_PROMPT),
        new HumanMessage({ content: [{ type: 'text', text: `Frame: ${width}x${height}.${input.overlay ? ' This scene is only the graphics: the footage, moving picture or 3D shot filling the frame under them is not part of it and cannot be changed, and it gets no background. Move or shrink the words, cards and chips that lie across a face or the main subject under them to where the picture is quiet.' : ''} The scene's CSS:\n${style}\n\nIts clips:\n${clips}` }, { type: 'image_url', image_url: { url: frame } }] }),
    ])).content);
    if (!/#[\w-]+\s*(\{|=>)/.test(reply))
        return false;
    const fixed = withRules(html, reply);
    const files = [...html.matchAll(/(?:src|href)="assets\/([^"]+)"/g)].map((match) => match[1]);
    const problem = sceneProblem(fixed, name, files);
    if (fixed === html || (problem && !problem.startsWith(FIT) && !problem.startsWith(PLAIN)))
        return false;
    await sandbox.writeFiles(who(userId), `${dirOf(projectId)}/compositions`, [{ path: `${name}.html`, bytes: Buffer.from(withoutBackdrop(fixed)) }]);
    return true;
}
const NO_STRETCH = ':where(img.clip,video.clip){object-fit:cover}:where(img.clip[src$=".png"]){object-fit:contain}';
export function stylesInTemplate(html) {
    const tagged = html.replace(/<template\b[^>]*>/g, '<template>');
    const wrapped = tagged.includes('<template>')
        ? tagged
        : /<body\b/.test(tagged)
            ? tagged.replace(/<body([^>]*)>([\s\S]*)<\/body>/, (whole, attributes, inner) => (inner.includes('data-composition-id') ? `<body${attributes}><template>${inner}</template></body>` : whole))
            : tagged.includes('data-composition-id')
                ? `<template>${tagged}</template>`
                : tagged;
    return wrapped.replace(/^([\s\S]*?)(<template>)/, (_, head, open) => {
        const sheets = head.match(/<style\b[^>]*>[\s\S]*?<\/style>/g) ?? [];
        return `${sheets.reduce((rest, sheet) => rest.replace(sheet, ''), head)}${open}${sheets.join('')}`;
    });
}
const REPAIR_PROMPT = 'You fix the layout of one HyperFrames scene. Reply with CSS rules only, no other text and no code fence: one #id{...} rule for each clip you move or resize, setting left, top, width, height and font-size in px as needed; and for a clip that is a sentence, a line #id => its new few words (same language, at most 6 words). Keep each clip near its place and its look; only make the listed problems go away (words fit their boxes, nothing in the captions\' band, no two texts on top of each other, inside the frame margins).';
export async function smallJpeg(ownerId, path, width, quality) {
    const out = `/tmp/look-${randomUUID().slice(0, 8)}.jpg`;
    const made = await sandbox.exec(who(ownerId), { command: `ffmpeg -y -v error -i "${path}" -vf "scale='min(${width},iw)':-2" -frames:v 1 -q:v ${quality} "${out}"`, timeoutMs: 30_000 }).catch(() => null);
    const bytes = made?.exitCode === 0 ? await sandbox.readFile(who(ownerId), out, 8 * 1024 * 1024).catch(() => null) : null;
    await sandbox.exec(who(ownerId), { command: `rm -f "${out}"`, timeoutMs: 15_000 }).catch(() => undefined);
    return bytes ? bytes.toString('base64') : null;
}
export async function composeScene(userId, role, projectId, input, ownerId = userId) {
    const dir = dirOf(projectId);
    const sandboxWho = who(ownerId);
    const seconds = Math.min(SCENE_MAX_SECONDS, Math.max(1, Math.round(input.seconds*100)/100));
    const index = (await sandbox.readFile(sandboxWho, `${dir}/index.html`, MAX_HTML)).toString('utf8');
    const width = Number(/data-width="(\d+)"/.exec(index)?.[1] ?? 1920);
    const height = Number(/data-height="(\d+)"/.exec(index)?.[1] ?? 1080);
    const known = new Map((await listAssets(ownerId, projectId)).map((asset) => [asset.name, asset]));
    const wanted = input.assets.filter((name) => known.has(name));
    const chosen = [...wanted.filter((name) => known.get(name)?.kind !== 'audio').slice(0, 12), ...wanted.filter((name) => known.get(name)?.kind === 'audio')];
    const absent = input.assets.filter((name) => !known.has(name));
    if (absent.length > 0) {
        logger.warn('VIDEO_SCENE_FILES_MISSING', { projectId, absent });
        input.onNote?.(`ไม่พบไฟล์ในโปรเจกต์: ${absent.slice(0, 5).join(', ')}`);
    }
    const images = [];
    const shapes = new Map();
    for (const name of chosen) {
        if (known.get(name)?.kind !== 'image')
            continue;
        const small = await smallJpeg(ownerId, `${dir}/assets/${name}`, 768, 5);
        if (!small)
            continue;
        images.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${small}` } });
        const size = await sharp(Buffer.from(small, 'base64')).metadata().catch(() => null);
        if (size?.width && size.height)
            shapes.set(name, `${size.width}x${size.height}`);
    }
    const list = chosen.map((name) => {
        const asset = known.get(name);
        return `- assets/${name} (${asset.kind}${shapes.has(name) ? `, shaped ${shapes.get(name)}: its box keeps that proportion` : ''}${asset.duration ? `, ${asset.duration.toFixed(1)}s` : ''}${asset.kind === 'video' && asset.hasAudio ? ', has sound' : ''})${SFX_USE[name] ? `: ${SFX_USE[name]}` : ''}`;
    });
    const styled = (input.reference ?? []).slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url } }));
    const name = `ai-${Math.random().toString(36).slice(2, 7)}`;
    const system = SCENE_PROMPT.replaceAll('__W__', String(width)).replaceAll('__H__', String(height)).replaceAll('__D__', String(seconds));
    const maxTokens = input.quick ? 32_000 : 100_000;
    const fallback = input.model ?? agentConfig().videoModel;
    const designer = SCENE_DESIGNER ?? fallback;
    let model = await videoModel({ alias: designer, userId, role, maxTokens }, input.effort, true);
    let fellBack = designer === fallback;
    const ask = [
        `The scene: ${input.prompt}`,
        input.look ? `Design brief for the whole video (use its palette and mood): ${input.look}` : '',
        input.style ?? '',
        input.style ? 'Whatever the skills say about how to build, your reply is one scene document in exactly the form the rules above give: <!doctype html> and a <body> holding one <template> with its <style>, the #root and its clips, and the timeline <script>; nothing else.' : '',
        input.said
            ? `The voice-over over this scene says (the captions carry it; never print it whole): "${input.said}". Keep pace with it for the whole ${input.seconds} s: show each thing as it names it, something new on screen every 2 to 3 seconds (a list growing item by item, a line of code lighting up, a number counting, a diagram or table building, a step of the example), never one word or one box held alone.`
            : '',
        `Length: ${seconds} seconds. Frame: ${width}x${height}, the user's own choice and final: lay everything out for exactly this frame, even where the brief names another shape.`,
        input.overlay
            ? 'This scene is laid on top of video shots that already fill the frame. Make it an overlay only: no background clip, no full-frame panel, nothing that hides the footage. Titles, lower thirds, labels, shapes and small pictures at the edges, readable on moving footage (a soft dark chip behind words). Keep it small and clean, the way a human editor dresses footage: words in the top band (above 22% of the height) or just above the captions (60% to 76%), at most two text clips on screen at once, never across the middle where the subject is; a quick simple entrance (a pop or a 40px slide) and exit; no big panels, no zooms of your own, and no cursor or click (you cannot see where things are in the footage).'
            : '',
        list.length > 0 ? `Files to use (the pictures are shown to you, in this order):\n${list.join('\n')}` : 'No files: draw everything with HTML and CSS.',
        chosen.some((name) => SFX_USE[name]) ? SFX_GUIDE : '',
    ]
        .filter(Boolean)
        .join('\n\n');
    let html = '';
    let plain = '';
    let problem = '';
    for (let attempt = 0; attempt < 3 && !html && !(plain && attempt >= 2); attempt++) {
        const messages = [
            new SystemMessage(system),
            new HumanMessage({
                content: [
                    { type: 'text', text: problem ? `${ask}\n\nYour last answer was refused: ${problem} Write the whole file again.` : ask },
                    ...images,
                    ...(styled.length > 0 ? [{ type: 'text', text: 'Frames of the video the user gave as the style they want: make this scene look and move like it (its type, colour, light, depth, framing and finish), never copying its content or words.' }, ...styled] : []),
                ],
            }),
        ];
        const reply = await (input.quick ? retryOverloaded(() => model.invoke(messages)) : model.invoke(messages)).catch(async (error) => {
            if (fellBack)
                throw isBudgetExhausted(error) ? error : new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-scene-failed', cause: error });
            fellBack = true;
            input.onNote?.('ใช้โมเดลสำรองออกแบบ');
            model = await videoModel({ alias: fallback, userId, role, maxTokens }, input.effort, true);
            return model.invoke(messages).catch((again) => {
                if (isBudgetExhausted(again))
                    throw again;
                throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-scene-failed', cause: again });
            });
        });
        const text = stylesInTemplate(textOf(reply.content))
            .replace(/^```[a-z]*\n?/i, '')
            .replace(/```\s*$/, '')
            .trim()
            .replaceAll('__NAME__', name);
        problem = sceneProblem(text, name, chosen, input.overlay, input.facts);
        if (problem)
            logger.warn('VIDEO_SCENE_REFUSED', { attempt, problem: problem.slice(0, 240) });
        if (!problem)
            html = text;
        else if (problem.startsWith(FIT)) {
            input.onNote?.('จัดตำแหน่งข้อความให้พอดี');
            const style = /<style\b[^>]*>([\s\S]*?)<\/style>/.exec(text)?.[1] ?? '';
            const clips = (text.match(/<[a-z0-9]+\b[^>]*\sclass="[^"]*\bclip\b[^"]*"[^>]*>/g) ?? []).join('\n').slice(0, 12_000);
            const fix = await model
                .invoke([new SystemMessage(REPAIR_PROMPT), new HumanMessage(`Frame: ${width}x${height}.\nProblems: ${problem}\n\nThe scene's CSS:\n${style}\n\nIts clips:\n${clips}`)])
                .then((answer) => textOf(answer.content))
                .catch(() => '');
            const fixed = withRules(text, fix);
            const left = sceneProblem(fixed, name, chosen, input.overlay, input.facts);
            if (!left)
                html = fixed;
            else
                plain = left.startsWith(FIT) || left.startsWith(PLAIN) ? fixed : text;
            break;
        }
        else if (problem.startsWith(PLAIN)) {
            input.onNote?.('เพิ่มการตกแต่งให้ฉาก');
            plain = text;
        }
        else
            input.onNote?.('เขียนฉากใหม่ (ไฟล์ยังไม่ผ่าน)');
    }
    if (!html && plain)
        html = plain;
    if (!html)
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-scene-invalid', message: problem });
    await ensureFonts(ownerId, projectId).catch(() => undefined);
    const typed = withoutBackdrop(withTyping(html.replace(/<style\b[^>]*>/, (open) => `${open}${NO_STRETCH}${html.includes('fonts/Kanit') ? '' : FONT_FACES}`)));
    await sandbox.writeFiles(sandboxWho, `${dir}/compositions`, [{ path: `${name}.html`, bytes: Buffer.from(typed) }]);
    const snippet = `<div data-composition-id="${name}" data-composition-src="compositions/${name}.html" data-start="0" data-duration="${seconds}" data-track-index="0" data-width="${width}" data-height="${height}"></div>`;
    return { name, snippet, duration: seconds };
}
const PITCH = (rate, to, fade) => `-af "asetrate=${rate},aresample=44100,atrim=0:${to},afade=t=out:st=${fade}:d=${to - fade}"`;
export const RECORDED_SFX = {
    'sfx-whoosh.mp3': '-i "$R/whoosh.mp3"',
    'sfx-whoosh-low.mp3': `-i "$R/whoosh.mp3" ${PITCH(37400, 0.9, 0.5)}`,
    'sfx-whoosh-high.mp3': `-i "$R/whoosh.mp3" ${PITCH(52800, 0.6, 0.3)}`,
    'sfx-whoosh-big.mp3': '-ss 1.3 -i "$R/whoosh-cinematic.mp3" -t 2.6 -af "afade=t=out:st=1.8:d=0.8"',
    'sfx-pop.mp3': '-i "$R/pop.mp3" -t 0.35 -af "afade=t=out:st=0.2:d=0.15"',
    'sfx-pop-hi.mp3': `-i "$R/pop.mp3" ${PITCH(55000, 0.25, 0.12)}`,
    'sfx-ding.mp3': '-i "$R/chime.mp3" -t 1.4 -af "afade=t=out:st=0.9:d=0.5"',
    'sfx-rise.mp3': '-ss 0.8 -i "$R/riser.mp3" -t 1.8 -af "afade=t=in:d=0.2,afade=t=out:st=1.6:d=0.2"',
    'sfx-rise-rev.mp3': '-i "$R/impact-bass-2.mp3" -af "areverse,atrim=0:1.4,afade=t=in:d=0.2"',
    'sfx-impact.mp3': '-i "$R/impact-bass-1.mp3" -i "$R/impact-bass-2.mp3" -i "$R/sparkle.mp3" -filter_complex "[0:a]atrim=0:1.0,afade=t=out:st=0.55:d=0.45[a];[1:a]atrim=0:0.8,volume=0.7,afade=t=out:st=0.45:d=0.35[b];[2:a]atrim=0:0.7,volume=0.3,adelay=30|30[c];[a][b][c]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.95"',
    'sfx-boom.mp3': '-i "$R/impact-bass-2.mp3" -t 1.4 -af "afade=t=out:st=0.9:d=0.5,volume=1.1"',
    'sfx-glitch.mp3': '-i "$R/glitch-1.mp3" -t 0.7 -af "afade=t=out:st=0.4:d=0.3"',
    'sfx-glitch-long.mp3': '-i "$R/glitch-2.mp3" -t 1.3 -af "afade=t=out:st=0.8:d=0.5"',
    'sfx-sparkle.mp3': '-i "$R/sparkle.mp3" -t 1.4 -af "afade=t=out:st=0.9:d=0.5"',
    'sfx-click.mp3': '-i "$R/click.mp3"',
    'sfx-key.mp3': '-i "$R/key-press.mp3"',
    'sfx-typing.mp3': '-i "$R/typing.mp3" -t 1.8 -af "afade=t=out:st=1.5:d=0.3"',
    'sfx-notify.mp3': '-i "$R/notification.mp3" -t 1.2 -af "afade=t=out:st=0.8:d=0.4"',
    'sfx-ping.mp3': '-i "$R/ping.mp3" -t 1.0 -af "afade=t=out:st=0.6:d=0.4"',
    'sfx-error.mp3': '-i "$R/error.mp3" -t 1.0 -af "afade=t=out:st=0.7:d=0.3"',
};
export const SFX_USE = {
    'sfx-whoosh.mp3': 'a 0.6 s whoosh for a transition across a cut',
    'sfx-whoosh-low.mp3': 'a deeper 0.9 s whoosh for a slow or heavy move',
    'sfx-whoosh-high.mp3': 'a quick bright 0.5 s swipe for a fast cut or a thing flying in',
    'sfx-whoosh-big.mp3': 'a 2.6 s cinematic whoosh that builds and passes: a big scene change',
    'sfx-pop.mp3': 'a 0.3 s pop for a label or caption appearing',
    'sfx-pop-hi.mp3': 'a higher 0.25 s pop: the next label after a pop, or a small element',
    'sfx-ding.mp3': 'a 1.4 s chime for the end card',
    'sfx-rise.mp3': 'a 1.8 s rising swell for an opening build-up',
    'sfx-rise-rev.mp3': 'a 1.4 s reversed swell that ends on its peak, right before a drop or a reveal',
    'sfx-impact.mp3': 'a 1 s layered impact (low hit, body, bright top) for a title landing',
    'sfx-boom.mp3': 'a 1.4 s deep boom for a shock, a punchline or the biggest hit of the video',
    'sfx-glitch.mp3': 'a 0.7 s digital glitch for a hard cut or a glitch effect on screen',
    'sfx-glitch-long.mp3': 'a 1.3 s harsh glitch for a jarring transition or a distorted reveal',
    'sfx-sparkle.mp3': 'a 1.4 s sparkle for a shine, a star or a logo glint',
    'sfx-click.mp3': 'a crisp 0.4 s click for a button, a toggle or a selection',
    'sfx-key.mp3': 'a single 0.4 s key press for one typed character or a terminal input',
    'sfx-typing.mp3': 'a 1.8 s burst of typing for text writing itself on',
    'sfx-notify.mp3': 'a 1.2 s notification for a message, a badge or a toast arriving',
    'sfx-ping.mp3': 'a sharp 1 s electronic ping for a key number or data point',
    'sfx-error.mp3': 'a 1 s negative tone for a wrong, a failure or a fail',
};
export const SFX_GUIDE = [
    'How to lay the sound effects (as a sound editor does):',
    '- Vary them: never the same file for two effects in a row; a family has variants (whoosh, whoosh-low, whoosh-high, whoosh-big; pop, pop-hi; glitch, glitch-long), so alternate them, and change the volume a little each time (0.3 to 0.6; the hit of a title or logo up to 0.9).',
    '- Start a whoosh 0.1 s BEFORE the cut or the move it goes with, a hit exactly ON the frame it lands, and let a rise end on the thing it builds to.',
    '- Layer for weight: under a title hit, add a pop or a click or a sparkle a few hundredths of a second after it; a boom for the one biggest moment only.',
    '- Keep it sparse: about one effect a second at most, none for a thing that needs no accent, never during speech.',
].join('\n');
export async function ensureSfx(ownerId, projectId) {
    const dir = `${dirOf(projectId)}/assets`;
    if (Array.isArray(plannedEffects())) return [];
    const names = Object.keys(RECORDED_SFX);
    const script = names
        .map((name) => {
        const made = `ffmpeg -y -v error ${RECORDED_SFX[name]} -c:a libmp3lame -q:a 4 "$T"`;
        return `[ -s "${dir}/${name}" ] || { T="${dir}/.$$-${name}"; { ${made}; } && mv "$T" "${dir}/${name}" || rm -f "$T"; }`;
    })
        .join('; ');
    const done = await sandbox.exec(who(ownerId), { command: `mkdir -p "${dir}"; R="$(npm root -g)/hyperframes/dist/skills/media-use/audio/assets/sfx"; ${script}; for f in ${names.join(' ')}; do [ ! -s "${dir}/$f" ] || echo "$f"; done`, timeoutMs: 90_000 });
    if (done.exitCode !== 0)
        throw new AppError('BAD_REQUEST', { key: 'af-video-ramp-failed', message: done.stderr.slice(-200) });
    return done.stdout.trim().split(/\s+/).filter(name => names.includes(name));
}
const FONTS = { 'Kanit-ExtraBold.ttf': 800, 'Kanit-Medium.ttf': 500 };
export const FONT_FACES = Object.entries(FONTS)
    .map(([file, weight]) => `@font-face{font-family:"Kanit";font-weight:${weight};font-display:block;src:url("fonts/${file}")}`)
    .join('');
export async function ensureFonts(ownerId,projectId) {
    const dir=dirOf(projectId);
    await sandbox.exec(who(ownerId),{command:`mkdir -p "${dir}/fonts" && cp -n /opt/video/fonts/* "${dir}/fonts/"`, timeoutMs:10000});
}
const PRICE = /฿\s?\d[\d,]*|\d[\d,]*\s?บาท/g;
const amountOf = (price) => price.replace(/[\s,]/g, '').replace(/บาท$/, '').replace('฿', '');
const statedPrices = (facts) => new Set([...facts.matchAll(PRICE)].map((match) => amountOf(match[0])));
export function inventedPrice(text, facts) {
    if (!facts)
        return null;
    const stated = statedPrices(facts);
    for (const match of text.matchAll(PRICE)) {
        if (!stated.has(amountOf(match[0])))
            return `It shows ${match[0].trim()}, which the facts do not state: show only the prices the facts give, as they give them (no totals or sums).`;
    }
    return null;
}
export function withoutInventedPrices(text, facts) {
    if (!facts)
        return text;
    const stated = statedPrices(facts);
    return text.replace(PRICE, (price) => (stated.has(amountOf(price)) ? price : '')).replace(/[ \t]{2,}/g, ' ');
}
function sceneProblem(html, name, files, overlay = false, facts = '') {
    if (!/<template>[\s\S]*<\/template>/.test(html))
        return 'It has no <template>.';
    if (!html.includes(`data-composition-id="${name}"`))
        return 'The root has no data-composition-id.';
    if (!html.includes(`window.__timelines["${name}"]`))
        return 'It does not register its timeline as window.__timelines["name"].';
    if (/Math\.random|Date\.now|setTimeout|repeat:\s*-1|<script[^>]+src="(?!https:\/\/cdn\.jsdelivr\.net\/npm\/(?:gsap|three)@|lib\/[\w.-]+\.js")/.test(html))
        return 'It uses something that is not allowed (random, time, timers, endless loops or an external script).';
    for (const match of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
        if (!files.includes(match[1].replace(/^assets\//, '')))
            return `It uses ${match[1]}, which is not one of the files.`;
    }
    const price = inventedPrice(html, facts);
    if (price)
        return price;
    const crowded = wordsThatDoNotFit(html);
    if (crowded.length > 0)
        return `${FIT} ${crowded.join('; ')}. Give each a box wide enough (about 0.6 × font-size per letter) or a smaller font-size, inside the frame margins, centred on the shape it sits on.`;
    if (!overlay && decorationKinds(html) === 0 && !/<img\b|box-shadow\s*:/.test(html))
        return `${PLAIN} give it one focal thing beside the words: a glass card, a picture of the files, an icon or a 3D turn (rotationY with transformPerspective).`;
    return '';
}
const PLAIN = 'It is words on a background with too little design:';
const SHORT_TEXT = 48;
const CAPTION_BAND = [0.8, 0.95];
const FIT = 'Some words do not fit their place:';
const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
export function wordsThatDoNotFit(html) {
    const width = Number(/data-width="(\d+)"/.exec(html)?.[1] ?? 0);
    const height = Number(/data-height="(\d+)"/.exec(html)?.[1] ?? 0);
    if (!width || !height)
        return [];
    const idRules = new Map([...html.matchAll(/#([\w-]+)\s*\{([^}]*)\}/g)].map((match) => [match[1], match[2]]));
    const classRules = new Map([...html.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)].map((match) => [match[1], match[2]]));
    const rules = new Map();
    for (const [, attrs] of html.matchAll(/<[a-z0-9]+\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
        const id = /(?:^|\s)id="([^"]+)"/.exec(attrs)?.[1];
        if (!id)
            continue;
        const inline = /\sstyle="([^"]*)"/.exec(attrs)?.[1] ?? '';
        const classes = (/\sclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).map((name) => classRules.get(name) ?? '');
        const rule = [inline, idRules.get(id) ?? '', ...classes].filter(Boolean).join(';');
        if (rule)
            rules.set(id, rule);
    }
    const px = (rule, name) => {
        const value = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*(-?[\\d.]+px|0)(?=\\s*(?:;|$))`).exec(rule)?.[1];
        return value === undefined ? null : Number.parseFloat(value);
    };
    const box = (rule) => {
        const [left, top, w, h] = ['left', 'top', 'width', 'height'].map((name) => px(rule, name));
        return left == null || top == null || w == null || h == null ? null : { left, top, w, h, x: left + w / 2, y: top + h / 2 };
    };
    const found = [];
    const texts = [];
    for (const tag of html.matchAll(/<(div|h1|h2|h3|p|span)\b([^>]*\bclass="[^"]*\bclip\b[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)) {
        const inner = tag[3].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
        if (!/\S/.test(inner))
            continue;
        const attrs = tag[2];
        const id = /(?:^|\s)id="([^"]+)"/.exec(attrs)?.[1];
        const rule = id ? rules.get(id) : undefined;
        if (!id || !rule)
            continue;
        const [left, top, boxWidth, boxHeight, size] = ['left', 'top', 'width', 'height', 'font-size'].map((name) => px(rule, name));
        if (left == null || top == null || boxWidth == null || size == null)
            continue;
        const start = Number(/data-start="([\d.]+)"/.exec(attrs)?.[1] ?? 0);
        const length = Number(/data-duration="([\d.]+)"/.exec(attrs)?.[1] ?? 1e9);
        const h = boxHeight ?? size;
        texts.push({ id, x: left + boxWidth / 2, y: top + h / 2, w: boxWidth, left, top, h, from: start, to: start + length });
        const words = inner.trim().replace(/\s+/g, ' ').replace(THAI_MARKS, '');
        if (words.replace(/\s+/g, '').length > SHORT_TEXT)
            found.push(`#${id} is a sentence (${words.replace(/\s+/g, '').length} letters): keep a few words (at most ${SHORT_TEXT} letters), the captions carry the speech`);
        if (top + h > height * CAPTION_BAND[0] && top < height * CAPTION_BAND[1])
            found.push(`#${id} reaches into the captions' band (${Math.round(CAPTION_BAND[0] * 100)}–${Math.round(CAPTION_BAND[1] * 100)}% of the height): move it up, with the shape it sits on, to end above ${Math.round(height * CAPTION_BAND[0])}px (top at most ${Math.floor(height * CAPTION_BAND[0] - h)}px)`);
        const oneLine = /white-space\s*:\s*nowrap/.test(rule) || (boxHeight != null && boxHeight < size * 2);
        const ems = (text) => [...text].reduce((sum, letter) => sum + (/[\s.,:;!|'"\-()]/.test(letter) ? 0.3 : 0.6), 0);
        const needed = Math.round(size * (oneLine ? ems(words) : Math.max(...words.split(/\s+/).map(ems))));
        if (needed > boxWidth * 1.05)
            found.push(`#${id} needs about ${needed}px for its words but is ${boxWidth}px wide`);
        else if (left < width * 0.05 || left + boxWidth > width * 0.95 || top < 0 || top + (boxHeight ?? size) > height)
            found.push(`#${id} reaches past the frame margins`);
    }
    for (const [index, a] of texts.entries()) {
        for (const b of texts.slice(index + 1)) {
            if (a.from >= b.to || b.from >= a.to)
                continue;
            const across = Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left);
            const down = Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top);
            if (across > 0 && down > 0 && across * down > 0.15 * Math.min(a.w * a.h, b.w * b.h))
                found.push(`#${a.id} and #${b.id} overlap`);
        }
    }
    for (const [id, rule] of rules) {
        const shape = box(rule);
        if (!shape || /blur\(/.test(rule) || shape.w > width * 0.9 || texts.some((text) => text.id === id))
            continue;
        const on = texts.filter((text) => text.x > shape.left && text.x < shape.left + shape.w && text.y > shape.top && text.y < shape.top + shape.h);
        const text = on[0];
        if (on.length !== 1 || !text || text.w < shape.w * 0.5)
            continue;
        if (Math.abs(text.x - shape.x) > shape.w * 0.06 || Math.abs(text.y - shape.y) > shape.h * 0.06)
            found.push(`#${text.id} is off the centre of #${id} it sits on (centre ${Math.round(text.x)},${Math.round(text.y)} against ${Math.round(shape.x)},${Math.round(shape.y)})`);
    }
    return found;
}
export function decorationKinds(html) {
    return [/clip-path\s*:\s*polygon\(/, /<svg\b/, /rotation[XY]\s*:/, /conic-gradient\(/].filter((pattern) => pattern.test(html)).length;
}
const CAPTIONS_PROMPT = [
    'Transcribe the speech in this audio as SubRip (.srt) subtitles.',
    'Keep the language that is spoken (Thai stays Thai, never translate).',
    'Each cue is one or two short lines of at most about 42 characters, between 1.5 and 6 seconds long, in order, never overlapping, with times counted from the start of the audio as HH:MM:SS,mmm.',
    'Only what is said: no sound descriptions, no speaker names, nothing invented; skip what cannot be made out.',
    'Reply with the SRT text only, no explanation and no code fence.',
].join(' ');
const ASSET_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const LANGUAGE = /^(auto|[a-z]{2,3})$/;
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
const LANGUAGE_NAMES = { th: 'Thai', en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' };
export async function transcribeAsset(userId, role, projectId, asset, language, ownerId = userId) {
    if (!ASSET_NAME.test(asset))
        throw new AppError('BAD_REQUEST', { key: 'af-video-asset-name' });
    if (!LANGUAGE.test(language))
        throw new AppError('BAD_REQUEST', { key: 'af-video-language' });
    const tmp = `/tmp/captions-${randomUUID()}.mp3`;
    const sandboxWho = who(ownerId);
    try {
        const made = await sandbox.exec(sandboxWho, {
            command: `ffmpeg -y -v error -i "${dirOf(projectId)}/assets/${asset}" -vn -ac 1 -ar 16000 -c:a libmp3lame -b:a 32k "${tmp}"`,
            timeoutMs: 240_000,
        });
        if (made.exitCode !== 0)
            throw new AppError('BAD_REQUEST', { key: 'af-video-captions-audio', message: 'This file has no sound that can be read.' });
        const audio = await sandbox.readFile(sandboxWho, tmp, AUDIO_MAX_BYTES);
        const srt = await transcribe(audio, language);
        if (!srt)
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-captions-empty' });
        return { srt };
    }
    catch (error) {
        if (error instanceof AppError || isBudgetExhausted(error))
            throw error;
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-captions-failed', cause: error });
    }
    finally {
        await sandbox.exec(sandboxWho, { command: `rm -f "${tmp}"`, timeoutMs: 15_000 }).catch(() => undefined);
    }
}
let catalog = null;
const CATALOG_KEPT_MS = 30 * 60_000;
export async function listBlocks(userId) {
    if (catalog && Date.now() - catalog.at < CATALOG_KEPT_MS)
        return catalog.items;
    const bytes=await sandbox.readFile(who(userId),'/opt/video/catalog.json',8*1024*1024);
    const parsed=JSON.parse(bytes.toString('utf8'));
    const items = parsed.map((entry) => ({
        name: entry.name,
        type: entry.type,
        title: entry.title ?? entry.name,
        description: (entry.description ?? '').slice(0, 220),
        tags: entry.tags ?? [],
        duration: entry.duration ?? null,
        poster: entry.preview?.poster ?? null,
        width: entry.dimensions?.width ?? null,
        height: entry.dimensions?.height ?? null,
    }));
    catalog = { at: Date.now(), items };
    return items;
}
const BLOCK_NAME = /^[a-z0-9][a-z0-9-]{0,80}$/;
async function installBlock(userId, dir, name) {
    if (!BLOCK_NAME.test(name)) throw new AppError('BAD_REQUEST',{key:'so-video-block-name'});
    const block=(await listBlocks(userId)).find(entry=>entry.name===name);
    if(!block)throw new AppError('BAD_REQUEST',{key:'so-video-block-unknown'});
    const group=block.type==='block'?'blocks':'components';
    const base='https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/'+group+'/'+name+'/';
    const manifest=await (await fetchPublic(base+'registry-item.json')).json();
    if(manifest.name!==name || !Array.isArray(manifest.files) || manifest.files.length>80)throw new Error('Invalid block manifest');
    let size=0;
    let composition;
    for(const file of manifest.files) {
        if(!/^(compositions|models|lib|assets)\/[A-Za-z0-9_./-]+$/.test(file.target) || file.target.split('/').some(part=>part==='.'||part==='..'))continue;
        if(!/^[A-Za-z0-9_./-]+$/.test(file.path) || file.path.includes('..'))throw new Error('Invalid block asset');
        const response=await fetchPublic(file.url||base+file.path);
        if(!response.ok)throw new Error('Registry asset could not be fetched');
        const bytes=Buffer.from(await response.arrayBuffer());
        if((size+=bytes.length)>24*1024*1024)throw new Error('Block exceeds the asset budget');
        await sandbox.writeFiles(who(userId),dir,[{path:file.target,bytes}]);
        if(!composition && file.target.endsWith('.html'))composition={path:file.target,source:bytes.toString('utf8')};
    }
    if(!composition)throw new Error('The block has no composition');
    return {block,composition};
}
export async function addBlock(userId,projectId,name) {
    const {block,composition}=await installBlock(userId,dirOf(projectId),name);
    return {type:block.type,file:composition.path.split('/').pop(),snippet:`<div data-composition-id="${name}" data-composition-src="${composition.path}" data-start="0" data-duration="${Number(block.duration)||3}" data-track-index="0"></div>`};
}
export async function blockSource(userId,name) {
    const {composition}=await installBlock(userId,`${WORKSPACE}/.hf-blocks`,name);
    return composition.source.slice(0,40000);
}
export async function makeThumbnail(userId, projectId) {
    const dir = dirOf(projectId);
    const tmp = `/tmp/thumb-${randomUUID()}`;
    const done = await sandbox.exec(who(userId), {
        command: `cd ${dir} && export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_BROWSER_PATH=$(find ~/.astra/browser/ms-playwright -path '*chromium-*' -name chrome -type f | head -1) && ${HF} snapshot --at 1 --no-end --describe false --output ${tmp} > /dev/null 2>&1; f=$(ls ${tmp}/*.png 2>/dev/null | head -1); [ -n "$f" ] && ffmpeg -y -v error -i "$f" -vf scale=480:-2 -q:v 5 thumb.jpg; rm -r ${tmp} 2>/dev/null; [ -f thumb.jpg ]`,
        timeoutMs: 120_000,
    });
    if (done.exitCode !== 0)
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-thumbnail-failed' });
}
