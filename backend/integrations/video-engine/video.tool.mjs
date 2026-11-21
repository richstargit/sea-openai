import { z } from "zod"
import { defineTool } from "./runtime.mjs"
import { AppError } from "./runtime.mjs"
import { aiVideoStatus, CAMERA_MOVES, placeAsset, replaceClip, placeBlender, placeCaptions, placePresenter, startAiRestyle, startAiVideo, startAvatarVideo, startLipsync } from "./ai-video.service.mjs"
import { blenderAsset, blenderLink, blenderStatus, designBlender, projectFrame } from "./blender-designer.mjs"
import { drawnImage, webImage } from "./video-images.service.mjs"
import { studioChatProject } from "./runtime.mjs"
import { listLibraryFiles } from "./runtime.mjs"
import { addAsset, addBlock, composeScene, createProject, ensureSfx, listBlocks, SCENE_MAX_SECONDS, transcribeAsset } from "./video-studio.service.mjs"
import { CLONED_VOICE, speakText, VOICES } from "./runtime.mjs"
import { addMusic, findMusic, rememberedTrack, rememberTracks } from "./music.service.mjs"
const voiceName = z.union([z.enum(VOICES), z.string().regex(CLONED_VOICE)]);
import { linksIn, makeVideo, reshapeThree, reviewVideo } from "./video-make.service.mjs"
import { withoutNickname } from "./runtime.mjs"
import { ATTACHMENT_ID } from "./runtime.mjs"
const projectId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);
const assetName = z.string().regex(/^[A-Za-z0-9._-]{1,120}$/);
const VEO_WAIT_MS = 10 * 60_000;
const AVATAR_WAIT_MS = 20 * 60_000;
async function onlyItsProject(threadId, project) {
    if ((await studioChatProject(threadId)) !== project)
        throw new AppError('FORBIDDEN', { key: 'af-video-chat-other-project' });
}
const WEB_IMAGE = defineTool({
    id: 'video_web_image',
    description: "Find a real, freely licensed photo on Wikimedia Commons for the words and put it in the assets/ folder of the user's video project (its licence and author go to the project's credits.txt). Use it when a scene needs a real photo of a place, landmark, product kind or public thing. `query`: a short search phrase in English. Returns the file's path (assets/NAME), or null when nothing usable was found.",
    input: z.object({ projectId, query: z.string().min(2).max(120) }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const found = await webImage(ctx.userId, input.projectId, input.query);
        return { path: found ? `assets/${found.name}` : null };
    },
    project: (result) => result,
});
const DRAW_IMAGE = defineTool({
    id: 'video_draw_image',
    description: "Draw a picture with the image model into the assets/ of the user's video project, optionally building on up to 4 pictures of the project (`references`: file names in assets/: a product, a face, a style). `cutout`: the subject on a transparent background (a logo, sticker or person to lay on a clip). `palette`: hex colours of the video, for the picture to match. Returns the file's path (assets/NAME), or null when it could not be drawn.",
    input: z.object({
        projectId,
        prompt: z.string().min(3).max(2000),
        references: z.array(assetName).max(4).optional(),
        cutout: z.boolean().optional(),
        palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(5).optional(),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const drawn = await drawnImage(ctx.userId, ctx.role, ctx.userId, input.projectId, input.prompt, input.references ?? [], {
            ...(input.cutout ? { cutout: true } : {}),
            ...(input.palette ? { palette: input.palette } : {}),
        });
        return { path: drawn ? `assets/${drawn.name}` : null };
    },
    project: (result) => result,
});
const VOICE = defineTool({
    id: 'video_voice',
    description: `Speak a text with an OpenAI voice and put the mp3 into the assets/ of the user's video project, for a voice-over (place it as an <audio> clip). \`voice\`: one of ${VOICES.join(', ')}, or the user's cloned voice id (voice_...) when they chose their own voice. Returns the file's path (assets/NAME) and its length in seconds: the scene it narrates should last that long.`,
    input: z.object({ projectId, text: z.string().min(1).max(4000), voice: voiceName }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const sound = await speakText(ctx.userId, ctx.role, input.projectId, { text: await withoutNickname(ctx.userId, input.text, ctx.said), voice: input.voice });
        return { path: `assets/${sound.name}`, seconds: sound.duration };
    },
    project: (result) => result,
});
const VEO = defineTool({
    id: 'video_veo_clip',
    description: `Make one AI video clip (Google's Gemini Omni Flash, the successor of Veo: 1080p, with its own sound) and put it into the assets/ of the user's video project, framed like the project (9:16 or 16:9); it takes a minute or two and is billed to the user. \`seconds\`: 3 to 10. \`camera\`: one of ${CAMERA_MOVES.join(', ')}. \`image\`: a picture of the project (file name in assets/) to start the shot from (its first frame); to chain shots, start the next from the last frame of the one before. \`end_image\`: a picture of the project the shot ends on (its last frame), only with \`image\`: the model fills the change between the two, for a transformation (a construction timelapse from bare ground to the finished tower, a before and after, an empty room furnished); draw both of the same place and framing. Describe subject and action, setting, light and mood; never ask for text or logos in the shot. Returns the clip's path (assets/NAME) and length.`,
    input: z.object({
        projectId,
        prompt: z.string().min(3).max(2000),
        seconds: z.number().int().min(3).max(10),
        camera: z.string().max(30).default('push-in'),
        image: assetName.optional(),
        end_image: assetName.optional(),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const { jobId } = await startAiVideo(ctx.userId, ctx.role, input.projectId, { prompt: input.prompt, seconds: input.seconds, camera: input.camera, image: input.image, endImage: input.end_image });
        return waitForClip(ctx, input.projectId, jobId);
    },
    project: (result) => result,
});
async function waitForClip(ctx, projectId, jobId) {
    const until = Date.now() + VEO_WAIT_MS;
    while (Date.now() < until) {
        ctx.signal?.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await aiVideoStatus(ctx.userId, ctx.role, projectId, jobId);
        if (status.state === 'done')
            return { path: `assets/${status.asset.name}`, seconds: status.asset.duration };
        if (status.state === 'failed')
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-refused', message: status.message });
    }
    throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-timeout' });
}
const RESTYLE = defineTool({
    id: 'video_restyle',
    description: "Make a video of the project look the way the words say while it keeps its motion and camera exactly (Gemini Omni's edit; billed per second of the result, the user's). This is the Blender + AI workflow: Blender sets the shot for free (shapes, blocking, camera move, timing) and this paints it (photoreal materials, glass, metal, skin, light, atmosphere), so the AI never spends tries guessing the camera. `source`: the video in the project's assets/ (the path video_blender returned, without the assets/ prefix), 15 seconds at most: a longer guide is rendered in parts of up to 15 seconds and each part restyled. `prompt`: in English, the look (the materials and what each should look like, the light, the lens, the mood) AND the action and the camera move in plain words, beat by beat (\"he crouches, then jumps and raises the ball above his head, the camera orbits to the side\"): the model follows a guide only loosely, and where the words leave the action out it repaints one of its own (a guide of a jump came back as a man dribbling in place); say what to KEEP (the camera move, the layout, the timing); never ask for text or logos. A guide that is clean and well lit is enough: it needs no detail, since the AI adds it. `lock`: how the guide is kept. \"auto\" (the default) redraws the guide's FIRST and LAST frame as photographs (they hold the pose and the place exactly) and has the model make the shot between them: for a guide of 10 seconds at most, and the right choice when an action must happen (a jump, a hit, a turn); \"video\" sends the whole video to the model's edit (up to 15 seconds), which keeps the camera but follows the action loosely. Billed on top: two pictures with \"frames\". Takes a few minutes. Returns the new clip's path (assets/NAME) and length. If `source` was on the timeline (a Blender shot is placed by video_blender itself) the new clip takes its place there, same start and track, with the AI's sound: do not place it again. Only when `replaced` is 0 is the clip not on the timeline yet: put it there with video_place.",
    input: z.object({
        projectId,
        source: assetName,
        prompt: z.string().min(3).max(2000),
        lock: z.enum(['auto', 'frames', 'video']).default('auto'),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const { jobId } = await startAiRestyle(ctx.userId, ctx.role, input.projectId, { source: input.source, prompt: input.prompt, lock: input.lock });
        const made = await waitForClip(ctx, input.projectId, jobId);
        const replaced = await replaceClip(ctx.userId, input.projectId, input.source, { name: made.path.replace(/^assets\//, ''), duration: made.seconds });
        return { ...made, replaced };
    },
    project: (result) => result,
});
const VEO_SET = defineTool({
    id: 'video_veo_clips',
    description: 'Make several AI video clips at once, side by side (same fields as video_veo_clip for each, `image` the first frame and `end_image` the last for a transformation): for shots that do not start from each other\'s last frame, so five shots take about as long as one. To chain shots (each from the last frame of the one before), use video_veo_clip one by one instead. Returns each clip\'s path (or its error) in the order given.',
    input: z.object({
        projectId,
        clips: z.array(z.object({ prompt: z.string().min(3).max(2000), seconds: z.number().int().min(3).max(10), camera: z.string().max(30).default('push-in'), image: assetName.optional(), end_image: assetName.optional() })).min(1).max(6),
    }),
    sideEffect: 'write',
    approval: 'never',
    run: (ctx, input) => sideBySide(ctx, VEO, input.projectId, input.clips),
    project: (result) => result,
});
const MUSIC_SEARCH = defineTool({
    id: 'video_music_search',
    description: "Find background music the video may use commercially (Openverse: Jamendo, ccMixter ... under CC0, CC BY or CC BY-SA). `genres`: one to three SINGLE English words, since a phrase finds almost nothing: pick them to fit the video and vary them from one video to the next, never the same genre for every promo. What works well: electronic, dance, techno, energetic, upbeat, hiphop, drill, trap, funk, rock, pop (for a fast TikTok or Reels promo, a launch, a hype cut); cinematic, epic, trailer (a brand film, a reveal, a big title); ambient, lofi, chill (calm, explainers, tutorials, a quiet product shot). Returns up to 10 tracks with an `id`, title, creator, licence, length and tags; read the choice to the user in one line, and put the one you pick in the project with video_music_add. `seconds`: the least length wanted (default 20).",
    input: z.object({ genres: z.array(z.string().max(20)).min(1).max(3), seconds: z.number().int().min(5).max(300).default(20) }),
    sideEffect: 'read',
    approval: 'never',
    async run(ctx, input) {
        const tracks = await findMusic(input.genres, input.seconds, 10);
        rememberTracks(ctx.userId, tracks);
        return { tracks: tracks.map(({ url: _url, page: _page, ...track }) => ({ ...track, needsCredit: track.license !== 'CC CC0' })), ...(tracks.length === 0 ? { next: 'Nothing found: try one other single genre word (electronic, upbeat, cinematic, ambient).' } : {}) };
    },
    project: (result) => result,
});
const MUSIC_ADD = defineTool({
    id: 'video_music_add',
    description: "Put a track found by video_music_search (its `id`) into the project's assets/ and write its credit where the licence asks. Returns the file's path (assets/NAME), its length and, for CC BY and CC BY-SA, the `credit` line: tell the user to give that credit wherever they post the video. Then lay it on the timeline with video_place (track 10, it plays under everything) and keep it quiet under speech and effects: volume 0.2 to 0.4 in a scene or on the clip; cut or fade it to the length of the video.",
    input: z.object({ projectId, id: z.string().min(1).max(80) }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const track = rememberedTrack(ctx.userId, input.id);
        if (!track)
            throw new AppError('BAD_REQUEST', { key: 'af-video-music-unknown', message: 'Search for the track first (video_music_search) and use its id; the search is remembered for half an hour.' });
        const added = await addMusic(ctx.userId, input.projectId, track);
        return { path: `assets/${added.name}`, seconds: added.seconds, title: track.title, ...(added.credit ? { credit: added.credit } : {}) };
    },
    project: (result) => result,
});
const PLACE = defineTool({
    id: 'video_place',
    description: "Put a file of the project's assets/ on the timeline as it is: a picture, a clip or a sound that a tool made (video_draw_image, video_voice, video_veo_clip, video_web_image) or the user gave. `file`: the name in assets/, or the .html filename in compositions/ for a scene or block. `start`: second to start at (after what is already on the timeline when left out). `seconds`: how long it stays (a clip or sound: its own length; a picture: 3). `track`: a higher number is on top (pictures and clips 1, sounds 10). `sound`: true to keep a clip's own sound. The timeline grows to hold it. Returns its id, start and length. Use it for everything you make by hand, so nothing stays unplaced in assets/.",
    input: z.object({
        projectId,
        file: assetName,
        start: z.number().min(0).max(36000).optional(),
        seconds: z.number().min(0.2).max(3600).optional(),
        track: z.number().int().min(0).max(30).optional(),
        sound: z.boolean().optional(),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        return placeAsset(ctx.userId, input.projectId, { file: input.file, start: input.start, seconds: input.seconds, track: input.track, sound: input.sound });
    },
    project: (result) => result,
});
const AVATAR = defineTool({
    id: 'video_avatar_clip',
    description: "Make a presenter clip with HeyGen: a person says `script` on camera, with their lips in sync (a talking head for an explainer, a host for a promo, a spokesperson). Cast the person for this piece: `look` describes who to draw (age, gender, ethnicity, outfit, setting: a chef in a kitchen for a food shop, a doctor for a clinic), or `image` is a picture of a person already in assets/ (one from video_draw_image or video_web_image, or the user's own); give `voice` with either, a Gemini voice of the person's gender (women: Zephyr, Kore, Leda, Aoede, Callirrhoe, Autonoe, Despina, Erinome, Laomedeia, Achernar, Gacrux, Pulcherrima, Vindemiatrix, Sulafat; men: Puck, Charon, Fenrir, Orus, Enceladus, Iapetus, Umbriel, Algieba, Algenib, Rasalgethi, Alnilam, Schedar, Achird, Zubenelgenubi, Sadachbia, Sadaltager). Leave both out only when the user wants the account's own avatar. Write the script in the language the user wants spoken, as it should be said, at most about 300 words. It takes a few minutes and is billed to the user. It places the clip on the timeline itself (after what is there, full frame, track 1) with captions of the script, and returns its path (assets/NAME), start and length: never place it again or add captions; to make it a bubble in a corner, edit that <video> element.",
    input: z.object({
        projectId,
        script: z.string().min(2).max(2400),
        look: z.string().min(3).max(600).optional(),
        image: assetName.optional(),
        voice: voiceName.optional(),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const script = await withoutNickname(ctx.userId, input.script, ctx.said);
        const { jobId } = await startAvatarVideo(ctx.userId, ctx.role, input.projectId, { ...input, script });
        const until = Date.now() + AVATAR_WAIT_MS;
        while (Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 8000));
            const status = await aiVideoStatus(ctx.userId, ctx.role, input.projectId, jobId);
            if (status.state === 'done') {
                const placed = await placePresenter(ctx.userId, input.projectId, status.asset, script);
                return { path: `assets/${status.asset.name}`, ...placed, next: 'The clip is on the timeline with its captions. Tell the user now; do not place it again, add captions or read files to check.' };
            }
            if (status.state === 'failed')
                throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-refused', message: status.message });
        }
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-timeout' });
    },
    project: (result) => result,
});
const THREE_SHOT = defineTool({
    id: 'video_3d',
    description: "Design a 3D shot of the video freely (Three.js: products, cards with 3D icons, voxel dioramas, kinetic 3D words, phones with UI, particles, camera moves), or change a 3D shot already in it. `change`: what to make, or what to change, in your words as a motion designer would brief it; `clip`: the id of a 3D clip on the timeline (clip-3d-…) to change it; without `clip` a new 3D shot is added after what is there, `seconds` long. Each 3D shot is its own file (compositions/three-<key>.js) that the user can edit too. Takes a minute or two.",
    input: z.object({ projectId, change: z.string().min(3).max(1500), clip: z.string().max(60).optional(), seconds: z.number().min(2).max(20).optional() }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const done = await reshapeThree(ctx.userId, ctx.role, input.projectId, { change: input.change, clip: input.clip, seconds: input.seconds, model: ctx.model, effort: ctx.effort });
        return { ...done, next: 'The 3D shot is in the video. Tell the user; do not render or read files to check.' };
    },
    project: (result) => result,
});
const BLENDER_STATUS = defineTool({
    id: 'video_blender_status',
    description: "Ask the user's own computer about Blender: is astraflow-connect running there, is Blender installed, its version and the GPU it renders with (METAL, CUDA, OPTIX, HIP, ONEAPI or CPU). Call it before video_blender when you are not sure; when Blender is missing, tell the user to install it from blender.org (free) and to keep astraflow-connect running. `device`: the computer's name when the user has several online.",
    input: z.object({ device: z.string().trim().min(1).max(100).optional() }),
    sideEffect: 'read',
    approval: 'never',
    async run(ctx, input) {
        const found = await blenderStatus(ctx.userId, input.device).catch((error) => {
            if (error instanceof AppError && error.key === 'af-local-device-offline')
                return null;
            throw error;
        });
        if (!found)
            return { connected: false, installed: false, next: 'No computer of the user is connected: tell them to run astraflow-connect on the computer that has Blender, then try again.' };
        if (!found.ready)
            return { connected: true, installed: false, next: 'Their computer runs no Blender server: tell them to update astraflow-connect (npm i -g astraflow-connect) and start it again.' };
        return { connected: true, ...found.status, ...(found.status?.installed ? {} : { next: 'Blender is not installed on their computer: tell them to install it from blender.org (free).' }) };
    },
    project: (result) => result,
});
const BLENDER = defineTool({
    id: 'video_blender',
    description: "Make a shot in Blender on the USER's own computer (it needs astraflow-connect running there and Blender installed; check with video_blender_status when unsure) and put it on the timeline. Free-form: describe anything Blender does in `idea` (as long as you like): a product or model spinning on a transparent background, a glass, metal or clay render, a product on a set, a long cinematic animation, a camera fly-through of a room or a world, 3D motion graphics. For a photoreal or glossy look, render a cheap guide here (EEVEE, 15 seconds at most; it only has to carry the camera move, the timing and the shapes, not look finished) and then make it beautiful with video_restyle: that is cheaper than asking the AI video model for the camera move. A guide the AI repaints must be easy to read: say in `idea` that the subject fills at least half the frame, the action shows in every frame (a jump: crouch, rise, apex, landing) and nothing jumps or cuts; the first and last frame of the guide are what video_restyle redraws as photographs, so make them the key poses (a jump shot starts in the crouch and ends at the apex); use `scale` 0.75 or more, since a small blurry figure is repainted as a different pose. A 3D artist writes the Blender script, looks at preview frames and fixes it, then renders. `seconds`: its length (any, default 6). `alpha`: true for a transparent background (a subject laid over other footage: a webm with alpha on track 1), false for a whole frame (an mp4), 'auto' (default) lets the artist decide. `fps` (default 24), `scale` (the render's size against the project's frame, default 1; lower it for a quick draft), `output` (video, still, or png-sequence: an archive, not placed), `assets`: files of the project's assets/ (pictures, .glb models) the script may use, `model`: English words for a free real 3D model to fetch (\"sneaker\"). `start`: second to start at (after what is there by default). The render runs on their computer and can take minutes to hours by how rich it is: it is followed here and the progress shown; tell the user it is running, and do not start it twice. It places the clip itself (with the words it wrote) and returns its path, start and length: never place it again. Not for text-only or UI scenes (video_scene), nor when the user has no Blender: Three.js (video_3d) does simple 3D with nothing to install.",
    input: z.object({
        projectId,
        idea: z.string().min(3),
        seconds: z.number().positive().default(6),
        alpha: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        fps: z.number().int().positive().default(24),
        scale: z.number().positive().default(1),
        output: z.enum(['video', 'still', 'png-sequence']).default('video'),
        assets: z.array(assetName).optional(),
        model: z.string().regex(/^[A-Za-z][A-Za-z -]{1,59}$/).optional(),
        start: z.number().min(0).optional(),
        device: z.string().trim().min(1).max(100).optional(),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const link = await blenderLink(ctx.userId, input.device);
        const brief = {
            idea: await withoutNickname(ctx.userId, input.idea, ctx.said),
            seconds: input.seconds,
            fps: input.fps,
            scale: input.scale,
            output: input.output,
            frame: await projectFrame(ctx.userId, input.projectId),
            ...(input.alpha === 'auto' ? {} : { alpha: input.alpha }),
            assets: input.assets,
            search: input.model,
            model: ctx.model,
            effort: ctx.effort,
        };
        const made = await designBlender(ctx.userId, ctx.userId, ctx.role, input.projectId, brief, link, { onProgress: (detail) => ctx.reportActivity?.(detail, 'video_blender'), signal: ctx.signal });
        const asset = await blenderAsset(ctx.userId, input.projectId, made);
        if (!asset)
            return { fileId: made.fileId, name: made.name, next: 'The PNG sequence is an archive in the user\'s library (not media): tell them its name now and call no other tool; it is not on the timeline.' };
        const placed = await placeBlender(ctx.userId, input.projectId, { asset, alpha: made.alpha, words: made.words, start: input.start });
        return { path: `assets/${asset.name}`, ...placed, alpha: made.alpha, width: made.width, height: made.height, fps: made.fps, next: 'The Blender shot is on the timeline and that was the whole task. Tell the user now in a sentence or two and call no other tool: nothing on their computer (no find, no files, no shell), no second render, no placing it again.' };
    },
    project: (result) => result,
});
const LIPSYNC = defineTool({
    id: 'video_lipsync_clip',
    description: "Make a person in a video of the project say a new sound track with their lips in sync (HeyGen lipsync): dub a talking clip into another language (make the voice with video_voice first), fix a line, or put a script in the mouth of a filmed presenter. `video`: the clip (file name in assets/, a face on camera); `audio`: the sound to speak (file name in assets/). Takes a few minutes, billed to the user. Returns the new clip's path (assets/NAME) to put in place of the old one.",
    input: z.object({ projectId, video: assetName, audio: assetName }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const { jobId } = await startLipsync(ctx.userId, ctx.role, input.projectId, { video: input.video, audio: input.audio });
        const until = Date.now() + AVATAR_WAIT_MS;
        while (Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 8000));
            const status = await aiVideoStatus(ctx.userId, ctx.role, input.projectId, jobId);
            if (status.state === 'done')
                return { path: `assets/${status.asset.name}`, seconds: status.asset.duration };
            if (status.state === 'failed')
                throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-refused', message: status.message });
        }
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-video-ai-timeout' });
    },
    project: (result) => result,
});
const LIBRARY_SEARCH = defineTool({
    id: 'video_library_search',
    description: "Search the user's own library of files (pictures, clips, sounds they uploaded or generated before) by part of the name or by kind (image, video, audio); empty `query` lists the newest. Returns up to 30 files with their `fileId`, to put into the project with video_library_add.",
    input: z.object({ query: z.string().max(80).optional(), kind: z.enum(['image', 'video', 'audio']).optional() }),
    sideEffect: 'read',
    approval: 'never',
    async run(ctx, input) {
        const words = (input.query ?? '').trim().toLowerCase();
        const files = (await listLibraryFiles(ctx.userId))
            .filter((file) => (!input.kind || file.kind === input.kind) && (!words || file.fileName.toLowerCase().includes(words)))
            .slice(0, 30);
        return { files: files.map((file) => ({ fileId: file.publicId, name: file.fileName, kind: file.kind, origin: file.origin, createdAt: file.createdAt })) };
    },
    project: (result) => result,
});
const LIBRARY_ADD = defineTool({
    id: 'video_library_add',
    description: "Put a file of the user's library (a `fileId` from video_library_search) into the assets/ of the video project, to use in a scene or place on the timeline. Returns its path (assets/NAME) and, for a clip or sound, its length in seconds.",
    input: z.object({ projectId, fileId: z.string().min(1).max(128) }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const asset = await addAsset(ctx.userId, input.projectId, input.fileId);
        return { path: `assets/${asset.name}`, kind: asset.kind, seconds: asset.duration };
    },
    project: (result) => result,
});
const BLOCKS_SEARCH = defineTool({
    id: 'video_blocks_search',
    description: "Search HyperFrames' registry of ready-made effects, transitions, charts, captions and scenes (the editor's Effects and Blocks) by words in the name, title, description or tags. Returns up to 15 with their `name`, to install with video_block_add.",
    input: z.object({ query: z.string().min(2).max(80) }),
    sideEffect: 'read',
    approval: 'never',
    async run(ctx, input) {
        const words = input.query.toLowerCase().split(/\s+/).filter(Boolean);
        const found = (await listBlocks(ctx.userId))
            .filter((block) => words.every((word) => `${block.name} ${block.title} ${block.description} ${block.tags.join(' ')}`.toLowerCase().includes(word)))
            .slice(0, 15);
        return { blocks: found.map((block) => ({ name: block.name, type: block.type, title: block.title, description: block.description, seconds: block.duration })) };
    },
    project: (result) => result,
});
const BLOCK_ADD = defineTool({
    id: 'video_block_add',
    description: "Install a registry block into the video project (its files go into the project). Returns `snippet`: the element that places it on the timeline; put it into index.html with data-start, data-duration and data-track-index (and the block's own composition id) where it should play.",
    input: z.object({ projectId, name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/) }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        return await addBlock(ctx.userId, input.projectId, input.name);
    },
    project: (result) => result,
});
const SCENE = defineTool({
    id: 'video_scene',
    description: `Have the editor's scene designer write one HyperFrames scene for the video project: a sub-composition file in the editor's exact format (every element its own clip, readable animation), layered, typeset and animated like a promo. This is how every scene is written; do not hand-write scene files. \`prompt\`: the full brief for the scene: its message, the exact words to show (in the user's language), layout, colours and mood, what each beat does. \`seconds\`: its length (3 to ${SCENE_MAX_SECONDS}). \`assets\`: files of the project (names in assets/, at most 12) to use in it. \`overlay\`: true for a graphic layer laid over footage (no background of its own). \`look\`: the design direction (palette hexes, mood, type feel) shared by every scene of the video: give the same one each time. Returns \`snippet\`: the element that places the scene; put it into index.html's root and set its data-start and data-track-index (the scene file is already written).`,
    input: z.object({
        projectId,
        prompt: z.string().min(3).max(4000),
        seconds: z.number().min(3).max(SCENE_MAX_SECONDS),
        assets: z.array(assetName).max(12).default([]),
        overlay: z.boolean().optional(),
        look: z.string().max(600).optional(),
    }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const sfx = await ensureSfx(ctx.userId, input.projectId).catch(() => []);
        const scene = await composeScene(ctx.userId, ctx.role, input.projectId, {
            prompt: await withoutNickname(ctx.userId, input.prompt, ctx.said),
            seconds: input.seconds,
            assets: [...input.assets.slice(0, 12), ...sfx],
            model: ctx.model,
            effort: ctx.effort,
            ...(input.overlay ? { overlay: true } : {}),
            ...(input.look ? { look: input.look } : {}),
        });
        return { name: scene.name, file:scene.name+".html", snippet: scene.snippet, seconds: scene.duration };
    },
    project: (result) => result,
});
function projectLink(ctx, projectId) {
    return ctx.sale?.workspaceId ? `/sale/${ctx.sale.workspaceId}/video/${projectId}` : `/video/${projectId}`;
}
const MAKE = defineTool({
    id: 'video_make',
    description: "Make a whole video of any kind (promo, explainer, tutorial, story, recap, quote or music clip…) from a brief in one call — a good way to start a new video or fill an empty timeline (or build it yourself with the other video tools): the editor's director plans the beats to suit that kind (3–12 for a short video, up to 60 for a lesson of minutes; a hook or call to action only where the kind wants one), voices every line, designs every scene side by side with the scene designer and places scenes and voice-over on the timeline from 0:00. Takes a few minutes. `projectId`: the open editor's project; leave it out in any other chat (the main chat, the course editor): a project is then created in the user's video editor by itself (named from the brief), and the video is made there with a link for the user to open it, not rendered: they press Export when they want a file. So never save or create a project first. `brief`: everything the user asked (the subject and kind of video, facts, tone, platform, language), (the attached files are read by video_make itself: their words, pictures and clips; do not read them first). `files`: the user's files (ids from FILES) the video is built from: the files attached to the chat go by default. Their video clips become the footage (the director watches and hears them, cuts the strongest stretches, keeps the speech of people talking with captions, and lays motion graphics over them); their pictures and brand colours set the look (app or web screens rebuilt as faithful animated copies, real photos placed with motion, single subjects cut out). `links`: links to videos the user gave (YouTube, Google Drive, TikTok, Instagram, Facebook, Vimeo, X or a file address), fetched and cut in like their clips. `reference`: one video the user gave as the style they want (\"like this\", \"in this style\"): its attachment id or link; the director copies its pacing, type, colour and energy, never its content, and it is left out of `files`. It also makes 3D shots where they lift the video (a real 3D model of the subject turning, the key words as a 3D card, pictures on 3D cards): say so in the brief when the user asks for 3D. `music`: a song the user names for the background (their audio file's id or a link, YouTube or any); without it a fitting track that may be used commercially is found by itself. `seconds`: total length, up to 600 (10 minutes): what the user asked, else what the kind needs (a lesson or tutorial takes minutes). `voice`: an OpenAI voice name, or the user's cloned voice id (voice_...) when they chose their own voice. It places the voice-over captions and a quiet music bed too (never add more). It always makes the video in the project's own frame (the size the user picked in the editor, even if their words name another shape): never change the frame yourself; if they want another shape, tell them to pick it in the editor's size menu. When it returns, report at once: the editor placed and checked everything, so do not read index.html, run check/lint or list files to verify. Afterwards add only what the user asks for (AI footage with video_veo_clips, their own music, changes).",
    input: z.object({ projectId: projectId.optional(), brief: z.string().min(3).max(4000), seconds: z.number().min(5).max(600), voice: voiceName.default('Kore'), files: z.array(z.string().regex(ATTACHMENT_ID)).max(16).optional(), links: z.array(z.string().url().max(2000)).max(4).optional(), reference: z.string().max(2000).optional(), music: z.string().max(2000).optional() }),
    sideEffect: 'write',
    approval: 'never',
    async run(ctx, input) {
        const created = input.projectId ? null : await createProject(ctx.userId, input.brief.replace(/\s+/g, ' ').slice(0, 60));
        const target = input.projectId ?? created?.id ?? '';
        if (input.projectId)
            await onlyItsProject(ctx.threadId, input.projectId);
        const { mountSkill } = await import("./runtime.mjs");
        await mountSkill(ctx, 'brag').catch(() => false);
        const said = linksIn(ctx.said ?? '');
        const reference = input.reference ?? said.reference;
        const music = input.music;
        const made = await makeVideo(ctx.userId, ctx.role, target, { brief: await withoutNickname(ctx.userId, input.brief, ctx.said), seconds: input.seconds, voice: input.voice, model: ctx.model, effort: ctx.effort, said: ctx.said, files: (input.files ?? ctx.attachmentIds).filter((id) => id !== reference && id !== music), links: input.links ?? said.links, reference, music, signal: ctx.signal, onProgress: (detail) => ctx.reportActivity?.(detail, 'video_make') });
        if (!created)
            return { ...made, project: null };
        return { ...made, project: { id: target, name: created.name, link: projectLink(ctx, target) } };
    },
    endsStep: true,
    project: (result) => ({
        status: 'done',
        summary: `The video is made and on the timeline: ${result.seconds} s, ${result.beats.length} beats.${result.music ? ` Its music is "${result.music}": the user credits it like that wherever the video is posted.` : ''}${result.project ? ` It is kept as the project "${result.project.name}" and is not rendered. Give the user this link to open it: [${result.project.name}](${result.project.link}). They watch it there and press Export when they want a file.` : ''}`,
        ...result,
    }),
});
async function sideBySide(ctx, tool, projectId, items) {
    await onlyItsProject(ctx.threadId, projectId);
    const made = await Promise.allSettled(items.map((item) => tool.run(ctx, tool.input.parse({ ...item, projectId }))));
    return {
        results: made.map((result, index) => result.status === 'fulfilled' ? { index, ...result.value } : { index, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }),
    };
}
const SCENES = defineTool({
    id: 'video_scenes',
    description: 'Make several scenes at once with the scene designer, side by side (same fields as video_scene for each). Use it whenever the video has more than one scene: they are designed in parallel, so the whole set takes about as long as one. Returns each one\'s `snippet` (or its error) in the order given.',
    input: z.object({
        projectId,
        scenes: z.array(z.object({ prompt: z.string().min(3).max(4000), seconds: z.number().min(3).max(SCENE_MAX_SECONDS), assets: z.array(assetName).max(12).default([]), overlay: z.boolean().optional(), look: z.string().max(600).optional() })).min(1).max(8),
    }),
    sideEffect: 'write',
    approval: 'never',
    run: (ctx, input) => sideBySide(ctx, SCENE, input.projectId, input.scenes),
    project: (result) => result,
});
const CAPTIONS = defineTool({
    id: 'video_captions',
    description: "Hear a voice-over (or any clip with speech) of the project and get its words with their times, as SubRip (SRT). `place`: true also puts them on the video as the editor's own captions (social-video style: big, bold, a few words at a time, the key word lit), wherever that file plays on the timeline, so place the file first; asked again after it moved, they are put again. They sit in the bottom band of the frame (80% to 95% of its height), which the scene designer keeps free of words, so they never lie over a scene's own labels and no captions scene has to be designed (a scene made for captions lies over what the other scenes show there). Without `place` you only get the times (to cut a long talk into shorts, or to time something to the speech). `asset`: the file name in assets/; `language`: e.g. th or en.",
    input: z.object({ projectId, asset: assetName, language: z.string().min(2).max(4).default('th'), place: z.boolean().optional() }),
    sideEffect: 'write',
    approval: 'never',
    repeatable: true,
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        const heard = await transcribeAsset(ctx.userId, ctx.role, input.projectId, input.asset, input.language);
        return input.place ? { ...heard, captions: await placeCaptions(ctx.userId, input.projectId, input.asset, heard.srt) } : heard;
    },
    project: (result) => result,
});
const EDIT = defineTool({
    id: 'video_edit',
    description: "Make one stretch of the finished video again, the way video_make makes a video (plan, voice, scenes, AI clips, the frame check), and put it in place of the old stretch: the rest of the video, its music and its other scenes stay, and what follows moves if the new stretch runs longer or shorter. Use it when the user wants part of the video redone or changed (\"redo 0:40 to 1:10\", \"make the solar part better\", the stretch they selected on the timeline) rather than the whole video made again. `from`/`to`: the seconds to redo (widened to the whole scenes they touch). `brief`: what this stretch should say and show now, in the user's words, with the facts from their files. `seconds`: its new length, else the same as the old. `files`: the user's files to build it from (the chat's attachments by default). For a small fix inside a scene (a word cut off, text over a picture) call video_review instead.",
    input: z.object({ projectId, from: z.number().min(0), to: z.number().min(0), brief: z.string().min(3).max(4000), seconds: z.number().min(3).max(600).optional(), voice: voiceName.default('Kore'), files: z.array(z.string().regex(ATTACHMENT_ID)).max(16).optional() }),
    sideEffect: 'write',
    approval: 'never',
    repeatable: true,
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        if (input.to <= input.from)
            throw new AppError('BAD_REQUEST', { key: 'af-video-edit-range', message: '`to` must come after `from`.' });
        return makeVideo(ctx.userId, ctx.role, input.projectId, { brief: await withoutNickname(ctx.userId, input.brief, ctx.said), seconds: input.seconds ?? 0, voice: input.voice, model: ctx.model, effort: ctx.effort, said: ctx.said, files: input.files ?? ctx.attachmentIds, range: { from: input.from, to: input.to }, signal: ctx.signal, onProgress: (detail) => ctx.reportActivity?.(detail, 'video_edit') });
    },
    endsStep: true,
    project: (result) => ({ status: 'done', summary: `Remade ${result.remade?.replaced ?? 'the stretch'} as ${result.beats.length} beats; the video is now ${result.seconds} s.`, ...result }),
});
const REVIEW = defineTool({
    id: 'video_review',
    description: "Look at the finished video as it plays and fix what its frames show wrong, scene by scene: words covered, crossed or cut by the frame, too small or faint to read, a crowded corner, something hanging off the frame. Call it when the user asks to check, review or fix the video, or only part of it: `scenes` (the scene files on the timeline, compositions/<name>.html, without the folder or .html) or `from`/`to` (seconds, as the user selected on the timeline) limit it to those; with neither, every scene. Only the scene files change; the timeline, voice and music stay. Report which scenes were fixed.",
    input: z.object({ projectId, scenes: z.array(z.string().regex(/^[\w-]{1,60}$/)).max(60).optional(), from: z.number().min(0).optional(), to: z.number().min(0).optional() }),
    sideEffect: 'write',
    approval: 'never',
    repeatable: true,
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        return reviewVideo(ctx.userId, ctx.role, input.projectId, { ...input, model: ctx.model, effort: ctx.effort, onProgress: (detail) => ctx.reportActivity?.(detail, 'video_review') });
    },
    project: (result) => ({ status: 'done', summary: `Checked ${result.checked.length} scenes; ${result.fixed.length > 0 ? `fixed ${result.fixed.join(', ')}` : result.failed.length > 0 ? 'fixed none' : 'nothing was wrong'}${result.failed.length > 0 ? `; could not fix ${result.failed.join(', ')} (the fix failed, so do not say they are fine)` : ''}.`, ...result }),
});
const EXPORT = defineTool({
    id: 'video_export',
    description: "Give the user the link to this video's project, where they watch it and press Export when they want a file (an MP4, a GIF, an MP3 of the sound). Call it when the user asks for a file or an export. It starts no render: a render holds the machine for minutes, so it is the user's to start.",
    input: z.object({ projectId }),
    sideEffect: 'read',
    approval: 'never',
    async run(ctx, input) {
        await onlyItsProject(ctx.threadId, input.projectId);
        return { link: projectLink(ctx, input.projectId) };
    },
    endsStep: true,
    project: ({ link }) => ({ status: 'done', summary: `Nothing was rendered. Give the user this link: [open the project](${link}). They press Export there to get the file.`, link }),
});
export const VIDEO_TOOLS = [MAKE, EDIT, REVIEW, EXPORT, SCENE, SCENES, CAPTIONS, WEB_IMAGE, DRAW_IMAGE, VOICE, MUSIC_SEARCH, MUSIC_ADD, VEO, VEO_SET, RESTYLE, PLACE, AVATAR, THREE_SHOT, BLENDER_STATUS, BLENDER, LIPSYNC, LIBRARY_SEARCH, LIBRARY_ADD, BLOCKS_SEARCH, BLOCK_ADD];
