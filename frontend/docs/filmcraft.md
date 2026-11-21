# SnapPromo Edit and FilmCraft

The requested FilmCraft source was cloned from https://github.com/storytold/filmcraft at commit `960a661001767a887dc4402c51e24f0436176705` to `/tmp/sea-filmcraft` for inspection, with a source copy retained in `references/filmcraft/` at the repository root (ignored by Git). It is a native Rust / WebAssembly application, not a React component library. SnapPromo uses a TypeScript adaptation of selected timeline semantics rather than embedding the entire Rust engine.

## Source mapping

- `crates/edit/src/lib.rs`, `split_track_at`: split strictly inside a clip, preserve the consumed source range using playback speed and give the right fragment a new ID. Adapted in `lib/editor/model.ts`.
- `crates/edit/src/lib.rs`, `move_edge` / `trim`: clamp edits to media handles and keep at least one sequence frame. The browser adaptation uses a contiguous sequence, so trims shift later clips automatically.
- `crates/edit/src/lib.rs`, `ripple_delete_items`: close the deleted interval. Titles and source audio stay attached to their clip in the simpler browser model.
- `crates/engine/src/lib.rs`, `History`, `Session::undo` / `redo`, `edit_merged`: project snapshots, redo invalidation after new edits and one undo step for a continuous gesture.
- `crates/time/src/lib.rs`: exact edit time. The browser implementation uses integer frames at 30 fps, with seconds only at decoder/audio boundaries. It does not implement FilmCraft's tick format or interchange ABI.

FilmCraft is dual licensed MIT / Apache-2.0. The adaptation uses its MIT option; the full required copyright and permission notice is retained in `docs/licenses/filmcraft-MIT.txt`. No FilmCraft brand assets, fonts, Rust codecs or UI binary are redistributed.

## Scope

The browser editor supports local video/photo/audio import, sequential assembly, frame-level split and ripple trim/delete, reorder/duplicate, snapshot undo/redo, text and subtitles, contain/cover framing, speed, brightness/contrast/saturation, fade through black, per-clip audio gain, a looping music bed, per-account project and media storage in MongoDB, and MP4 export. The backend compiles the timeline into a HyperFrames composition for both playback and export.

Open **Assistant** to edit the selected shot or the entire timeline with a prompt. On wide screens the conversation sits beside the preview. On phones it opens below the playback controls. It can change captions, framing, camera movement, timing, clip volume, image adjustments and shot order. Each applied prompt is one undo step. The pencil reopens the last prompt for that scope.

The editor uses the HyperFrames player for playback and seeking. Export checks the saved composition in Docker and renders H.264 and AAC on the host. The video dimensions and frame rate follow the editor project.

Video Studio opens the rendered film in the editor with cuts at the production’s scene boundaries. The original motion design can be revised from the Studio result. The step-by-step demo opens its sample image and copy as editable shots.

## Design base

`docs/design/apple-design.md` is the exact user-supplied skill. The editor applies its system typography, quiet material hierarchy, immediate press feedback, one-to-one timeline scrubbing and trim gestures, gesture-grouped history, keyboard controls, tooltips and reduced motion/transparency/contrast preferences.
