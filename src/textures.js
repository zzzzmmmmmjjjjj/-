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

function rosePetalMask(u, v) {
  const x = (u - 0.5) * 2;
  const widthProfile =
    Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.995), 0.58)), 0.64) * (0.16 + Math.pow(v, 0.82) * 0.84);
  const edge = 1 - Math.pow(Math.abs(x) / Math.max(widthProfile, 0.01), 2.15);
  const heartNotch =
    v > 0.86 ? 1 - Math.pow((v - 0.86) / 0.14, 1.25) * Math.max(0, 1 - Math.abs(x) * 0.85) : 1;
  const wave = 1 + Math.sin(v * 16 + u * 9) * 0.025 * v;
  return THREE.MathUtils.clamp(edge * heartNotch * wave, 0, 1);
}

function drawBranch(ctx, x, y, angle, length, width, depth, rand, color) {
  if (depth > 6 || length < 8) return;
  const x2 = x + Math.cos(angle) * length;
  const y2 = y + Math.sin(angle) * length;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(
    (x + x2) / 2 + (rand() - 0.5) * length * 0.12,
    (y + y2) / 2 + (rand() - 0.5) * length * 0.08,
    x2,
    y2
  );
  ctx.strokeStyle = color(depth);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
  const split = 0.18 + rand() * 0.16;
  drawBranch(ctx, x2, y2, angle - split, length * 0.64, width * 0.6, depth + 1, rand, color);
  drawBranch(ctx, x2, y2, angle + split, length * 0.6, width * 0.58, depth + 1, rand, color);
}

function createCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}

export function createPetalMaps(kind = "outer", size = 1024) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const emissiveCanvas = createCanvas(size);
  const emissiveCtx = emissiveCanvas.getContext("2d");
  const rand = mulberry32(kind === "inner" ? 11 : kind === "mid" ? 23 : 47);

  const image = ctx.createImageData(size, size);
  const emissiveImage = emissiveCtx.createImageData(size, size);
  const data = image.data;
  const emissiveData = emissiveImage.data;

  const palettes = {
    inner: {
      deep: [210, 138, 152],
      mid: [232, 178, 188],
      tip: [248, 218, 224],
      edge: [255, 236, 240]
    },
    mid: {
      deep: [222, 158, 170],
      mid: [242, 198, 206],
      tip: [252, 228, 232],
      edge: [255, 244, 246]
    },
    outer: {
      deep: [232, 178, 188],
      mid: [248, 214, 220],
      tip: [255, 240, 242],
      edge: [255, 250, 251]
    }
  };
  const palette = palettes[kind];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = 1 - y / (size - 1);
      const mask = rosePetalMask(u, v);
      const xNorm = Math.abs((u - 0.5) * 2);
      const edgeGlow = Math.pow(1 - xNorm, 2.2) * Math.pow(v, 0.62);
      const velvet = 0.9 + Math.sin(u * size * 0.08) * Math.sin(v * size * 0.06) * 0.05;
      const baseShadow = Math.pow(1 - v, 1.8) * 0.18;
      const t = Math.pow(v, 0.82);
      const baseMix = t * (1 - t) * 4;
      const r = (palette.deep[0] * (1 - t) * (1 + baseShadow) + palette.mid[0] * baseMix + palette.tip[0] * t) * velvet;
      const g = (palette.deep[1] * (1 - t) * (1 + baseShadow) + palette.mid[1] * baseMix + palette.tip[1] * t) * velvet;
      const b = (palette.deep[2] * (1 - t) * (1 + baseShadow) + palette.mid[2] * baseMix + palette.tip[2] * t) * velvet;
      const grain = (rand() - 0.5) * 5;
      const i = (y * size + x) * 4;
      data[i] = THREE.MathUtils.clamp(r + grain, 0, 255);
      data[i + 1] = THREE.MathUtils.clamp(g + grain * 0.4, 0, 255);
      data[i + 2] = THREE.MathUtils.clamp(b + grain * 0.35, 0, 255);
      data[i + 3] = Math.round(Math.pow(mask, 0.72) * 255);

      const emissiveStrength = (edgeGlow * 0.22 + Math.pow(1 - xNorm, 3) * v * 0.12) * mask;
      emissiveData[i] = THREE.MathUtils.clamp(palette.edge[0] * emissiveStrength, 0, 255);
      emissiveData[i + 1] = THREE.MathUtils.clamp(palette.edge[1] * emissiveStrength, 0, 255);
      emissiveData[i + 2] = THREE.MathUtils.clamp(palette.edge[2] * emissiveStrength, 0, 255);
      emissiveData[i + 3] = Math.round(emissiveStrength * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  emissiveCtx.putImageData(emissiveImage, 0, 0);

  ctx.globalCompositeOperation = "multiply";
  const veinColor = (depth) => `rgba(210, 140, 155, ${Math.max(0.04, 0.18 - depth * 0.022)})`;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size);
  ctx.quadraticCurveTo(size * 0.2, size * 0.5, size * 0.5, size * 0.06);
  ctx.quadraticCurveTo(size * 0.8, size * 0.5, size * 0.5, size);
  ctx.clip();
  drawBranch(ctx, size * 0.5, size * 0.95, -Math.PI / 2, size * 0.4, kind === "outer" ? 3.5 : 4.5, 0, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.88, -Math.PI / 2 - 0.28, size * 0.24, 2.5, 1, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.88, -Math.PI / 2 + 0.3, size * 0.24, 2.5, 1, rand, veinColor);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  const gloss = ctx.createLinearGradient(size * 0.15, 0, size * 0.75, size);
  gloss.addColorStop(0, "rgba(255,255,255,0.16)");
  gloss.addColorStop(0.35, "rgba(255,255,255,0.04)");
  gloss.addColorStop(0.7, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = 8;
  emissiveMap.needsUpdate = true;

  return { map, emissiveMap };
}

export function createSoftParticleTexture() {
  const size = 128;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.3, "rgba(255,228,236,0.45)");
  gradient.addColorStop(1, "rgba(255,200,214,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createGoldParticleTexture() {
  const size = 128;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,248,252,0.9)");
  gradient.addColorStop(0.35, "rgba(255,220,230,0.35)");
  gradient.addColorStop(1, "rgba(255,190,205,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createFloatingPetalTexture(size = 256) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const rand = mulberry32(909);
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = 1 - y / (size - 1);
      const mask = rosePetalMask(u, v);
      const i = (y * size + x) * 4;
      const tone = 230 + v * 20 + (rand() - 0.5) * 6;
      data[i] = THREE.MathUtils.clamp(tone, 0, 255);
      data[i + 1] = THREE.MathUtils.clamp(tone - 28, 0, 255);
      data[i + 2] = THREE.MathUtils.clamp(tone - 18, 0, 255);
      data[i + 3] = Math.round(Math.pow(mask, 0.78) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
