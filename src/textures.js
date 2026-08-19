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
  const width = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.999), 0.78)), 0.58);
  const edge = 1 - Math.pow(Math.abs(x) / Math.max(width, 1e-4), 2.65);
  return THREE.MathUtils.clamp(edge, 0, 1);
}

function drawBranch(ctx, x, y, angle, length, width, depth, rand, color) {
  if (depth > 7 || length < 8) return;

  const x2 = x + Math.cos(angle) * length;
  const y2 = y + Math.sin(angle) * length;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(
    (x + x2) / 2 + (rand() - 0.5) * length * 0.16,
    (y + y2) / 2 + (rand() - 0.5) * length * 0.1,
    x2,
    y2
  );
  ctx.strokeStyle = color(depth);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();

  const split = 0.2 + rand() * 0.18;
  drawBranch(ctx, x2, y2, angle - split, length * (0.64 + rand() * 0.1), width * 0.62, depth + 1, rand, color);
  drawBranch(ctx, x2, y2, angle + split * 0.92, length * (0.6 + rand() * 0.1), width * 0.58, depth + 1, rand, color);
  if (depth < 4) {
    drawBranch(ctx, x2, y2, angle + (rand() - 0.5) * 0.14, length * 0.72, width * 0.68, depth + 1, rand, color);
  }
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
      deep: [92, 8, 24],
      mid: [148, 28, 48],
      tip: [196, 72, 88],
      edge: [220, 110, 118]
    },
    mid: {
      deep: [108, 14, 32],
      mid: [168, 42, 58],
      tip: [214, 96, 108],
      edge: [236, 148, 152]
    },
    outer: {
      deep: [124, 22, 42],
      mid: [188, 68, 82],
      tip: [228, 132, 142],
      edge: [248, 188, 192]
    }
  };
  const palette = palettes[kind];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = 1 - y / (size - 1);
      const mask = petalMask(u, v);
      const xNorm = Math.abs((u - 0.5) * 2);
      const edgeGlow = Math.pow(1 - xNorm, 1.8) * Math.pow(v, 0.55);
      const velvet = 0.88 + Math.sin(u * size * 0.08) * Math.sin(v * size * 0.06) * 0.06;
      const t = Math.pow(v, 0.92);
      const baseMix = t * (1 - t) * 4;
      const r =
        (palette.deep[0] * (1 - t) + palette.mid[0] * baseMix + palette.tip[0] * t) * velvet;
      const g =
        (palette.deep[1] * (1 - t) + palette.mid[1] * baseMix + palette.tip[1] * t) * velvet;
      const b =
        (palette.deep[2] * (1 - t) + palette.mid[2] * baseMix + palette.tip[2] * t) * velvet;
      const grain = (rand() - 0.5) * 8;
      const i = (y * size + x) * 4;
      data[i] = THREE.MathUtils.clamp(r + grain, 0, 255);
      data[i + 1] = THREE.MathUtils.clamp(g + grain * 0.45, 0, 255);
      data[i + 2] = THREE.MathUtils.clamp(b + grain * 0.35, 0, 255);
      data[i + 3] = Math.round(Math.pow(mask, 0.68) * 255);

      const subsurface = edgeGlow * (0.35 + v * 0.45) * mask;
      const edgeHot = Math.pow(1 - xNorm, 3.2) * Math.pow(v, 0.75) * mask * 0.85;
      const emissiveStrength = subsurface * 0.55 + edgeHot * (kind === "outer" ? 1 : 0.72);
      const er = palette.edge[0] * emissiveStrength + 255 * edgeHot * 0.18;
      const eg = palette.edge[1] * emissiveStrength * 0.72 + 210 * edgeHot * 0.12;
      const eb = palette.edge[2] * emissiveStrength * 0.65 + 180 * edgeHot * 0.08;
      emissiveData[i] = THREE.MathUtils.clamp(er, 0, 255);
      emissiveData[i + 1] = THREE.MathUtils.clamp(eg, 0, 255);
      emissiveData[i + 2] = THREE.MathUtils.clamp(eb, 0, 255);
      emissiveData[i + 3] = Math.round(emissiveStrength * mask * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  emissiveCtx.putImageData(emissiveImage, 0, 0);

  ctx.globalCompositeOperation = "multiply";
  const veinColor = (depth) => {
    const alpha = kind === "outer" ? 0.28 - depth * 0.032 : 0.42 - depth * 0.04;
    return `rgba(72, 8, 22, ${Math.max(0.05, alpha)})`;
  };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size);
  ctx.quadraticCurveTo(size * 0.16, size * 0.52, size * 0.5, size * 0.03);
  ctx.quadraticCurveTo(size * 0.84, size * 0.52, size * 0.5, size);
  ctx.clip();

  drawBranch(ctx, size * 0.5, size * 0.96, -Math.PI / 2, size * 0.44, kind === "outer" ? 4.8 : 6.5, 0, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.9, -Math.PI / 2 - 0.34, size * 0.3, 3.2, 1, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.9, -Math.PI / 2 + 0.36, size * 0.3, 3.2, 1, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.82, -Math.PI / 2 - 0.12, size * 0.18, 2.2, 2, rand, veinColor);
  drawBranch(ctx, size * 0.5, size * 0.82, -Math.PI / 2 + 0.14, size * 0.18, 2.2, 2, rand, veinColor);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  const gloss = ctx.createLinearGradient(0, 0, size, size);
  gloss.addColorStop(0, "rgba(255,220,225,0.08)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0)");
  gloss.addColorStop(1, "rgba(255,180,190,0.05)");
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
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,230,210,0.75)");
  gradient.addColorStop(0.45, "rgba(255,180,190,0.25)");
  gradient.addColorStop(1, "rgba(255,120,140,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createGoldParticleTexture() {
  const size = 128;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,248,220,1)");
  gradient.addColorStop(0.2, "rgba(255,210,120,0.85)");
  gradient.addColorStop(0.55, "rgba(255,160,60,0.2)");
  gradient.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
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
      const mask = petalMask(u, v);
      const i = (y * size + x) * 4;
      const tone = 120 + v * 80 + (rand() - 0.5) * 8;
      data[i] = THREE.MathUtils.clamp(tone + 40, 0, 255);
      data[i + 1] = THREE.MathUtils.clamp(tone * 0.28, 0, 255);
      data[i + 2] = THREE.MathUtils.clamp(tone * 0.34, 0, 255);
      data[i + 3] = Math.round(Math.pow(mask, 0.75) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
