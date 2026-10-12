/**
 * Evidence and Relationship Manager — photographs.
 *
 * Originals are stored byte-for-byte as received and never modified.
 * Annotations always produce a separate derived copy that points back to the original.
 */
import type { Inspection, Photo, PhotoAnnotation, ShotType } from '../domain/models';
import { newId, nowIso } from '../domain/ids';

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Revoke after decode; the decoded bitmap stays usable for drawing.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality)
  );
}

export async function makeThumbnail(img: HTMLImageElement, max = 360): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', 0.8);
}

export interface ProcessedImage {
  original: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error(`Image is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB`);
  if (file.type && !file.type.startsWith('image/')) throw new Error('Not an image file');
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error('This image format cannot be read by this browser (HEIC may need converting to JPEG first)');
  }
  const thumb = await makeThumbnail(img);
  return { original: file, thumb, width: img.naturalWidth, height: img.naturalHeight };
}

const KEYWORDS: { re: RegExp; component?: string; areaHint?: RegExp; shot?: ShotType }[] = [
  { re: /front/i, areaHint: /front/i },
  { re: /rear|back/i, areaHint: /rear|back/i },
  { re: /left/i, areaHint: /left/i },
  { re: /right/i, areaHint: /right/i },
  { re: /roof|shingle/i, areaHint: /roof/i, component: 'Roof covering' },
  { re: /gutter/i, component: 'Gutter' },
  { re: /siding/i, component: 'Siding' },
  { re: /window|screen/i, component: 'Window / screen' },
  { re: /ceiling/i, component: 'Ceiling' },
  { re: /wall|drywall/i, component: 'Wall' },
  { re: /floor|carpet/i, component: 'Flooring' },
  { re: /kitchen/i, areaHint: /kitchen/i },
  { re: /bath/i, areaHint: /bath/i },
  { re: /bed/i, areaHint: /bed/i },
  { re: /living/i, areaHint: /living/i },
  { re: /overview|wide/i, shot: 'overview' },
  { re: /close|detail|macro/i, shot: 'closeup' },
  { re: /context/i, shot: 'context' }
];

/**
 * Suggest a classification from the file name and the area the user is working in.
 * Suggestions are clearly marked and stay "pending" until the user accepts or corrects them.
 */
export function suggestClassification(
  insp: Inspection,
  fileName: string,
  activeAreaId: string | undefined
): Photo['suggestion'] {
  const reasons: string[] = [];
  let areaId: string | undefined;
  let component: string | undefined;
  let shotType: ShotType | undefined;

  for (const k of KEYWORDS) {
    if (!k.re.test(fileName)) continue;
    if (k.areaHint && !areaId) {
      const a = insp.areas.find((x) => k.areaHint!.test(x.name));
      if (a) {
        areaId = a.id;
        reasons.push(`file name mentions "${fileName.match(k.re)?.[0]}"`);
      }
    }
    if (k.component && !component) component = k.component;
    if (k.shot && !shotType) shotType = k.shot;
  }
  if (!areaId && activeAreaId) {
    areaId = activeAreaId;
    reasons.push('you were working in this area');
  }
  if (!shotType && areaId) {
    const existing = insp.photos.filter((p) => p.areaId === areaId);
    const area = insp.areas.find((a) => a.id === areaId);
    const missing = area?.photoRequirements.find((r) => !existing.some((p) => p.shotType === r));
    if (missing) {
      shotType = missing;
      reasons.push(`the area's photo checklist still needs a ${missing} photo`);
    }
  }
  if (!areaId && !component && !shotType) return undefined;
  return { areaId, component, shotType, reason: `Suggested because ${reasons.join(' and ') || 'of the file name'}.`, status: 'pending' };
}

export function newPhotoRecord(
  partial: Pick<Photo, 'fileName' | 'mimeType' | 'width' | 'height' | 'sizeBytes' | 'origin'> & Partial<Photo>
): Photo {
  const id = newId('pho');
  const now = nowIso();
  return {
    id,
    blobKey: `${id}/original`,
    thumbKey: `${id}/thumb`,
    capturedAt: now,
    importedAt: now,
    isOriginal: true,
    component: '',
    shotType: 'other',
    caption: '',
    notes: '',
    labels: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  } as Photo;
}

/** Draw annotation shapes over an image onto a canvas (used for preview and for saving). */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  shapes: PhotoAnnotation['shapes'],
  w: number,
  h: number
): void {
  const lw = Math.max(3, Math.round(Math.min(w, h) / 150));
  for (const s of shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = s.points.map(([x, y]) => [x * w, y * h] as const);
    if (s.type === 'stroke' && pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    } else if (s.type === 'circle' && pts.length === 2) {
      const r = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.type === 'arrow' && pts.length === 2) {
      const [[x1, y1], [x2, y2]] = pts;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = lw * 5;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (s.type === 'text' && pts.length >= 1 && s.text) {
      const size = Math.max(16, Math.round(Math.min(w, h) / 22));
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      const m = ctx.measureText(s.text);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(pts[0][0] - 4, pts[0][1] - size, m.width + 8, size * 1.3);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, pts[0][0], pts[0][1]);
    }
  }
}

/** Render an annotated copy. The original blob is only read, never changed. */
export async function renderAnnotatedCopy(original: Blob, shapes: PhotoAnnotation['shapes']): Promise<ProcessedImage> {
  const img = await loadImage(original);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  drawAnnotations(ctx, shapes, c.width, c.height);
  const full = await canvasToBlob(c, 'image/jpeg', 0.9);
  const thumb = await makeThumbnail(await loadImage(full));
  return { original: full, thumb, width: c.width, height: c.height };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Downscale for PDF embedding to keep exported files a sensible size. */
export async function blobToJpegDataUrl(blob: Blob, max = 1200): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(blob);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.82), width: c.width, height: c.height };
}
