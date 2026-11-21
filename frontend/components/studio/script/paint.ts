/**
 * Draws a photo onto white. A PNG with transparent areas has no colour there, and a canvas exported as JPEG
 * (which has no alpha channel) turns those areas black. Filling white first makes them white instead.
 */
export function paintOnWhite(
  ctx: Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect" | "drawImage">,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}
