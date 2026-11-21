import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { randomUUID } from "node:crypto"
import sharp from 'sharp';
import { agentConfig } from "./runtime.mjs"
import { textOf } from "./runtime.mjs"
import { AppError } from "./runtime.mjs"
import { deleteFile } from "./runtime.mjs"
import { devices } from "./runtime.mjs"
import { logger } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { bodyOf } from "./three-designer.mjs"
import { fetchModel, threeWords } from "./three-scene.mjs"
import { videoModel } from "./runtime.mjs"
import { addAsset, dirOf, inventedPrice, projectIdOf, sendFromSandbox, SCENE_DESIGNER, who } from "./video-studio.service.mjs"
const SERVER = 'blender';
export const blenderTiming = { pollMs: 5000, stallMs: 20 * 60_000, ceilingMs: 6 * 3_600_000, missMs: 3 * 60_000, statusTtlMs: 60_000 };
async function call(link, tool, args, timeoutMs = 60_000) {
    const answer = await devices.callTool(link.requester, { device: link.device, server: SERVER, tool, args, timeoutMs });
    const said = answer.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    if (answer.isError)
        throw new AppError('BAD_REQUEST', { key: 'af-blender-refused', message: `Blender on your computer refused: ${said.slice(0, 400)}` });
    try {
        return JSON.parse(said);
    }
    catch {
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-reply', message: `Blender's server on your computer answered something unreadable: ${said.slice(0, 200)}` });
    }
}
export async function blenderStatus(userId, wanted) {
    const picked = devices.pickDevice(userId, wanted);
    const link = { requester: userId, device: picked.id };
    if (!picked.servers.some((server) => server.name === SERVER && server.status === 'ready'))
        return { ...link, ready: false };
    return { ...link, ready: true, status: await call(link, 'blender_status', {}, 30_000) };
}
export async function blenderLink(userId, wanted) {
    const found = await blenderStatus(userId, wanted);
    if (!found.ready)
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-no-server', message: 'Your computer is connected but runs no Blender server: update astraflow-connect (npm i -g astraflow-connect) and start it again.' });
    if (!found.status?.installed)
        throw new AppError('BAD_REQUEST', { key: 'af-blender-missing', message: 'Blender is not installed on your computer: install it from blender.org (free), then try again.' });
    return { requester: found.requester, device: found.device, status: found.status };
}
const known = new Map();
export async function blenderOn(userId) {
    const kept = known.get(userId);
    if (kept && Date.now() - kept.at < blenderTiming.statusTtlMs)
        return kept.link;
    const link = await blenderLink(userId).catch(() => null);
    known.set(userId, { at: Date.now(), link });
    return link;
}
const forbidden = (what, why) => `It uses ${what}, which a shot may not: ${why}`;
const BANNED_MODULES = new Set(['subprocess', 'socket', 'urllib', 'urllib2', 'requests', 'httpx', 'http', 'ftplib', 'smtplib', 'xmlrpc', 'telnetlib', 'shutil', 'ctypes', 'pickle', 'marshal', 'importlib', 'builtins', 'multiprocessing', 'webbrowser', 'pty']);
const BANNED_OS = '(?:system|popen|exec\\w*|spawn\\w*|remove|unlink|rmdir|removedirs|rename|renames|replace|kill|killpg|fork|chmod|chown|startfile)';
export function blenderScriptProblem(script) {
    if (!script.trim())
        return 'It is empty.';
    for (const line of script.matchAll(/^[ \t]*(?:import|from)[ \t]+([^\n]*)/gm)) {
        const text = line[1] ?? '';
        const modules = /^from\b/.test(line[0].trim()) ? [text.split(/\s+/)[0] ?? ''] : text.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '');
        for (const module of modules)
            if (BANNED_MODULES.has(module.split('.')[0] ?? ''))
                return forbidden(`the module ${module}`, 'it reaches outside Blender (the network, other programs, memory).');
        if (/^from\s+os\s+import\b/.test(line[0].trim()) && new RegExp(`\\b${BANNED_OS}\\b`).test(text))
            return forbidden('os functions that run programs or delete files', 'use bpy and os.path only.');
    }
    const os = new RegExp(`\\bos\\s*\\.\\s*${BANNED_OS}\\b`).exec(script);
    if (os)
        return forbidden(os[0].replace(/\s+/g, ''), 'it runs programs or deletes files.');
    const dynamic = /(?<![\w.])(eval|exec|compile)\s*\(|__import__|__builtins__|__subclasses__|\bimportlib\b/.exec(script);
    if (dynamic)
        return forbidden(dynamic[0].replace(/\s*\($/, ''), 'run no code built from text.');
    for (const open of script.matchAll(/\bopen\s*\(([^)]*)\)/g)) {
        const mode = /(?:,\s*|mode\s*=\s*)(['"])([^'"]*)\1/.exec(open[1] ?? '')?.[2] ?? '';
        if (/[wax+]/.test(mode))
            return forbidden('open() for writing', 'a shot writes no files of its own; the wrapper saves the render.');
    }
    const files = /\.(?:write_text|write_bytes|unlink|rmdir|save_render)\s*\(|\bbpy\s*\.\s*data\s*\.\s*libraries\s*\.\s*(?:load|write)\b|\bbpy\s*\.\s*utils\s*\.\s*execfile\b/.exec(script);
    if (files)
        return forbidden(files[0].replace(/\s+/g, ''), 'it writes or loads files outside the shot.');
    const ops = /\bbpy\s*\.\s*ops\s*\.\s*(?:wm\s*\.\s*(?:save\w*|open\w*|recover\w*|url_open\w*|quit\w*|link|append|\w*_export|read_history)|script\s*\.|preferences\s*\.|export\w*\s*\.|render\s*\.\s*(?:render|opengl)|image\s*\.\s*save\w*)/.exec(script);
    if (ops)
        return forbidden(ops[0].replace(/\s+/g, ''), /render/.test(ops[0]) ? 'the script must not render: the wrapper renders after it.' : 'it saves, opens or installs something outside the shot.');
    return null;
}
export function blenderShotOf(reply) {
    let rest = bodyOf(reply);
    const tags = {};
    for (let found = /^<(words|alpha|engine)>([\s\S]*?)<\/\1>\s*/.exec(rest); found; found = /^<(words|alpha|engine)>([\s\S]*?)<\/\1>\s*/.exec(rest)) {
        tags[found[1] ?? ''] = (found[2] ?? '').trim();
        rest = rest.slice(found[0].length);
    }
    let words = [];
    if (tags.words !== undefined) {
        try {
            const parsed = JSON.parse(tags.words);
            words = Array.isArray(parsed) ? parsed : null;
        }
        catch {
            words = null;
        }
    }
    const engine = /^(CYCLES|BLENDER_EEVEE_NEXT|BLENDER_EEVEE|AUTO)$/i.exec(tags.engine ?? '')?.[1]?.toUpperCase() ?? null;
    return { words, alpha: tags.alpha === undefined ? null : /^true$/i.test(tags.alpha), engine, script: bodyOf(rest) };
}
export function applyBlenderPatches(draft, reply) {
    const blocks = [...reply.matchAll(/<patch>\s*<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>\s*<\/patch>/g)];
    if (blocks.length === 0)
        return /<patch>/.test(reply) ? null : reply;
    let made = draft;
    for (const [, find = '', replace = ''] of blocks) {
        const at = find.length > 0 ? made.indexOf(find) : -1;
        if (at < 0 || made.indexOf(find, at + 1) >= 0)
            return null;
        made = made.slice(0, at) + replace + made.slice(at + find.length);
    }
    return made;
}
export async function previewProblem(bytes) {
    const [red, green, blue] = (await sharp(bytes).stats()).channels;
    if (!red || !green || !blue)
        return null;
    const mean = (red.mean + green.mean + blue.mean) / 3;
    if ((red.stdev + green.stdev + blue.stdev) / 3 < 4)
        return mean < 25 ? 'is flat black: nothing is in view' : mean > 230 ? 'is flat white: nothing is in view' : 'is one flat colour: nothing is in view';
    if (red.mean > 170 && blue.mean > 170 && green.mean < 100)
        return 'is mostly magenta: a missing texture or a broken shader';
    return null;
}
export const BLENDER_PROMPT = [
    'You are a top 3D artist and motion designer who works in Blender. Write ONE shot of a video as a complete Python script for Blender\'s bpy, run headless (background mode, no UI) on the user\'s own computer. Reply in exactly this form and nothing else (no markdown fences, no explanation): optionally <alpha>true</alpha> or <alpha>false</alpha> (true when the shot is a subject to lay over other footage or graphics: a product turntable, a model spinning, a short loop, an animated object; the background is then transparent and the file is a webm with alpha; false for a full scene with its own world, a fly-through, a product shot on a set), optionally <engine>CYCLES|BLENDER_EEVEE|BLENDER_EEVEE_NEXT|AUTO</engine> (AUTO unless you have a reason: Cycles for photoreal glass, metal and soft light; the EEVEE engine for graphics and fast motion design), optionally <words>[...]</words> (a JSON array, maybe empty: the words laid over the shot as text layers, described last), then ONLY the Python script.',
    'Freedom: the shot is as long, as complex and as cinematic as the idea needs (a turntable of a product, a model spinning with alpha, a short loop, a long animation, a full scene, a camera fly-through, motion graphics in 3D, anything Blender does); nothing limits its seconds, frames or detail. Make it look real and premium, better than the best Blender reels, and never the same way twice: find the visual language that fits the subject and the look given (its colours, mood, energy).',
    'The contract. Before your script runs, the wrapper has already set the render resolution, fps, frame range, transparent film (when alpha), image and device settings, and defined a global dict ARGS: {width, height, fps, frameStart, frameEnd, samples, alpha, engine, out_dir, assets_dir} (assets_dir and out_dir end with a slash). Your script builds the scene and animates it; it must NOT render, save or open any .blend, and must not touch files other than reading from ARGS["assets_dir"] + name (the project\'s files, given below) and, if it needs scratch space, ARGS["out_dir"]. After the script the wrapper renders frames frameStart..frameEnd at ARGS["fps"]. Time: frame f is second (f - frameStart) / fps; keyframe from ARGS["frameStart"] and ARGS["frameEnd"], never hard-coded frame numbers, so a shorter or longer render still plays your whole story. Be deterministic: random.seed(7) and no time or clock. Allowed modules: bpy, bmesh, mathutils, math, random, json, os.path, colorsys. The script is read by a static check and refused if it imports or calls subprocess, socket, urllib, requests, http, shutil, ctypes, pickle, importlib, builtins, os.system, os.popen or other os functions that run programs or delete files, eval/exec/compile, __import__, open() for writing, bpy.ops.wm save/open/export/link/append operators, bpy.ops.script or preferences (add-on install), bpy.ops.export_*, bpy.ops.render.render, image save_render.',
    'Setup: build everything with the data API (bpy.data, bmesh, mathutils) and primitives; the UI is absent, so avoid operators that need a window, area or selection context (bpy.ops.transform, view3d, screen, anything with a mode that needs the viewport); where an operator is easiest (bpy.ops.mesh.primitive_*_add, bpy.ops.object.shade_smooth, bpy.ops.import_scene.gltf), set bpy.context.view_layer.objects.active and select first, or use bpy.context.temp_override(...). Clear the default cube, light and camera by removing objects and orphan data (for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)); do NOT call bpy.ops.wm.read_factory_settings: it resets everything the wrapper set (if you ever replace the scene, set scene.render.resolution_x/y, fps, frame_start, frame_end, film_transparent again from ARGS). Work in metres (scene.unit_settings.system = "METRIC"), the hero about 1 to 2 m, the camera 4 to 12 m away. Put objects in collections (bpy.data.collections.new, scene.collection.children.link) and name everything.',
    'Materials with nodes: mat = bpy.data.materials.new(name); mat.use_nodes = True; bsdf = mat.node_tree.nodes["Principled BSDF"]. Blender 4.x renamed the inputs: "Base Color", "Metallic", "Roughness", "IOR", "Alpha", "Subsurface Weight" (not Subsurface), "Specular IOR Level" (not Specular), "Transmission Weight" (not Transmission), "Coat Weight" (not Clearcoat), "Sheen Weight", "Emission Color" and "Emission Strength" (not Emission); set them through a helper that tries bsdf.inputs.get(name) and skips what is missing, so it also runs on 3.x. Recipes: clay (Base Color pastel, Roughness 0.7 to 0.9, bevelled soft shapes); glossy plastic (Roughness 0.1 to 0.25, Coat Weight 0.5); brushed metal (Metallic 1, Roughness 0.25 to 0.4, a light grey base, give it something to reflect: large soft area lights and a gradient world); glass (Transmission Weight 1, Roughness 0 to 0.05, IOR 1.45, thick enough to refract, a dark or light backdrop behind it so it reads); neon or screens (Emission Color with Emission Strength 5 to 30, with the compositor glare); toon or flat graphic (an Emission shader with no lighting, or Roughness 1 with Standard view transform); pictures and screens (an Image Texture node on bpy.data.images.load(ARGS["assets_dir"] + name), plane sized by the picture\'s aspect); gradients (Gradient Texture or Texture Coordinate into a ColorRamp), noise bump for surface detail, a Fresnel or Layer Weight for rims. Give every object real edges: a Bevel modifier (width 0.01 to 0.03, segments 3) so highlights catch, and Subdivision (levels 2, render_levels 2 to 3) for organic forms; smooth shading with polygon.use_smooth = True (Mesh.use_auto_smooth was removed in 4.1).',
    'Light like a studio: a key (an area light 2 to 4 m wide, 45 degrees to the side and above, energy 500 to 2000 W at 4 to 6 m), a soft fill at a third of it on the other side, and a rim or back light that separates the silhouette from the background (a narrow strip area light or a spot behind); coloured accent lights from the palette; a light that travels (animate a light across the subject for a sweep). The world gives ambient light and reflections even when the background is transparent: world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True; bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (r, g, b, 1); bg.inputs[1].default_value = strength (0.2 to 1); a gradient or a Sky Texture node (ShaderNodeTexSky) lights metal and glass well; large softboxes (emissive planes) make reflections read as a studio. Without a backdrop, a shadow catcher floor (obj.is_shadow_catcher = True, Cycles) gives a transparent shot a soft contact shadow.',
    'Camera: cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data); link it into a collection; scene.camera = cam. Focal length 50 to 85 mm for products (cam_data.lens), 24 to 35 mm for scenes and fly-throughs; the sensor fits the wider side, so for a tall frame check the framing (cam_data.sensor_fit = "AUTO"). Aim with a Track To constraint on an empty at the subject (con.track_axis = "TRACK_NEGATIVE_Z", con.up_axis = "UP_Y") and move the empty or the camera; orbit by parenting the camera to a rotating empty; fly through along a bezier curve with a Follow Path constraint (animate its offset_factor from 0 to 1); depth of field with cam_data.dof.use_dof = True, dof.focus_object = the subject, dof.aperture_fstop 1.8 to 4 (focus pulls animate focus_distance). Frame the subject large (60 to 80 percent of the frame\'s height) with space around it, the whole subject inside the frame all through the shot.',
    'Motion that reads: every object moves continuously from one frame to the next (keyframes eased, never a move of more than the object would travel in that time; no cuts, no jump in position, no object appearing or vanishing mid-shot), and a shot a video model will repaint (a guide) keeps its subject large (at least half the frame height), one clear silhouette, the action readable in every frame (a jump shows its crouch, its rise, its apex and its landing) and the light even. Keep the script compact (under about 250 lines: helper functions and loops for repeated parts, no long comments): its length is the time the shot takes to make.',
    'Animation: obj.location / rotation_euler / scale / material input default_value, light energy and camera lens are all keyframed with obj.keyframe_insert("location", frame=f) (data_path on materials: socket.keyframe_insert("default_value", frame=f)). Keyframes are Bezier by default, which eases in and out: use that for most motion (an entrance that lands in the first second, a development with overlapping eased motion, a calm end). Linear motion (a turntable, a constant spin) needs fcurve.keyframe_points[i].interpolation = "LINEAR" through this helper that works on every version: def fcurves(obj): a = obj.animation_data.action; try: return list(a.fcurves) except AttributeError: return [fc for l in a.layers for s in l.strips for cb in s.channelbags for fc in cb.fcurves]. A seamless turntable: rotation_euler.z = 0 at frameStart and 2*pi at frameEnd + 1, LINEAR (so the last rendered frame is one step before the first). Overshoot and bounce: set interpolation "BACK", "ELASTIC" or "BOUNCE" with easing "EASE_OUT" on the keyframe points. Procedural motion: add a Noise modifier to an fcurve (fc.modifiers.new("NOISE")), use simple driver expressions only (e.g. "sin(frame / 12)": simple expressions run even where scripts are off), offset several objects by index for mograph waves (copies of one mesh with obj.copy() and linked data, each keyframed with a delay).',
    'Procedural and heavy things: scatter and arrays with a loop over instances (linked duplicates, bpy.data.objects.new(name, mesh), seeded random placement), Array and Curve modifiers, Geometry Nodes for instancing (ng = bpy.data.node_groups.new("GN", "GeometryNodeTree"); ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry") and the same for OUTPUT; nodes "NodeGroupInput", "GeometryNodeDistributePointsOnFaces", "GeometryNodeInstanceOnPoints", "NodeGroupOutput"; apply with obj.modifiers.new("GN", "NODES").node_group = ng), particle hair or emitters only when the idea needs them. Physics (cloth, fluid, smoke, rigid bodies) simulates from the first frame and a render of a later frame bakes everything before it, so use them only where the idea is a simulation, keep them small, and set the cache range to the frame range; a falling-and-settling object is often better keyframed.',
    'Text in 3D: curve = bpy.data.curves.new("T", "FONT"); curve.body = "WORD"; curve.size, curve.extrude = 0.05 to 0.15, curve.bevel_depth = 0.01, curve.align_x = "CENTER"; obj = bpy.data.objects.new("T", curve). Blender\'s default font has no Thai letters: Thai (and long text) is never modelled in 3D; only short Latin words, numbers and symbols are, and every headline, line or price the viewer reads is a word layer in <words>, laid over the render by the editor. Importing a model: for name.glb or .gltf in the project\'s files, bpy.ops.import_scene.gltf(filepath=ARGS["assets_dir"] + name); the imported objects are the selected ones (bpy.context.selected_objects); parent them under one empty, centre it by the bounding box and scale it by obj.dimensions to the size you want, re-assign materials only if the model needs it. Other formats: bpy.ops.wm.obj_import, bpy.ops.import_scene.fbx.',
    'Look: scene.view_settings.view_transform = "AgX" (Blender 4.x; "Filmic" on 3.x; "Standard" for flat graphic colour) with a look such as "AgX - Medium High Contrast" inside try/except (names differ by version), exposure and gamma left near 0 and 1. Bloom and glow: the compositor (scene.use_nodes = True; tree = scene.node_tree; a CompositorNodeGlare, glare_type "BLOOM" on 4.2+ or "FOG_GLOW", threshold near 1, mix 0 to 0.3; wrap in try/except) between the Render Layers and Composite nodes; the EEVEE engine\'s own bloom settings were removed in 4.2, so guard any scene.eevee attribute with hasattr (use_raytracing, taa_render_samples). Motion blur: scene.render.use_motion_blur = True, motion_blur_shutter 0.5 for fast motion. Cycles: leave samples and denoising to the wrapper (ARGS["samples"]); you may set scene.cycles.use_adaptive_sampling. Do not set scene.render.engine unless you need a different one than ARGS["engine"]; if you do, use the exact name that exists (BLENDER_EEVEE_NEXT on 4.2 to 4.5, BLENDER_EEVEE on older and on 5.0).',
    'Alpha: when ARGS["alpha"] is true the film is transparent: no sky or backdrop is seen, so build no floor, wall or background plane unless it is meant (a shadow catcher is the exception), keep soft edges (no black fringes: premultiplied light, no emission backdrop), and let the subject stay whole inside the frame, large, in the middle, with room to move; its video is laid over a designed scene by the editor, so the subject carries its own light, and never a flat black or white card. When it is false the shot is the whole frame: a world, a set, a ground, a backdrop in the video\'s palette, never flat black unless the look is dark.',
    'Craft: one focal subject, a clear silhouette against its background (a light subject on a deep ground, a dark one on a light ground, never dark on dark), layered light, a camera that always travels or something that always moves, depth (foreground, subject, background), a light or highlight that moves across the surface, and between any two moments a second apart the frame visibly changes. Less, done well: no clutter. For a tall frame (height above width) compose vertically: stack and scale for the narrow side, and leave the bottom fifth of the frame free of the subject\'s key details (the editor puts captions there) unless the shot is an alpha subject. Take the colours from the palette given and keep the look consistent with it.',
    'Words: every headline, line, price or call to action the viewer reads is a word layer, not modelled: each is {"text", "at": seconds from the shot start, "for": seconds shown, "x": -40..40 and "y": -46..24 (where its centre sits, in % of the frame from the middle: y -32 is high, 0 the middle, 24 the lowest), "size": px on a 1080-wide frame (a headline 90 to 150, a line 44 to 64), "weight": 500|800|900, "color": "#hex", "in": fade|zoom|blur|slide-up|slide-down|slide-left|slide-right|wipe-up|wipe-left|iris|flip|spin|dip, "keys": [{"t", "x", "y", "scale", "rotate", "opacity", "ease"}] optional kinetic moves}. At most 8, each short (a few words, one line), never two over each other at the same time, placed where the 3D leaves room and timed with its motion. Use only the facts and words given, in the video\'s language; invent none: every number and price is one the facts state. Leave <words> empty when the shot is a subject for an alpha overlay and the video already carries the words.',
].join('\n');
const REVIEW_PROMPT = 'These are preview frames of your shot (a quick low-resolution render of the Blender scene your script built; for an alpha shot the transparent background is shown flat; the words are laid over the final video by the editor and are not in them) at the frames given, with what you wrote and what was measured. First write what you see wrong in each frame inside <seen>...</seen> (look hard: the subject missing, too small, cut by the edge or lost against its background; nothing lit or everything flat; materials that look like plastic when they should be metal or glass; clutter; frames that barely differ; a floor or backdrop where the shot is an alpha subject; magenta), then reply with the improved shot, or exactly OK if nothing is wrong. When only some lines change, send just the changes: one or more <patch><find>text copied exactly from what you wrote, unique in it</find><replace>the new text</replace></patch> blocks and nothing else (far quicker than the whole script). Send the whole shot (the tags, then the script) only when most of it changes. Where a frame is flat black, white or magenta the measurement is a fact: fix it.';
const FAILED_PROMPT = 'Blender ran your script and it failed. Its error is below (a Python traceback tail, or what was measured). Fix its cause (and anything else wrong). When only some lines change, reply with just the changes: one or more <patch><find>text copied exactly from what you wrote, unique in it</find><replace>the new text</replace></patch> blocks and nothing else (far quicker than the whole script). Reply with the whole corrected shot (the tags, then the script) only when most of it changes.';
const MOST_CALLS = 5;
const PREVIEW_WIDTH = 640;
const even = (value) => Math.max(2, Math.round(value / 2) * 2);
const round2 = (value) => Math.round(value * 100) / 100;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function follow(link, jobId, report, signal) {
    const cancel = () => call(link, 'blender_render_cancel', { jobId }, 20_000).catch(() => undefined);
    const started = Date.now();
    let moved = started;
    let heard = started;
    let last = '';
    for (;;) {
        await wait(blenderTiming.pollMs);
        if (signal?.aborted) {
            await cancel();
            throw new AppError('BAD_REQUEST', { key: 'af-blender-stopped', message: 'The run was stopped, so the Blender job was cancelled.' });
        }
        if (Date.now() - started > blenderTiming.ceilingMs) {
            await cancel();
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-ceiling', message: `The Blender job ran past ${round2(blenderTiming.ceilingMs / 3_600_000)} hours and was cancelled.` });
        }
        let now;
        try {
            now = await call(link, 'blender_render_status', { jobId }, 20_000);
            heard = Date.now();
        }
        catch (error) {
            if (error instanceof AppError && error.key === 'af-blender-refused')
                throw error;
            if (Date.now() - heard > blenderTiming.missMs)
                throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-unreachable', message: `Your computer could not be reached (${error.message}). Blender may still be rendering there: check it, then try again.` });
            continue;
        }
        if (now.state === 'done' || now.state === 'failed' || now.state === 'cancelled')
            return now;
        const mark = `${now.state}|${now.phase}|${now.progress}|${now.frame}`;
        if (mark !== last) {
            last = mark;
            moved = Date.now();
            report?.(now);
        }
        else if (Date.now() - moved > blenderTiming.stallMs) {
            await cancel();
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-stalled', message: `Blender made no progress for ${Math.round(blenderTiming.stallMs / 60_000)} minutes (${now.phase ?? now.state}) and the job was cancelled.` });
        }
    }
}
const PHASES = { preview: 'พรีวิว', render: 'เรนเดอร์', encode: 'เข้ารหัสวิดีโอ', upload: 'อัปโหลดผลลัพธ์' };
export async function projectFrame(ownerId, projectId) {
    const index = await sandbox.readFile(who(ownerId), `${dirOf(projectId)}/index.html`, 4_000_000).then((bytes) => bytes.toString('utf8'), () => '');
    return { width: Number(/data-width="(\d+)"/.exec(index)?.[1] ?? 1920), height: Number(/data-height="(\d+)"/.exec(index)?.[1] ?? 1080) };
}
async function sendAssets(ownerId, projectId, names, requester) {
    if (names.length === 0)
        return undefined;
    if (names.some((name) => !/^[A-Za-z0-9._/-]{1,160}$/.test(name) || name.includes('..') || name.startsWith('/')))
        throw new AppError('BAD_REQUEST', { key: 'af-video-asset-name' });
    const archive = `/tmp/blender-assets-${randomUUID()}.tgz`;
    try {
        const packed = await sandbox.exec(who(ownerId), { command: `cd "${dirOf(projectId)}/assets" && tar -czf ${archive} -- ${names.map((name) => `'${name}'`).join(' ')}`, timeoutMs: 300_000 });
        if (packed.exitCode !== 0)
            throw new AppError('BAD_REQUEST', { key: 'af-blender-assets', message: `The files could not be packed for Blender: ${packed.stderr.slice(-200)}` });
        return (await sendFromSandbox(ownerId, archive, { ownerId: requester, fileName: 'blender-assets.tgz' })).publicId;
    }
    finally {
        await sandbox.exec(who(ownerId), { command: `rm -f ${archive}`, timeoutMs: 15_000 }).catch(() => undefined);
    }
}
export async function designBlender(ownerId, userId, role, projectId, brief, link, options = {}) {
    projectIdOf(projectId);
    const turn = takeDesignTurn(userId);
    if (turn.full())
        options.onProgress?.('Blender: รอคิวออกแบบ (ช็อตอื่นกำลังทำอยู่)');
    await turn.wait(options.signal);
    try {
        return await designBlenderNow(ownerId, userId, role, projectId, brief, link, options);
    }
    finally {
        turn.done();
    }
}
const MOST_DESIGNS = 3;
const designs = new Map();
export function takeDesignTurn(userId) {
    const mine = designs.get(userId) ?? { live: 0, queue: [] };
    designs.set(userId, mine);
    let held = false;
    return {
        full: () => mine.live >= MOST_DESIGNS,
        async wait(signal) {
            while (mine.live >= MOST_DESIGNS) {
                signal?.throwIfAborted();
                await new Promise((resolve) => {
                    const wake = () => {
                        signal?.removeEventListener('abort', wake);
                        mine.queue.splice(mine.queue.indexOf(wake), 1);
                        resolve();
                    };
                    mine.queue.push(wake);
                    signal?.addEventListener('abort', wake, { once: true });
                });
            }
            mine.live += 1;
            held = true;
        },
        done() {
            if (!held)
                return;
            held = false;
            mine.live -= 1;
            mine.queue[0]?.();
            if (mine.live === 0 && mine.queue.length === 0)
                designs.delete(userId);
        },
    };
}
async function designBlenderNow(ownerId, userId, role, projectId, brief, link, options) {
    const tell = (detail) => options.onProgress?.(detail);
    const fps = brief.fps ?? 24;
    const output = brief.output ?? 'video';
    const frameEnd = output === 'still' ? 1 : Math.max(1, Math.round(brief.seconds * fps));
    const scale = brief.scale ?? 1;
    const width = even(brief.frame.width * scale);
    const height = even(brief.frame.height * scale);
    const previewHeight = even((PREVIEW_WIDTH * brief.frame.height) / brief.frame.width);
    const marks = [...new Set([0.15, 0.5, 0.85].map((at) => 1 + Math.round((frameEnd - 1) * at)))];
    const files = [...(brief.assets ?? [])];
    const modelPath = brief.search ? await fetchModel(ownerId, projectId, brief.search).catch(() => null) : null;
    if (modelPath)
        files.push(modelPath.replace(/^assets\//, '').split('/')[0] ?? '');
    const listed = [...(brief.assets ?? []), ...(modelPath ? [modelPath.replace(/^assets\//, '')] : [])];
    const assetsFileId = await sendAssets(ownerId, projectId, files.filter(Boolean), link.requester);
    const designer = SCENE_DESIGNER ?? brief.model ?? agentConfig().videoModel;
    const effort = brief.effort && ['high', 'xhigh', 'max'].includes(brief.effort) ? 'medium' : brief.effort;
    const model = await videoModel({ alias: designer, userId, role, maxTokens: 100_000 }, effort, true);
    const ask = [
        `The shot: ${brief.idea}`,
        `Length: ${brief.seconds} seconds at ${fps} fps (frames ${1} to ${frameEnd}; ARGS has them). Frame: ${brief.frame.width}x${brief.frame.height}${brief.frame.height > brief.frame.width ? ' (tall: compose vertically)' : ''}.`,
        `The video's look: ${brief.look || 'clean and modern'}. Palette: ${(brief.palette ?? []).join(', ') || 'your choice'}.`,
        `Blender ${link.status.version ?? ''} on the user's computer (${link.status.device ?? 'CPU'}; Cycles ${link.status.cycles === false ? 'not available' : 'available'}, EEVEE ${link.status.eevee === false ? 'not available' : 'available'}).`,
        brief.alpha === undefined ? '' : brief.alpha ? 'The background must be transparent (alpha true): a subject to lay over other footage.' : 'The shot is the whole frame, not transparent (alpha false).',
        listed.length > 0 ? `Files you may use, at ARGS["assets_dir"] + name: ${listed.join(', ')}` : '',
        brief.facts ? `Facts to copy exactly (invent none):\n${brief.facts.slice(0, 2500)}` : '',
        brief.style ?? '',
    ]
        .filter(Boolean)
        .join('\n\n');
    const render = (shot) => ({ script: shot.script, ...(assetsFileId ? { assetsFileId } : {}), fps, frameStart: 1, frameEnd, alpha: shot.alpha, engine: shot.engine ?? 'AUTO' });
    const preview = async (shot) => {
        const { jobId } = await call(link, 'blender_render', { ...render(shot), width: PREVIEW_WIDTH, height: previewHeight, output: 'preview', preview: { frames: marks, width: PREVIEW_WIDTH } });
        const done = await follow(link, jobId, undefined, options.signal);
        if (done.state !== 'done')
            return { error: (done.error ?? done.log ?? 'Blender stopped without saying why.').slice(-3000) };
        return { frames: (done.previews ?? []).map((one) => ({ frame: one.frame, bytes: Buffer.from(one.jpegBase64, 'base64') })) };
    };
    let made = null;
    let draft = '';
    let problem = '';
    let failure = '';
    let seen = null;
    for (let calls = 0; calls < MOST_CALLS; calls++) {
        options.signal?.throwIfAborted();
        tell(calls === 0 ? 'Blender: เขียนสคริปต์ฉาก 3D' : `Blender: แก้สคริปต์จากภาพพรีวิว (รอบที่ ${calls + 1})`);
        const reply = await model
            .invoke(seen
            ? [
                new SystemMessage(BLENDER_PROMPT),
                new HumanMessage({
                    content: [
                        { type: 'text', text: `${REVIEW_PROMPT}\n\nFrames ${seen.frames.map((one) => one.frame).join(', ')} of 1 to ${frameEnd}.${seen.measured.length > 0 ? `\nMeasured: ${seen.measured.join(' ')}` : ''}\n\n${ask}\n\nWhat you wrote:\n${draft}` },
                        ...seen.frames.map((one) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${one.bytes.toString('base64')}` } })),
                    ],
                }),
            ]
            : [new SystemMessage(BLENDER_PROMPT), new HumanMessage(problem ? `${FAILED_PROMPT}\n\n${ask}\n\nWhat you wrote:\n${draft}\n\nThe problem:\n${problem}` : ask)])
            .then((answer) => bodyOf(textOf(answer.content)), (error) => {
            logger.warn('VIDEO_BLENDER_MODEL_FAILED', { projectId, error: error instanceof Error ? error.message : String(error) });
            return '';
        });
        problem = '';
        let verdict = reply.replace(/^\s*<seen>[\s\S]*?<\/seen>\s*/, '');
        if (seen && made && seen.measured.length === 0 && /^OK\.?$/i.test(verdict))
            break;
        const merged = draft ? applyBlenderPatches(draft, verdict) : verdict;
        if (merged === null) {
            problem = failure = 'Your patch did not apply: a <find> text was not in what you wrote, or was in it more than once. Reply with the whole corrected shot (the tags, then the script) this time.';
            seen = null;
            continue;
        }
        verdict = merged;
        const shot = blenderShotOf(verdict);
        const wrong = shot.words === null ? 'Its <words> is not a JSON array.' : (blenderScriptProblem(shot.script) ?? inventedPrice(JSON.stringify(shot.words), brief.facts ?? ''));
        draft = verdict;
        if (wrong) {
            problem = failure = wrong;
            seen = null;
            continue;
        }
        const current = { script: shot.script, alpha: brief.alpha ?? shot.alpha ?? false, engine: shot.engine };
        tell(`Blender: เรนเดอร์ภาพพรีวิว ${marks.length} เฟรม`);
        const looked = await preview(current);
        if ('error' in looked) {
            problem = failure = looked.error;
            seen = null;
            continue;
        }
        const measured = (await Promise.all(looked.frames.map(async (one) => ({ frame: one.frame, wrong: await previewProblem(one.bytes).catch(() => null) })))).flatMap((one) => (one.wrong ? [`Frame ${one.frame} ${one.wrong}.`] : []));
        if (looked.frames.length === 0)
            measured.push('No preview frame came back.');
        if (measured.length === 0)
            made = { ...current, words: threeWords(shot.words, brief.seconds) };
        else
            failure = measured.join(' ');
        seen = { frames: looked.frames, measured };
    }
    if (!made) {
        logger.warn('VIDEO_BLENDER_DESIGN_FAILED', { projectId, problem: failure });
        throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-design-failed', message: `The Blender shot could not be made to render cleanly: ${failure.slice(0, 600)}` });
    }
    tell('Blender: เริ่มเรนเดอร์ฉากเต็ม');
    const name = `blender-${randomUUID().slice(0, 8)}`;
    try {
        const { jobId } = await call(link, 'blender_render', { ...render(made), width, height, output, name });
        let shown = -1;
        const done = await follow(link, jobId, (state) => {
            const percent = Math.round((state.progress ?? 0) * 100);
            if (percent < shown + 5 && percent !== 100 && shown >= 0 && state.phase === 'render')
                return;
            shown = percent;
            tell(`Blender: ${PHASES[state.phase ?? 'render'] ?? state.phase} ${percent}%${state.frames ? ` (เฟรม ${state.frame ?? 0}/${state.frames})` : ''}`);
        }, options.signal);
        if (done.state !== 'done' || !done.fileId)
            throw new AppError('SERVICE_UNAVAILABLE', { key: 'af-blender-render-failed', message: `The Blender render ${done.state === 'done' ? 'came back without a file' : done.state}: ${(done.error ?? done.log ?? '').slice(-400)}` });
        tell('Blender: ได้ไฟล์แล้ว');
        return { fileId: done.fileId, name: done.name ?? `${name}.mp4`, alpha: made.alpha, output, seconds: output === 'still' ? 0 : brief.seconds, fps, width, height, words: made.words };
    }
    finally {
        if (assetsFileId)
            await deleteFile(assetsFileId, link.requester, true).catch(() => undefined);
    }
}
export async function blenderAsset(ownerId, projectId, made, requester = ownerId) {
    if (made.output === 'png-sequence')
        return null;
    const asset = await addAsset(ownerId, projectId, made.fileId, requester, made.alpha);
    return { name: asset.name, duration: asset.duration ?? made.seconds };
}
export function blenderTag(asset, alpha, length, start, key, track = alpha ? 1 : 0) {
    const timing = `data-start="${start}" data-duration="${length}" data-track-index="${track}"`;
    if (/\.(png|jpe?g|webp)$/i.test(asset.name))
        return `<img id="clip-${key}" class="clip lupo-fill" src="assets/${asset.name}" ${timing} data-fit="cover">`;
    return `<video id="clip-${key}" class="lupo-fill" src="assets/${asset.name}" ${timing} data-media-start="0" data-fit="cover" playsinline muted data-volume="0"></video>`;
}
