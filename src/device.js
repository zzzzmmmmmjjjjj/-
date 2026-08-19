export function detectDevice() {
  const ua = navigator.userAgent || "";
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrow = Math.min(innerWidth, innerHeight) < 720;
  const isIOS =
    /iP(hone|ad|od)/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isWeChat = /MicroMessenger/i.test(ua);
  const isMobile = coarse || isIOS || isAndroid || narrow || /Mobile/i.test(ua);
  const saveData = Boolean(navigator.connection?.saveData);
  const cores = navigator.hardwareConcurrency || 8;
  const lowPower = saveData || cores <= 4;

  return {
    isMobile,
    isIOS,
    isAndroid,
    isWeChat,
    saveData,
    pixelRatio: isMobile ? Math.min(devicePixelRatio || 1, 1.75) : Math.min(devicePixelRatio || 1, 2),
    antialias: !isMobile,
    postBloom: true,
    bloomStrength: isMobile ? 0.26 : 0.42,
    bloomRadius: isMobile ? 0.38 : 0.52,
    bloomThreshold: isMobile ? 0.78 : 0.82,
    environment: !lowPower || !isMobile,
    transmission: !isMobile,
    textureSize: isMobile ? 512 : 1024,
    petalSegments: isMobile ? { w: 16, l: 22 } : { w: 40, l: 56 },
    lowPoly: isMobile,
    sparkleCount: isMobile ? 220 : 900,
    stamenCount: isMobile ? 18 : 48,
    compactStem: isMobile
  };
}

export function isStandaloneApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    navigator.standalone === true
  );
}

export function viewSize() {
  const viewport = window.visualViewport;
  if (viewport) {
    return {
      width: Math.max(1, Math.round(viewport.width)),
      height: Math.max(1, Math.round(viewport.height))
    };
  }
  return { width: innerWidth, height: innerHeight };
}
