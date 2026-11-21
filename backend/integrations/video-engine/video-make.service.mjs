import { fetchPublic as fetch } from "./runtime.mjs"
import { adaptBeats, chosenStyle, continuousMotion, plannedEffects, requestedShots, sceneSoundGuide, stagePublic } from "./runtime.mjs"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { createHash } from "node:crypto"
import sharp from 'sharp';
import { agentConfig } from "./runtime.mjs"
import { downloadAttachment, resolveAttachments } from "./runtime.mjs"
import { textOf } from "./runtime.mjs"
import { extractPdfText, renderPdfPage } from "./runtime.mjs"

import { extractFilePictures } from "./runtime.mjs"
import { plainTextOf } from "./runtime.mjs"
import { AppError } from "./runtime.mjs"
import { logger } from "./runtime.mjs"
import { findEnabled, readFile as readSkillFile, skillMdOf } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { videoModel } from "./runtime.mjs"
import { blenderAsset, blenderOn, blenderTag, designBlender } from "./blender-designer.mjs"
import { designThree } from "./three-designer.mjs"
import { fetchModel, freeThreeClip, threeClip, threeFile, wordClips } from "./three-scene.mjs"
import { aiVideoStatus, startAiVideo } from "./ai-video.service.mjs"

import { drawnImage, webImage } from "./video-images.service.mjs"
import { addAsset, addCredit, blockSource, cardScene, composeScene, dirOf, ensureSfx, FONT_FACES, HF, listBlocks, makeThumbnail, polishScene, SCENE_DESIGNER, WORKSPACE, transcribeAsset, who, withoutInventedPrices, withoutPlaceholder } from "./video-studio.service.mjs"
import { findMusic } from "./music.service.mjs"
import { speakText } from "./runtime.mjs"
import { limiter } from "./limiter.mjs"
export const quickCap = (seconds) => (seconds <= 20 ? 4 : seconds <= 45 ? 6 : Math.min(10, Math.ceil(seconds / 8)));
const PICTURE_ASKED = /photo|picture|image|illustrat|draw|รูป|ภาพ/i;
export function quickBeats(beats, seconds, brief) {
    for (const beat of beats) {
        delete beat.three;
        delete beat.blender;
        delete beat.clip;
        if (!PICTURE_ASKED.test(brief)) {
            delete beat.photo;
            delete beat.draw;
        }
    }
    beats.splice(quickCap(seconds));
}
export const toppedUp = (lengths, seconds) => {
    const total = lengths.reduce((sum, length) => sum + length, 0);
    return total > 0 && total < seconds * 0.9 ? lengths.map((length) => round((length * seconds) / total)) : lengths;
};
const BREATH = { quick: 0.3, steady: 0.7, hold: 2 };
const PLAN_PROMPT = [
    'You plan a video as beats, of whatever kind the brief asks for (a promo or ad, an explainer, a tutorial, a story, a news or recap piece, a quote or music clip, a slideshow, a vlog, anything). Reply with JSON only: {"look": "...", "film": "...", "music": ["..."], "beats": [{"say": "...", "show": "...", "seconds": n, "pace": "steady", "moves": ["..."], "block": "...", "three": {"idea": "...", "kind": "..."}}]}: block and three only on the beats that have them.',
    '- film (optional): a style of the film-style library in the house style ("film styles"), its slug, when one fits this subject and brief better than the families below (a premium product in glass and light, a device seen inside, numbers as data, an app in use, a story in paint or paper): every scene and 3D shot then follows its STYLE, in the look\'s palette; leave it out where a family fits better.',
    '- music: 1 to 3 single English words for the background music that fits this video, genre first, then mood (acoustic, lofi, cinematic, jazz, electronic, pop, rock, hiphop, ambient, piano, corporate, chill, upbeat, epic, happy, calm).',
    '- look: one design direction for every scene: 3 palette hexes (deep background, bright accent, near-white text), a mood, a type feel, and one style family that fits the subject: "brand film" (the brand-ad formula of the best motion edits, and the one for any promo of a brand, app, product or service unless the brief asks for another look: a near-black ground lit by the brand colour; the brand\'s own mark opens it, drawn on or burst out of particles, or one huge number; then the product\'s story, its moments chosen by what it is (an app or service: through its real interface; a drink, a food, a thing people wear or use: cinematic drawn photographs of it in life, one word each, and the product hero in studio light; a machine or a technical product: seen through as a glowing wireframe with its parts lit and labelled), one moment a beat, the interface big in the middle of the frame on a glowing phone or as floating UI cards seen in depth (the search, the result, the price, a map whose route lights up, the card that arrives), each moment turning into the next (the route ends at the box, the timer becomes the result); one beat of scale, a wall or grid of hundreds of tiles or pictures the camera flies through while a number counts up; the real pictures as a collage (hexagons, a grid, tilted cards) the camera dives into one frame at a time, the frame\'s edge lighting up and tracing round it while a callout says what it shows, then pulling back to the next; depth made in 2.5D (layered planes at several depths, perspective, a camera that dollies and orbits) rather than a 3D engine; tag lines of two to four words in heavy white type, each ending in a full stop in the brand colour; the logo glowing on the brand colour with the tagline at the end, then black), "product pastel" (a vivid mesh gradient, three or four saturated hues such as tangerine, hot pink, violet and sky blurred together, or a clean white canvas, whatever the brand colours are (they go on the accents, and its palette is then those hues with a near-black text colour); one huge glossy 3D clay icon per moment; feature cards each in its own pastel (mint, butter, sky, rose, peach) in a cover-flow; a huge headline word that slides in with a selection box or caret round it; a cursor that clicks; small black pills; few things on screen, lots of space; for apps, services, shops, offers), "dark glow" (a near-black ground, minimal UI in pill tabs and list rows, one brand colour that glows, a white headline with one word in the brand colour, a logo that lights up; for tech, music, premium), "editorial premium" (a warm near-black or deep ground with a soft glow and fine film grain, one accent; every beat in one layout system: a small kicker pill at the top left naming the part, a heavy two-line headline (white, its second line in the accent with a soft glow), one hero in the middle (a code or UI card, a diagram, a 3D object, two cards compared with a cross and a check, a huge number), small tilted sticker chips as labels; for lessons, tutorials, explainers, tech), "cinematic premium" (a dark studio ground lit like a product shoot, one real-looking 3D object or a phone with its screen, one big word, small quiet type; for premium brands and launches), or "bold kinetic" (huge tight type that slams in word by word, a block of the accent behind the key word, pixel-block wipes between beats; for hooks, news, energy). Name the family in the look so every scene follows it.',
    '- beats: in order, one per idea, about one every 5 to 8 seconds (3 to 12 for a short video; a long one, such as a lesson of minutes, as many as its length needs, up to 60, one step of it each), for "brand film" one every 2 to 4 seconds, as many as its length needs, in its order (the mark or number, the product\'s moments, the wall of scale, the tag lines, the logo), and for "product pastel" about one every 2 to 3 seconds (up to 14), each one idea that lands at once and a brand card (the name or logo on its colour) last; their seconds add up to the length asked. Shape them for the kind of video: a hook first for anything that must catch a scroll; a call to action last only for a promo or ad; an explainer or tutorial goes step by step and ends on a recap; a story has a beginning, a turn and an end; a recap or list goes item by item. Never add a hook or an offer the brief does not call for.',
    '- say: what the voice-over says in that beat, in the language of the user\'s own words (else of the brief), short enough to speak in its seconds (about 2.5 words a second; Thai about 6 syllables a second), and never more than about 8 seconds of speech (about 20 words; Thai about 48 syllables): a longer thought is several beats, each showing its own step.',
    '- pace: how long the picture stays after its line, so the video moves at the speed of what it says: "quick" for a punchy line or a hand-over, "steady" for most, "hold" where the viewer has to read or follow (code, a table, a worked step, a diagram). A beat lasts as long as its line plus that breath; seconds only times a beat with no line.',
    '- moves: 1 to 3 motion recipes the beat\'s scene is built from, by their ids in the house style\'s list of motion recipes, picked for what the beat shows (a punchy line, a number, a product screen, a logo, a list), and varied across the video so it never moves the same way twice in a row.',
    '- block (optional): a registry block from the house style\'s list, made by motion designers, that this beat\'s scene starts from when one fits what it shows (a hero, a phone or UI, a reveal, a stat, a carousel, a logo); the scene keeps its craft and makes it this video (words, pictures, colours, frame). A video of any kind starts at least its opening beat and one key beat (the product, the main idea, the turn of the story) from blocks, unless none fits; it may use more.',
    '- transition (every beat but the first): how it comes in from the beat before, so the video plays as one continuous piece and not a row of slides: "zoom-through" (high energy, a punch forward), "push-slide LEFT|RIGHT|UP|DOWN" (the next thing pushes the last one out), "squeeze" (the last one folds to an edge), "blur-crossfade" (calm, or two very different grounds), "crossfade", or "cut" (a hard hit on the beat); vary them, never one kind three times in a row. Carry one motif through the beats as the best edits do (a light trail that draws on from scene to scene, a line, the brand shape, one camera moving through one world): each show says where it enters from the beat before and where it leaves toward the next.',
    '- The ground changes with the story from beat to beat (dark, light, the accent colour, a full-bleed picture of the files), in the one palette: one ground for the whole video reads flat.',
    '- In a lesson, tutorial or explainer every beat shows real content the viewer learns from (the code, the numbers, a worked example step by step, a diagram, a table filling in), never a lone title or one word on screen.',
    '- A design system, brand guide or style sheet among the files is how the video looks (its colours, type, logo, shapes), never what it is about: no beat shows its palette, swatches, colour codes, type specimens or its name.',
    '- Every fact in the video (a feature, an offer, a price, a place, an hour, an app store) comes from the brief or the user\'s files: invent none, not even a likely one; with few facts, make fewer beats about them rather than add any.',
    '- The video is about its subject for its viewers: never address or name the person who asked for it, and use no nickname, honorific, personal detail or style of speech of theirs unless the brief asks for it.',
    '- show: the scene brief for a motion designer: the exact on-screen words (a key word, the number, the offer; never the spoken sentence again), the layout, the one hero and its few accents, the motion and how it hands over to the next beat.',
    '- span (0 to 4): a journey, the best edits\' signature: this beat\'s scene goes on through the next beats while they are said, one continuous piece the camera travels for 8 to 15 seconds (a light trail drawing on from one thing to the next, a pan across one big board of the steps, a flight through a city or the inside of a product), reaching one stop for each beat it spans; those beats then show nothing of their own, so their "show" is what the camera reaches there. A video of six beats or more has at least one journey (span 2 to 4).',
    '- three (rarely: a designed scene with 2.5D depth, layered planes, perspective and a moving camera, looks better and is the default, with a WebGPU block of the shelf (a shader ground, light, liquid glass, a mesh gradient, particles) under it for light and depth, which looks far better than a 3D shot; a 3D shot only where a real object or world is the point and the files have no picture of it: a store\'s aisles or a city the camera flies through, a map whose route draws on in 3D, a product seen through to its inside, the brand mark built of particles, 3D digits counting up, glossy clay objects; a journey through a world is a 3D camera flight through its stops; an interface moment (a phone screen, a UI card, a list) is a designed scene in depth, not a 3D shot): {"idea": "...", "kind": "model"|"pictures"|"screen"|"cards", "search": "...", "pictures": ["name"], "cards": [{"title": "...", "line": "...", "icon": "..."}], "layout": "flow"|"stack", "motion": "assemble"|"drop"|"spin"|"float"}, a 3D shot. "idea" is the heart of it: brief the 3D shot freely as a top motion designer would, new for this video (what is in it, how it is laid out, how it moves in phases, the camera, the light), and a 3D designer builds exactly that; the other fields only fetch what it needs: "model" the product or object itself turning in a studio light in the video\'s colours ("search": the exact thing in one to three English words, "coffee cup", "sneaker", "laptop"; if no model is exactly it, a picture of it is drawn and stood in the light), only for a real everyday object the video is about (a cup, a shoe, a chair, a plant, a fruit, a camera): a brand, an app, a logo, a mascot or an idea is built by the 3D designer from the "idea", never searched; "pictures" pictures of the user\'s products or place on cards circling in 3D; "screen" a screenshot of the user\'s app or website (one picture) on a 3D phone whose screen layers fly out in depth and stack back together; "cards" 2 to 6 glassy cards, each a 3D clay icon ("icon": two or three English words naming it, "piggy bank", "padlock", "coffee cup"), a short title and one line in the video\'s language, in a 3D cover-flow that moves to each in turn ("layout": "flow") or a tilted stack that falls in and spreads ("stack"): for features, benefits, menu items, services or steps (the cards carry their words: say them in "say", not in "show"). Pick the motion for the beat\'s energy, and vary it between the two: "assemble" its pieces fly together (a product being built, how it is made, a reveal), "drop" it falls in and lands with a bounce and sparks (a launch, an offer, a hit on the beat), "spin" it bursts out of a spin (an opening, a wow), "float" it eases in and drifts (calm, premium, a closing). An idea gets an object that stands for it (a lesson\'s tool or machine, a number as 3D digits, a place as a little 3D world); never for a feeling, a person\'s face or words alone (titles and text are designed scenes). Its "show" then briefs only light graphics at the edges over the 3D (a label, a line, a price chip), never a background.',
    '- photo (optional, in at most 4 beats): two to four English words for a real photograph found on the web, free to use, when a real one lifts the beat more than a drawing (a place, a city, nature, food or a drink in life, people doing what the video is about, a crowd, a moment of the story): it is placed itself with motion (a slow push, a parallax cut, a mask reveal, full frame or in a card); never for the brand\'s logo, the app\'s screen or the user\'s own product (those are theirs or designed).',
    '- clip (optional, in at most 3 beats, only a beat on a picture of the files): {"picture": "name", "motion": "..."} the picture made into a short real-looking video (the first frame is the picture itself; the place, things and people in it stay as they are, only the camera and light move: a slow push in, a pan along it, steam rising, a machine turning): for the photographs that matter most (the site, the plant, the team at work). With "from" (the same place earlier, for an image model: bare ground, a construction site, an empty hall) the picture is where it ends and the video builds it up in a timelapse from that start: for something built or installed (a building, a plant, a pipe rack, solar panels on a roof), once or twice in a video. Two beats in a row with a clip of the same picture play as one unbroken shot: the second goes on from the very frame the first ends on, so its "motion" says what happens next (the camera travels on, the next thing in the picture starts to move). Its "show" then briefs only titles and labels at the edges over the moving picture. Never for a screenshot, a logo or a chart, and the motion invents nothing that is not in the picture.',
    '- draw (optional, in at most 3 beats; up to 6 in a brand film told in photographs): {"prompt": "...", "cutout": true|false} a picture to generate for that beat when a real-looking one would lift it (a product shot, a dish, a place, a prop, or for "product pastel" a glossy 3D clay icon of a thing, cut out, a different one for each feature); never a person (a still photo of someone reads as pasted in: people come only from the clips the user gives); the prompt describes it for an image model, with no words in it; cutout: true for a single object to stand on the scene as a PNG, false for a full picture. Leave it out where shapes and type carry the beat.',
].join('\n');
const BLENDER_PLAN = '- blender (optional, as many beats as lift the video; in place of three or clip in that beat): {"idea": "...", "alpha": true|false, "search": "..."}: a shot rendered in Blender on the user\'s own computer, which does photoreal and cinematic 3D that Three.js cannot: a product turntable or a model spinning on a transparent background, glass, metal and clay renders, a product on a set, a camera fly-through of a room or a world, long animations, 3D motion graphics, anything Blender does. "idea" briefs it as a 3D artist would (what is in it, the set or none, the materials, the light, how it moves in phases, the camera), new for this video. "alpha": true for a subject that stands over the beat\'s scene (its designed scene is then the whole background behind it); false for a full shot of its own (the beat\'s scene is then only light labels at the edges). "search" (optional): an exact everyday object in one to three English words when a real model of it helps ("sneaker", "coffee cup", "chair"). It costs time on the user\'s computer (a minute or many, by how rich it is), so use it where it makes the video better, not for every beat; its words are the scene\'s, never in the render.';
const MATERIAL_PROMPT = [
    'Pictures from the user\'s files are shown after this, each by name. Take the look\'s palette and type feel from them (their brand colours), not from your own taste; for "product pastel" the brand colours are the accents and the background is still the vivid gradient or white.',
    'The user attached these to be seen in the video: each real photo of theirs goes on the beat it belongs to (several on one beat is fine) unless the brief says otherwise. A drawn, searched or generated stand-in for something they gave a real picture of is a video made twice.',
    'Give a beat "assets": ["name", ...] where a picture belongs. A real photo, product, person, place or logo is placed itself, with motion. A screenshot of an app, website or dashboard, or a document page, is a reference: say in `show` that the designer rebuilds that screen as a faithful live copy (same layout, words, prices, colours) that animates piece by piece; it is never pasted in.',
    'Add "cutout": ["name", ...] at the top level for pictures whose subject stands on its own (a product, a person, a logo, an object on a plain background) and looks better cut out as a PNG; never a full scene, a landscape, a screenshot or a page.',
].join('\n');
const FOOTAGE_PROMPT = [
    'Video clips of the user\'s are shown after this too: each by name with its length, frames at their times and what is said in it (SRT). This is real footage: build the video from it.',
    'Give a beat "footage": {"name": "...", "from": s, "to": s, "audio": "speech"|"under"|"off"}, the stretch of that clip shown full frame in that beat. You are the editor: take its strongest moments and leave out whatever is weak (dead air, repeats, fumbles, shaky or dull parts) simply by not choosing it. Each stretch is a different part of its clip: never use the same seconds twice, so nothing is seen or said twice.',
    'focus (optional) frames the stretch the way an editor would: {"x": 0..1, "y": 0..1, "zoom": 1..3}, where the action is in the clip\'s own picture (fractions of its width and height, from the frames you saw) and how close to go; the clip always fills the frame, so 1 shows as much as fits. A screen recording or a wide shot in a tall video needs it: centre the subject (a character, a person, the product) and zoom in past the program\'s bars and empty sides (1.4–2.2).',
    'behind (optional, true): the person in the stretch is cut out of their own background, as on a green screen, and stands in front of a designed scene with the motion graphics moving behind them: for someone speaking to camera in a promo, an explainer or a creator clip, or whenever the brief asks for graphics behind the speaker. Its "show" then briefs that full background (the world, the light, big type and graphics around and above them), and nothing goes over their face.',
    'transform (optional, only with behind: true, in at most 2 beats): {"from": "...", "to": "...", "motion": "..."} the background behind the speaker changes through the beat instead of a designed scene: a real-looking place drawn as it ends and as it starts, and an AI video of the change between them. Only when the brief or a reference asks for something being built or transformed behind the speaker (a tower rising from bare ground, an empty room furnished, a before and after). "to" is the place at the end and "from" the same place at the start, each written for an image model (the place, the light, the camera; no people, no text); "motion" is how it changes (a construction timelapse, the tower rising floor by floor). Never invent facts: only what the brief says is built or changed.',
    'speed (optional, default 1) is how fast the stretch plays: 0.4–0.8 for slow motion that lets a moment breathe (a pour, a splash, a reveal, a smile), 1.5–3 to speed through a process, a walk, a crowd or a timelapse; a stretch where someone speaks always plays at 1.',
    'audio is your call for each stretch: "speech" keeps what is said in it (a person talking to camera, an interview, a line worth hearing): then "say" is "" and no voice-over is added, and the stretch ends where a sentence ends; "under" keeps the clip\'s own sound quietly under the voice-over (the place, a sizzle, a pour, a crowd); "off" mutes it for the voice-over (wind, noise, silence, or speech that does not serve this video). A clip marked "no sound" is always "off". For "under" and "off" the voice-over says "say" and the stretch is long enough for it.',
    'A clip that is plainly a finished example of a style rather than material for this video (a polished ad or edit of another brand or subject, with its own titles and cuts) is not cut in: follow its pacing and look instead.',
    'The "show" of a footage beat is the brief for motion graphics laid OVER the footage, never a background that hides it: a short kinetic title, a label, a number, a lower third, kept small (in the top or bottom band) and off the subject and faces. When the user gives footage every beat shows it, cut on the beat like a human editor (now and then a quick punch-in); a beat on a plain background is only a short cover or end card the brief asks for.',
].join('\n');
const REFERENCE_PROMPT = 'A video the user gave as the style they want is shown after this: frames across it and where it cuts. Make this video feel like it: its pacing, framing, type, colour treatment, transitions, caption feel and energy; take the look from it. Never reuse its content, words or footage.';
const MATERIAL_MAX = 30;
const MATERIAL_FILES = 12;
const CLIPS_MAX = 4;
const PLAN_SPEECH = 24_000;
const CLIP_FRAMES = 6;
const VIDEO_FILE = /\.(mp4|mov|m4v|webm|mkv)$/i;
async function probeVideo(userId, path) {
    const probed = await sandbox.exec(who(userId), { command: `ffprobe -v error -show_entries stream=codec_type,width,height:format=duration -of csv=p=0 "${path}"`, timeoutMs: 60_000 }).catch(() => null);
    const lines = probed?.stdout.split('\n').map((line) => line.trim()) ?? [];
    const seconds = Number(lines.find((line) => /^[\d.]+$/.test(line)));
    const [, width = 0, height = 0] = (lines.find((line) => line.startsWith('video')) ?? '').split(',').map(Number);
    return lines.some((line) => line.startsWith('video')) && seconds > 0 ? { seconds: round(seconds), hasAudio: lines.some((line) => line.startsWith('audio')), width, height } : null;
}
async function shotsOf(userId, path, times, width) {
    const tag = Math.random().toString(36).slice(2, 7);
    await sandbox
        .exec(who(userId), { command: times.map((at, index) => `ffmpeg -y -v error -ss ${at} -i "${path}" -frames:v 1 -vf "scale='min(${width},iw)':-2" -q:v 5 /tmp/ft-${tag}-${index}.jpg`).join('; '), timeoutMs: 120_000 })
        .catch(() => null);
    const shots = await Promise.all(times.map(async (at, index) => {
        const bytes = await sandbox.readFile(who(userId), `/tmp/ft-${tag}-${index}.jpg`, 2_000_000).catch(() => null);
        return bytes ? { at, preview: `data:image/jpeg;base64,${bytes.toString('base64')}` } : null;
    }));
    await sandbox.exec(who(userId), { command: `rm -f /tmp/ft-${tag}-*.jpg`, timeoutMs: 15_000 }).catch(() => undefined);
    return shots.filter((shot) => shot !== null);
}
const spread = (seconds, count) => Array.from({ length: count }, (_, index) => round(((index + 0.5) * seconds) / count));
const RVM_MODEL = 'https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx';
const MATTE = `import os, subprocess, sys
import cv2, numpy as np, onnxruntime as ort

src, out, model = sys.argv[1], sys.argv[2], sys.argv[3]
w, h, rate = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", src], capture_output=True, text=True).stdout.strip().split(",")[:3]
w, h = int(w), int(h)
scale = min(1.0, 960 / max(w, h))
sw, sh = max(2, int(w * scale) // 2 * 2), max(2, int(h * scale) // 2 * 2)
reader = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
writer = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-r", rate, "-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-auto-alt-ref", "0", "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "8", out], stdin=subprocess.PIPE)
options = ort.SessionOptions()
options.intra_op_num_threads = os.cpu_count() or 4
session = ort.InferenceSession(model, options, providers=["CPUExecutionProvider"])
state = [np.zeros([1, 1, 1, 1], dtype=np.float32)] * 4
ratio = np.array([0.25], dtype=np.float32)
size = w * h * 3
# The speaker a little smaller than the frame, standing on its bottom edge: the scene behind shows round them.
pw, ph = int(w * 0.82) // 2 * 2, int(h * 0.82) // 2 * 2
canvas = np.zeros((h, w, 4), np.uint8)
while True:
    raw = reader.stdout.read(size)
    if len(raw) < size:
        break
    frame = np.frombuffer(raw, np.uint8).reshape(h, w, 3)
    small = cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA)
    x = (small.astype(np.float32) / 255).transpose(2, 0, 1)[None]
    _, pha, *state = session.run(None, {"src": x, "r1i": state[0], "r2i": state[1], "r3i": state[2], "r4i": state[3], "downsample_ratio": ratio})
    alpha = cv2.resize((pha[0, 0] * 255).clip(0, 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_LINEAR)
    cut = cv2.resize(np.dstack([frame, alpha]), (pw, ph), interpolation=cv2.INTER_AREA)
    canvas[:] = 0
    canvas[h - ph:, (w - pw) // 2:(w - pw) // 2 + pw] = cut
    writer.stdin.write(canvas.tobytes())
writer.stdin.close()
sys.exit(writer.wait() or reader.wait())
`;
async function matteOf(userId, dir, name, from, seconds) {
    const tag = Math.random().toString(36).slice(2, 7);
    const out = `matte-${tag}.webm`;
    const job = `/tmp/matte-${tag}`;
    await sandbox.writeFiles(who(userId), '/tmp', [{ path: `matte-${tag}.py`, bytes: Buffer.from(MATTE) }]);
    const steps = [
        `cd "${dir}/assets"`,
        `(python3 -c 'import onnxruntime, cv2' 2>/dev/null || pip3 install -q --user --no-warn-script-location onnxruntime opencv-python-headless numpy)`,
        `{ M=/opt/rvm/rvm.onnx; [ -s $M ] || { M=~/.cache/rvm/rvm.onnx; mkdir -p ~/.cache/rvm; [ -s $M ] || curl -fsSL --max-time 120 -o $M ${RVM_MODEL}; }; }`,
        `ffmpeg -y -v error -ss ${from} -t ${seconds} -i "${name}" -an -c:v libx264 -preset veryfast -crf 16 ${job}.mp4`,
        `python3 ${job}.py ${job}.mp4 "${out}" $M`,
    ].join(' && ');
    await sandbox.exec(who(userId), { command: `nohup bash -c '${steps.replace(/'/g, "'\\''")}; echo $? > ${job}.exit' > ${job}.log 2>&1 &`, timeoutMs: 30_000 });
    for (const started = Date.now(); Date.now() - started < 45 * 60_000;) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const state = await sandbox.exec(who(userId), { command: `cat ${job}.exit 2>/dev/null`, timeoutMs: 15_000 }).catch(() => null);
        const code = state?.stdout.trim();
        if (code) {
            await sandbox.exec(who(userId), { command: `rm -f ${job}.*`, timeoutMs: 15_000 }).catch(() => undefined);
            return code === '0' ? out : null;
        }
    }
    return null;
}
const BACKDROP = 'A photo-real background plate for a video, the place alone: no people, no text, no logo, the camera at eye height and locked off.';
const TRANSFORM_MOST_SECONDS = 25;
export async function transformOf(userId, role, projectId, footage, from, seconds, pictures, size, signal) {
    const change = footage.transform;
    if (!change || seconds > TRANSFORM_MOST_SECONDS)
        return null;
    const shot = `tf-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const assets = `${dirOf(projectId)}/assets`;
    const framed = await sandbox.exec(who(userId), { command: `cd "${assets}" && ffmpeg -y -v error -ss ${from} -i "${footage.name}" -frames:v 1 -q:v 3 "${shot}"`, timeoutMs: 60_000 }).then((done) => done.exitCode === 0, () => false);
    const end = await drawnImage(userId, role, userId, projectId, `${BACKDROP} The place as it is at the end: ${change.to}${framed ? ' Keep the framing and camera height of the first reference picture, with every person left out of it.' : ''}`, [...(framed ? [shot] : []), ...pictures].slice(0, 4), { size });
    if (framed)
        await sandbox.exec(who(userId), { command: `rm -f "${assets}/${shot}"`, timeoutMs: 15_000 }).catch(() => undefined);
    if (!end)
        return null;
    const start = await drawnImage(userId, role, userId, projectId, `${BACKDROP} The same place as the reference picture, the same camera, framing and light, earlier, before the change: ${change.from}`, [end.name], { size });
    if (!start || signal?.aborted)
        return null;
    const length = Math.min(10, Math.max(3, Math.ceil(seconds)));
    const { jobId } = await startAiVideo(userId, role, projectId, { prompt: `${change.motion}. The background only, no people.`, seconds: length, camera: 'static', image: start.name, endImage: end.name });
    return aiClipDone(userId, role, projectId, jobId, length, signal);
}
async function aiClipDone(userId, role, projectId, jobId, planned, signal) {
    for (const started = Date.now(); Date.now() - started < 15 * 60_000 && !signal?.aborted;) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await aiVideoStatus(userId, role, projectId, jobId);
        if (status.state === 'done')
            return { name: status.asset.name, duration: status.asset.duration || planned };
        if (status.state === 'failed')
            return null;
    }
    return null;
}
const CLIP_MOST_SECONDS = 20;
const clipRate = (duration, length) => round(Math.max(0.5, Math.min(1, duration / length)));
export function movingClips(userId, role, projectId, beats, lengths, size, signal) {
    const moving = [];
    beats.forEach((beat, index) => {
        const clip = beat.three ? undefined : beat.clip;
        const prior = beats[index - 1];
        const make = async () => {
            if (!clip)
                return null;
            const before = !clip.from && prior && !prior.three && prior.clip?.picture === clip.picture ? await moving[index - 1] : null;
            const length = lengths[index - 1] ?? 3;
            const made = await clipOf(userId, role, projectId, clip, lengths[index] ?? 3, size, signal, before ? { clip: before.name, at: round(Math.max(0, Math.min(before.duration - 0.1, length * clipRate(before.duration, length)))) } : undefined);
            if (made?.chained)
                beat.transition = 'cut';
            return made;
        };
        moving.push(make().catch(() => null));
    });
    return moving;
}
async function clipOf(userId, role, projectId, clip, seconds, size, signal, after) {
    if (seconds > CLIP_MOST_SECONDS)
        return null;
    const length = Math.min(10, Math.max(3, Math.ceil(seconds)));
    if (clip.from) {
        const start = await drawnImage(userId, role, userId, projectId, `${BACKDROP} The same place as the reference picture, the same camera, framing and light, earlier: ${clip.from}`, [clip.picture], { size });
        if (!start || signal?.aborted)
            return null;
        const { jobId } = await startAiVideo(userId, role, projectId, { prompt: `${clip.motion}. A timelapse that ends exactly on the last frame.`, seconds: length, camera: 'static', image: start.name, endImage: clip.picture });
        return aiClipDone(userId, role, projectId, jobId, length, signal);
    }
    const shot = { prompt: `${clip.motion}. Keep the place, things and people of the picture exactly as they are: only the camera and the light move.`, seconds: length, camera: 'push-in' };
    const chained = after ? await startAiVideo(userId, role, projectId, { ...shot, after }).catch(() => null) : null;
    const { jobId } = chained ?? (await startAiVideo(userId, role, projectId, { ...shot, image: clip.picture }));
    const made = await aiClipDone(userId, role, projectId, jobId, length, signal);
    return made && chained ? { ...made, chained: true } : made;
}
async function fetchLink(userId, dir, url, prefix, kind = 'video') {
    if (!/^https?:\/\/[^\s'"`$\\]+$/i.test(url))
        return null;
    const base = `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
    const out = `${base}.${kind === 'audio' ? 'mp3' : 'mp4'}`;
    const stream = kind === 'audio' ? 'audio' : 'video';
    try {await stagePublic(url,dir,out)} catch {return null}
    const done=await sandbox.exec(who(userId),{command:`cd "${dir}" && ffprobe -v error -select_streams ${stream[0]}:0 -show_entries stream=codec_type -of csv=p=0 "${out}" | grep -q ${stream} || { rm -f "${out}"; exit 1; }`,timeoutMs:15000});
    return done?.exitCode === 0 ? out : null;
}
async function musicFor(userId, projectId, chosen, words, seconds) {
    if (chosen) {
        if (/^https?:\/\//i.test(chosen)) {
            const name = await fetchLink(userId, '/tmp', chosen, 'song', 'audio');
            if (name)
                return { path: `/tmp/${name}`, temp: true };
        }
        else {
            const asset = await addAsset(userId, projectId, chosen).catch(() => null);
            if (asset && asset.kind !== 'image')
                return { path: `${dirOf(projectId)}/assets/${asset.name}`, temp: false };
        }
    }
    const found = await findMusic(words, Math.min(60, seconds), 12);
    for (let at = 0; at < Math.min(3, found.length); at++) {
        const track = found[(hashOf(projectId) + at) % Math.min(8, found.length)];
        if (!track)
            continue;
        const path = `/tmp/music-${Math.random().toString(36).slice(2, 7)}.mp3`;
        const got = await stagePublic(track.url,'/tmp',path.split('/').pop()).then(()=>sandbox.exec(who(userId),{command:`ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${path}" | grep -q audio`,timeoutMs:15000})).catch(()=>null);
        if (got?.exitCode === 0)
            return { path, temp: true, credit: `"${track.title}" by ${track.creator}, ${track.license}, ${track.page}` };
    }
    const bundled = await sandbox.exec(who(userId), { command: `ls ${MUSIC}/*.mp3 2>/dev/null | sort`, timeoutMs: 15_000 }).catch(() => null);
    const tracks = bundled?.stdout.split('\n').map((line) => line.trim()).filter(Boolean) ?? [];
    const track = tracks[hashOf(projectId) % (tracks.length || 1)];
    return track ? { path: track, temp: false } : null;
}
const BEAT_PAGE = '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="600" data-width="1080" data-height="1920"><audio id="music" src="music.mp3" data-start="0" data-duration="600" data-track-index="1" data-volume="1"></audio></div></body></html>';
async function beatsOf(userId, path) {
    const work = `/tmp/beats-${Math.random().toString(36).slice(2, 7)}`;
    const found = await sandbox
        .exec(who(userId), {
        command: `mkdir -p ${work} && cd ${work} && printf '%s' '${BEAT_PAGE}' > index.html && cp "${path}" music.mp3 && HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 timeout 120 ${HF} beats . --json >/dev/null 2>&1; cat beats/music.mp3.json 2>/dev/null; cd / && rm -rf ${work}`,
        timeoutMs: 150_000,
    })
        .catch(() => null);
    try {
        const parsed = JSON.parse(found?.stdout ?? '');
        return (parsed.beats ?? []).filter((beat) => beat.strength >= 0.3).map((beat) => beat.time);
    }
    catch {
        return [];
    }
}
export function onBeats(lengths, times, least) {
    const out = [...lengths];
    let at = 0;
    for (let index = 0; index < out.length; index++) {
        const length = out[index] ?? 0;
        const floor = least[index] ?? null;
        const target = at + length;
        const longerOnly = floor === null || index === out.length - 1;
        const near = times
            .filter((time) => (longerOnly ? time >= target - 0.001 && time - target <= 0.4 : Math.abs(time - target) <= 0.4 && time - at >= Math.max(1.5, floor ?? 0)))
            .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
        if (near !== undefined)
            out[index] = round(near - at);
        at += out[index] ?? 0;
    }
    return out;
}
async function clipsOf(userId, role, projectId, names) {
    const clips = [];
    for (const name of names.slice(0, CLIPS_MAX)) {
        const source = `${dirOf(projectId)}/assets/${name}`;
        const video = await probeVideo(userId, source);
        if (!video)
            continue;
        const frames = await shotsOf(userId, source, spread(video.seconds, Math.max(1, Math.min(CLIP_FRAMES, Math.ceil(video.seconds / 5)))), 512);
        const transcript = video.hasAudio && !/ai-video-/.test(name) ? await transcribeAsset(userId, role, projectId, name, 'auto').then((made) => made.srt, () => '') : '';
        clips.push({ name, ...video, frames, transcript });
    }
    return clips;
}
async function referenceOf(userId, source) {
    let path = null;
    if (/^https?:\/\//i.test(source)) {
        const name = await fetchLink(userId, '/tmp', source, 'reference', 'reference');
        path = name ? `/tmp/${name}` : null;
    }
    else {
        const file = await downloadAttachment(userId, source).catch(() => null);
        if (file) {
            const name = `reference-${Math.random().toString(36).slice(2, 7)}${/\.\w+$/.exec(file.name)?.[0] ?? '.mp4'}`;
            await sandbox.writeFiles(who(userId), '/tmp', [{ path: name, bytes: file.bytes }]);
            path = `/tmp/${name}`;
        }
    }
    if (!path)
        return null;
    try {
        const video = await probeVideo(userId, path);
        if (!video)
            return null;
        const scenes = await sandbox
            .exec(who(userId), { command: `ffmpeg -v info -i "${path}" -vf "select='gt(scene,0.3)',showinfo" -an -f null - 2>&1 | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 | head -80`, timeoutMs: 180_000 })
            .catch(() => null);
        const cuts = (scenes?.stdout.split('\n') ?? []).map(Number).filter((at) => at > 0).map(round);
        return { seconds: video.seconds, cuts, frames: await shotsOf(userId, path, spread(video.seconds, 8), 384) };
    }
    finally {
        await sandbox.exec(who(userId), { command: `rm -f "${path}"`, timeoutMs: 15_000 }).catch(() => undefined);
    }
}
export function linksIn(said) {
    const links = [];
    let reference;
    for (const match of said.matchAll(/https?:\/\/[^\s<>"']+/g)) {
        const url = match[0].replace(/[).,!?;:\]]+$/, '');
        const before = said.slice(Math.max(0, (match.index ?? 0) - 40), match.index);
        if (!reference && /สไตล์|แบบนี้|แนวนี้|ประมาณนี้|อ้างอิง|เป็นตัวอย่าง|reference|style|like this|vibe/i.test(before))
            reference = url;
        else if (!links.includes(url))
            links.push(url);
    }
    return { links: links.slice(0, 4), ...(reference ? { reference } : {}) };
}
async function silencesOf(userId, path) {
    const found = await sandbox
        .exec(who(userId), { command: `ffmpeg -v info -i "${path}" -vn -af silencedetect=noise=-32dB:d=0.12 -f null - 2>&1 | grep -oE 'silence_(start|end): [0-9.]+'`, timeoutMs: 120_000 })
        .catch(() => null);
    const quiet = [];
    for (const line of found?.stdout.split('\n') ?? []) {
        const [kind, value] = line.split(': ');
        if (kind === 'silence_start')
            quiet.push({ start: Number(value), end: Number.POSITIVE_INFINITY });
        else if (kind === 'silence_end' && quiet.length > 0)
            quiet.at(-1).end = Number(value);
    }
    return quiet;
}
export function cleanCut(stretch, cues, quiet, length) {
    const inside = cues.filter((cue) => cue.end > stretch.from + 0.05 && cue.start < stretch.to - 0.05);
    let from = inside[0]?.start ?? stretch.from;
    let to = inside.at(-1)?.end ?? stretch.to;
    const before = quiet.filter((gap) => gap.end >= from - 0.6 && gap.end <= from + 0.3).sort((a, b) => Math.abs(a.end - from) - Math.abs(b.end - from))[0];
    from = before ? Math.max(before.start, before.end - 0.12) : from - 0.1;
    const after = quiet.filter((gap) => gap.start >= to - 0.3 && gap.start <= to + 0.6).sort((a, b) => Math.abs(a.start - to) - Math.abs(b.start - to))[0];
    to = after ? Math.min(after.end, after.start + 0.25) : to + 0.2;
    return { from: round(Math.max(0, from)), to: round(Math.min(length, Math.max(to, from + 0.5))) };
}
export function unused(stretch, used, cues) {
    let { from, to } = stretch;
    for (const taken of [...used].sort((a, b) => a.from - b.from)) {
        if (!(from < taken.to - 0.3 && to > taken.from + 0.3))
            continue;
        if (from < taken.from)
            to = Math.min(to, [...cues].reverse().find((cue) => cue.end <= taken.from + 0.05)?.end ?? taken.from);
        else
            from = Math.max(taken.to, (cues.find((cue) => cue.start >= taken.to - 0.05)?.start ?? taken.to) - 0.1);
    }
    return to - from >= 1.5 ? { from: round(from), to: round(to) } : null;
}
const EVEN_LOUDNESS = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const TRANSITION = /^(cut|crossfade|blur-crossfade|zoom-through|squeeze|push-slide( (LEFT|RIGHT|UP|DOWN))?)$/;
export function transitionTweens(name, out, into, at, frame) {
    const [kind, way = 'LEFT'] = name.split(' ');
    const t = round(at);
    const o = JSON.stringify(out);
    const n = JSON.stringify(into);
    switch (kind) {
        case 'crossfade':
            return { seconds: 0.5, tweens: [`tl.to(${o},{opacity:0,duration:0.5,ease:"power2.inOut"},${t});`, `tl.fromTo(${n},{opacity:0},{opacity:1,duration:0.5,ease:"power2.inOut",immediateRender:false},${t});`] };
        case 'blur-crossfade':
            return {
                seconds: 0.6,
                tweens: [`tl.to(${o},{filter:"blur(10px)",scale:1.03,opacity:0,duration:0.6,ease:"power2.inOut"},${t});`, `tl.fromTo(${n},{filter:"blur(10px)",scale:0.97,opacity:0},{filter:"blur(0px)",scale:1,opacity:1,duration:0.6,ease:"power2.inOut",immediateRender:false},${t});`],
            };
        case 'zoom-through':
            return {
                seconds: 0.4,
                tweens: [`tl.to(${o},{scale:2.5,opacity:0,filter:"blur(8px)",duration:0.4,ease:"power3.in"},${t});`, `tl.fromTo(${n},{scale:0.5,opacity:0,filter:"blur(8px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:0.4,ease:"power3.out",immediateRender:false},${t});`],
            };
        case 'squeeze':
            return {
                seconds: 0.4,
                tweens: [`tl.to(${o},{scaleX:0,transformOrigin:"left center",duration:0.4,ease:"power3.inOut"},${t});`, `tl.fromTo(${n},{scaleX:0,transformOrigin:"right center",opacity:1},{scaleX:1,transformOrigin:"right center",duration:0.4,ease:"power3.inOut",immediateRender:false},${t});`],
            };
        case 'push-slide': {
            const axis = way === 'UP' || way === 'DOWN' ? 'y' : 'x';
            const travel = (axis === 'x' ? frame.width : frame.height) * (way === 'RIGHT' || way === 'DOWN' ? 1 : -1);
            return {
                seconds: 0.5,
                tweens: [`tl.to(${o},{${axis}:${travel},duration:0.5,ease:"power3.inOut"},${t});`, `tl.fromTo(${n},{${axis}:${-travel},opacity:1},{${axis}:0,duration:0.5,ease:"power3.inOut",immediateRender:false},${t});`],
            };
        }
        default:
            return null;
    }
}
export function lightSweep(key, at, accent) {
    const start = round(Math.max(0, at - 0.25));
    return {
        clip: `<div id="sweep-${key}" class="clip" data-start="${start}" data-duration="0.5" data-track-index="15" style="position:absolute;inset:-20% -60%;pointer-events:none;background:linear-gradient(105deg,transparent 40%,${accent}cc 47%,#ffffffee 50%,${accent}cc 53%,transparent 60%);filter:blur(10px);mix-blend-mode:screen"></div>`,
        tween: `tl.fromTo("#sweep-${key}",{xPercent:-130},{xPercent:130,duration:0.5,ease:"power2.inOut"},${start});`,
    };
}
export function cuesOf(srt) {
    const time = (stamp) => {
        const [h = 0, m = 0, s = 0] = stamp.replace(',', '.').split(':').map(Number);
        return h * 3600 + m * 60 + s;
    };
    return [...srt.matchAll(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g)].map((match) => ({
        start: time(match[1] ?? '0:0:0'),
        end: time(match[2] ?? '0:0:0'),
        text: (match[3] ?? '').replace(/\s+/g, ' ').trim(),
    })).filter((cue) => cue.text && cue.end > cue.start);
}
async function material(userId, projectId, files) {
    const found = [];
    const words = [];
    const skipped = [];
    const share = Math.max(1_500, Math.floor(20_000 / Math.max(1, Math.min(files.length, MATERIAL_FILES))));
    for (const id of files.slice(0, MATERIAL_FILES)) {
        const file = await downloadAttachment(userId, id).catch(() => null);
        if (!file)
            continue;
        const isPdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name);
        let read = false;
        if (isPdf) {
            const page = await renderPdfPage(file.bytes, 1).catch(() => null);
            if (page)
                found.push({ bytes: page, area: Number.MAX_SAFE_INTEGER, page: true, from: file.name });
            const text = await extractPdfText(file.bytes).catch(() => null);
            if (text?.text) {
                words.push(`${file.name}:\n${text.text.slice(0, share)}`);
                read = true;
            }
        }
        if (!isPdf) {
            const text = await plainTextOf(file).catch(() => '');
            if (text.trim()) {
                words.push(`${file.name}:\n${text.slice(0, share)}`);
                read = true;
            }
        }
        const pictures = await extractFilePictures(file).catch(() => []);
        for (const picture of pictures)
            if (Math.min(picture.width, picture.height) >= 160)
                found.push({ bytes: picture.bytes, area: picture.width * picture.height, from: file.name });
        if (pictures.length > 0)
            read = true;
        if (!read)
            skipped.push(file.name);
    }
    const kept = await Promise.all((() => {
        const share = Math.max(3, Math.floor(MATERIAL_MAX / Math.max(1, files.length)));
        const taken = new Map();
        const fair = [...found].sort((a, b) => b.area - a.area).filter((picture) => {
            const count = taken.get(picture.from) ?? 0;
            taken.set(picture.from, count + 1);
            return count < share;
        });
        return fair;
    })()
        .slice(0, MATERIAL_MAX)
        .map(async (picture) => {
        const image = sharp(picture.bytes).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
        const alpha = (await sharp(picture.bytes).metadata()).hasAlpha;
        const name = `${picture.page ? 'page' : 'file'}-${createHash('sha1').update(picture.bytes).digest('hex').slice(0, 10)}.${alpha ? 'png' : 'jpg'}`;
        const bytes = await (alpha ? image.png() : image.jpeg({ quality: 86 })).toBuffer();
        const preview = (await sharp(picture.bytes).resize({ width: 512, height: 512, fit: 'inside' }).flatten({ background: '#ffffff' }).jpeg({ quality: 70 }).toBuffer()).toString('base64');
        return { name, bytes, preview: `data:image/jpeg;base64,${preview}`, from: picture.from };
    })
        .map((made) => made.catch(() => null)));
    const kept_files = kept.filter((entry) => entry !== null);
    if (kept_files.length > 0)
        await sandbox.writeFiles(who(userId), `${dirOf(projectId)}/assets`, kept_files.map((entry) => ({ path: entry.name, bytes: entry.bytes })));
    return { pictures: kept_files.map((entry) => ({ name: entry.name, preview: entry.preview, from: entry.from })), words: words.join('\n\n').slice(0, 20_000), skipped };
}
async function cutouts(userId, projectId, names) {
    const pairs=await Promise.all(names.slice(0,4).map(async name=>{
        const image=await drawnImage(userId,'user',userId,projectId,'Isolate the exact subject from the supplied image. Preserve identity, existing markings, proportions and material.',[name],{cutout:true});
        return image?[name,image.name]:null;
    }));
    return new Map(pairs.filter(Boolean));
}
async function styleOf(userId, seconds, clips) {
    const house = continuousMotion() ? 'explainer-engaging' : clips.some((clip) => clip.transcript.trim()) ? 'motion-broll' : seconds > 25 ? 'explainer-default' : 'explainer-high-energy';
    const [mine, animation, launch, brag, apple, lemo, oneTake] = await Promise.all([house, 'hyperframes-animation', 'product-launch-video', 'brag', 'apple-design', 'lemo-styles', ...(continuousMotion() ? ['onetake'] : [])].map((name) => findEnabled(userId, name).catch(() => null)));
    const file = async (skill, path) => (skill ? ((await readSkillFile(userId, skill.id, path).catch(() => null))?.content.toString('utf8') ?? '') : '');
    const [index, language, catalog] = await Promise.all([file(animation, 'rules-index.md'), file(launch, 'references/motion-language.md'), listBlocks(userId).catch(() => [])]);
    const md = (skill) => (skill ? skillMdOf(skill).replace(/```[\s\S]*?```/g, (block) => (block.split('\n').length > 25 ? '' : block)).replace(/^## Initial Response[\s\S]*?(?=^## )/m, '') : '');
    const sections = (text, titles) => text.split(/^(?=## )/m).filter((section) => titles.test(section.split('\n')[0] ?? '')).join('');
    if (continuousMotion() && oneTake) logger.info('ใช้แนวทางกล้องจากสกิล OneTake ที่ติดตั้งบนเครื่อง');
    const style = md(mine);
    const laws = sections(md(brag), /tone|creative laws|narration/i);
    const craft = sections(md(apple), /core idea|spring|spatial|smooth|material|typograph|foundation/i);
    const moves = [...new Map([...index.matchAll(/<([\w-]+) path="rules\/[\w-]+\.md">([^<]*)</g)].map((match) => [match[1], (match[2] ?? '').replace(/\s*Tags:[\s\S]*$/, '').slice(0, 220)])).entries()];
    const known = new Set(moves.map(([id]) => id));
    const contract = /## The contract[\s\S]*?(?=\n## )/.exec(index)?.[0] ?? '';
    const doctrine = /# Part 2[\s\S]*?(?=\n## Naming motion)/.exec(language)?.[0] ?? '';
    const part = (name, text, room) => (text ? `--- ${name} ---\n${text.slice(0, room)}` : '');
    const framed = (parts) => {
        const kept = parts.filter(Boolean);
        return kept.length === 0 ? '' : `The house style: follow these for the design (structure, pacing, transitions, typography, motion, sound). Where one builds or renders its own way (an HTML page with seek(t), render.mjs, Playwright, CLI steps, synthesised audio, capturing a website, asking the user first), keep building as you are told here instead.\n\n${kept.join('\n\n')}`;
    };
    const blocks = catalog.filter((block) => block.type === 'block');
    const shelf = blocks.length > 0 ? `Registry blocks a beat can start from in "block" (name: what it is):\n${blocks.map((block) => `- ${block.name}: ${block.description.slice(0, 160)}${block.width ? ` (${block.width}x${block.height})` : ''}`).join('\n')}` : '';
    const menu = moves.length > 0 ? `The motion recipes a beat can name in "moves" (id: what it does):\n${moves.map(([id, what]) => `- ${id}: ${what}`).join('\n')}` : '';
    return {
        plan: framed([part('Continuous camera direction', md(oneTake), 5500), part('Selected video style',chosenStyle(),6000),part(`skill "${house}"`, style, 8_000), part('skill "brag"', md(brag), 10_000), part('film styles', /^# Film styles[\s\S]*/m.exec(md(lemo))?.[0] ?? '', 14_000), part('motion recipes', menu, 12_000), part('registry blocks', shelf, 20_000)]),
        scene: framed([part('Continuous camera direction', md(oneTake), 5500), part('Selected video style',chosenStyle(),6000),part(`skill "${house}"`, style, 4_000), part('motion doctrine', doctrine, 7_000), part('skill "brag"', laws, 5_000), part('skill "apple-design"', craft, 11_500), part('motion recipe contract', contract, 2_500)]),
        three: framed([part(`skill "${house}"`, style, 3_000), part('motion doctrine', doctrine, 7_000), part('skill "apple-design"', craft, 11_500)]),
        film: async (slug) => {
            const text = slug ? await file(lemo, `styles/${slug}.md`) : '';
            return text ? `\n\n${part(`film style "${slug}"`, text, 12_000)}\n\nFollow this film style for the look, materials, light, type, motion and camera, in the video's palette. Its rules for its own demo films (a fictional product, never a real brand, name or logo; its sound and voice; its render pipeline) do not apply: the user's brand, words and facts are the subject, and the scene is built as the rules above say.` : '';
        },
        recipes: async (asked) => {
            const bodies = await Promise.all(asked.filter((id) => known.has(id)).slice(0, 3).map(async (id) => part(`motion recipe "${id}"`, await file(animation, `rules/${id}.md`), 9_000)));
            const kept = bodies.filter(Boolean);
            return kept.length === 0 ? '' : `\n\nThis scene moves by these recipes, named for it in the plan: build its motion from them, their mechanism on this scene's own content and look.\n\n${kept.join('\n\n')}`;
        },
    };
}
async function startingBlock(userId, dir, name) {
    const source = name ? await blockSource(userId, name).catch(() => '') : '';
    if (source) {
        const blocks = `${WORKSPACE}/.hf-blocks`;
        await sandbox
            .exec(who(userId), { command: `cd "${dir}" && mkdir -p lib models && cp -rn ${blocks}/compositions/lib/. ${blocks}/lib/. lib/ 2>/dev/null; cp -rn ${blocks}/models/. models/ 2>/dev/null; true`, timeoutMs: 30_000 })
            .catch(() => undefined);
    }
    return source
        ? `\n\nStart this scene from the registry block "${name}", made by a motion designer: keep its craft (its layers, depth, light, motion and effects) and make it this beat: its words and facts from this video, the project's pictures in place of the block's own (or none), the video's look and colours, this video's frame and this scene's seconds. Its composition id and timeline become this scene's; what it runs on stays as it is (its data-requires-webgpu, its lib/ scripts, its models/ files, its GSAP or three.js from cdn.jsdelivr.net). Its source:\n${source}`
        : '';
}
const planCheck = (seconds) => `Before you reply, check the plan against the rules: all the lines said aloud fit ${seconds} seconds with their breaths (about ${Math.round(seconds * 2)} words in all; Thai about ${seconds * 5} syllables); in a video of six beats or more a journey spanning 2 to 4 beats, 3D on the beats that are a world or an object, for a brand film its order and its two-to-four-word tag lines with a full stop, a block for the opening and one key beat where one fits, moves on every beat, the ground changing from beat to beat, every fact copied from the files.`;
async function modelFits(userId, role, input, thumbnail, name, want, look, kind = 'the 3D model') {
    const response = await fetch(thumbnail, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const picture = response?.ok ? await response.arrayBuffer() : null;
    if (!picture)
        return false;
    const type = /^image\/(png|jpeg|webp|gif)/.exec(response?.headers.get('content-type') ?? '')?.[0] ?? 'image/png';
    const model = await videoModel({ alias: SCENE_DESIGNER ?? input.model ?? agentConfig().videoModel, userId, role, maxTokens: 20 }, input.effort);
    const reply = textOf((await model.invoke([
        new HumanMessage({
            content: [
                { type: 'text', text: `A shot of a video wants: ${want}\nThe video's look: ${look}\nThis is ${kind} found for it, "${name}". Is it that very thing, and would it look right in this video? Reply yes or no.` },
                { type: 'image_url', image_url: { url: `data:${type};base64,${Buffer.from(picture).toString('base64')}` } },
            ],
        }),
    ])).content);
    return /^\s*yes/i.test(reply);
}
async function stockPhoto(userId, role, input, projectId, words, want, look, frame) {
    return (await commonsPhoto(userId, role, input, projectId, words, want, look, frame)) ?? openversePhoto(userId, role, input, projectId, words, want, look, frame.width >= frame.height);
}
async function commonsPhoto(userId, role, input, projectId, words, want, look, frame) {
    return webImage(userId,projectId,words);
}
async function openversePhoto(userId, role, input, projectId, words, want, look, wide) {
    const found = (await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(words)}&license_type=commercial,modification&aspect_ratio=${wide ? 'wide' : 'tall'}&size=large&page_size=20`, { signal: AbortSignal.timeout(15_000) })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null));
    const usable = (found?.results ?? []).filter((image) => ['cc0', 'by', 'by-sa', 'pdm'].includes(image.license ?? '') && Math.max(image.width ?? 0, image.height ?? 0) >= 1200 && /^https:\/\/[^\s'"`$\\]+$/.test(image.url ?? '') && image.thumbnail);
    for (const image of usable.slice(0, 4)) {
        if (!(await modelFits(userId, role, input, image.thumbnail, image.title ?? words, want, look, 'the photograph').catch(() => false)))
            continue;
        const name = `photo-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const dir=`${dirOf(projectId)}/assets`;
        const got=await stagePublic(image.url,dir,name).then(()=>sandbox.exec(who(userId),{command:`cd "${dir}" && ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${name}" | grep -q video`,timeoutMs:15000})).catch(()=>null);
        if (got?.exitCode === 0)
            return { name, credit: `"${image.title ?? 'Untitled'}" by ${image.creator ?? 'unknown'}, ${(image.license ?? '').toUpperCase()}${image.license_version ? ` ${image.license_version}` : ''}, ${image.foreign_landing_url ?? image.url}` };
    }
    return null;
}
async function plan(userId, role, input, frame, pictures, clips, reference, words, style, blender = false) {
    const fallback = input.model ?? agentConfig().videoModel;
    const text_ = `${style ? `${style}\n\n` : ''}Brief: ${input.brief}\nLength: ${input.seconds} seconds.\n${NO_VOICE.test(input.brief) ? 'No voice-over: every "say" is "", the music carries the video and its cuts fall on its beats; what each beat says is told on screen, in kinetic words and pictures.\n' : ''}Frame: ${frame}. The user chose this frame in the editor and it is final: plan every layout for it, whatever other shape (vertical, 9:16, square, wide…) the brief names.${input.said ? `\nThe user's own words: "${input.said}"\nThe voice-over and every word on screen are in the language of the user's own words (not the brief's), unless they ask for another.` : ''}${pictures.length > 0 ? `\n\n${MATERIAL_PROMPT}` : ''}${clips.length > 0 ? `\n\n${FOOTAGE_PROMPT}` : ''}${reference ? `\n\n${REFERENCE_PROMPT}` : ''}${words ? `\n\nThe words in the user's files: use their facts as written (names, prices, hours, addresses, offers), never others:\n${words}` : ''}\n\n${planCheck(input.seconds)}`;
    const shown = [
        ...pictures.flatMap((picture) => [{ type: 'text', text: `Picture ${picture.name}${picture.from ? ` (from the file "${picture.from}": the file's name is the name of the place it shows)` : ''}:` }, { type: 'image_url', image_url: { url: picture.preview } }]),
        ...clips.flatMap((clip) => [
            { type: 'text', text: `Clip ${clip.name}, ${clip.seconds} s, ${clip.width}x${clip.height}${clip.hasAudio ? '' : ', no sound'}. What is said in it:\n${clip.transcript.slice(0, PLAN_SPEECH) || '(nothing)'}` },
            ...clip.frames.flatMap((shot) => [{ type: 'text', text: `${clip.name} at ${shot.at} s:` }, { type: 'image_url', image_url: { url: shot.preview } }]),
        ]),
        ...(reference
            ? [
                {
                    type: 'text',
                    text: `The style reference: ${reference.seconds} s, ${reference.cuts.length > 0 ? `cutting at ${reference.cuts.join(', ')} s (about one shot every ${round(reference.seconds / (reference.cuts.length + 1))} s)` : 'one continuous shot'}.`,
                },
                ...reference.frames.flatMap((shot) => [{ type: 'text', text: `Reference at ${shot.at} s:` }, { type: 'image_url', image_url: { url: shot.preview } }]),
            ]
            : []),
    ];
    const messages = [new SystemMessage(blender ? `${PLAN_PROMPT}\n${BLENDER_PLAN}` : PLAN_PROMPT), new HumanMessage(shown.length > 0 ? { content: [{ type: 'text', text: text_ }, ...shown] } : text_)];
    const ask = async (alias) => textOf((await (await videoModel({ alias, userId, role, maxTokens: 64_000 }, input.effort, true)).invoke(messages)).content);
    const first = SCENE_DESIGNER ?? fallback;
    const made = async () => {
        const text = await ask(first).catch((error) => (first === fallback ? Promise.reject(error) : ask(fallback)));
        return planOf(text, new Set(pictures.map((picture) => picture.name)), new Map(clips.map((clip) => [clip.name, { seconds: clip.seconds, hasAudio: clip.hasAudio }])));
    };
    return made().catch((error) => (error instanceof AppError && error.key === 'af-video-make-plan' ? made() : Promise.reject(error)));
}
export function firstObject(text) {
    const start = text.indexOf('{');
    let depth = 0;
    let quote = false;
    for (let at = start; at >= 0 && at < text.length; at++) {
        const char = text[at];
        if (quote) {
            if (char === '\\')
                at++;
            else if (char === '"')
                quote = false;
        }
        else if (char === '"')
            quote = true;
        else if (char === '{')
            depth++;
        else if (char === '}' && --depth === 0)
            return text.slice(start, at + 1);
    }
    return start < 0 ? null : text.slice(start);
}
export function intoActs(beats) {
    for (let index = 0; beats.length >= 4 && index < beats.length;) {
        const head = beats[index];
        if (head.clip || head.blender)
            delete head.span;
        else if (!head.footage && !head.span) {
            let run = 0;
            while (run < 2 && index + run + 1 < beats.length && !beats[index + run + 1]?.footage && !beats[index + run + 1]?.three && !beats[index + run + 1]?.blender && !beats[index + run + 1]?.span && !beats[index + run + 1]?.clip)
                run++;
            if (run > 0)
                head.span = run;
        }
        const clipAt = head.span ? beats.slice(index + 1, index + 1 + head.span).findIndex((beat) => beat.clip) : -1;
        if (clipAt === 0)
            delete head.span;
        else if (clipAt > 0)
            head.span = clipAt;
        index += (head.span ?? 0) + 1;
    }
}
export function planOf(text, known, clips = new Map()) {
    const json = firstObject(text);
    const parsed = (() => {
        try {
            return json ? JSON.parse(json) : null;
        }
        catch (error) {
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-make-plan', message: `The plan was not valid JSON: ${error instanceof Error ? error.message : String(error)}` });
        }
    })();
    const beats = (parsed?.beats ?? []).filter((beat) => beat && typeof beat.say === 'string' && typeof beat.show === 'string').slice(0, 60);
    if (beats.length === 0)
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-make-plan', message: 'The plan came back empty.' });
    const names = (list) => (Array.isArray(list) ? list.filter((name) => typeof name === 'string' && known.has(name)) : []);
    let draws = 0;
    let photos = 0;
    let clipped = 0;
    let threes = 0;
    let transforms = 0;
    return {
        look: typeof parsed?.look === 'string' ? parsed.look : '',
        music: Array.isArray(parsed?.music) ? parsed.music.filter((word) => typeof word === 'string' && /^[a-z][a-z -]{1,19}$/i.test(word)).slice(0, 3) : [],
        cutout: names(parsed?.cutout),
        ...(typeof parsed?.film === 'string' && /^[a-z0-9-]{2,40}$/.test(parsed.film) ? { film: parsed.film } : {}),
        beats: beats.map((beat) => {
            const draw = beat.draw && typeof beat.draw.prompt === 'string' && draws++ < 6 ? { prompt: beat.draw.prompt, cutout: beat.draw.cutout === true } : undefined;
            const clip = beat.footage ? clips.get(beat.footage.name) : undefined;
            const from = Math.max(0, Number(beat.footage?.from) || 0);
            const to = clip ? Math.min(clip.seconds, Number(beat.footage?.to) || clip.seconds) : 0;
            const asked = beat.footage?.audio ?? (beat.footage?.sound === true ? 'speech' : 'off');
            const audio = !clip?.hasAudio ? 'off' : asked === 'speech' || asked === 'under' ? asked : 'off';
            const askedSpeed = Number(beat.footage?.speed);
            const speed = audio === 'speech' || !Number.isFinite(askedSpeed) || askedSpeed <= 0 ? 1 : round(Math.min(3, Math.max(0.4, askedSpeed)));
            const askedFocus = beat.footage?.focus;
            const fraction = (value) => Math.min(1, Math.max(0, Number(value)));
            const focus = askedFocus && Number.isFinite(Number(askedFocus.x)) && Number.isFinite(Number(askedFocus.y)) ? { x: round(fraction(askedFocus.x)), y: round(fraction(askedFocus.y)), zoom: round(Math.min(3, Math.max(1, Number(askedFocus.zoom) || 1))) } : undefined;
            const behind = beat.footage?.behind === true;
            const change = beat.footage?.transform;
            const words = (value) => (typeof value === 'string' ? value.trim().slice(0, 600) : '');
            const transform = clip && to - from >= 0.5 && behind && change && words(change.from) && words(change.to) && words(change.motion) && transforms++ < 2 ? { from: words(change.from), to: words(change.to), motion: words(change.motion) } : undefined;
            const footage = clip && to - from >= 0.5 ? { name: beat.footage?.name, from: round(from), to: round(to), audio, speed, ...(focus ? { focus } : {}), ...(behind ? { behind: true } : {}), ...(transform ? { transform } : {}) } : undefined;
            const spoken = footage?.audio === 'speech';
            const asked3d = beat.three;
            const kind3d = asked3d && ['model', 'pictures', 'screen', 'cards'].includes(String(asked3d.kind)) ? String(asked3d.kind) : undefined;
            const cards3d = Array.isArray(asked3d?.cards)
                ? asked3d.cards
                    .filter((card) => typeof card?.title === 'string' && card.title.trim())
                    .slice(0, 6)
                    .map((card) => ({ title: String(card.title).slice(0, 40), ...(typeof card.line === 'string' ? { line: card.line.slice(0, 90) } : {}), ...(typeof card.icon === 'string' && /^[A-Za-z][A-Za-z -]{1,40}$/.test(card.icon) ? { icon: card.icon } : {}) }))
                : [];
            const idea3d = typeof asked3d?.idea === 'string' ? String(asked3d.idea).slice(0, 900) : '';
            const three = (kind3d || idea3d) && !footage && threes++ < 5
                ? {
                    kind: kind3d ?? 'pictures',
                    ...(idea3d ? { idea: idea3d } : {}),
                    ...(typeof asked3d?.search === 'string' && /^[A-Za-z][A-Za-z -]{1,59}$/.test(asked3d.search) ? { search: asked3d.search } : {}),
                    pictures: names(asked3d?.pictures),
                    ...(kind3d === 'cards' ? { cards: cards3d, layout: asked3d?.layout === 'stack' ? 'stack' : 'flow' } : {}),
                    ...(['assemble', 'drop', 'spin', 'float'].includes(String(asked3d.motion)) ? { motion: String(asked3d.motion) } : {}),
                }
                : undefined;
            const askedBlender = beat.blender;
            const blenderIdea = typeof askedBlender?.idea === 'string' ? askedBlender.idea.trim() : '';
            return {
                say: spoken ? '' : beat.say,
                show: beat.show,
                ...(beat.pace === 'quick' || beat.pace === 'steady' || beat.pace === 'hold' ? { pace: beat.pace } : {}),
                ...(typeof beat.block === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(beat.block) ? { block: beat.block } : {}),
                ...(typeof beat.transition === 'string' && TRANSITION.test(beat.transition.trim()) ? { transition: beat.transition.trim() } : {}),
                ...(!footage && Number(beat.span ?? asked3d?.span) >= 1 ? { span: Math.min(4, Math.round(Number(beat.span ?? asked3d?.span))) } : {}),
                ...(Array.isArray(beat.moves) ? { moves: beat.moves.filter((id) => typeof id === 'string').slice(0, 3) } : {}),
                seconds: spoken ? round(to - from) : Math.max(2, Math.min(30, Number(beat.seconds) || 3)),
                assets: names(beat.assets),
                ...(draw ? { draw } : {}),
                ...((() => {
                    const asked = beat.clip;
                    return !beat.footage && asked && typeof asked.picture === 'string' && known.has(asked.picture) && typeof asked.motion === 'string' && asked.motion.trim() && clipped++ < 3 ? { clip: { picture: asked.picture, motion: asked.motion.trim().slice(0, 400), ...(typeof asked.from === 'string' && String(asked.from).trim() ? { from: String(asked.from).trim().slice(0, 600) } : {}) } } : {};
                })()),
                ...(typeof beat.photo === 'string' && /^[A-Za-z][A-Za-z ,'-]{2,60}$/.test(beat.photo) && photos++ < 4 ? { photo: beat.photo } : {}),
                ...(footage ? { footage } : {}),
                ...(!footage && blenderIdea ? { blender: { idea: blenderIdea, ...(typeof askedBlender?.alpha === 'boolean' ? { alpha: askedBlender.alpha } : {}), ...(typeof askedBlender?.search === 'string' && /^[A-Za-z][A-Za-z -]{1,59}$/.test(askedBlender.search) ? { search: askedBlender.search } : {}) } } : {}),
                ...(three && (three.idea || (three.kind === 'model' ? three.search : three.kind === 'cards' ? (three.cards ?? []).length >= 2 : (three.pictures ?? []).length > 0)) ? { three } : {}),
            };
        }),
    };
}
const round = (value) => Math.round(value * 100) / 100;
const MUSIC = '/home/user/skills/brag/assets/music';
const MUSIC_VOLUME = 0.14;
const CLIP_UNDER_VOICE = 0.3;
const NO_VOICE = /ไม่(ต้อง)?(ใส่|มี|เอา)?\s*(เสียง)?พากย์|ไม่ต้องมีเสียงพูด|เพลงอย่างเดียว|ไม่(ต้อง)?(ใส่|มี|เอา)?\s*เสียง(บรรยาย|พูด)|ไม่ต้องบรรยาย|no (voice[- ]?over|voice\b|narrat\w+)|without (a )?(voice[- ]?over|narrat\w+)|music only/i;
const NO_MUSIC = /ไม่(ต้อง)?(ใส่|มี|เอา)?\s*(เพลง|ดนตรี)|no (background )?(music|bgm|soundtrack)|without (background )?music/i;
const hashOf = (text) => [...text].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % 100_003, 7);
const CAPTION_LOOK = 'data-font-size="58" data-weight="800" data-shadow="30" data-stroke="5" data-stroke-color="#000000b3" data-trans-in="zoom" data-fade-in="0.1" data-y="34"';
const CAPTION_ACCENT = '#facc15';
export function accentOf(look) {
    const hex = look.match(/#[0-9a-fA-F]{6}/g)?.[1];
    if (!hex)
        return CAPTION_ACCENT;
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.45 ? hex : CAPTION_ACCENT;
}
const CAPTION_TRACK = 20;
const CAPTION_LETTERS = 16;
export function captionsFor(line, at, seconds, key, accent = CAPTION_ACCENT) {
    const words = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(line.trim())].map((part) => part.segment);
    const chunks = [];
    for (const word of words) {
        const last = chunks.at(-1);
        if (last !== undefined && (last + word).trim().length <= CAPTION_LETTERS)
            chunks[chunks.length - 1] = last + word;
        else if (word.trim())
            chunks.push(word.trimStart());
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
    const numbered = chunks.filter((chunk) => /\d/.test(chunk));
    const key_ = numbered.length > 0 ? new Set(numbered) : new Set(chunks.length > 2 ? [chunks.reduce((long, chunk) => (chunk.trim().length > long.trim().length ? chunk : long))] : []);
    let start = at;
    return chunks.map((chunk, index) => {
        const length = round((seconds * chunk.length) / total);
        const clip = `<div id="cap-${key}-${index + 1}" class="clip lupo-text" data-caption="" data-start="${round(start)}" data-duration="${length}" data-track-index="${CAPTION_TRACK}" ${CAPTION_LOOK} data-color="${key_.has(chunk) ? accent : '#ffffff'}">${escapeHtml(chunk.trim())}</div>`;
        start += length;
        return clip;
    });
}
async function polish(userId, role, projectId, scenes, lengths, input, tell) {
    const dir = dirOf(projectId);
    const work = `${dir}/.polish`;
    const placed = [];
    let start = 0;
    scenes.forEach((scene, position) => {
        const length = lengths[position] ?? 3;
        if (!scene)
            return;
        const own = scene.snippet.replace(/data-start="[^"]*"/, `data-start="${round(start)}"`).replace(/data-duration="[^"]*"/, `data-duration="${length}"`);
        placed.push({ name: scene.name, snippet: scene.under ? `${scene.under(round(start), length)}\n${own.replace('data-track-index="0"', 'data-track-index="1"')}` : own, at: round(start + Math.min(length * 0.65, length - 0.3)), over: Boolean(scene.under) });
        start += length;
    });
    if (placed.length === 0)
        return;
    tell('ตรวจภาพจริงของทุกฉาก');
    const index = (await sandbox.readFile(who(userId), `${dir}/index.html`, 4_000_000)).toString('utf8');
    const page = index
        .replace('</body>', () => `${scenes.flatMap((scene) => (scene?.script ? [scene.script] : [])).join('\n')}</body>`)
        .replace(/(<div[^>]*data-composition-id="main"[^>]*?)data-duration="[^"]*"/, `$1data-duration="${round(start)}"`)
        .replace(/(<div[^>]*data-composition-id="main"[^>]*>)/, (root) => `${root}\n${placed.map((scene) => scene.snippet).join('\n')}`);
    await sandbox.exec(who(userId), { command: `rm -rf "${work}" && mkdir -p "${work}" && for d in compositions fonts assets; do [ ! -d "${dir}/$d" ] || cp -al "${dir}/$d" "${work}/$d"; done`, timeoutMs: 15_000 });
    await sandbox.writeFiles(who(userId), work, [{ path: 'index.html', bytes: Buffer.from(page) }]);
    const shot = await sandbox.exec(who(userId), {
        command: `cd "${work}" && command -v hyperframes >/dev/null || exit 3; HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 timeout 240 ${HF} snapshot --at ${placed.map((scene) => scene.at).join(',')} --no-end -o out . >/dev/null 2>&1; i=0; for f in $(ls out/frame-*.png | sort); do ffmpeg -y -v error -i "$f" -vf scale=1280:-2 -q:v 4 "out/look-$i.jpg"; i=$((i+1)); done; ls out/look-*.jpg | wc -l`,
        timeoutMs: 270_000,
    });
    const count = Number(shot.stdout.trim().split('\n').at(-1) ?? 0);
    if (shot.exitCode !== 0 || count !== placed.length) {
        logger.warn('VIDEO_REVIEW_FRAMES_UNAVAILABLE', {count, expected:placed.length});
        await sandbox.exec(who(userId), { command: `rm -rf "${work}"`, timeoutMs: 15_000 }).catch(() => undefined);
        if (placed.some((scene) => scene.over))
            return polish(userId, role, projectId, scenes.map((scene) => (scene?.under ? null : scene)), lengths, input, tell);
        return;
    }
    await Promise.all(placed.map(async (scene, position) => {
        const frame = await sandbox.readFile(who(userId), `${work}/out/look-${position}.jpg`, 2_000_000);
        const changed = await polishScene(userId, role, projectId, scene.name, `data:image/jpeg;base64,${frame.toString('base64')}`, { model: input.model, effort: input.effort, overlay: scene.over }).catch(() => false);
        if (changed)
            tell(`ฉาก ${position + 1}: ปรับตามภาพจริง`);
    }));
    await sandbox.exec(who(userId), { command: `rm -rf "${work}"`, timeoutMs: 15_000 }).catch(() => undefined);
}
export function reviewTimes(index, only = {}) {
    const wanted = new Set(only.scenes ?? []);
    return [...index.matchAll(/<[^>]*\sdata-composition-src="compositions\/([\w-]+)\.html"[^>]*>/g)]
        .map(([tag, name]) => ({ name: name, start: Number(/\sdata-start="([\d.]+)"/.exec(tag)?.[1] ?? 0), length: Number(/\sdata-duration="([\d.]+)"/.exec(tag)?.[1] ?? 3) }))
        .filter((scene) => (wanted.size === 0 || wanted.has(scene.name)) && scene.start + scene.length > (only.from ?? 0) && scene.start < (only.to ?? Number.POSITIVE_INFINITY))
        .flatMap((scene) => {
        const looks = Math.max(1, Math.round(scene.length / 4.5));
        return Array.from({ length: looks }, (_, look) => ({ name: scene.name, at: round(scene.start + Math.min((scene.length * (look + 0.65)) / looks, scene.length - 0.3)) }));
    })
        .sort((a, b) => a.at - b.at);
}
export async function reviewVideo(userId, role, projectId, input) {
    const dir = dirOf(projectId);
    const index = (await sandbox.readFile(who(userId), `${dir}/index.html`, 4_000_000)).toString('utf8');
    const looks = reviewTimes(index, input);
    if (looks.length === 0)
        throw new AppError('BAD_REQUEST', { key: 'af-video-review-none', message: 'No scene of the video is there: name scenes from index.html (compositions/<name>.html) or a time range inside the video.' });
    input.onProgress?.(`ดูภาพจริง ${new Set(looks.map((look) => look.name)).size} ฉาก`);
    const out = `${dir}/.review`;
    const shot = await sandbox.exec(who(userId), {
        command: `cd "${dir}" && command -v hyperframes >/dev/null || exit 3; rm -rf .review; HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 timeout 570 ${HF} snapshot --at ${looks.map((look) => look.at).join(',')} --no-end -o .review . >/dev/null 2>&1; i=0; for f in $(ls .review/frame-*.png | sort); do ffmpeg -y -v error -i "$f" -vf scale=1280:-2 -q:v 4 ".review/look-$i.jpg"; i=$((i+1)); done; ls .review/look-*.jpg | wc -l`,
        timeoutMs: 600_000,
    });
    if (shot.exitCode !== 0 || Number(shot.stdout.trim().split('\n').at(-1) ?? 0) !== looks.length) {
        await sandbox.exec(who(userId), { command: `rm -rf "${out}"`, timeoutMs: 15_000 }).catch(() => undefined);
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-review-snapshot', message: 'The frames of the video could not be taken.' });
    }
    const fixed = new Set();
    const failed = new Set();
    const byScene = new Map();
    looks.forEach((look, position) => byScene.set(look.name, [...(byScene.get(look.name) ?? []), position]));
    await Promise.all([...byScene].map(async ([name, positions]) => {
        for (const position of positions) {
            const frame = await sandbox.readFile(who(userId), `${out}/look-${position}.jpg`, 2_000_000);
            const done = await polishScene(userId, role, projectId, name, `data:image/jpeg;base64,${frame.toString('base64')}`, input).catch((error) => {
                logger.warn('VIDEO_REVIEW_POLISH_FAILED', { name, error: error instanceof Error ? error.message : String(error) });
                failed.add(name);
                return false;
            });
            if (done)
                fixed.add(name);
        }
        if (fixed.has(name))
            input.onProgress?.(`${name}: ปรับตามภาพจริง`);
    }));
    await sandbox.exec(who(userId), { command: `rm -rf "${out}"`, timeoutMs: 15_000 }).catch(() => undefined);
    return { checked: [...byScene.keys()], fixed: [...fixed], failed: [...failed] };
}
const PICTURE_RULE = 'The pictures of this scene: a screenshot of an app, a website, a dashboard or a document page is a reference, not footage: rebuild that screen as a faithful live copy of it, as close to the original as you can: the same layout and proportions, the same words, numbers and prices, the same colours, corner radii, spacing and order, its icons drawn with CSS or SVG, so it reads as that very screen, every word, number and price copied exactly as the picture shows it, character by character (a price or a number written differently is a mistake, and nothing is made up); then animate it piece by piece (cards slide in in order, numbers count up, a tap lights its button). Never place the screenshot itself. A real photo, product, person, place or logo, or a cut-out PNG, is placed itself with <img src="assets/NAME"> and given motion (a slow push-in, a mask or clip-path reveal, parallax, a soft 3D tilt, a gentle float for a cut-out), never stretched (object-fit: cover or contain).';
export function withWords(index, shot, old, words) {
    const rules = lookRules(words);
    const ids = old.map((clip) => /\sid="([^"]+)"/.exec(clip)?.[1]).filter(Boolean);
    return old
        .reduce((page, clip) => page.replace(`${clip}\n`, '').replace(clip, ''), index)
        .replace(/<style id="lupo-style">([\s\S]*?)<\/style>/, (_, sheet) => `<style id="lupo-style">${rules}\n${sheet.replace(/#([\w-]+)\{[^}]*\}\n?/g, (rule, id) => (ids.includes(id) ? '' : rule))}</style>`)
        .replace(new RegExp(`<div\\b[^>]*\\sid="${shot}"[^>]*>[\\s\\S]*?</div>`), (clip) => `${clip}\n${words.join('\n')}`);
}
const FACTS = '.video-facts.txt';
const LOOK = '.video-look.json';
const checkShot = (key, frame, palette, assets, seconds) => (code, words) => {
    const made = freeThreeClip(key, frame, palette, assets, { code });
    const clips = wordClips(key, words, 0);
    return { clip: [made.clip(0, seconds), ...clips].join('\n'), script: made.script, style: lookRules(clips) };
};
export async function reshapeThree(userId, role, projectId, input) {
    const dir = dirOf(projectId);
    const index = withoutPlaceholder((await sandbox.readFile(who(userId), `${dir}/index.html`, 4_000_000)).toString('utf8'));
    const facts = await sandbox.readFile(who(userId), `${dir}/${FACTS}`, 100_000).then((bytes) => bytes.toString('utf8'), () => '');
    const frame = { width: Number(/data-width="(\d+)"/.exec(index)?.[1] ?? 1920), height: Number(/data-height="(\d+)"/.exec(index)?.[1] ?? 1080) };
    const css = (n, fallback) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : fallback);
    const setupOf = (script) => {
        try {
            return JSON.parse(/const S = (\{.*?\});\n/.exec(script)?.[1] ?? '{}');
        }
        catch {
            return {};
        }
    };
    if (input.clip) {
        if (!/^clip-3d-[\w-]{1,40}$/.test(input.clip))
            throw new AppError('BAD_REQUEST', { key: 'af-video-3d-clip', message: 'Not a 3D clip id.' });
        const script = new RegExp(`<script type="module" data-lupo-3d="${input.clip}">([\\s\\S]*?)</script>`).exec(index)?.[1] ?? '';
        const file = /import design from "\.\/(compositions\/three-[\w-]+\.js)"/.exec(script)?.[1];
        if (!file)
            throw new AppError('BAD_REQUEST', { key: 'af-video-3d-clip', message: 'That 3D clip is not a free design: make a new one instead.' });
        const S = setupOf(script);
        const seconds = Number(new RegExp(`id="${input.clip}"[^>]*data-duration="([\\d.]+)"`).exec(index)?.[1] ?? 5);
        const source = (await sandbox.readFile(who(userId), `${dir}/${file}`, 1_000_000)).toString('utf8');
        const code = /export default async function design\(ctx\) \{\n([\s\S]*)\n\}\s*$/.exec(source)?.[1] ?? source;
        const key = file.replace(/^compositions\/three-|\.js$/g, '');
        const palette = [css(S.deep, '#14110f'), css(S.accent, '#e8833a'), css(S.light, '#fbf7f2')];
        const assets = S.assets ?? { pictures: [], icons: [] };
        const brief = { idea: input.change, seconds, frame, palette, look: '', assets, facts, model: input.model, effort: input.effort };
        const start = Number(new RegExp(`id="${input.clip}"[^>]*data-start="([\\d.]+)"`).exec(index)?.[1] ?? 0);
        const clips = [...index.matchAll(new RegExp(`<div\\b[^>]*\\sid="w-${key}-\\d+"[^>]*>[^<]*</div>`, 'g'))].map((match) => match[0]);
        const words = clips.map((clip) => {
            const attr = (name) => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(clip)?.[1];
            return { text: (/>([^<]*)<\/div>$/.exec(clip)?.[1] ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), at: Number(attr('start') ?? start) - start, for: Number(attr('duration') ?? 1), x: Number(attr('x') ?? 0), y: Number(attr('y') ?? 0), size: Number(attr('font-size') ?? 80), weight: Number(attr('weight') ?? 800), color: attr('color') ?? '#ffffff', in: attr('trans-in') ?? 'fade' };
        });
        const changed = await designThree(userId, userId, role, projectId, key, brief, checkShot(key, frame, palette, assets, seconds), { code, words, change: input.change });
        if (!changed)
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-3d-failed', message: 'The 3D shot could not be changed so that it still draws.' });
        await sandbox.writeFiles(who(userId), `${dir}/compositions`, [{ path: `three-${key}.js`, bytes: Buffer.from(threeFile(changed.code)) }]);
        const page = withWords(index, input.clip, clips, wordClips(key, changed.words, start)).replace(`<script type="module" data-lupo-3d="${input.clip}">${script}</script>`, () => freeThreeClip(key, frame, palette, assets, { file }).script);
        await sandbox.writeFiles(who(userId), dir, [{ path: 'index.html', bytes: Buffer.from(page) }]);
        return { clip: input.clip, seconds };
    }
    const seconds = Math.max(2, Math.min(20, input.seconds ?? 5));
    const S = setupOf(/<script type="module" data-lupo-3d="[^"]+">([\s\S]*?)<\/script>/.exec(index)?.[1] ?? '');
    const palette = [css(S.deep, '#14110f'), css(S.accent, '#e8833a'), css(S.light, '#fbf7f2')];
    const key = Math.random().toString(36).slice(2, 8);
    const assets = { pictures: [], icons: [] };
    const brief = { idea: input.change, seconds, frame, palette, look: '', assets, facts, model: input.model, effort: input.effort };
    const made = await designThree(userId, userId, role, projectId, key, brief, checkShot(key, frame, palette, assets, seconds));
    if (!made)
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-3d-failed', message: 'The 3D shot could not be made to draw.' });
    await sandbox.writeFiles(who(userId), `${dir}/compositions`, [{ path: `three-${key}.js`, bytes: Buffer.from(threeFile(made.code)) }]);
    const start = timelineEnd(index);
    const shot = freeThreeClip(key, frame, palette, assets, { file: `compositions/three-${key}.js` });
    await sandbox.writeFiles(who(userId), dir, [{ path: 'index.html', bytes: Buffer.from(placedOnTimeline(index, [shot.clip(start, seconds), ...wordClips(key, made.words, start)], start + seconds, [shot.script])) }]);
    return { clip: `clip-3d-${key}`, start, seconds };
}
export function placedOnTimeline(index, clips, end, scripts = []) {
    const fonts = index.includes('id="lupo-fonts"') ? '' : `<style id="lupo-fonts">${FONT_FACES}.lupo-text[data-caption],.lupo-text[data-words]{font-family:"Kanit",sans-serif}</style>`;
    const rules = lookRules(clips);
    const sheeted = !rules ? index : index.includes('<style id="lupo-style">') ? index.replace('<style id="lupo-style">', `<style id="lupo-style">${rules}\n`) : index.replace('</head>', `<style id="lupo-style">${rules}</style></head>`);
    return sheeted
        .replace('.lupo-text[data-caption]{font-family', '.lupo-text[data-caption],.lupo-text[data-words]{font-family')
        .replace('</head>', `${fonts}</head>`)
        .replace('</body>', () => `${scripts.join('\n')}</body>`)
        .replace(/(<div[^>]*data-composition-id="main"[^>]*?)data-duration="[^"]*"/, `$1data-duration="${round(end)}"`)
        .replace(/(<div[^>]*data-composition-id="main"[^>]*>)/, (root) => `${root}\n${clips.join('\n')}`);
}
const startOf = (line) => Number(/^<[^>]*\sdata-start="([\d.]+)"/.exec(line)?.[1] ?? Number.NaN);
export function remadeStretch(index, from, to) {
    const total = Number(/<div[^>]*data-composition-id="main"[^>]*\sdata-duration="([\d.]+)"/.exec(index)?.[1] ?? 0);
    const scenes = [...index.matchAll(/<[^>]*\sdata-composition-src="[^"]*"[^>]*>/g)]
        .map(([tag]) => ({ start: Number(/\sdata-start="([\d.]+)"/.exec(tag)?.[1] ?? 0), length: Number(/\sdata-duration="([\d.]+)"/.exec(tag)?.[1] ?? 0) }))
        .filter((scene) => scene.start < to && scene.start + scene.length > from);
    if (scenes.length === 0)
        throw new AppError('BAD_REQUEST', { key: 'af-video-edit-range', message: `No scene of the video is between ${from} and ${to} s: pick seconds inside the video (0 to ${total}).` });
    return { start: Math.min(...scenes.map((scene) => scene.start)), end: round(Math.max(...scenes.map((scene) => scene.start + scene.length))), total };
}
export function splicedTimeline(index, stretch, made, tag) {
    const delta = round(made.end - stretch.end);
    const inside = (start) => start >= stretch.start - 0.3 && start < stretch.end - 0.01;
    const gone = new Set();
    const lines = index.split('\n').flatMap((line) => {
        const start = startOf(line.trim());
        if (Number.isNaN(start) || line.includes('data-composition-id="main"'))
            return [line];
        const id = /^\s*<[^>]*\sid="([^"]+)"/.exec(line)?.[1] ?? '';
        if (id === 'music-bed')
            return [line.replace(/data-duration="([\d.]+)"/, (_, seconds) => `data-duration="${round(Math.min(Number(seconds), stretch.total + delta))}"`)];
        if (inside(start) && !(id.startsWith('sweep-') && start >= stretch.end - 0.3)) {
            gone.add(id);
            return [];
        }
        return [start >= stretch.end - 0.3 ? line.replace(/data-start="[\d.]+"/, `data-start="${round(start + delta)}"`) : line];
    });
    const targets = (statement) => [...statement.matchAll(/["']#([\w-]+)["']/g)].map((match) => match[1]);
    const kept = lines
        .join('\n')
        .replace(/<script type="module" data-lupo-3d="([\w-]+)">[\s\S]*?<\/script>/g, (script, id) => (gone.has(id) ? '' : script))
        .replace(/(<script id="lupo-seams[\w-]*">\(function\(\)\{var tl=[^;]*;if\(!tl\)return;)([\s\S]*?)(\}\)\(\);<\/script>)/g, (_, open, body, close) => {
        const statements = (body.match(/tl\.\w+\([\s\S]*?\);/g) ?? []).filter((statement) => !targets(statement).some((id) => gone.has(id)));
        return `${open}${statements.map((statement) => statement.replace(/,([\d.]+)\);$/, (_, at) => `,${Number(at) >= stretch.end - 0.3 ? round(Number(at) + delta) : at});`)).join('')}${close}`;
    });
    const taken = new Set([...kept.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    let text = [made.clips.join('\n'), made.scripts.join('\n')].join('\u0000');
    for (const id of new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))) {
        if (taken.has(id))
            text = text.replace(new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), `${id}-${tag}`);
    }
    const [clips, scripts] = text.split('\u0000');
    return placedOnTimeline(kept, clips ? clips.split('\n') : [], round(stretch.total + delta), scripts ? [scripts] : []);
}
export function framing(focus, source, frame) {
    if (!focus || !source?.width || !source.height)
        return null;
    const cover = Math.max(frame.width / source.width, frame.height / source.height);
    const shown = { width: source.width * cover * focus.zoom, height: source.height * cover * focus.zoom };
    const spare = { x: (shown.width - frame.width) / 2, y: (shown.height - frame.height) / 2 };
    const dx = Math.min(spare.x, Math.max(-spare.x, (0.5 - focus.x) * shown.width));
    const dy = Math.min(spare.y, Math.max(-spare.y, (0.5 - focus.y) * shown.height));
    return { scale: focus.zoom, x: round((dx / frame.width) * 100), y: round((dy / frame.height) * 100) };
}
export function lookRules(clips) {
    return clips
        .map((clip) => {
        const tag = /^<[^>]*>/.exec(clip)?.[0] ?? '';
        const id = /\sid="([^"]+)"/.exec(tag)?.[1];
        const attr = (name) => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(tag)?.[1];
        if (!id)
            return '';
        const rules = [];
        const x = Number(attr('x') ?? 0);
        const y = Number(attr('y') ?? 0);
        if (x || y)
            rules.push(`translate:${x}% ${y}%`);
        const scale = Number(attr('scale') ?? 1);
        if (scale !== 1)
            rules.push(`scale:${scale}`);
        if (attr('fit') === 'cover')
            rules.push('object-fit:cover');
        if (attr('font-size'))
            rules.push(`font-size:${attr('font-size')}px`);
        if (attr('color'))
            rules.push(`color:${attr('color')}`);
        if (attr('weight'))
            rules.push(`font-weight:${attr('weight')}`);
        const stroke = Number(attr('stroke') ?? 0);
        if (stroke)
            rules.push(`-webkit-text-stroke:${stroke}px ${attr('stroke-color') ?? '#000000'}`, 'paint-order:stroke fill');
        const shadow = attr('shadow');
        if (shadow !== undefined)
            rules.push(`text-shadow:${Number(shadow) ? `0 ${round(Number(shadow) / 6)}px ${shadow}px #0009` : 'none'}`);
        return rules.length > 0 ? `#${id}{${rules.join(';')}}` : '';
    })
        .filter(Boolean)
        .join('\n');
}
export function timelineEnd(index) {
    const ends = [...index.matchAll(/<[^>]*\sdata-start="([\d.]+)"[^>]*>/g)]
        .filter((match) => !match[0].includes('data-composition-id="main"'))
        .map((match) => Number(match[1]) + Number(/data-duration="([\d.]+)"/.exec(match[0])?.[1] ?? 0));
    return round(Math.max(0, ...ends));
}
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const making = new Set();
export async function makeVideo(userId, role, projectId, input) {
    const key = `${userId}:${projectId}`;
    if (making.has(key))
        throw new AppError('BAD_REQUEST', { key: 'af-video-make-running', message: 'This video is being made already: wait for that call to finish instead of making it again.' });
    making.add(key);
    try {
        const made = await make(userId, role, projectId, input);

        return made;
    }
    finally {
        making.delete(key);
    }
}
const NOT_EMPTY = { key: 'af-video-make-not-empty', message: 'The timeline already has the video: redo a stretch of it with video_edit, fix how it looks with video_review, or change one scene with video_scene, instead of making it again.' };
const hasVideo = (html) => Boolean(html.match(/<[^>]*\sdata-start=[^>]*>/g)?.some((tag) => !tag.includes('data-composition-id="main"')));
async function make(userId, role, projectId, input) {
    const stop = () => {
        if (input.signal?.aborted)
            throw new AppError('BAD_REQUEST', { key: 'af-video-make-stopped', message: 'The run was stopped, so the video was not made.' });
    };
    const turn = (most) => {
        const gate = limiter(most);
        return (work) => gate(async () => (stop(), work()));
    };
    const dir = dirOf(projectId);
    const read = async () => withoutPlaceholder((await sandbox.readFile(who(userId), `${dir}/index.html`, 4_000_000)).toString('utf8'));
    const html = await read();
    if (!input.range && hasVideo(html))
        throw new AppError('BAD_REQUEST', NOT_EMPTY);
    const stretch = input.range ? remadeStretch(html, input.range.from, input.range.to) : null;
    const kept = stretch ? await sandbox.readFile(who(userId), `${dir}/${LOOK}`, 100_000).then((bytes) => JSON.parse(bytes.toString('utf8')), () => null) : null;
    if (stretch) {
        const said = (from, to) => [...html.matchAll(/<div[^>]*\sdata-caption=""[^>]*\sdata-start="([\d.]+)"[^>]*>([^<]*)<\/div>/g)].filter((caption) => Number(caption[1]) >= from && Number(caption[1]) < to).map((caption) => caption[2]).join('');
        const before = said(stretch.start - 12, stretch.start);
        const after = said(stretch.end, stretch.end + 12);
        input = {
            ...input,
            seconds: input.seconds > 0 ? input.seconds : round(stretch.end - stretch.start),
            brief: `${input.brief}\n\nThis makes again only ${stretch.start}–${stretch.end} s of a finished ${stretch.total} s video, as one stretch put in its place: ${stretch.start > 0 ? 'no opening title or logo, ' : ''}${stretch.end < stretch.total - 0.5 ? 'no closing card or call to action, ' : ''}it flows on from what is said before it${before ? ` ("${before.slice(-300)}")` : ''} and leads into what follows${after ? ` ("${after.slice(0, 300)}")` : ''}.${kept ? ` Keep the video's look: ${kept.look}` : ''}`,
        };
    }
    if (input.quick)
        input = { ...input, effort: 'low', brief: `${input.brief}\n\nQuick lesson video: at most ${quickCap(input.seconds)} beats, one or two short sentences of narration per beat, no 3D shots and no AI video clips.` };
    const w = Number(/data-width="(\d+)"/.exec(html)?.[1] ?? 1920);
    const h = Number(/data-height="(\d+)"/.exec(html)?.[1] ?? 1080);
    const frame = `${w}x${h} (${w > h ? 'wide, landscape' : w < h ? 'tall, portrait' : 'square'})`;
    const tell = (detail) => input.onProgress?.(detail);
    const files = input.files ?? [];
    if (files.length > 0)
        tell('ดูรูป คลิป และสีธีมในไฟล์ที่แนบมา');
    const refs = files.length > 0 ? await resolveAttachments(userId, files).catch(() => []) : [];
    const isClip = (ref) => ref.mimeType.startsWith('video/') || VIDEO_FILE.test(ref.name);
    const isSong = (ref) => ref.mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(ref.name);
    const beyond = refs.filter((ref) => !isClip(ref) && !isSong(ref)).slice(MATERIAL_FILES);
    if (beyond.length > 0)
        tell(`อ่านไฟล์ได้ ${MATERIAL_FILES} ไฟล์แรก · ไม่ได้ใช้: ${beyond.map((ref) => ref.name).join(', ')}`);
    const links = input.links ?? [];
    if (links.length > 0)
        tell(`โหลดคลิปจากลิงก์ ${links.length} ลิงก์`);
    if (input.reference)
        tell('ดูคลิปตัวอย่างสไตล์ที่อยากได้');
    const bring = async () => {
        const attached = await Promise.all(refs.filter(isClip).map((ref) => addAsset(userId, projectId, ref.id).then((asset) => asset.name, () => null)));
        const fetched = await Promise.all(links.map((url) => fetchLink(userId, `${dir}/assets`, url, 'link')));
        return [...attached, ...fetched].filter((name) => name !== null);
    };
    const [{ pictures, words, skipped }, userClips, reference] = await Promise.all([
        material(userId, projectId, refs.filter((ref) => !isClip(ref) && !isSong(ref)).map((ref) => ref.id)).catch(() => ({ pictures: [], words: '', skipped: [] })),
        bring().then((names) => {
            if (names.length > CLIPS_MAX)
                tell(`ใช้คลิปได้ ${CLIPS_MAX} คลิปแรก · ไม่ได้ใช้: ${names.slice(CLIPS_MAX).join(', ')}`);
            return clipsOf(userId, role, projectId, names);
        }).catch(() => []),
        input.reference ? referenceOf(userId, input.reference).catch(() => null) : Promise.resolve(null),
    ]);
    const found = [pictures.length > 0 ? `รูป ${pictures.length} รูป` : '', userClips.length > 0 ? `คลิป ${userClips.length} คลิป (ถอดเสียงและดูภาพแล้ว)` : '', reference ? 'สไตล์ตัวอย่าง' : ''].filter(Boolean).join(' · ');
    if (skipped.length > 0)
        tell(`อ่านไฟล์เหล่านี้ไม่ได้ (ไม่มีรูปหรือข้อความที่ใช้ได้): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ` และอีก ${skipped.length - 5} ไฟล์` : ''}`);
    tell(found ? `ได้${found} · วางแผนเรื่องและจังหวะของวิดีโอ` : 'วางแผนเรื่องและจังหวะของวิดีโอ');
    stop();
    const style = await styleOf(userId, input.seconds, userClips);
    const blender = input.quick ? null : await blenderOn(userId);
    const planned = await plan(userId, role, input, frame, pictures, userClips, reference, words, style.plan, Boolean(blender));
    const { look, film } = kept ?? planned;
    const { beats, cutout, music } = planned;
    adaptBeats(beats);
    if (input.quick)
        quickBeats(beats, input.seconds, input.brief);
    for (const beat of beats) {
        if (!beat.blender)
            continue;
        delete beat.span;
        if (blender) {
            delete beat.three;
            delete beat.clip;
        }
        else {
            if (!beat.three?.idea)
                beat.three = { kind: 'pictures', idea: beat.blender.idea, pictures: [] };
            delete beat.blender;
        }
    }
    const filmStyle = await style.film(film);
    if (filmStyle) tell(`ใช้สไตล์ Lemo-Opuscar · ${film}`);
    if (NO_VOICE.test(input.brief))
        for (const beat of beats)
            beat.say = '';
    if (continuousMotion()) {
        for (const beat of beats) {
            delete beat.transition;
            delete beat.span;
        }
        if (beats.length > 1) beats[0].span = beats.length - 1;
    } else if (requestedShots()) {
        for (const beat of beats) delete beat.span;
    } else intoActs(beats);
    const shown = JSON.stringify(beats);
    const left = pictures.filter((picture) => picture.name.startsWith('file-') && !shown.includes(picture.name));
    if (left.length > 0)
        tell(`แผนไม่ได้ใช้รูปที่แนบมา ${left.length} จาก ${pictures.filter((picture) => picture.name.startsWith('file-')).length} รูป (จาก ${[...new Set(left.map((picture) => picture.from ?? picture.name))].slice(0, 5).join(', ')})`);
    const known = [words, ...beats.flatMap((beat) => (beat.three?.cards ?? []).map((card) => `${card.title}${card.line ? ` — ${card.line}` : ''}`))].filter(Boolean).join('\n');
    for (const beat of beats) {
        beat.say = withoutInventedPrices(beat.say, known);
        beat.show = withoutInventedPrices(beat.show, known);
        if (beat.three?.idea)
            beat.three.idea = withoutInventedPrices(beat.three.idea, known);
        if (beat.blender)
            beat.blender.idea = withoutInventedPrices(beat.blender.idea, known);
    }
    const clipSeconds = new Map(userClips.map((clip) => [clip.name, clip.seconds]));
    const clipSize = new Map(userClips.map((clip) => [clip.name, { width: clip.width, height: clip.height }]));
    const clipTranscripts = new Map(userClips.map((clip) => [clip.name, clip.transcript]));
    const heard = [...new Set(beats.flatMap((beat) => (beat.footage && beat.footage.audio !== 'off' ? [beat.footage.name] : [])))];
    const evened = new Map();
    const quiet = new Map();
    await Promise.all(heard.map(async (name) => {
        const even = `${name.replace(/\.\w+$/, '')}-even.mp4`;
        const made = await sandbox
            .exec(who(userId), { command: `cd "${dir}/assets" && ffmpeg -y -v error -i "${name}" -map 0:v:0 -map 0:a:0 -c:v copy -ac 2 -af ${EVEN_LOUDNESS} -ar 48000 -c:a aac -b:a 160k "${even}"`, timeoutMs: 180_000 })
            .catch(() => null);
        if (made?.exitCode === 0)
            evened.set(name, even);
        quiet.set(name, await silencesOf(userId, `${dir}/assets/${name}`));
    }));
    const used = new Map();
    for (let index = 0; index < beats.length; index++) {
        const beat = beats[index];
        if (!beat?.footage)
            continue;
        const name = beat.footage.name;
        const cues = cuesOf(clipTranscripts.get(name) ?? '');
        const cut = beat.footage.audio === 'speech' ? cleanCut(beat.footage, cues, quiet.get(name) ?? [], clipSeconds.get(name) ?? beat.footage.to) : beat.footage;
        const free = unused(cut, used.get(name) ?? [], cues);
        if (!free) {
            beats.splice(index--, 1);
            continue;
        }
        used.set(name, [...(used.get(name) ?? []), free]);
        beat.footage = { ...beat.footage, ...free };
        if (beat.footage.audio === 'speech')
            beat.seconds = round(free.to - free.from);
        const even = evened.get(name);
        if (even) {
            clipSeconds.set(even, clipSeconds.get(name) ?? beat.footage.to);
            const size = clipSize.get(name);
            if (size)
                clipSize.set(even, size);
            clipTranscripts.set(even, clipTranscripts.get(name) ?? '');
            beat.footage = { ...beat.footage, name: even };
        }
    }
    const sounds = new Map();
    for (const beat of beats) {
        const footage = beat.footage;
        if (!footage || footage.audio === 'off' || sounds.has(footage.name))
            continue;
        const sound = `${footage.name.replace(/\.\w+$/, '')}-sound.m4a`;
        sounds.set(footage.name, sandbox
            .exec(who(userId), { command: `cd "${dir}/assets" && ([ -s "${sound}" ] || ffmpeg -y -v error -i "${footage.name}" -vn -map 0:a:0 -c:a aac -b:a 160k "${sound}")`, timeoutMs: 300_000 })
            .then((done) => (done.exitCode === 0 ? sound : null), () => null));
    }
    const drawing = beats.filter((beat) => beat.draw).length;
    tell(`ได้ ${beats.length} ช็อต · กำลังพากย์เสียงทุกช็อตพร้อมกัน${drawing > 0 ? ` · เจนรูปประกอบ ${drawing} รูป` : ''}${cutout.length > 0 ? ` · ตัดพื้นหลัง ${cutout.length} รูป` : ''}${NO_MUSIC.test(input.brief) ? '' : input.music ? ' · ใส่เพลงที่ให้มา' : ` · หาเพลงประกอบ${music.length > 0 ? ` (${music.join(', ')})` : ''} แล้วตัดตามจังหวะ`}`);
    const sfx = await ensureSfx(userId, projectId).catch(() => []);
    const palette = look.match(/#[0-9a-fA-F]{6}/g)?.slice(0, 5);
    const voiced = (beat) => speakText(userId, role, projectId, { text: beat.say, voice: input.voice });
    const voiceTurn = turn(8);
    const threeTurn = turn(4);
    const sceneTurn = turn(6);
    const songs = refs.filter(isSong).map((ref) => ref.id);
    const [voices, drawn, cut, models, song] = await Promise.all([
        Promise.all(beats.map((beat, index) => beat.say.trim()
            ? voiceTurn(() => voiced(beat).catch(() => voiced(beat))).catch(() => {
                tell(`ฉาก ${index + 1}: พากย์เสียงไม่สำเร็จ 2 ครั้ง ฉากนี้จะไม่มีเสียงพากย์`);
                return null;
            })
            : Promise.resolve(null))),
        Promise.all(beats.map((beat) => (beat.photo ? stockPhoto(userId, role, input, projectId, beat.photo, beat.show, look, { width: w, height: h }).catch(() => null) : Promise.resolve(null)).then((photo) => photo ??
            (beat.draw
                ? drawnImage(userId, role, userId, projectId, beat.draw.prompt, [], { size: w > h ? '1536x1024' : w < h ? '1024x1536' : '1024x1024', ...(beat.draw.cutout ? { cutout: true } : {}), ...(palette ? { palette } : {}) })
                : null)))),
        cutouts(userId, projectId, cutout),
        Promise.all(beats.map(async (beat) => {
            if (beat.three?.kind === 'cards') {
                const icons = await Promise.all((beat.three.cards ?? []).map((card) => card.icon
                    ? drawnImage(userId, role, userId, projectId, `A single glossy 3D clay icon of ${card.icon}, soft rounded chunky shapes, smooth matte clay, cheerful pastel colours, soft studio light, centred, no text`, [], { size: '1024x1024', cutout: true, ...(palette ? { palette } : {}) }).then((made) => made?.name, () => undefined)
                    : Promise.resolve(undefined)));
                return { model: undefined, picture: undefined, icons };
            }
            if (beat.three?.kind !== 'model' || !beat.three.search)
                return null;
            const want = beat.three.idea || beat.three.search;
            const found = await fetchModel(userId, projectId, beat.three.search, (thumbnail, name) => modelFits(userId, role, input, thumbnail, name, want, look)).catch(() => null);
            if (found)
                return { model: found, picture: undefined, icons: undefined };
            const drawn3d = await drawnImage(userId, role, userId, projectId, `A single ${beat.three.search}, a premium studio product photograph of it alone, seen at a three-quarter angle, softly lit, sharp`, [], { size: '1024x1024', cutout: true, ...(palette ? { palette } : {}) }).catch(() => null);
            return drawn3d ? { model: undefined, picture: drawn3d.name, icons: undefined } : null;
        })),
        NO_MUSIC.test(input.brief) || stretch
            ? Promise.resolve(null)
            : musicFor(userId, projectId, input.music ?? songs[0], music, input.seconds).then(async (found) => (found ? { ...found, beats: await beatsOf(userId, found.path) } : null)),
    ]);
    beats.forEach((beat, index) => {
        const made3d = models[index];
        if (beat.three?.kind === 'model' && !made3d && !beat.three.idea)
            delete beat.three;
        else if (beat.three && made3d?.picture)
            beat.three = { ...beat.three, pictures: [made3d.picture] };
        else if (beat.three?.kind === 'cards' && made3d?.icons)
            beat.three = { ...beat.three, cards: (beat.three.cards ?? []).map((card, n) => ({ ...card, ...(made3d.icons?.[n] ? { picture: made3d.icons[n] } : {}) })) };
        beat.assets = beat.assets.map((name) => cut.get(name) ?? name);
        const picture = drawn[index];
        if (picture)
            beat.assets.push(picture.name);
        if (picture && 'credit' in picture)
            void addCredit(userId, projectId, `${picture.name}: ${picture.credit}`).catch(() => undefined);
    });
    let lengths = beats.map((beat, index) => {
        const line = voices[index]?.duration;
        return beat.footage?.audio === 'speech' || !line ? beat.seconds : round(line + BREATH[beat.pace ?? 'steady']);
    });
    const unvoiced = beats.map((beat, index) => !voices[index]?.duration && !beat.footage);
    const quietSum = lengths.reduce((sum, length, index) => sum + (unvoiced[index] ? length : 0), 0);
    if (input.quick)
        lengths = toppedUp(lengths, input.seconds);
    const short = input.seconds - lengths.reduce((sum, length) => sum + length, 0);
    if (short > 0.5 && quietSum > 0)
        lengths = lengths.map((length, index) => (unvoiced[index] ? round(length * (1 + short / quietSum)) : length));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const pace = Math.min(1.3, total / input.seconds);
    if (pace > 1.03) {
        const spoken = voices.filter((voice) => voice !== null).map((voice) => voice.name);
        const sped = await sandbox
            .exec(who(userId), {
            command: `cd "${dir}/assets" && for f in ${spoken.map((name) => `"${name}"`).join(' ')}; do ffmpeg -y -v error -i "$f" -filter:a atempo=${pace.toFixed(3)} "pace-$f" && mv "pace-$f" "$f" || exit 1; done`,
            timeoutMs: 120_000,
        })
            .catch(() => null);
        if (sped?.exitCode === 0) {
            for (const voice of voices)
                if (voice?.duration)
                    voice.duration = round(voice.duration / pace);
            lengths = lengths.map((length, index) => (beats[index]?.footage?.audio === 'speech' ? length : round(length / pace)));
        }
    }
    if (song && song.beats.length > 0)
        lengths = onBeats(lengths, song.beats, beats.map((beat, index) => (beat.footage?.audio === 'speech' ? null : round((voices[index]?.duration ?? 0) + 0.25))));
    lengths = lengths.map((length, index) => {
        const footage = beats[index]?.footage;
        return footage?.audio === 'speech' ? round(Math.min(length, (clipSeconds.get(footage.name) ?? Number.POSITIVE_INFINITY) - footage.from)) : length;
    });
    const filmDuration = lengths.reduce((sum, length) => sum + length, 0);
    const stretchOf = (footage, length) => {
        const clipLength = clipSeconds.get(footage.name) ?? footage.to;
        const speed = round(Math.min(footage.speed, clipLength / length));
        return { speed, from: round(Math.max(0, Math.min(footage.from, clipLength - length * speed))) };
    };
    const footageTag = (footage, length, start, key) => {
        const { speed, from } = stretchOf(footage, length);
        const framed = framing(footage.focus, clipSize.get(footage.name), { width: w, height: h });
        return `<video id="clip-${key}" class="lupo-fill" src="assets/${footage.name}" data-start="${start}" data-duration="${length}" data-media-start="${from}"${speed !== 1 ? ` data-playback-rate="${speed}"` : ''} data-track-index="${footage.behind ? 1 : 0}" data-fit="cover"${framed ? ` data-scale="${framed.scale}"${framed.x ? ` data-x="${framed.x}"` : ''}${framed.y ? ` data-y="${framed.y}"` : ''}` : ''} data-link="${key}" playsinline muted data-volume="0"></video>`;
    };
    const movedTag = (made, length, start, key) => {
        const rate = clipRate(made.duration, length);
        return `<video id="clip-${key}" class="lupo-fill" src="assets/${made.name}" data-start="${start}" data-duration="${length}" data-media-start="0"${rate !== 1 ? ` data-playback-rate="${rate}"` : ''} data-track-index="0" data-fit="cover" playsinline muted data-volume="0"></video>`;
    };
    const matteTurn = turn(1);
    const mattes = beats.map((beat, index) => {
        const footage = beat.footage;
        if (!footage?.behind)
            return Promise.resolve(null);
        const { speed, from } = stretchOf(footage, lengths[index] ?? 3);
        return matteTurn(() => matteOf(userId, dir, footage.name, from, round((lengths[index] ?? 3) * speed))).catch(() => null);
    });
    const transforms = beats.map((beat, index) => {
        const footage = beat.footage;
        if (!footage?.transform)
            return Promise.resolve(null);
        const length = lengths[index] ?? 3;
        return transformOf(userId, role, projectId, footage, stretchOf(footage, length).from, length, beat.assets.filter((name) => /\.(png|jpe?g|webp)$/i.test(name)), w > h ? '1536x1024' : w < h ? '1024x1536' : '1024x1024', input.signal).catch(() => null);
    });
    if (beats.some((beat) => beat.footage?.transform))
        tell('เจนวิดีโอฉากหลังที่เปลี่ยนไปข้างหลังคนพูด');
    const moving = movingClips(userId, role, projectId, beats, lengths, w > h ? '1536x1024' : w < h ? '1024x1536' : '1024x1024', input.signal);
    if (beats.some((beat) => beat.clip && !beat.three))
        tell('เจนวิดีโอ AI จากรูปในไฟล์');
    tell(`พากย์เสียงครบ · กำลังออกแบบ ${beats.length} ฉากพร้อมกัน`);
    let designed = 0;
    const design = async (beat, index, last = false) => {
        if (under[index] || (beat.three?.idea && (await free3dAt[index])))
            return { name: '', snippet: '', duration: 0 };
        const pictures = [...new Set(beats.slice(index, index + (spans[index] ?? 0) + 1).flatMap((stop) => stop.assets))];
        const three = beat.three;
        if (three?.idea && !(three.kind === 'model' ? models[index] : three.kind === 'cards' ? (three.cards ?? []).length >= 2 : three.pictures?.length))
            delete beat.three;
        if (beat.clip && (beat.three || !(await moving[index])))
            delete beat.clip;
        const rendered = beat.blender ? await blendered[index] : null;
        if (beat.blender && !rendered)
            delete beat.blender;
        const over = Boolean((beat.footage && !beat.footage.behind) || beat.three || beat.clip || (rendered && !rendered.made.alpha));
        const blenderNote = rendered
            ? rendered.made.alpha
                ? `\n\nA 3D subject rendered with a transparent background stands in front of this scene (${beat.blender?.idea.slice(0, 300)}), filling the middle of the frame: this scene is the whole background behind it, a designed set that moves (the light, big type and graphics around and above it); fill the whole frame, and put nothing where the subject is.`
                : `\n\nUnder this scene a 3D render fills the frame (${beat.blender?.idea.slice(0, 300)}): keep the middle of the frame clear for it and never write its words again; add only small things at the edges (a label, a line, a chip).`
            : '';
        const out = beats[index + (spans[index] ?? 0) + 1]?.transition;
        const joins = [beat.transition, out].map((name) => (name && name !== 'cut' ? name : ''));
        const seam = !over && joins.some(Boolean)
            ? `\n\nThe editor joins the scenes itself${joins[0] ? `, bringing this one in by "${joins[0]}" over its first half second` : ''}${joins[1] ? `, taking it out by "${joins[1]}" over the half second after its end` : ''}: its ground and first element stand from 0 s (never an empty ground coming in), it makes no full-frame entrance or exit of its own, and the finished composition holds to the end.`
            : '';
        const sceneStart = lengths.slice(0, index).reduce((sum, length) => sum + length, 0);
        return composeScene(userId, role, projectId, {
            prompt: `${sceneSoundGuide(sceneStart, reach(index), filmDuration)}${continuousMotion() ? 'Use one persistent hero and a single camera rig in one coordinate system for this entire take. Keep them mounted the full duration. Animate their numerical pose continuously. Share end and start positions, tangent and speed between beats. Keep the hero visible in the first frame and through the final wordmark reveal. Start in motion; carry that momentum across every interior beat. ' : ''}${beat.show}${spans[index] && !beat.three ? `\n\nA journey: this one scene runs ${reach(index)} s through ${(spans[index] ?? 0) + 1} stops, one continuous piece (one camera move across one big composition, a trail of light drawing on from stop to stop, things handing over into the next), never cut into slides; the camera reaches each stop as it is said. ${stopsOf(index)}` : ''}${beat.three ? `\n\nUnder this scene a 3D shot already fills the frame (${beat.three.kind === 'model' ? `a 3D ${beat.three.search ?? 'object'} turning in the light` : beat.three.kind === 'screen' ? 'the app screen on a 3D phone' : beat.three.kind === 'cards' ? `3D cards that already read ${(beat.three.cards ?? []).map((card) => `"${card.title}"`).join(', ')}; at most a small headline at the top` : 'pictures circling on 3D cards'}): keep the middle of the frame clear for it and never write its words again; add only small things at the edges (a label, a line, a chip).` : ''}${beat.clip ? `\n\nUnder this scene a video of the picture assets/${beat.clip.picture} plays full frame, the real place moving${beat.clip.from ? ' (it is built up in a timelapse and ends on the picture)' : ''}: the scene is the titles and labels over it, never a background; keep the middle of the frame clear, words at the edges on a soft gradient so they read.` : ''}${blenderNote}${beat.footage?.behind ? '\n\nThe person in the footage is cut out of their background and stands in front of this scene, filling the middle of the frame from about a fifth of its height down to the bottom: this scene is the whole background behind them, a designed set that moves (the world, the light, big type and graphics around and above them); fill the whole frame, and put nothing where their face and body are.' : beat.footage?.audio === 'speech' ? '\n\nSomeone speaks to camera in the footage under this scene: their face and body fill the middle of the frame, so keep the frame from 12% to 66% of its height clear of everything (no card, chip or title across them); words go in a band above 12% or between 66% and 76%.' : ''}${seam}${words ? `\n\nThe facts of the user's files (names, prices, hours, places): every one on screen is copied exactly from here, and nothing (no product, feature, price, number, offer, store badge or download button) is added that it does not state:\n${words.slice(0, 2500)}` : ''}\n\nEvery word on screen is in the language of the voice-over. ${beat.say ? `The voice-over says at this moment (do not print it; captions carry it): "${beat.say}"` : beat.footage?.audio === 'speech' ? 'The person in the footage speaks here (captions carry it; do not print it).' : 'No voice-over here and no captions: the words on screen tell this beat (kinetic type on the music\'s beat), so show them.'}${sfx.length ? `\nSound effects you may use as <audio> clips: ${sfx.map((name) => `assets/${name}`).join(', ')}.` : ''}${pictures.length > 0 ? `\n${PICTURE_RULE}` : ''}`,
            seconds: reach(index),
            ...(reference ? { reference: reference.frames.filter((_, n, all) => n % Math.max(1, Math.floor(all.length / 4)) === 0).slice(0, 4).map((shot) => shot.preview) } : {}),
            ...(beat.say.trim() ? { said: spans[index] ? beats.slice(index, index + (spans[index] ?? 0) + 1).map((stop) => stop.say).join(' ') : beat.say } : {}),
            assets: [...pictures, ...sfx],
            look,
            facts: known,
            style: style.scene + filmStyle + (await style.recipes(beat.moves ?? [])) + (await startingBlock(userId, dir, beat.block)),
            ...(over ? { overlay: true } : {}),
            model: input.model,
            effort: input.effort,
            quick: input.quick,
            onNote: (note) => tell(`ฉาก ${index + 1}: ${note}`),
        })
            .then((scene) => {
            tell(`ออกแบบฉากเสร็จ ${++designed}/${beats.length}`);
            return scene;
        })
            .catch((error) => {
            tell(`ฉาก ${index + 1} ยังไม่สำเร็จ: ${(error instanceof Error ? error.message : String(error)).slice(0, 120)}`);
            return last ? cardScene(userId, projectId, over ? beat.say : beat.say || beat.show, reach(index), over).catch(() => null) : null;
        });
    };
    const tag3d = Math.random().toString(36).slice(2, 6);
    const assets3d = (beat, index) => ({
        ...(models[index]?.model ? { model: models[index]?.model } : {}),
        pictures: beat.three?.pictures ?? [],
        icons: (beat.three?.cards ?? []).map((card) => ({ title: card.title, line: card.line, picture: card.picture })),
    });
    if (known && !stretch)
        await sandbox.writeFiles(who(userId), dir, [{ path: FACTS, bytes: Buffer.from(known) }]).catch(() => undefined);
    const spans = beats.map(() => 0);
    const under = beats.map(() => false);
    beats.forEach((beat, index) => {
        if (under[index] || !beat.span)
            return;
        let gone = 0;
        while (gone < beat.span && index + gone + 1 < beats.length && !beats[index + gone + 1]?.footage)
            under[index + ++gone] = true;
        spans[index] = gone;
    });
    const reach = (index) => round(lengths.slice(index, index + (spans[index] ?? 0) + 1).reduce((sum, length) => sum + length, 0));
    const stopsOf = (index) => beats
        .slice(index, index + (spans[index] ?? 0) + 1)
        .map((stop, n) => `From ${round(lengths.slice(index, index + n).reduce((sum, length) => sum + length, 0))} s: ${stop.show}${stop.say ? ` (said: "${stop.say}")` : ''}${stop.assets.length > 0 ? ` (its pictures: ${stop.assets.map((name) => `assets/${name}`).join(', ')})` : ''}`)
        .join(' ');
    const free3dAt = beats.map((beat, index) => threeTurn(async () => {
        if (!beat.three?.idea || under[index])
            return null;
        const key = `${tag3d}-${index + 1}`;
        const stops = beats.slice(index, index + (spans[index] ?? 0) + 1);
        const idea = spans[index]
            ? `${beat.three.idea}\n\nA journey through ${stops.length} stops, the camera reaching each as it is said (captions carry the words; do not print them). ${stopsOf(index)}`
            : `${beat.three.idea}\n\nWhat the beat shows (its words are yours to show): ${beat.show}${beat.say ? `\nThe voice-over says (captions carry it; do not print it): "${beat.say}"` : ''}`;
        const brief = { idea, seconds: reach(index), frame: { width: w, height: h }, palette: palette ?? [], look, assets: assets3d(beat, index), facts: known, style: style.three + filmStyle, model: input.model, effort: input.effort };
        tell(`ฉาก ${index + 1}: ออกแบบ 3D`);
        const made = await designThree(userId, userId, role, projectId, key, brief, checkShot(key, brief.frame, brief.palette, brief.assets, brief.seconds)).catch(() => null);
        if (!made)
            return null;
        await sandbox.writeFiles(who(userId), `${dir}/compositions`, [{ path: `three-${key}.js`, bytes: Buffer.from(threeFile(made.code)) }]);
        tell(`ฉาก ${index + 1}: 3D เสร็จ`);
        return { key, words: made.words };
    }));
    const blenderTurn = turn(1);
    const blendered = beats.map((beat, index) => blenderTurn(async () => {
        if (!beat.blender || !blender || under[index])
            return null;
        const brief = {
            idea: `${beat.blender.idea}\n\nWhat the beat shows (its words are the editor's, not the render's): ${beat.show}${beat.say ? `\nThe voice-over says (captions carry it; do not print it): "${beat.say}"` : ''}`,
            seconds: reach(index),
            frame: { width: w, height: h },
            alpha: beat.blender.alpha,
            palette: palette ?? [],
            look,
            assets: beat.assets.filter((name) => /\.(png|jpe?g|webp)$/i.test(name)),
            search: beat.blender.search,
            facts: known,
            style: filmStyle,
            model: input.model,
            effort: input.effort,
        };
        tell(`ฉาก ${index + 1}: ออกแบบและเรนเดอร์ใน Blender`);
        const made = await designBlender(userId, userId, role, projectId, brief, blender, { onProgress: (detail) => tell(`ฉาก ${index + 1}: ${detail}`), signal: input.signal }).catch((error) => {
            tell(`ฉาก ${index + 1}: Blender ไม่สำเร็จ (${(error instanceof Error ? error.message : String(error)).slice(0, 120)}) · ใช้ฉากที่ออกแบบแทน`);
            return null;
        });
        const asset = made ? await blenderAsset(userId, projectId, made).catch(() => null) : null;
        return made && asset ? { made, asset } : null;
    }));
    const backdrop = (clip, index) => {
        const length = lengths[index] ?? 3;
        const rate = round(clip.duration / length);
        return { name: clip.name, snippet: `<video id="clip-tf-${index + 1}" class="lupo-fill" src="assets/${clip.name}" data-start="0" data-duration="${length}" data-media-start="0"${rate !== 1 ? ` data-playback-rate="${rate}"` : ''} data-track-index="0" data-fit="cover" playsinline muted data-volume="0"></video>`, duration: length };
    };
    const scenes = await Promise.all(beats.map((beat, index) => (transforms[index] ?? Promise.resolve(null)).then((clip) => (clip ? backdrop(clip, index) : sceneTurn(() => design(beat, index))))));
    const missing = scenes.filter((scene) => !scene).length;
    if (missing > 0)
        tell(`ลองออกแบบฉากที่ยังไม่ผ่านอีกครั้ง (${missing} ฉาก)`);
    await Promise.all(beats.map(async (beat, index) => {
        if (!scenes[index])
            scenes[index] = await sceneTurn(() => design(beat, index, true));
    }));
    const moved = await Promise.all(moving);
    const blenderDone = await Promise.all(blendered);
    const looked = scenes.map((scene, index) => {
        const beat = beats[index];
        const made = moved[index];
        const key = `look-${index + 1}`;
        if (!scene?.snippet || scene.snippet.startsWith('<video') || under[index] || beat?.footage?.behind)
            return null;
        if (beat?.footage) {
            const footage = beat.footage;
            return { ...scene, under: (start, seconds) => footageTag(footage, seconds, start, key) };
        }
        if (beat?.blender) {
            const got = blenderDone[index];
            return got && !got.made.alpha ? { ...scene, under: (start, seconds) => blenderTag(got.asset, false, seconds, start, key) } : null;
        }
        if (beat?.three) {
            const shot = threeClip(key, beat.three, { width: w, height: h }, palette ?? [], models[index]?.model);
            return { ...scene, under: shot.clip, script: shot.script };
        }
        return beat?.clip && made ? { ...scene, under: (start, seconds) => movedTag(made, seconds, start, key) } : scene;
    });
    await polish(userId, role, projectId, looked, lengths, input, tell).catch((error) => logger.warn('VIDEO_POLISH_FAILED', { error: error instanceof Error ? error.message : String(error) }));
    const freeKeys = await Promise.all(free3dAt);
    if (mattes.some((_, index) => beats[index]?.footage?.behind))
        tell('ตัดพื้นหลังคนในคลิป');
    const matted = await Promise.all(mattes);
    const soundOf = new Map(await Promise.all([...sounds].map(async ([name, made]) => [name, await made])));
    stop();
    tell('วางฉาก เสียงพากย์ ซับ และเพลงลงไทม์ไลน์');
    const index = await read();
    if (!stretch && hasVideo(index))
        throw new AppError('BAD_REQUEST', NOT_EMPTY);
    const placed = [];
    const scripts = [];
    const accent = accentOf(look);
    let at = stretch?.start ?? 0;
    const seams = [];
    let before = null;
    scenes.forEach((scene, position) => {
        if (!scene && !under[position] && ((beats[position]?.clip && moved[position]) || (beats[position]?.blender && blenderDone[position])))
            scenes[position] = { name: `clip-${position + 1}`, snippet: '', duration: 0 };
    });
    let head = -1;
    scenes.forEach((_, position) => {
        if (!under[position])
            head = position;
        else if (head >= 0 && !scenes[head])
            scenes[position] = null;
    });
    scenes.forEach((scene, position) => {
        if (!scene) {
            before = null;
            return;
        }
        let joined = false;
        const length = lengths[position] ?? 3;
        const footage = beats[position]?.footage;
        const offsets = lengths.slice(position, position + spans[position] + 1).map((_, n) => round(lengths.slice(position, position + n).reduce((sum, value) => sum + value, 0)));
        const marked = continuousMotion() && scene.snippet && !under[position]
            ? scene.snippet.replace('data-composition-src=', `data-continuous-beats="${offsets.join(',')}" data-composition-src=`)
            : scene.snippet;
        const snippet = marked.replace(/data-start="[^"]*"/, `data-start="${round(at)}"`).replace(/data-duration="[^"]*"/, `data-duration="${reach(position)}"`);
        const group = [];
        const put = (html) => {
            const tag = /^<[^>]*>/.exec(html)?.[0] ?? '';
            const id = /\sid="([^"]+)"/.exec(tag)?.[1] ?? `scene-${position + 1}`;
            placed.push(tag.includes(' id="') ? html : html.replace(/^<([a-z]+)/, `<$1 id="${id}"`));
            group.push({ index: placed.length - 1, id });
        };
        let track = 1;
        if (under[position]) {
        }
        else if (footage) {
            const { speed, from } = stretchOf(footage, length);
            const key = `ft-${position + 1}`;
            const rate = speed !== 1 ? ` data-playback-rate="${speed}"` : '';
            const timing = `data-start="${round(at)}" data-duration="${length}" data-media-start="${from}"${rate}`;
            const matte = matted[position];
            if (footage.behind && snippet)
                put(snippet.replace(/^<([a-z]+)/, '<$1 style="isolation:isolate"'));
            put(matte
                ? `<video id="clip-${key}" class="lupo-fill" src="assets/${matte}" data-start="${round(at)}" data-duration="${length}" data-media-start="0"${rate} data-track-index="1" data-fit="cover" data-link="${key}" playsinline muted data-volume="0"></video>`
                : footageTag(footage, length, round(at), key));
            if (footage.audio !== 'off')
                placed.push(`<audio id="clip-${key}-sound" src="assets/${soundOf.get(footage.name) ?? footage.name}" ${timing} data-track-index="12" data-volume="${footage.audio === 'speech' ? 1 : CLIP_UNDER_VOICE}" data-link="${key}"></audio>`);
            if (!footage.behind && snippet)
                put(snippet.replace('data-track-index="0"', 'data-track-index="1"'));
            if (footage.audio === 'speech')
                cuesOf(clipTranscripts.get(footage.name) ?? '')
                    .filter((cue) => cue.end > from && cue.start < from + length)
                    .forEach((cue, n) => {
                    const start = Math.max(cue.start, from);
                    placed.push(...captionsFor(cue.text, at + start - from, Math.min(cue.end, from + length) - start, `${key}-${n + 1}`, accent));
                });
        }
        else if (beats[position]?.blender && blenderDone[position]) {
            const got = blenderDone[position];
            const key = `bl-${position + 1}`;
            if (got.made.alpha && snippet)
                put(snippet.replace(/^<([a-z]+)/, '<$1 style="isolation:isolate"'));
            put(blenderTag(got.asset, got.made.alpha, reach(position), round(at), key));
            placed.push(...wordClips(key, got.made.words, round(at)));
            if (!got.made.alpha && snippet)
                put(snippet.replace('data-track-index="0"', 'data-track-index="1"'));
        }
        else if (beats[position]?.three) {
            const made3d = models[position];
            const free = freeKeys[position];
            const shot = free
                ? freeThreeClip(free.key, { width: w, height: h }, palette ?? [], assets3d(beats[position], position), { file: `compositions/three-${free.key}.js` })
                : threeClip(`${position + 1}`, beats[position]?.three, { width: w, height: h }, palette ?? [], made3d?.model);
            put(shot.clip(round(at), reach(position)));
            if (free)
                placed.push(...wordClips(free.key, free.words, round(at)));
            if (scene.snippet)
                put(snippet.replace('data-track-index="0"', 'data-track-index="1"'));
            scripts.push(shot.script);
        }
        else if (beats[position]?.clip && moved[position]) {
            put(movedTag(moved[position], length, round(at), `mv-${position + 1}`));
            if (snippet)
                put(snippet.replace('data-track-index="0"', 'data-track-index="1"'));
        }
        else {
            track = before?.track === 0 ? 1 : 0;
            put(snippet.replace('data-track-index="0"', `data-track-index="${track}"`));
        }
        const into = beats[position]?.transition;
        if (!under[position]) {
            const alone = !(footage || beats[position]?.three || (beats[position]?.clip && moved[position]) || (beats[position]?.blender && blenderDone[position]));
            const held = before && before.end === round(at) && group.length > 0 && into ? before : null;
            const seam = !held
                ? null
                : held.alone && alone
                    ? transitionTweens(into ?? '', `#${held.parts[0]?.id}`, `#${group[0]?.id}`, at, { width: w, height: h })
                    : into !== 'cut'
                        ? { seconds: 0.5, tweens: [`tl.fromTo(${JSON.stringify(group.map((part) => `#${part.id}`).join(','))},{opacity:0},{opacity:1,duration:0.5,ease:"power2.inOut",immediateRender:false},${round(at)});`] }
                        : null;
            if (seam && held) {
                joined = true;
                for (const part of held.parts)
                    placed[part.index] = (placed[part.index] ?? '').replace(/data-duration="([^"]*)"/, (_, seconds) => `data-duration="${round(Number(seconds) + seam.seconds)}"`);
                seams.push(...seam.tweens);
            }
            before = group.length > 0 ? { parts: group, alone, track, end: round(at + reach(position)) } : null;
        }
        if (!joined && !under[position] && at > 0 && into && into !== 'cut') {
            const sweep = lightSweep(`${position + 1}`, at, accent);
            placed.push(sweep.clip);
            seams.push(sweep.tween);
        }
        const voice = voices[position];
        if (voice) {
            const key = voice.name.replace(/\.\w+$/, '');
            placed.push(`<audio id="vo-${key}" src="assets/${voice.name}" data-start="${round(at + 0.15)}" data-duration="${round(voice.duration ?? 0)}" data-track-index="10" data-volume="1"></audio>`);
            placed.push(...captionsFor(beats[position]?.say ?? '', at + 0.15, voice.duration ?? length - 0.15, key, accent));
        }
        at += length;
    });
    if (song) {
        const bed = await sandbox
            .exec(who(userId), {
            command: `ffmpeg -y -v error -i "${song.path}" -t ${round(at + 0.5)} -af "afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, round(at - 2))}:d=2" -c:a libmp3lame -q:a 4 "${dir}/assets/music-bed.mp3"`,
            timeoutMs: 60_000,
        })
            .catch(() => null);
        if (song?.temp)
            await sandbox.exec(who(userId), { command: `rm -f "${song.path}"`, timeoutMs: 15_000 }).catch(() => undefined);
        if (bed?.exitCode === 0) {
            placed.push(`<audio id="music-bed" src="assets/music-bed.mp3" data-start="0" data-duration="${round(at)}" data-track-index="11" data-volume="${MUSIC_VOLUME}"></audio>`);
            if (song?.credit)
                await addCredit(userId, projectId, `music-bed.mp3: ${song.credit}`).catch(() => undefined);
        }
    }
    if (seams.length > 0)
        scripts.push(`<script id="lupo-seams">(function(){var tl=window.__timelines&&window.__timelines["main"];if(!tl)return;${seams.join('')}})();</script>`);
    if (!placed.some((clip) => clip.includes('data-composition-src') || clip.includes('id="clip-mv-') || clip.includes('id="clip-bl-')))
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-make-scenes', message: 'No scene could be designed.' });
    const tag = Math.random().toString(36).slice(2, 6);
    if (seams.length > 0 && stretch)
        scripts[scripts.length - 1] = (scripts.at(-1) ?? '').replace('<script id="lupo-seams">', `<script id="lupo-seams-${tag}">`);
    await sandbox.writeFiles(who(userId), dir, [
        { path: 'index.html', bytes: Buffer.from(stretch ? splicedTimeline(index, stretch, { clips: placed, scripts, end: at }, tag) : placedOnTimeline(index, placed, at, scripts)) },
        ...(stretch ? [] : [{ path: LOOK, bytes: Buffer.from(JSON.stringify({ look, film })) }]),
    ]);
    await sandbox
        .exec(who(userId), {
        command: `cd "${dir}" && rm -f assets/*.pcm; { ! grep -lq data-requires-webgpu compositions/*.html 2>/dev/null || grep -q data-requires-webgpu index.html || sed -i '0,/data-composition-id="main"/s//data-composition-id="main" data-requires-webgpu/' index.html; }; true`,
        timeoutMs: 30_000,
    })
        .catch(() => undefined);
    const credit = song?.credit ? ` The music is "${song.credit}": tell the user to credit it like that wherever they post the video (its licence asks for it).` : '';
    const effects = plannedEffects()?.length ?? await sandbox
        .exec(who(userId), { command: `cd "${dir}" && cat compositions/*.html 2>/dev/null | grep -o 'assets/sfx-' | wc -l`, timeoutMs: 15_000 })
        .then((done) => Number.parseInt(done.stdout.trim(), 10) || 0, () => 0);
    return {
        next: `The editor placed and checked everything. Tell the user now what was made and how long it is; do not read files or run check/lint to verify.${credit}`,
        seconds: stretch ? round(stretch.total + at - stretch.end) : round(at),
        ...(stretch ? { remade: { from: stretch.start, to: round(at), replaced: `${stretch.start}–${stretch.end} s` } } : {}),
        look,
        ...(song?.credit ? { music: song.credit } : {}),
        sound: { voiceOver: voices.filter(Boolean).length, musicBed: placed.some((clip) => clip.includes('id="music-bed"')), soundEffects: effects },
        beats: beats.map((beat, position) => ({ say: beat.say, scene: scenes[position]?.name ?? 'left out: its scene could not be designed', voice: scenes[position] && voices[position] ? `assets/${voices[position]?.name}` : null, seconds: lengths[position], ...(beat.clip ? { aiClip: moved[position] ? (beat.clip.from ? 'timelapse ending on the file picture' : 'the file picture in motion') : 'not made: designed scene instead' } : {}) })),
    };
}
