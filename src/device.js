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
  const lowPower = isMobile || saveData || cores <= 4;

  return {
    isMobile,
    isIOS,
    isWeChat,
    saveData,
    pixelRatio: isMobile ? Math.min(devicePixelRatio || 1, 1.5) : Math.min(devicePixelRatio || 1, 2),
    antialias: !isMobile,
    postBloom: !lowPower,
    environment: !isMobile,
    transmission: !isMobile,
    textureSize: isMobile ? 512 : 1024,
    petalSegments: isMobile ? { w: 16, l: 22 } : { w: 40, l: 56 },
    lowPoly: isMobile,
    sparkleCount: isMobile ? 160 : 780,
    stamenCount: isMobile ? 18 : 48
  };
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
