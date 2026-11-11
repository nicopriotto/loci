/** Resize a user image to a 512x512 center-cropped JPEG data URL (quality 0.82). */
export async function fileToSquareJpeg(file: Blob, size = 512, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close();
  return c.toDataURL('image/jpeg', quality);
}
