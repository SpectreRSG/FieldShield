/**
 * Draws simple synthetic "photographs" for the demonstration inspection.
 * Every image is watermarked SYNTHETIC DEMO IMAGE so it can never be mistaken for evidence.
 */
import type { DemoPhotoSpec } from './demo';

const W = 1280;
const H = 960;

function sky(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#9cc3e6');
  g.addColorStop(1, '#e8f1f8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6f9a4f';
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
}

function house(ctx: CanvasRenderingContext2D, variant: 'front' | 'rear' | 'left') {
  sky(ctx);
  const x = variant === 'left' ? 340 : 220;
  const w = variant === 'left' ? 600 : 840;
  ctx.fillStyle = variant === 'rear' ? '#d9cdb8' : '#e5dccb';
  ctx.fillRect(x, 420, w, 330);
  // Siding lines
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let y = 430; y < 750; y += 18) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  // Roof
  ctx.fillStyle = '#4b4f57';
  ctx.beginPath();
  if (variant === 'left') {
    ctx.moveTo(x - 40, 430);
    ctx.lineTo(x + w / 2, 230);
    ctx.lineTo(x + w + 40, 430);
  } else {
    ctx.moveTo(x - 50, 430);
    ctx.lineTo(x + 160, 250);
    ctx.lineTo(x + w - 160, 250);
    ctx.lineTo(x + w + 50, 430);
  }
  ctx.closePath();
  ctx.fill();
  // Windows / door
  ctx.fillStyle = '#7fa6c9';
  const wins = variant === 'left' ? [x + 120, x + 380] : [x + 80, x + 300, x + 600];
  for (const wx of wins) {
    ctx.fillRect(wx, 500, 110, 130);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.strokeRect(wx, 500, 110, 130);
  }
  if (variant === 'front') {
    ctx.fillStyle = '#6b3f2a';
    ctx.fillRect(x + 455, 560, 90, 190);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('100', x + 470, 545);
  }
  // Gutter
  ctx.fillStyle = '#ddd';
  ctx.fillRect(x - 50, 428, w + 100, 14);
}

function shingles(ctx: CanvasRenderingContext2D, scale = 1) {
  ctx.fillStyle = '#50545c';
  ctx.fillRect(0, 0, W, H);
  const rowH = 46 * scale;
  const tabW = 120 * scale;
  for (let row = 0, y = 0; y < H; row++, y += rowH) {
    for (let x = row % 2 ? -tabW / 2 : 0; x < W; x += tabW) {
      const shade = 70 + ((x * 7 + y * 3) % 30);
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 10})`;
      ctx.fillRect(x + 2, y + 2, tabW - 4, rowH - 4);
    }
  }
  // granule speckle
  for (let i = 0; i < 4000; i++) {
    const v = 60 + ((i * 37) % 80);
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect((i * 97) % W, (i * 53) % H, 2, 2);
  }
}

function draw(ctx: CanvasRenderingContext2D, scene: DemoPhotoSpec['scene']) {
  switch (scene) {
    case 'house':
      return house(ctx, 'front');
    case 'house-rear':
      return house(ctx, 'rear');
    case 'house-left':
      return house(ctx, 'left');
    case 'roof':
      sky(ctx);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(80, 820);
      ctx.lineTo(380, 260);
      ctx.lineTo(900, 260);
      ctx.lineTo(1200, 820);
      ctx.closePath();
      ctx.clip();
      shingles(ctx, 0.6);
      ctx.restore();
      return;
    case 'roof-test':
      shingles(ctx, 0.8);
      ctx.strokeStyle = '#f4f4f4';
      ctx.lineWidth = 10;
      ctx.strokeRect(300, 180, 680, 600);
      ctx.fillStyle = '#f4f4f4';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText('TS', 320, 250);
      for (const [cx, cy] of [[420, 320], [560, 400], [820, 300], [700, 560], [450, 640], [880, 680], [620, 260], [380, 480], [900, 480]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    case 'hail-hit':
      shingles(ctx, 2.4);
      ctx.fillStyle = '#2b2d31';
      ctx.beginPath();
      ctx.arc(640, 480, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4f4f4';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(640, 480, 110, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 'gutter': {
      sky(ctx);
      ctx.fillStyle = '#e9e9e9';
      ctx.fillRect(0, 380, W, 220);
      ctx.fillStyle = '#c9c9c9';
      for (const x of [180, 420, 610, 900, 1080]) {
        ctx.beginPath();
        ctx.ellipse(x, 490, 34, 24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#4b4f57';
      ctx.fillRect(0, 300, W, 80);
      return;
    }
    case 'screen':
      ctx.fillStyle = '#e5dccb';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#9fb7cc';
      ctx.fillRect(240, 120, 800, 720);
      ctx.strokeStyle = 'rgba(40,40,40,0.35)';
      ctx.lineWidth = 1;
      for (let i = 240; i < 1040; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, 120); ctx.lineTo(i, 840); ctx.stroke();
      }
      for (let j = 120; j < 840; j += 8) {
        ctx.beginPath(); ctx.moveTo(240, j); ctx.lineTo(1040, j); ctx.stroke();
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 16;
      ctx.strokeRect(240, 120, 800, 720);
      ctx.fillStyle = '#9fb7cc';
      ctx.beginPath();
      ctx.moveTo(880, 760); ctx.lineTo(980, 700); ctx.lineTo(960, 790); ctx.closePath();
      ctx.fill();
      return;
    case 'kitchen':
      ctx.fillStyle = '#f1efe9';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, 220);
      ctx.fillStyle = '#8a6b4e';
      ctx.fillRect(80, 520, 1120, 300);
      ctx.fillStyle = '#d8d3c8';
      ctx.fillRect(80, 500, 1120, 30);
      ctx.fillStyle = '#9b7f62';
      ctx.fillRect(140, 250, 400, 180);
      ctx.fillRect(760, 250, 400, 180);
      ctx.fillStyle = 'rgba(150,110,60,0.45)';
      ctx.beginPath();
      ctx.ellipse(900, 110, 150, 70, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'stain':
      ctx.fillStyle = '#f7f6f2';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(160,120,70,0.35)';
      ctx.beginPath();
      ctx.ellipse(640, 480, 420, 260, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,40,0.7)';
      ctx.lineWidth = 12;
      ctx.stroke();
      return;
  }
}

export async function renderDemoImage(spec: DemoPhotoSpec): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  draw(ctx, spec.scene);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H - 64, W, 64);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('SYNTHETIC DEMO IMAGE — FieldShield', 24, H - 22);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85));
}
