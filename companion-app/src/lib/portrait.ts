// Shrinks a picture to a small square so it fits comfortably in a sheet's JSON.
// Pictures with see-through areas stay PNG so the card shows through them; the rest
// become JPEG, which is far smaller.
export async function portraitFromFile(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Centre crop to a square.
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return hasTransparency(ctx, size) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.8);
}

function hasTransparency(ctx: CanvasRenderingContext2D, size: number): boolean {
  const pixels = ctx.getImageData(0, 0, size, size).data;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) return true;
  return false;
}
