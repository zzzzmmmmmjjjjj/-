import * as THREE from "three";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function petalMask(u, v) {
  const x = (u - 0.5) * 2;
  const width = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.999), 0.82)), 0.62);
  const edge = 1 - Math.pow(Math.abs(x) / Math.max(width, 1e-4), 2.8);
  return THREE.MathUtils.clamp(edge, 0, 1);
}

function drawBranch(ctx, x, y, angle, length, width, depth, rand, color) {
  if (depth > 6 || length < 10) return;

  const x2 = x + Math.cos(angle) * length;
  const y2 = y + Math.sin(angle) * length;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(
    (x + x2) / 2 + (rand() - 0.5) * length * 0.18,
    (y + y2) / 2 + (rand() - 0.5) * length * 0.12,
    x2,
    y2
  );
  ctx.strokeStyle = color(depth);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();

  const split = 0.22 + rand() * 0.2;
  drawBranch(ctx, x2, y2, angle - split, length * (0.62 + rand() * 0.12), width * 0.62, depth + 1, rand, color);
  drawBranch(ctx, x2, y2, angle + split * 0.95, length * (0.58 + rand() * 0.12), width * 0.6, depth + 1, rand, color);
  if (depth < 3) {
    drawBranch(ctx, x2, y2, angle + (rand() - 0.5) * 0.12, length * 0.74, width * 0.7, depth + 1, rand, color);
  }
}

export function createPetalMaps(kind = "outer") {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rand = mulberry32(kind === "inner" ? 11 : kind === "mid" ? 23 : 47);

  const image = ctx.createImageData(size, size);
  const data = image.data;

  const palettes = {
    inner: { deep: [232, 72, 108], mid: [255, 132, 156], tip: [255, 196, 208] },
    mid: { deep: [244, 118, 148], mid: [255, 186, 198], tip: [255, 232, 236] },
    outer: { deep: [255, 176, 188], mid: [255, 228, 232], tip: [255, 250, 252] }
  };
  const palette = palettes[kind];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = 1 - y / (size - 1);
      const mask = petalMask(u, v);
      const t = v;
      const r = palette.deep[0] * (1 - t) + palette.mid[0] * t * (1 - t) * 2 + palette.tip[0] * t;
      const g = palette.deep[1] * (1 - t) + palette.mid[1] * t * (1 - t) * 2 + palette.tip[1] * t;
      const b = palette.deep[2] * (1 - t) + palette.mid[2] * t * (1 - t) * 2 + palette.tip[2] * t;
      const grain = (rand() - 0.5) * 10;
      const i = (y * size + x) * 4;
      data[i] = THREE.MathUtils.clamp(r + grain, 0, 255);
      data[i + 1] = THREE.MathUtils.clamp(g + grain * 0.6, 0, 255);
      data[i + 2] = THREE.MathUtils.clamp(b + grain * 0.5, 0, 255);
      data[i + 3] = Math.round(Math.pow(mask, 0.72) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);

  ctx.globalCompositeOperation = "multiply";
  const veinColor = (depth) => {
    const alpha = kind === "outer" ? 0.22 - depth * 0.028 : 0.32 - depth * 0.036;
    return `rgba(168, 36, 72, ${Math.max(0.04, alpha)})`;
  };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size);
  ctx.quadraticCurveTo(size * 0.18, size * 0.55, size * 0.5, size * 0.04);
  ctx.quadraticCurveTo(size * 0.82, size * 0.55, size * 0.5, size);
  ctx.clip();

  drawBranch(ctx, size * 0.5, size * 0.96, -Math.PI / 2, size * 0.42, kind === "outer" ? 5.5 : 7, 0, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.9, -Math.PI / 2 - 0.32, size * 0.28, 3.4, 1, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.9, -Math.PI / 2 + 0.34, size * 0.28, 3.4, 1, rand, veinColor);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

export function createSoftParticleTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,220,230,0.65)");
  gradient.addColorStop(1, "rgba(255,180,200,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
