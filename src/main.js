import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBloomingFlower } from "./bloomingFlower.js";
import { createAtmosphere } from "./atmosphere.js";
import { detectDevice, isStandaloneApp, viewSize } from "./device.js";
import { bindWakeLockLifecycle, detectPetMode, releaseWakeLock, requestWakeLock, setPetMode } from "./petMode.js";

const BLOOM_DURATION = 11;
const PET_BLOOM_DURATION = 8;
const BLOOM_HOLD = 0.7;
const CLOSE_DURATION = 1.1;

const canvas = document.querySelector("#scene");
const loading = document.querySelector(".loading");
const loadingText = loading?.querySelector("p");
const bloomButton = document.querySelector(".bloom");
const bloomLabel = document.querySelector(".bloom-label");
const musicButton = document.querySelector(".music");
const music = document.querySelector("#background-music");
const startGate = document.querySelector(".start-gate");
const hint = document.querySelector(".hint");
const intro = document.querySelector(".intro");
const installBanner = document.querySelector(".install-banner");
const installBtn = document.querySelector("#install-btn");
const installClose = document.querySelector(".install-close");
const installGuide = document.querySelector(".install-guide");
const installGuideClose = document.querySelector(".install-guide-close");
const petExit = document.querySelector(".pet-exit");
const petHint = document.querySelector(".pet-hint");
const petEnter = document.querySelector(".pet-enter");
const assetUrl = (fileName) => `${import.meta.env.BASE_URL}${fileName}`;
const quality = detectDevice();
const standalone = isStandaloneApp();
const petMode = detectPetMode(standalone);
quality.petMode = petMode;

if (quality.isMobile) document.documentElement.classList.add("is-mobile");
if (quality.isWeChat) document.documentElement.classList.add("is-wechat");
if (standalone) document.documentElement.classList.add("is-standalone");
if (petMode) document.documentElement.classList.add("is-pet-mode");

function hideLoading() {
  loading?.classList.add("hidden");
}

function showBootError(message) {
  if (loadingText) loadingText.textContent = message;
  loading?.classList.remove("hidden");
  loading?.classList.add("error");
  startGate?.classList.add("hidden");
}

function createRenderer() {
  try {
    const instance = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      alpha: true,
      powerPreference: quality.isMobile ? "low-power" : "high-performance",
      stencil: false,
      depth: true
    });
    if (!instance.getContext()) throw new Error("WebGL unavailable");
    return instance;
  } catch (error) {
    const fallback = document.createElement("canvas");
    const instance = new THREE.WebGLRenderer({
      canvas: fallback,
      antialias: false,
      alpha: true,
      powerPreference: "low-power"
    });
    if (!instance.getContext()) throw error;
    canvas.replaceWith(fallback);
    fallback.id = "scene";
    return instance;
  }
}

let renderer;
let composer;
let bloomPass;
let renderFrame = () => renderer.render(scene, camera);
let flower;
let atmosphere;
let flowerRoot;
let controls;
let clock;
let bloomElapsed = 0;
let closeElapsed = 0;
let displayProgress = 0;
let isPlayingBloom = false;
let isClosing = false;
let scene;
let camera;
let keyLight;
let rimLight;
let fillLight;
let bottomLight;
let coreLight;
let halo;
let goldHalo;
let lockedProgress;
let awaitingStart;

music.src = assetUrl("the-rose.mp3");
music.volume = 0.42;
music.setAttribute("playsinline", "");
music.setAttribute("webkit-playsinline", "");
music.preload = quality.isMobile ? "metadata" : "auto";

function applyResponsiveLayout() {
  if (!flowerRoot || !controls || !camera) return;
  const { width, height } = viewSize();
  const portrait = height >= width;
  if (quality.isMobile || width < 700) {
    const scale = portrait ? 0.9 : 0.8;
    flowerRoot.position.set(0, portrait ? 0.12 : 0.06, 0);
    flowerRoot.scale.setScalar(scale);
    camera.position.set(0.15, portrait ? 0.42 : 0.48, portrait ? 4.85 : 4.55);
    controls.target.set(0, portrait ? 0.22 : 0.26, 0);
    flowerRoot.rotation.set(-0.02, 0.12, 0);
  } else {
    flowerRoot.position.set(0.75, 0.12, 0);
    flowerRoot.scale.setScalar(1.02);
    camera.position.set(1.15, 0.58, 5.35);
    controls.target.set(0.65, 0.22, 0);
    flowerRoot.rotation.set(-0.06, 0.48, -0.12);
  }
  controls.update();
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const { width, height } = viewSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(quality.pixelRatio);
  composer?.setSize(width, height);
  bloomPass?.setSize(width, height);
  applyResponsiveLayout();
  if (flowerRoot) flowerRoot.userData.baseY = flowerRoot.position.y;
}

function replayBloom() {
  if (lockedProgress !== null) return;
  if (awaitingStart || isClosing || isPlayingBloom) return;
  isClosing = true;
  closeElapsed = 0;
  bloomLabel.textContent = "收拢中";
  if (clock) lastPetReplay = clock.getElapsedTime();
}

function beginBloom() {
  startGate?.classList.add("hidden");
  installBanner?.classList.add("hidden");
  hint?.classList.toggle("hidden", !quality.isMobile || standalone || petMode);
  petHint?.classList.toggle("hidden", !petMode);
  if (!awaitingStart && isPlayingBloom && bloomElapsed > 0) return;
  awaitingStart = false;
  clock.stop();
  clock.start();
  bloomElapsed = 0;
  closeElapsed = 0;
  isClosing = false;
  isPlayingBloom = lockedProgress === null || petMode;
  displayProgress = lockedProgress ?? 0;
  flower?.setBloom(displayProgress);
  bloomLabel.textContent = petMode ? "陪伴中" : lockedProgress !== null ? "预览" : "开放中";
  if (!petMode) playMusic();
  if (petMode) requestWakeLock();
}

function animate() {
  if (!renderer || !flower || !clock) return;
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (awaitingStart) {
    flower.setBloom(0);
    flower.updateSparkles(time, 0);
    flower.updatePremiumEffects(time, 0);
    atmosphere?.update(time, 0);
    halo.scale.setScalar(1 + Math.sin(time * 0.8) * 0.05);
    goldHalo.scale.setScalar(0.85 + Math.sin(time * 1.1) * 0.06);
    renderFrame();
    return;
  }

  if (lockedProgress !== null) {
    displayProgress = lockedProgress;
  } else if (isClosing) {
    closeElapsed += delta;
    const closeT = THREE.MathUtils.clamp(closeElapsed / CLOSE_DURATION, 0, 1);
    displayProgress = displayProgress * (1 - closeT * closeT * (3 - 2 * closeT));
    if (closeT >= 1) {
      isClosing = false;
      bloomElapsed = 0;
      isPlayingBloom = true;
      displayProgress = 0;
      bloomLabel.textContent = "开放中";
    }
  } else if (isPlayingBloom) {
    const duration = petMode ? PET_BLOOM_DURATION : BLOOM_DURATION;
    const hold = petMode ? 0.35 : BLOOM_HOLD;
    bloomElapsed += delta;
    displayProgress = THREE.MathUtils.clamp((bloomElapsed - hold) / duration, 0, 1);
    if (displayProgress >= 1) {
      isPlayingBloom = false;
      bloomLabel.textContent = petMode ? "陪伴中" : "再开放一次";
      if (standalone || petMode) intro?.classList.add("immersive");
    }
  } else if (petMode && lockedProgress === null && time - lastPetReplay > PET_REPLAY_INTERVAL) {
    lastPetReplay = time;
    isClosing = true;
    closeElapsed = 0;
  }

  const effectProgress = displayProgress;
  flower.setBloom(displayProgress);
  flower.updateSparkles(time, effectProgress);
  flower.updatePremiumEffects(time, effectProgress);
  if (petMode && displayProgress >= 0.95) flower.updatePetBreathing(time);
  atmosphere?.update(time, effectProgress);
  const wind = atmosphere?.getWindStrength?.() ?? 0;
  flower.updateIdle(time, effectProgress, wind);

  const glowPulse = 0.94 + Math.sin(time * 1.15) * 0.05 + displayProgress * 0.08;
  halo.scale.setScalar((1.0 + displayProgress * 0.1) * glowPulse);
  halo.material.opacity = 0.025 + displayProgress * 0.04;
  goldHalo.scale.setScalar((0.62 + displayProgress * 0.16) * (0.95 + Math.sin(time * 1.4) * 0.04));
  goldHalo.material.opacity = 0.015 + displayProgress * 0.045;

  if (bloomPass) {
    bloomPass.strength = quality.bloomStrength * (0.5 + effectProgress * (petMode ? 0.32 : 0.26));
    bloomPass.threshold = quality.bloomThreshold + effectProgress * 0.1;
  }

  coreLight.intensity = (quality.isMobile ? 3.2 : 5.0) * (0.25 + effectProgress * 0.5);
  keyLight.intensity = (quality.isMobile ? 1.6 : 1.5) * (0.76 + effectProgress * 0.2);
  rimLight.intensity = (quality.isMobile ? 1.3 : 1.5) * (0.7 + effectProgress * 0.24);
  fillLight.intensity = (quality.isMobile ? 2.0 : 2.8) * (0.65 + effectProgress * 0.24);
  bottomLight.intensity = (quality.isMobile ? 1.2 : 1.8) * (0.6 + effectProgress * 0.22);

  if (petMode) controls.autoRotate = true;
  flowerRoot.position.y = flowerRoot.userData.baseY + Math.sin(time * 0.45) * 0.02;
  controls.update(delta);
  renderFrame();
}

function boot() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x140810, quality.isMobile ? 0.018 : 0.026);
  scene.background = new THREE.Color(0x140810);

  const { width: startWidth, height: startHeight } = viewSize();
  camera = new THREE.PerspectiveCamera(quality.isMobile ? 40 : 38, startWidth / startHeight, 0.1, 80);
  camera.position.set(1.35, 0.42, 5.6);

  renderer = createRenderer();
  renderer.setSize(startWidth, startHeight, false);
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = quality.isMobile ? 0.96 : 0.88;

  hideLoading();

  if (quality.environment) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = quality.isMobile ? 0.28 : 0.32;
  }

  const viewCanvas = renderer.domElement;
  controls = new OrbitControls(camera, viewCanvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 9;
  controls.autoRotate = petMode;
  controls.autoRotateSpeed = petMode ? (quality.isMobile ? 0.42 : 0.55) : 0;
  controls.target.set(0.85, 0.05, 0);
  controls.rotateSpeed = quality.isMobile ? 0.72 : 1;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  keyLight = new THREE.DirectionalLight(0xfff4f6, quality.isMobile ? 2.2 : 2.0);
  keyLight.position.set(3.8, 4.8, 3.6);
  scene.add(keyLight);

  rimLight = new THREE.DirectionalLight(0xffc8d4, quality.isMobile ? 1.8 : 2.2);
  rimLight.position.set(-4.2, 2.4, -4.8);
  scene.add(rimLight);

  const backLight = new THREE.DirectionalLight(0xffa0b0, quality.isMobile ? 0.9 : 1.2);
  backLight.position.set(0.2, 1.2, -5.5);
  scene.add(backLight);

  fillLight = new THREE.PointLight(0xffb8c8, quality.isMobile ? 2.8 : 4.0, 12, 2);
  fillLight.position.set(1.0, 1.2, 2.8);
  scene.add(fillLight);

  bottomLight = new THREE.PointLight(0xffa0b0, quality.isMobile ? 1.8 : 2.8, 9, 1.8);
  bottomLight.position.set(0.1, -0.45, 2.0);
  scene.add(bottomLight);

  coreLight = new THREE.PointLight(0xffd0dc, quality.isMobile ? 2.2 : 3.5, 3.5, 2);
  coreLight.position.set(0, 0.12, 0.15);
  scene.add(coreLight);

  scene.add(new THREE.HemisphereLight(0xffeef2, 0x1a0810, quality.isMobile ? 0.42 : 0.35));
  scene.add(new THREE.AmbientLight(0x2a1018, 0.06));

  halo = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff8098,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide
    })
  );
  halo.position.set(0.1, 0.38, -0.5);
  scene.add(halo);

  goldHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffc0cc,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  goldHalo.position.set(0, 0.18, -0.1);
  scene.add(goldHalo);

  atmosphere = createAtmosphere(quality);
  scene.add(atmosphere.group);

  flowerRoot = new THREE.Group();
  scene.add(flowerRoot);
  flower = createBloomingFlower(quality);
  flowerRoot.add(flower.group);

  if (quality.postBloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(startWidth, startHeight),
      quality.bloomStrength,
      quality.bloomRadius,
      quality.bloomThreshold
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    renderFrame = () => composer.render();
  }

  clock = new THREE.Clock();
  lockedProgress = (() => {
    const raw = new URLSearchParams(location.search).get("p");
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : null;
  })();
  awaitingStart = quality.isMobile && lockedProgress === null && !standalone && !petMode;
  isPlayingBloom = petMode && lockedProgress === null;

  applyResponsiveLayout();
  flowerRoot.userData.baseY = flowerRoot.position.y;
  displayProgress = 0;
  flower.setBloom(0);

  if (awaitingStart) {
    bloomLabel.textContent = "轻触开启";
    clock.start();
  } else {
    startGate?.classList.add("hidden");
    beginBloom();
  }

  addEventListener("resize", resizeRenderer);
  visualViewport?.addEventListener("resize", resizeRenderer);
  visualViewport?.addEventListener("scroll", resizeRenderer);
  addEventListener("orientationchange", () => setTimeout(resizeRenderer, 250));
  animate();
}

async function playMusic() {
  try {
    await music.play();
    updateMusicUI(true);
  } catch {
    updateMusicUI(false);
  }
}

function updateMusicUI(isPlaying) {
  musicButton.classList.toggle("playing", isPlaying);
  musicButton.setAttribute("aria-pressed", String(isPlaying));
  musicButton.setAttribute("aria-label", isPlaying ? "暂停背景音乐" : "播放背景音乐");
}

bloomButton.addEventListener("click", (event) => {
  event.stopPropagation();
  replayBloom();
});

let lastTap = 0;
canvas?.addEventListener("touchend", (event) => {
  if (!petMode) return;
  const now = Date.now();
  if (now - lastTap < 320) {
    event.preventDefault();
    replayBloom();
  }
  lastTap = now;
});

musicButton.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (music.paused) await playMusic();
  else {
    music.pause();
    updateMusicUI(false);
  }
});

startGate?.addEventListener("click", beginBloom);
startGate?.addEventListener("touchend", (event) => {
  event.preventDefault();
  beginBloom();
}, { passive: false });

if (new URLSearchParams(location.search).get("p") !== null) {
  startGate?.classList.add("hidden");
}

let deferredInstallPrompt = null;

function showInstallBanner() {
  if (standalone || quality.isWeChat || sessionStorage.getItem("install-dismissed")) return;
  installBanner?.classList.remove("hidden");
}

function hideInstallBanner() {
  installBanner?.classList.add("hidden");
  sessionStorage.setItem("install-dismissed", "1");
}

installBtn?.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner();
    return;
  }
  installGuide?.classList.remove("hidden");
});

installClose?.addEventListener("click", hideInstallBanner);
installGuideClose?.addEventListener("click", () => installGuide?.classList.add("hidden"));

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallBanner();
});

if (quality.isIOS && !standalone && !quality.isWeChat && !petMode) {
  setTimeout(showInstallBanner, 2800);
}

petEnter?.addEventListener("click", () => {
  setPetMode(true);
  location.search = "?pet=1";
});

petExit?.addEventListener("click", () => {
  setPetMode(false);
  releaseWakeLock();
  const url = new URL(location.href);
  url.searchParams.delete("pet");
  location.href = url.toString();
});

bindWakeLockLifecycle(() => {
  if (petMode && displayProgress >= 0.99) clock?.start();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

setTimeout(() => hideLoading(), 12000);

try {
  boot();
} catch (error) {
  console.error(error);
  showBootError(quality.isWeChat ? "加载失败，请点右上角用浏览器打开" : "加载失败，请刷新页面重试");
}
