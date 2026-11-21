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

The browser editor supports local video/photo/audio import, sequential assembly, frame-level split and ripple trim/delete, reorder/duplicate, snapshot undo/redo, text and subtitles, contain/cover framing, speed, brightness/contrast/saturation, fade through black, per-clip audio gain, a looping music bed, project recovery in IndexedDB and MP4 export. Its preview and export share the same canvas painter.

MP4 is encoded using Mediabunny and browser WebCodecs (H.264 and AAC). Unsupported codecs or dimensions produce an error instead of a falsely labelled download. Exported resolution follows project settings; dimensions must be supported by the browser's encoder. Long exports run locally and may take time. Sources remain in browser storage and are never uploaded by the editor.

This is not a port of FilmCraft's entire professional editor. Multicam, GPU scopes, LUT workflows, proxy media, keyframe curves, advanced audio effects and project interchange are not implemented. Studio currently generates illustrative plans rather than real AI video; its handoff opens the selected product image and copy as editable shots. Real video files can be imported directly into the editor.

## Design base

`docs/design/apple-design.md` is the exact user-supplied skill. The editor applies its system typography, quiet material hierarchy, immediate press feedback, one-to-one timeline scrubbing and trim gestures, gesture-grouped history, keyboard controls, tooltips and reduced motion/transparency/contrast preferences.
