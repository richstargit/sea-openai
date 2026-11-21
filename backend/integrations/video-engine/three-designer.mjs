import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import sharp from 'sharp';
import { agentConfig } from "./runtime.mjs"
import { textOf } from "./runtime.mjs"
import { logger } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { videoModel } from "./runtime.mjs"
import { threeWords } from "./three-scene.mjs"
import { dirOf, FONT_FACES, HF, inventedPrice, SCENE_DESIGNER, who } from "./video-studio.service.mjs"
import { limiter } from "./limiter.mjs"
export const THREE_PROMPT = [
    'You are a top 3D motion designer. Write ONE shot of a video: its 3D as a Three.js scene, and its words as text layers over it. Reply in exactly this form and nothing else (no markdown fences, no explanation): first <words>[...]</words> (a JSON array, maybe empty), then ONLY the body of `async function design(ctx)` in plain JavaScript (no imports). The body builds the scene and returns a function `(t) => { ... }` that sets every object, light and the camera for time t, in seconds from the start of the shot (0 to ctx.seconds). Everything moves from t alone: never requestAnimationFrame, timers, Date, performance, Math.random (use ctx.rnd(n)), fetch or imports; load only ctx.assets, with ctx.loadTexture / ctx.loadModel. Your code is a module of its own: nothing but ctx exists in it, so begin with `const { THREE, scene, camera } = ctx;` (and whatever else of ctx you use).',
    'ctx: THREE; scene (empty; scene.environment is a studio for PBR materials); camera (PerspectiveCamera 30°, at (0,0,ctx.D) looking at the origin; move and aim it as you like); width, height (the frame), seconds; fit (world size that fills the narrower side of the frame at the start camera); palette {deep, accent, light} as numbers and css {deep, accent, light} as hex strings; ease {out, in, inOut, back, elastic} (each takes 0..1, clamped); clamp(x, lo=0, hi=1); mix(a, b, t); rnd(n) a fixed 0..1 for n; gradient(["#hex", ...], angleDegrees) a texture for scene.background; glow() a soft round texture for light blobs and halos; label(text, {size=96, weight=800|500, color="#fff", bg=null, radius=0.5, padX=0.6, padY=0.35, maxWidth=0}) a crisp text texture (Kanit, Thai and English) returning {texture, aspect}; card({title, line, picture, tint, dark=false}) a glassy card texture with a 3D icon, returned at once as {texture, aspect}; assets {model, pictures, icons:[{title, line, picture}]}; loadTexture(src) a texture at once for a picture of ctx.assets; loadModel(src) (await it) a THREE.Group scaled to size 1 and centred.',
    'Helpers, to use only where they serve your design (the design is yours, nothing obliges you to them): stage({look: "vivid"|"light"|"dark", ground}) a background in the palette, studio light and a soft floor shadow; phone({title, rows: [{title, line, price}], button, dark, height}) a 3D phone with that app screen on it; panel(texture, aspect, height) a card() or label() on a plane at its own proportions; city({blocks, cell, tall}) a low-poly city of lit buildings, trees and roads to fly a camera through; route(points, {color, width}) a glowing route along points that draw(p) reveals, its curve.getPointAt(p) the path for a camera or a pin(); pin({color, size}) a map pin; bloom({color, size}) a soft neon glow to put behind anything bright; sizeTo(object, height = 0.4, width = 0.9) sizes anything to those fractions of the frame and at(object, x, y, z) puts it there (x and y from -1 to 1 across the frame); in the pose: hero(object, t, {start, kind, turn}), coverflow(cards, t, {start, every}), orbit(objects, t, {radius, speed, y}), enter(object, t, start, "rise"|"pop"|"drop"|"slide-left"|"slide-right", duration), drift(t, strength), exit(objects, t) for the last 0.4 s.',
    'Design freely and beautifully, better than the best motion design on TikTok, and never the same way twice. Any subject and any genre (a game, food, fashion, beauty, tech, finance, a place, a service, an event, a person): find the visual language that fits it and the look given (its colours, its mood, its energy) instead of one house style, and choose the composition and motion that fit this idea. Model what the shot is about yourself, made to look real and premium: real proportions, materials that catch the light, layered light (a key, a fill, a rim that moves). Vocabulary to draw from: glass UI cards with 3D icons in a cover-flow, a fan, a wall, a stack or a spiral; exploded views that assemble; a product turning on a plinth under a sweeping light; isometric voxel dioramas built from boxes; neon, chrome, glass, fabric, clay or paper looks; kinetic words timed to the 3D; floating objects orbiting a hero; phones and screens in depth with UI layers; particles that mean something (sparks for speed, coins for money); a soft light sweep; a camera that dollies, orbits, whips or cranes; parallax layers in depth; a hand-off out at the end.',
    'Craft: the shot has phases (an entrance that lands in the first second, a development with overlapping eased motion, a hand-off out in the last half second); less, done well: one focal subject big in the frame with empty space around it, no clutter of particles, rings or scattered bits; something always moves; depth (foreground, subject, background) and a moving camera; a light, glow or highlight that travels. The subject always stands out from its background in light and in colour (a dark subject on a light or vivid ground, a light one on a deep ground, never dark on dark). Devices look real: a phone like a current iPhone (corners rounded about 15% of its width, a screen with matching rounded corners inside thin even bezels, a Dynamic Island, a metal frame that catches the light), a laptop with a thin bezel and a rounded lid. Every object and label that matters stays whole inside the frame all through the shot (the camera moves: keep them clear of the edges) and above the captions\' band (76% of the frame height down), and nothing passes over a label. A phone, laptop or screen always shows a UI on its screen (cards, rows, prices and buttons built with card() and label() from the files), never an empty or black screen. Cards never hide one another: in a stack each sits far enough down or aside that its picture and title read, or they fan, flow or come one after another. Between any two moments a second apart the frame visibly changes (the camera travels, things turn, assemble or swap). 3D objects: MeshStandardMaterial or MeshPhysicalMaterial. UI, text and pictures: MeshBasicMaterial({ map, transparent: true, toneMapped: false }) on planes sized by aspect, so whites stay white. Background: scene.background = ctx.gradient([...]) in the video\'s colours (never flat black unless the look is dark).',
    'Words: every headline, line, price or call to action the viewer reads is a word layer, not drawn in 3D: crisp real text over the canvas, which the user edits on the timeline. Each is {"text", "at": seconds from the shot start, "for": seconds shown, "x": -40..40 and "y": -46..24 (where its centre sits, in % of the frame from the middle: y -32 is high, 0 the middle, 24 the lowest, below it the captions run), "size": px on a 1080-wide frame (a headline 90 to 150, a line 44 to 64), "weight": 500|800|900, "color": "#hex", "in": fade|zoom|blur|slide-up|slide-down|slide-left|slide-right|wipe-up|wipe-left|iris|flip|spin|dip, "keys": kinetic moves if you want them, [{"t": seconds from its own start, "x", "y" (% of the frame, from where it rests), "scale", "rotate" (degrees), "opacity", "ease": a GSAP ease}]}. At most 8, each short (a few words, one line), never two over each other at the same time; place them where the 3D leaves room and time them with its motion. The shot is the whole frame: no other layer adds words. In the 3D only words that belong to an object (the title on a card, a label on a box), large enough to read. Use only the facts and words given, in the video\'s language; invent none: every number and price is one the facts state (no totals or sums you work out). A tall frame needs a vertical layout: stack things, do not spread them wide.',
    'Keep it light for a software renderer: under 150 meshes, no shadow maps, no post-processing, textures from ctx only.',
].join('\n');
const REVIEW_PROMPT = 'These are frames of your shot (the 3D with its word layers over it, still: the words fly in when it plays) at the times given, with what you wrote. A red FIX strip across the top of a frame is not part of the shot: it lists what was measured wrong in that frame (a word over the subject); fix each. Fix what the frames show wrong: an empty, dull or flat frame; the 3D things the shot is about missing or too small; words too small, cut off, over each other or over the 3D subject, or unreadable on what is behind them; things outside the frame; colours that fight the palette; nothing changing between the frames; clutter. First write what you see wrong in each frame inside <seen>...</seen> (look hard: a word over the subject, a label or object cut by the edge, one thing hiding another, a card whose title is covered, an empty screen, frames that barely differ), then reply with the whole improved shot in the same form (<words>[...]</words>, then the body of design(ctx)), or exactly OK if nothing is wrong.';
const BROKEN_PROMPT = 'These are frames of your shot with what you wrote. The red frame is the error your code threw, written on it: fix its cause (and anything else wrong) and reply with the whole corrected shot in the same form (<words>[...]</words>, then the body of design(ctx)) and nothing else.';
const BLANK = 'It rendered a blank frame: it drew nothing in view (check the camera aim, sizes against ctx.fit, and that every object is added to ctx.scene).';
const FORBIDDEN = /\b(requestAnimationFrame|setTimeout|setInterval|Date\s*\.|new\s+Date|performance\s*\.|Math\.random|import\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|eval\s*\(|Function\s*\(|localStorage|sessionStorage|document\.cookie|location\s*\.)|(?<![\w$.])(parent\s*\.|top\s*\.)|\bwindow\s*\.\s*(?:parent|top)\b/;
export function codeProblem(code) {
    if (!code.trim())
        return 'It is empty.';
    const banned = FORBIDDEN.exec(code);
    if (banned)
        return `It uses ${(banned[1] ?? banned[2] ?? banned[0]).trim()}, which the shot may not: everything moves from t alone.`;
    if (!/\breturn\s*(\(\s*t\s*\)|t\b|\(\s*time\s*\)|time\b|function\b)/.test(code))
        return 'It must return the function (t) => { ... } that poses the scene for t.';
    try {
        const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
        new AsyncFunction('ctx', code);
    }
    catch (error) {
        return `It does not parse: ${error instanceof Error ? error.message : String(error)}.`;
    }
    return null;
}
export const bodyOf = (reply) => reply.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '').trim();
export function shotOf(reply) {
    const text = bodyOf(reply);
    const found = /^<words>([\s\S]*?)<\/words>\s*/.exec(text);
    if (!found)
        return { words: [], code: text };
    let words = null;
    try {
        words = JSON.parse(found[1] ?? '');
    }
    catch { }
    return { words: Array.isArray(words) ? words : null, code: bodyOf(text.slice(found[0].length)) };
}
function checkPage(clip, script, style, frame, seconds) {
    return `<!doctype html><html><head><meta charset="UTF-8"><style>${FONT_FACES}.lupo-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 8%;font-family:"Kanit",sans-serif;white-space:pre-wrap;text-align:center}\n${style}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${seconds}" data-width="${frame.width}" data-height="${frame.height}">${clip}</div>${script}</body></html>`;
}
const LOOKS_AT_ONCE = 2;
const turns = new Map();
export async function inTurn(ownerId, work) {
    let held = turns.get(ownerId);
    if (!held)
        turns.set(ownerId, (held = { turn: limiter(LOOKS_AT_ONCE), open: 0 }));
    held.open++;
    try {
        return await held.turn(work);
    }
    finally {
        if (--held.open === 0)
            turns.delete(ownerId);
    }
}
async function lookAt(ownerId, projectId, key, page, times) {
    const dir = dirOf(projectId);
    const work = `${dir}/.three-${key}`;
    await sandbox.exec(who(ownerId), { command: `mkdir -p "${work}" && cd "${work}" && for d in assets fonts compositions; do [ -e "$d" ] || [ ! -d "../$d" ] || cp -al "../$d" "$d"; done`, timeoutMs: 15_000 });
    await sandbox.writeFiles(who(ownerId), work, [{ path: 'index.html', bytes: Buffer.from(page) }]);
    const shot = await inTurn(ownerId, () => sandbox
        .exec(who(ownerId), {
        command: `cd "${work}" && rm -rf out && HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 timeout 240 ${HF} snapshot --at ${times.join(',')} --no-end -o out . > out.log 2>&1; i=0; for f in $(ls out/frame-*.png 2>/dev/null | sort); do ffmpeg -y -v error -i "$f" -vf scale=720:-2 -q:v 4 "out/look-$i.jpg"; i=$((i+1)); done; ls out/look-*.jpg 2>/dev/null | wc -l`,
        timeoutMs: 200_000,
    })
        .catch(() => null));
    const count = Number(shot?.stdout.trim().split('\n').at(-1) ?? 0);
    if (count === 0) {
        const said = await sandbox.readFile(who(ownerId), `${work}/out.log`, 200_000).catch(() => null);
        logger.warn('VIDEO_THREE_LOOK_FAILED', { key, said: said?.toString('utf8').slice(-600) ?? 'no log' });
    }
    const frames = [];
    let blank = count === 0;
    let broken = false;
    for (let i = 0; i < count; i++) {
        const bytes = await sandbox.readFile(who(ownerId), `${work}/out/look-${i}.jpg`, 2_000_000).catch(() => null);
        if (!bytes)
            continue;
        const { channels } = await sharp(bytes).stats();
        if (channels.reduce((sum, channel) => sum + channel.stdev, 0) / channels.length < 4)
            blank = true;
        const [red, green, blue] = channels;
        if (red && green && blue && red.mean > 200 && green.mean < 90 && blue.mean < 90)
            broken = true;
        frames.push(`data:image/jpeg;base64,${bytes.toString('base64')}`);
    }
    return { frames, blank: blank && !broken, broken };
}
export async function designThree(ownerId, userId, role, projectId, key, brief, render, revise) {
    const designer = SCENE_DESIGNER ?? brief.model ?? agentConfig().videoModel;
    const model = await videoModel({ alias: designer, userId, role, maxTokens: 100_000 }, brief.effort, true);
    const ask = [
        revise ? `Change this shot as asked: ${revise.change}\n\nIt now:\n<words>${JSON.stringify(revise.words)}</words>\n${revise.code}` : `The shot: ${brief.idea}`,
        `Length: ${brief.seconds} seconds. Frame: ${brief.frame.width}x${brief.frame.height}${brief.frame.height > brief.frame.width ? ' (tall: lay things out vertically)' : ''}.`,
        `The video's look: ${brief.look || 'clean and modern'}. Palette: ${brief.palette.join(', ') || 'your choice'}.`,
        `Files you may use (ctx.assets): ${JSON.stringify(brief.assets)}`,
        brief.facts ? `Facts to copy exactly (invent none):\n${brief.facts.slice(0, 2500)}` : '',
        brief.style ?? '',
    ]
        .filter(Boolean)
        .join('\n\n');
    const times = [0.15, 0.5, 0.85].map((at) => Math.round(brief.seconds * at * 100) / 100);
    let made = null;
    let draft = '';
    let problem = '';
    let failure = '';
    let seen = null;
    for (let calls = 0, looks = 0; calls < 4 && looks < 3; calls++) {
        const reply = await model
            .invoke(seen
            ? [
                new SystemMessage(THREE_PROMPT),
                new HumanMessage({
                    content: [
                        { type: 'text', text: `${seen.broken ? BROKEN_PROMPT : REVIEW_PROMPT}\n\nFrames at ${times.join(' s and ')} s.\n\n${ask}\n\nWhat you wrote:\n${draft}` },
                        ...seen.frames.map((url) => ({ type: 'image_url', image_url: { url } })),
                    ],
                }),
            ]
            : [new SystemMessage(THREE_PROMPT), new HumanMessage(problem ? `${ask}\n\nWhat you wrote:\n${draft}\n\nThat did not pass: ${problem} Write the whole body again.` : ask)])
            .then((answer) => bodyOf(textOf(answer.content)), (error) => {
            logger.warn('VIDEO_THREE_MODEL_FAILED', { projectId, key, error: error instanceof Error ? error.message : String(error) });
            return '';
        });
        problem = '';
        const verdict = reply.replace(/^\s*<seen>[\s\S]*?<\/seen>\s*/, '');
        if (seen && !seen.broken && /^OK\.?$/i.test(verdict))
            break;
        const shot = shotOf(verdict);
        const wrong = shot.words === null ? 'Its <words> is not a JSON array.' : (codeProblem(shot.code) ?? inventedPrice(verdict, brief.facts ?? ''));
        if (wrong) {
            if (made)
                break;
            problem = failure = wrong;
            draft = verdict;
            seen = null;
            continue;
        }
        draft = verdict;
        const words = threeWords(shot.words, brief.seconds);
        const { clip, script, style } = render(shot.code, words);
        const look = await lookAt(ownerId, projectId, key, checkPage(clip, script, style, brief.frame, brief.seconds), times);
        looks++;
        if (look.blank) {
            problem = failure = BLANK;
            seen = null;
            continue;
        }
        if (!look.broken)
            made = { code: shot.code, words };
        seen = look;
    }
    await sandbox.exec(who(ownerId), { command: `rm -rf "${dirOf(projectId)}/.three-${key}"`, timeoutMs: 15_000 }).catch(() => undefined);
    if (!made)
        logger.warn('VIDEO_THREE_DESIGN_FAILED', { projectId, key, problem: failure });
    return made;
}
