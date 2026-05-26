import { badgeOctagonPoints } from '@/components/badges/badgeShape';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function triggerPngDownload(dataUrl: string, filename: string): boolean {
  if (!dataUrl || typeof document === 'undefined') return false;

  try {
    const blob = dataUrlToBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 800);
    return true;
  } catch {
    return false;
  }
}

function prepareCloneForExport(root: HTMLElement) {
  root.querySelectorAll('[data-export-score]').forEach((el) => {
    if (el instanceof HTMLElement) {
      el.style.background = 'none';
      el.style.backgroundImage = 'none';
      el.style.webkitBackgroundClip = 'border-box';
      el.style.backgroundClip = 'border-box';
      el.style.webkitTextFillColor = '#e879f9';
      el.style.color = '#e879f9';
    }
  });
  root.querySelectorAll('[data-export-brand]').forEach((el) => {
    if (el instanceof HTMLElement) {
      el.style.background = 'none';
      el.style.webkitTextFillColor = '#c4b5fd';
      el.style.color = '#c4b5fd';
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Shrink octagon slightly so edge glow / flower bleed is cut off */
function insetOctagonPoints(
  pts: [number, number][],
  insetPx: number
): [number, number][] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * insetPx, y + (dy / len) * insetPx] as [number, number];
  });
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Force transparent pixels outside badge outline */
export async function maskPngToOctagon(dataUrl: string, insetPx = 4): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  const poly = insetOctagonPoints(badgeOctagonPoints(w, h), insetPx);

  ctx.clearRect(0, 0, w, h);
  const imageData = ctx.createImageData(w, h);
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tctx = temp.getContext('2d')!;
  tctx.drawImage(img, 0, 0);
  const src = tctx.getImageData(0, 0, w, h).data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!pointInPolygon(x, y, poly)) {
        imageData.data[i + 3] = 0;
      } else {
        imageData.data[i] = src[i];
        imageData.data[i + 1] = src[i + 1];
        imageData.data[i + 2] = src[i + 2];
        imageData.data[i + 3] = src[i + 3];
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

async function captureWithHtmlToImage(el: HTMLElement): Promise<string | null> {
  const { toPng } = await import('html-to-image');
  return toPng(el, {
    cacheBust: true,
    pixelRatio: 2.5,
    backgroundColor: 'transparent',
    skipAutoScale: true,
    filter: (node) => {
      if (node instanceof HTMLElement) {
        if (node.dataset?.exportHide === 'true') return false;
        if (node.classList?.contains('credential-floral-decor')) return false;
      }
      return true;
    },
  });
}

async function captureWithHtml2Canvas(el: HTMLElement): Promise<string | null> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, {
    backgroundColor: null,
    scale: 2.5,
    useCORS: true,
    allowTaint: true,
    logging: false,
    onclone: (_doc, cloned) => {
      if (cloned instanceof HTMLElement) {
        prepareCloneForExport(cloned);
        cloned.querySelectorAll('.credential-floral-decor').forEach((n) => n.remove());
      }
    },
  });
  return canvas.toDataURL('image/png');
}

export async function captureBadgeElement(el: HTMLElement): Promise<string | null> {
  let raw: string | null = null;

  try {
    raw = await captureWithHtmlToImage(el);
  } catch (err) {
    console.warn('[credential] html-to-image failed:', err);
  }

  if (!raw) {
    try {
      raw = await captureWithHtml2Canvas(el);
    } catch (err) {
      console.warn('[credential] html2canvas failed:', err);
    }
  }

  if (!raw) return null;

  try {
    return await maskPngToOctagon(raw, 6);
  } catch {
    return raw;
  }
}

export async function downloadBadgeScreenshot(
  el: HTMLElement | null,
  studentName: string
): Promise<boolean> {
  if (!el) return false;

  const safeName = studentName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'player';
  const filename = `buzznexus-credential-${safeName}.png`;

  const dataUrl = await captureBadgeElement(el);
  if (!dataUrl) return false;

  return triggerPngDownload(dataUrl, filename);
}
