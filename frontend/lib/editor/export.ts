import { FPS, framesOf, locate, totalFrames, type Asset, type Project } from "./model";
import { paintFrame } from "./media";

export async function exportMp4(project: Project, assets: Asset[], onProgress: (value: number) => void, signal: AbortSignal) {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, AudioBufferSource, Quality, Input, BlobSource, ALL_FORMATS, CanvasSink, AudioBufferSink, canEncodeVideo, canEncodeAudio } = await import("mediabunny");
  const size = project.size;
  if (!await canEncodeVideo("avc", { width: size.width, height: size.height })) throw new Error("MP4 encoding is unavailable for this size in this browser. Try Chrome, Edge or Safari, or choose a smaller even-numbered size.");
  const frames = totalFrames(project); if (!frames) throw new Error("Add a clip before exporting.");
  if (frames > 30 * 60 * FPS) throw new Error("Browser exports are limited to 30 minutes per project.");
  const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas is unavailable.");
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", quality: new Quality("high") });
  output.addVideoTrack(video, { frameRate: FPS });
  const inputs = new Map<string, InstanceType<typeof Input>>();
  const sinks = new Map<string, InstanceType<typeof CanvasSink>>();
  const pictures = new Map<string, HTMLImageElement>();
  const urls: string[] = [];
  const abort = () => { if (signal.aborted) throw new DOMException("Export cancelled", "AbortError"); };
  const findAsset = (id: string) => { const asset = assets.find((item) => item.id === id); if (!asset) throw new Error("Media is missing. Import the original file again."); return asset; };
  const getInput = (asset: Asset) => { let input = inputs.get(asset.id); if (!input) { input = new Input({ source: new BlobSource(asset.file), formats: ALL_FORMATS }); inputs.set(asset.id, input); } return input; };
  try {
    // Schedule source audio at exact sequence positions, including source trims and rate changes.
    let offline: OfflineAudioContext | null = null;
    let hasAudio = false;
    async function schedule(asset: Asset, when: number, sourceIn: number, length: number, speed: number, volume: number, repeat = false) {
      if (!volume) return;
      const input = getInput(asset), track = await input.getPrimaryAudioTrack(); if (!track) return;
      if (!await track.canDecode()) throw new Error(`Audio in ${asset.name} cannot be decoded in this browser.`);
      offline ??= new OfflineAudioContext(2, Math.ceil(frames / FPS * 48000), 48000);
      const sink = new AudioBufferSink(track);
      const fullLength = asset.frames / FPS;
      const repeats = repeat ? Math.ceil(length / fullLength) : 1;
      for (let cycle = 0; cycle < repeats; cycle++) {
        const begin = repeat ? 0 : sourceIn, end = repeat ? Math.min(fullLength, length - cycle * fullLength) : sourceIn + length * speed;
        for await (const { buffer, timestamp } of sink.buffers(begin, end)) {
          abort();
          const inBuffer = Math.max(0, begin - timestamp), sourceEnd = Math.min(buffer.duration, end - timestamp);
          if (sourceEnd <= inBuffer) continue;
          const node = offline.createBufferSource(); node.buffer = buffer; node.playbackRate.value = speed;
          const gain = offline.createGain(); gain.gain.value = volume; node.connect(gain).connect(offline.destination);
          const at = when + (repeat ? cycle * fullLength : 0) + Math.max(0, timestamp - begin) / speed;
          node.start(at, inBuffer, sourceEnd - inBuffer); hasAudio = true;
        }
      }
    }
    let start = 0;
    for (const clip of project.clips) { abort(); const asset = findAsset(clip.assetId); if (asset.kind === "video") await schedule(asset, start / FPS, clip.sourceIn / FPS, framesOf(clip) / FPS, clip.speed, clip.volume); start += framesOf(clip); }
    if (project.music) await schedule(findAsset(project.music.assetId), 0, 0, frames / FPS, 1, project.music.volume, true);
    let audio: InstanceType<typeof AudioBufferSource> | undefined;
    if (hasAudio) {
      if (!await canEncodeAudio("aac")) throw new Error("AAC audio export is unavailable in this browser. Try Chrome, Edge or Safari.");
      audio = new AudioBufferSource({ codec: "aac", quality: new Quality({ bitrate: 192000 }) }); output.addAudioTrack(audio);
    }
    await output.start();
    if (audio) { abort(); await audio.add(await offline!.startRendering()); audio.close(); }
    for (let frame = 0; frame < frames; frame++) {
      abort(); const current = locate(project, frame)!; const asset = findAsset(current.clip.assetId);
      let source: CanvasImageSource;
      if (asset.kind === "image") {
        let image = pictures.get(asset.id);
        if (!image) { image = new Image(); const url = URL.createObjectURL(asset.file); urls.push(url); image.src = url; await image.decode(); pictures.set(asset.id, image); }
        source = image;
      } else {
        let sink = sinks.get(asset.id);
        if (!sink) { const track = await getInput(asset).getPrimaryVideoTrack(); if (!track || !await track.canDecode()) throw new Error(`Video in ${asset.name} cannot be decoded.`); sink = new CanvasSink(track, { poolSize: 1 }); sinks.set(asset.id, sink); }
        const sample = await sink.getCanvas((current.clip.sourceIn + current.offset * current.clip.speed) / FPS);
        if (!sample) throw new Error(`A frame in ${asset.name} could not be decoded.`); source = sample.canvas;
      }
      paintFrame(context, project, current.clip, asset, source, current.offset);
      await video.add(frame / FPS, 1 / FPS);
      if (frame % 3 === 0) { onProgress((frame + 1) / frames * 95); await new Promise((resolve) => setTimeout(resolve, 0)); }
    }
    video.close(); abort(); await output.finalize(); onProgress(100);
    if (!output.target.buffer) throw new Error("The export file is empty.");
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
  finally { for (const input of inputs.values()) input.dispose(); for (const url of urls) URL.revokeObjectURL(url); }
}
