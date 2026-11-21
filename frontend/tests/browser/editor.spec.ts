import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/auth/register", {
    data: { email: `editor-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() },
  });
  expect(response.status()).toBe(201);
});

test("edit, split, undo, save, switch size and export a playable MP4", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await expect(page.getByText("Saved to your account")).toBeVisible();
  await page.screenshot({ path: "/tmp/sea-editor-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("textbox", { name: "Headline", exact: true }).fill("Fresh from our kitchen");
  await expect(page.getByRole("textbox", { name: "Headline", exact: true })).toHaveValue("Fresh from our kitchen");
  const ruler = page.getByRole("slider", { name: "Playhead position" });
  await ruler.focus();
  for (let index = 0; index < 10; index++) await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Split clip (S)", exact: true }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo (⇧⌘Z)", exact: true }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await page.getByRole("button", { name: "Size", exact: true }).click();
  await page.getByRole("button", { name: /1:1 Square/ }).click();
  await expect(page.getByTestId("editor-preview")).toHaveAttribute("width", "1080");
  await expect(page.getByTestId("editor-preview")).toHaveAttribute("height", "1080");
  await expect(page.getByText("Saved to your account")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Headline", exact: true })).toHaveValue("Fresh from our kitchen");
  // Keep the render short and low resolution while exercising the real MP4 writer.
  await page.getByTestId("timeline-clip").nth(2).click();
  await page.getByRole("button", { name: "Delete clip and close gap", exact: true }).click();
  await page.getByTestId("timeline-clip").nth(1).click();
  await page.getByRole("button", { name: "Delete clip and close gap", exact: true }).click();
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await page.getByLabel("End time (seconds)").fill("1");
  await page.getByRole("button", { name: "Size", exact: true }).click();
  await page.getByRole("button", { name: "Custom dimensions", exact: true }).click();
  await page.getByLabel("Width (px)").fill("640");
  await page.getByLabel("Height (px)").fill("360");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download MP4", exact: true })).toBeVisible({ timeout: 60000 });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download MP4", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.mp4$/);
  await file.saveAs("/tmp/sea-editor-export.mp4");
  const info = await page.evaluate(async () => {
    const link = Array.from(document.querySelectorAll("a")).find((a) => a.download.endsWith(".mp4"))!;
    const buffer = await (await fetch(link.href)).arrayBuffer();
    const brand = new TextDecoder().decode(buffer.slice(4, 8));
    const video = document.createElement("video"); video.src = link.href;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("MP4 failed to decode")); });
    return { brand, width: video.videoWidth, height: video.videoHeight, duration: video.duration, bytes: buffer.byteLength };
  });
  expect(info.brand).toBe("ftyp"); expect(info.width).toBe(640); expect(info.height).toBe(360);
  expect(info.duration).toBeGreaterThan(0.9); expect(info.duration).toBeLessThan(1.2); expect(info.bytes).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("mobile editor fits the viewport and keeps controls accessible in Thai", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await page.getByRole("button", { name: "ไทย", exact: true }).click();
  await page.getByRole("button", { name: "ข้อความ", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ข้อความหลัก", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "/tmp/sea-editor-mobile.png", fullPage: true });
});

test("imports real video with audio and exports an edited MP4 with an AAC audio track", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await page.getByRole("button", { name: "My projects", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(0);
  const source = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    const audio = new AudioContext(); await audio.resume();
    const destination = audio.createMediaStreamDestination();
    const oscillator = audio.createOscillator(); oscillator.frequency.value = 440;
    const gain = audio.createGain(); gain.gain.value = 0.1;
    oscillator.connect(gain).connect(destination); oscillator.start();
    const stream = canvas.captureStream(30); stream.addTrack(destination.stream.getAudioTracks()[0]);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
    const chunks: BlobPart[] = [];
    const stopped = new Promise<Blob>((resolve) => { recorder.ondataavailable = (event) => chunks.push(event.data); recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });
    let n = 0;
    const draw = setInterval(() => { ctx.fillStyle = n++ % 2 ? "#2666b4" : "#f28b34"; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = "white"; ctx.font = "24px sans-serif"; ctx.fillText("Real media test", 35, 100); }, 33);
    recorder.start(); await new Promise((resolve) => setTimeout(resolve, 1600)); recorder.stop();
    const blob = await stopped; clearInterval(draw); oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close();
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  });
  await page.getByLabel("Choose media files").setInputFiles({ name: "real-video.webm", mimeType: "video/webm", buffer: Buffer.from(source, "base64") });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByRole("slider", { name: "Clip volume", exact: true }).press("ArrowLeft");
  await page.getByRole("button", { name: "Size", exact: true }).click();
  await page.getByRole("button", { name: "Custom dimensions", exact: true }).click();
  await page.getByLabel("Width (px)").fill("320"); await page.getByLabel("Height (px)").fill("180");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download MP4", exact: true })).toBeVisible({ timeout: 60000 });
  const pending = page.waitForEvent("download"); await page.getByRole("link", { name: "Download MP4", exact: true }).click();
  const file = await pending; const path = await file.path();
  const { readFile } = await import("node:fs/promises");
  const { Input, BufferSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({ source: new BufferSource(await readFile(path!)), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack(); const audio = await input.getPrimaryAudioTrack();
    expect(video).not.toBeNull(); expect(audio).not.toBeNull();
    expect(await input.computeDuration()).toBeGreaterThan(1.3);
    expect(await audio!.getCodec()).toBe("aac");
  } finally { input.dispose(); }
});

test("Studio hands the selected version into the editor", async ({ page }) => {
  await page.goto("/studio/demo");
  await page.getByRole("button", { name: "Use sample photos", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Create clip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your clip is ready", exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole("tab", { name: "Version B", exact: true }).click();
  await page.getByRole("button", { name: "Open in editor", exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?project=/);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Headline", exact: true })).toHaveValue("Hot rice needs this jar");
});

test("the video and live studios accept references and request distinct output formats", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "What will you film today?" })).toBeVisible();
  await expect(page.getByText("OBS Browser Source")).toHaveCount(0);
  await page.getByRole("button", { name: /Skincare launch/ }).click();
  await expect(page.getByRole("button", { name: "Remove file cosmetic.png" })).toBeVisible();
  await page.getByRole("textbox", { name: "Video brief", exact: true }).fill("");
  const formats: string[] = [];
  await page.route("**/agent/chat", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.message).toBeTruthy();
    formats.push(body.outputFormat);
    await route.fulfill({ json: { message: "Brief received" } });
  });
  await page.getByRole("button", { name: "Generate video", exact: true }).click();
  await expect(page.getByRole("main").getByText("Brief received")).toBeVisible();
  await page.getByRole("link", { name: "Live studio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "OBS Browser Source" })).toBeVisible();
  await page.getByRole("textbox", { name: "Video brief" }).fill("Create a price badge");
  await page.getByRole("button", { name: "Generate graphic" }).click();
  await expect(page.getByRole("main").getByText("Brief received")).toBeVisible();
  expect(formats).toEqual(["portrait", "overlay"]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
