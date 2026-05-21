const STORAGE_KEY = "unlimited-void-calibration-v2";
const EFFECT_DURATION_MS = 2600;
const CLIP_BEFORE_MS = 2000;
const CLIP_AFTER_MS = 3000;
const RECORDER_TIMESLICE_MS = 250;
const CALIBRATION_SAMPLE_TARGET = 24;

const refs = {
  startButton: document.getElementById("startButton"),
  installButton: document.getElementById("installButton"),
  calibrateButton: document.getElementById("calibrateButton"),
  resetCalibrationButton: document.getElementById("resetCalibrationButton"),
  permissionHint: document.getElementById("permissionHint"),
  camera: document.getElementById("camera"),
  overlay: document.getElementById("overlay"),
  stageFrame: document.getElementById("stageFrame"),
  domainOverlay: document.getElementById("domainOverlay"),
  compositeCanvas: document.getElementById("compositeCanvas"),
  clipPreview: document.getElementById("clipPreview"),
  clipBadge: document.getElementById("clipBadge"),
  downloadClip: document.getElementById("downloadClip"),
  cameraStatus: document.getElementById("cameraStatus"),
  handStatus: document.getElementById("handStatus"),
  gestureStatus: document.getElementById("gestureStatus"),
  motionStatus: document.getElementById("motionStatus"),
  gestureMeter: document.getElementById("gestureMeter"),
  stabilityMeter: document.getElementById("stabilityMeter"),
  motionMeter: document.getElementById("motionMeter"),
  debugText: document.getElementById("debugText"),
  calibrationText: document.getElementById("calibrationText"),
  pwaText: document.getElementById("pwaText"),
  recordingText: document.getElementById("recordingText"),
  feedbackFrame: document.getElementById("feedbackFrame"),
  feedbackExtend: document.getElementById("feedbackExtend"),
  feedbackCross: document.getElementById("feedbackCross"),
  feedbackClose: document.getElementById("feedbackClose"),
  feedbackFold: document.getElementById("feedbackFold"),
  feedbackMotion: document.getElementById("feedbackMotion"),
};

const state = {
  cameraActive: false,
  motionSupported: "DeviceMotionEvent" in window,
  motionGranted: false,
  motionDenied: false,
  motionLevel: 0,
  lastMotionAt: 0,
  lastLandmarks: null,
  hands: null,
  cameraFeed: null,
  audioContext: null,
  lastFrameAt: 0,
  lastMetrics: null,
  lastGestureResult: null,
  scoreHistory: [],
  stableFrames: 0,
  gestureActive: false,
  needsGestureReset: false,
  domainCooldownUntil: 0,
  effectStartAt: 0,
  effectCenter: { x: 0.5, y: 0.45 },
  effectParticles: [],
  animationFrameId: 0,
  calibrationMode: false,
  calibrationSamples: [],
  calibrationProfile: loadCalibrationProfile(),
  installPrompt: null,
  recorder: {
    supported: typeof MediaRecorder !== "undefined",
    mediaRecorder: null,
    mimeType: "",
    chunkStore: [],
    finalizing: false,
    clipUrl: "",
    captureRequestedAt: 0,
    captureFinalizeAt: 0,
  },
};

function loadCalibrationProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveCalibrationProfile(profile) {
  state.calibrationProfile = profile;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  updateCalibrationText();
  refs.resetCalibrationButton.disabled = false;
}

function clearCalibrationProfile() {
  window.localStorage.removeItem(STORAGE_KEY);
  state.calibrationProfile = null;
  updateCalibrationText();
  refs.resetCalibrationButton.disabled = true;
}

function updateCalibrationText() {
  if (!state.calibrationProfile) {
    refs.calibrationText.textContent = "Sem calibracao personalizada ainda.";
    return;
  }

  const timestamp = new Date(state.calibrationProfile.updatedAt);
  const label = Number.isNaN(timestamp.getTime())
    ? "agora"
    : timestamp.toLocaleString("pt-BR");
  refs.calibrationText.textContent = `Calibracao personalizada salva em ${label}.`;
}

function setPill(element, text, tone) {
  element.textContent = text;
  element.className = `status-pill ${tone}`;
}

function setDebug(message) {
  refs.debugText.textContent = message;
}

function setMeter(element, value) {
  element.style.width = `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function setFeedbackItem(element, tone, text) {
  element.className = `feedback-item ${tone}`;
  element.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vector(a, b) {
  return { x: b.x - a.x, y: b.y - a.y };
}

function magnitude(vector2d) {
  return Math.hypot(vector2d.x, vector2d.y);
}

function angleBetween(a, b) {
  const denominator = magnitude(a) * magnitude(b);
  if (!denominator) {
    return 0;
  }

  const cosine = clamp((a.x * b.x + a.y * b.y) / denominator, -1, 1);
  return Math.acos(cosine) * (180 / Math.PI);
}

function orientation(a, b, c) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  const epsilon = 1e-5;

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) {
    return true;
  }

  if (Math.abs(o1) < epsilon && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) < epsilon && onSegment(p1, q2, q1)) return true;
  if (Math.abs(o3) < epsilon && onSegment(p2, p1, q2)) return true;
  if (Math.abs(o4) < epsilon && onSegment(p2, q1, q2)) return true;

  return false;
}

function normalizeScore(value, min, max) {
  if (max <= min) {
    return 0;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function invertScore(value, idealMax, tolerance) {
  if (value <= idealMax) {
    return 1;
  }

  return clamp(1 - (value - idealMax) / tolerance, 0, 1);
}

function closenessScore(value, target, tolerance) {
  return clamp(1 - Math.abs(value - target) / tolerance, 0, 1);
}

function getDefaultProfile() {
  return {
    indexExtension: 0.3,
    middleExtension: 0.3,
    tipGap: 0.42,
    angle: 22,
    ringCurl: 0.04,
    pinkyCurl: 0.05,
  };
}

function getActiveProfile() {
  return state.calibrationProfile || getDefaultProfile();
}

function computeGestureMetrics(landmarks) {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const indexPip = landmarks[6];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middlePip = landmarks[10];
  const middleTip = landmarks[12];
  const ringPip = landmarks[14];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyPip = landmarks[18];
  const pinkyTip = landmarks[20];
  const handScale = Math.max(dist(indexMcp, pinkyMcp), 0.001);
  const indexVector = vector(indexPip, indexTip);
  const middleVector = vector(middlePip, middleTip);
  const tipGap = dist(indexTip, middleTip) / handScale;
  const angle = angleBetween(indexVector, middleVector);
  const orderFlip = (indexTip.x - middleTip.x) * (indexMcp.x - middleMcp.x) < 0;
  const crossing = segmentsIntersect(indexPip, indexTip, middlePip, middleTip);

  return {
    handScale,
    centerX: average([wrist.x, indexMcp.x, middleMcp.x, pinkyMcp.x]),
    centerY: average([wrist.y, indexMcp.y, middleMcp.y, pinkyMcp.y]),
    indexExtension: (dist(indexTip, wrist) - dist(indexPip, wrist)) / handScale,
    middleExtension: (dist(middleTip, wrist) - dist(middlePip, wrist)) / handScale,
    ringCurl: (dist(ringPip, wrist) - dist(ringTip, wrist)) / handScale,
    pinkyCurl: (dist(pinkyPip, wrist) - dist(pinkyTip, wrist)) / handScale,
    tipGap,
    angle,
    crossing,
    orderFlip,
  };
}

function scoreGesture(metrics) {
  const profile = getActiveProfile();
  const indexScore = normalizeScore(
    metrics.indexExtension,
    Math.max(0.14, profile.indexExtension * 0.68),
    Math.max(0.26, profile.indexExtension * 1.08)
  );
  const middleScore = normalizeScore(
    metrics.middleExtension,
    Math.max(0.14, profile.middleExtension * 0.68),
    Math.max(0.26, profile.middleExtension * 1.08)
  );
  const closeScore = invertScore(
    metrics.tipGap,
    Math.max(0.3, profile.tipGap * 1.14),
    Math.max(0.2, profile.tipGap * 0.9)
  );
  const crossByAngle = closenessScore(
    metrics.angle,
    clamp(profile.angle, 12, 42),
    Math.max(12, profile.angle * 0.8)
  );
  const crossScore = metrics.crossing ? 1 : metrics.orderFlip ? Math.max(0.72, crossByAngle) : crossByAngle * 0.3;
  const ringScore = normalizeScore(
    metrics.ringCurl,
    Math.min(-0.05, profile.ringCurl - 0.12),
    Math.max(0.02, profile.ringCurl + 0.08)
  );
  const pinkyScore = normalizeScore(
    metrics.pinkyCurl,
    Math.min(-0.05, profile.pinkyCurl - 0.12),
    Math.max(0.02, profile.pinkyCurl + 0.08)
  );
  const framingScore = normalizeScore(metrics.handScale, 0.13, 0.28);
  const overall =
    indexScore * 0.19 +
    middleScore * 0.19 +
    closeScore * 0.2 +
    crossScore * 0.2 +
    ringScore * 0.08 +
    pinkyScore * 0.08 +
    framingScore * 0.06;

  return {
    overall,
    parts: {
      framing: framingScore,
      index: indexScore,
      middle: middleScore,
      close: closeScore,
      cross: crossScore,
      ring: ringScore,
      pinky: pinkyScore,
    },
  };
}

function updateGuidance(metrics, result, gestureReady) {
  const extendScore = average([result.parts.index, result.parts.middle]);
  const foldScore = average([result.parts.ring, result.parts.pinky]);
  const motionReady = state.motionGranted ? motionRecentlyDetected() : true;

  setFeedbackItem(
    refs.feedbackFrame,
    result.parts.framing > 0.72 ? "good" : "warn",
    result.parts.framing > 0.72
      ? "Mao enquadrada e com tamanho bom"
      : "Aproxime a mao e mantenha o pulso todo no quadro"
  );
  setFeedbackItem(
    refs.feedbackExtend,
    extendScore > 0.75 ? "good" : "warn",
    extendScore > 0.75
      ? "Indicador e medio estao estendidos"
      : "Estique mais indicador e medio"
  );
  setFeedbackItem(
    refs.feedbackCross,
    result.parts.cross > 0.74 ? "good" : "warn",
    result.parts.cross > 0.74
      ? "Cruzamento do gesto esta convincente"
      : "Cruze mais os dois dedos no centro"
  );
  setFeedbackItem(
    refs.feedbackClose,
    result.parts.close > 0.72 ? "good" : "warn",
    result.parts.close > 0.72
      ? "Pontas proximas do suficiente"
      : "Aproxime mais as pontas do indicador e do medio"
  );
  setFeedbackItem(
    refs.feedbackFold,
    foldScore > 0.55 ? "good" : "warn",
    foldScore > 0.55
      ? "Anelar e mindinho estao apoiando bem"
      : "Dobre um pouco mais anelar e mindinho"
  );
  setFeedbackItem(
    refs.feedbackMotion,
    motionReady ? "good" : "warn",
    motionReady
      ? "Movimento pronto para disparo"
      : state.motionGranted
        ? "Faca um movimento curto para liberar o dominio"
        : "Sem sensor liberado, camera-only liberado"
  );

  if (state.calibrationMode) {
    const remaining = CALIBRATION_SAMPLE_TARGET - state.calibrationSamples.length;
    setDebug(`Calibrando: segure o gesto firme. Faltam ${Math.max(remaining, 0)} amostras.`);
    return;
  }

  if (state.needsGestureReset) {
    setDebug("Solte o gesto e refaca para rearmar o dominio.");
    return;
  }

  if (!gestureReady) {
    if (result.parts.framing < 0.55) {
      setDebug("Aproxime a mao da camera e traga o pulso inteiro para o quadro.");
    } else if (extendScore < 0.62) {
      setDebug("Estique mais indicador e medio antes de tentar cruzar.");
    } else if (result.parts.cross < 0.62) {
      setDebug("Cruze mais indicador e medio no meio da mao.");
    } else if (result.parts.close < 0.62) {
      setDebug("As pontas dos dedos ainda estao longe. Aproxima um pouco mais.");
    } else if (foldScore < 0.45) {
      setDebug("Dobre anelar e mindinho para dar apoio ao sinal.");
    } else if (state.stableFrames < 9) {
      setDebug("O gesto esta quase la. Segura firme por um instante.");
    } else if (!motionReady) {
      setDebug("Agora faz um movimento curto com a mao ou com o celular.");
    } else {
      setDebug("Quase pronto. Ajusta um pouco o cruzamento dos dedos.");
    }
    return;
  }

  setDebug(
    state.motionGranted
      ? "Gesto estabilizado. Um movimento curto ativa o dominio."
      : "Gesto estabilizado. Sem sensor liberado, a camera pode disparar sozinha."
  );
}

function updateCalibrationState(metrics) {
  if (!state.calibrationMode) {
    return;
  }

  if (metrics.handScale < 0.15) {
    setDebug("Chega mais perto com a mao para a calibracao ficar precisa.");
    return;
  }

  const calibrationScore = scoreGesture(metrics);
  if (calibrationScore.overall < 0.48) {
    setDebug("Mantenha o gesto mais proximo do sinal final antes de salvar a calibracao.");
    return;
  }

  state.calibrationSamples.push(metrics);
  refs.calibrationText.textContent = `Calibrando gesto: ${state.calibrationSamples.length}/${CALIBRATION_SAMPLE_TARGET} amostras.`;

  if (state.calibrationSamples.length < CALIBRATION_SAMPLE_TARGET) {
    return;
  }

  const profile = buildCalibrationProfile(state.calibrationSamples);
  state.calibrationMode = false;
  state.calibrationSamples = [];
  refs.calibrateButton.textContent = "Recalibrar gesto";
  saveCalibrationProfile(profile);
  setDebug("Calibracao concluida. Agora o detector usa o seu gesto como referencia.");
}

function buildCalibrationProfile(samples) {
  return {
    indexExtension: average(samples.map((sample) => sample.indexExtension)),
    middleExtension: average(samples.map((sample) => sample.middleExtension)),
    tipGap: average(samples.map((sample) => sample.tipGap)),
    angle: average(samples.map((sample) => sample.angle)),
    ringCurl: average(samples.map((sample) => sample.ringCurl)),
    pinkyCurl: average(samples.map((sample) => sample.pinkyCurl)),
    updatedAt: Date.now(),
  };
}

function resizeCanvases() {
  const width = refs.camera.videoWidth;
  const height = refs.camera.videoHeight;
  if (!width || !height) {
    return false;
  }

  if (refs.overlay.width !== width || refs.overlay.height !== height) {
    refs.overlay.width = width;
    refs.overlay.height = height;
  }

  if (refs.compositeCanvas.width !== width || refs.compositeCanvas.height !== height) {
    refs.compositeCanvas.width = width;
    refs.compositeCanvas.height = height;
  }

  return true;
}

function drawHandOverlay(landmarks, gestureScore) {
  if (!resizeCanvases()) {
    return;
  }

  const context = refs.overlay.getContext("2d");
  context.save();
  context.clearRect(0, 0, refs.overlay.width, refs.overlay.height);

  drawConnectors(context, landmarks, HAND_CONNECTIONS, {
    color: gestureScore > 0.78 ? "#ffd880" : "#8fefff",
    lineWidth: 4,
  });
  drawLandmarks(context, landmarks, {
    color: gestureScore > 0.78 ? "#ffffff" : "#12d7ff",
    lineWidth: 1.4,
    radius: 5,
  });

  const center = {
    x: state.lastMetrics.centerX * refs.overlay.width,
    y: state.lastMetrics.centerY * refs.overlay.height,
  };
  context.beginPath();
  context.arc(center.x, center.y, 46, 0, Math.PI * 2);
  context.strokeStyle = gestureScore > 0.78 ? "rgba(255, 216, 128, 0.9)" : "rgba(143, 239, 255, 0.62)";
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function clearHandOverlay() {
  const context = refs.overlay.getContext("2d");
  context.clearRect(0, 0, refs.overlay.width, refs.overlay.height);
}

function motionRecentlyDetected() {
  return Date.now() - state.lastMotionAt < 900;
}

function handleMotion(event) {
  const acceleration = event.accelerationIncludingGravity || event.acceleration;
  const rotationRate = event.rotationRate;
  const ax = acceleration?.x || 0;
  const ay = acceleration?.y || 0;
  const az = acceleration?.z || 0;
  const rotationMagnitude = rotationRate
    ? Math.hypot(rotationRate.alpha || 0, rotationRate.beta || 0, rotationRate.gamma || 0)
    : 0;
  const accelerationMagnitude = Math.hypot(ax, ay, az);
  const accelerationLevel = clamp((accelerationMagnitude - 9) / 14, 0, 1);
  const rotationLevel = clamp(rotationMagnitude / 280, 0, 1);
  const combined = clamp(Math.max(accelerationLevel, rotationLevel * 0.9), 0, 1);

  state.motionLevel = combined;
  setMeter(refs.motionMeter, combined);

  if (combined > 0.5) {
    state.lastMotionAt = Date.now();
  }

  if (state.motionGranted) {
    setPill(
      refs.motionStatus,
      motionRecentlyDetected() ? "Movimento lido" : "Parado",
      motionRecentlyDetected() ? "ok" : "idle"
    );
  }
}

async function requestMotionAccess() {
  if (!state.motionSupported) {
    setPill(refs.motionStatus, "Nao suportado", "warn");
    refs.pwaText.textContent = "Sem sensor de movimento nesse aparelho ou navegador.";
    return;
  }

  try {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== "granted") {
        throw new Error("Permissao negada");
      }
    }

    window.addEventListener("devicemotion", handleMotion, { passive: true });
    state.motionGranted = true;
    setPill(refs.motionStatus, "Sensor ativo", "ok");
  } catch (error) {
    state.motionDenied = true;
    setPill(refs.motionStatus, "Negado", "warn");
    setDebug("Sem permissao para o sensor. O app cai para camera-only.");
  }
}

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }

  const mimeTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function startCompositeRecorder() {
  if (!state.recorder.supported || state.recorder.mediaRecorder || !refs.compositeCanvas.width) {
    updateRecordingText();
    return;
  }

  const stream = refs.compositeCanvas.captureStream(24);
  const mimeType = pickRecorderMimeType();
  state.recorder.mimeType = mimeType;

  try {
    state.recorder.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (error) {
    refs.recordingText.textContent = "Recorder indisponivel neste navegador.";
    return;
  }

  state.recorder.mediaRecorder.addEventListener("dataavailable", (event) => {
    if (!event.data || event.data.size === 0) {
      return;
    }

    state.recorder.chunkStore.push({
      blob: event.data,
      at: Date.now(),
    });

    const cutoff = Date.now() - Math.max(CLIP_BEFORE_MS + CLIP_AFTER_MS + 1000, 7000);
    state.recorder.chunkStore = state.recorder.chunkStore.filter((entry) => entry.at >= cutoff);
  });

  state.recorder.mediaRecorder.start(RECORDER_TIMESLICE_MS);
  updateRecordingText();
}

function updateRecordingText() {
  if (!state.recorder.supported) {
    refs.recordingText.textContent = "Clip recorder nao suportado neste navegador.";
    return;
  }

  if (!state.recorder.mediaRecorder) {
    refs.recordingText.textContent = "Clip recorder aguardando camera.";
    return;
  }

  if (state.recorder.captureFinalizeAt > Date.now()) {
    refs.recordingText.textContent = "Gravando janela do dominio: 2s antes + 3s depois.";
    return;
  }

  refs.recordingText.textContent = "Clip recorder ativo. O ultimo dominio pode ser salvo.";
}

function queueClipCapture() {
  if (!state.recorder.mediaRecorder) {
    return;
  }

  state.recorder.captureRequestedAt = Date.now();
  state.recorder.captureFinalizeAt = Date.now() + CLIP_AFTER_MS + RECORDER_TIMESLICE_MS;
  refs.clipBadge.classList.add("recording");
  updateRecordingText();

  window.setTimeout(finalizeClipCapture, CLIP_AFTER_MS + RECORDER_TIMESLICE_MS * 2);
}

function finalizeClipCapture() {
  if (!state.recorder.mediaRecorder || state.recorder.finalizing) {
    return;
  }

  state.recorder.finalizing = true;
  refs.clipBadge.classList.remove("recording");

  const from = state.recorder.captureRequestedAt - CLIP_BEFORE_MS;
  const to = state.recorder.captureFinalizeAt + RECORDER_TIMESLICE_MS;
  const clipChunks = state.recorder.chunkStore
    .filter((entry) => entry.at >= from && entry.at <= to)
    .map((entry) => entry.blob);

  if (!clipChunks.length) {
    state.recorder.finalizing = false;
    updateRecordingText();
    return;
  }

  if (state.recorder.clipUrl) {
    URL.revokeObjectURL(state.recorder.clipUrl);
  }

  const clipBlob = new Blob(clipChunks, {
    type: state.recorder.mimeType || "video/webm",
  });
  const clipUrl = URL.createObjectURL(clipBlob);

  state.recorder.clipUrl = clipUrl;
  refs.clipPreview.src = clipUrl;
  refs.clipPreview.classList.remove("hidden");
  refs.downloadClip.href = clipUrl;
  refs.downloadClip.classList.remove("hidden");
  refs.downloadClip.download = `unlimited-void-${Date.now()}.webm`;
  refs.recordingText.textContent = "Clip pronto. Voce pode assistir ou baixar.";
  state.recorder.captureFinalizeAt = 0;
  state.recorder.finalizing = false;
}

function createImpulseResponse(audioContext, durationSeconds, decay) {
  const frameCount = Math.floor(audioContext.sampleRate * durationSeconds);
  const buffer = audioContext.createBuffer(2, frameCount, audioContext.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < frameCount; index += 1) {
      const progress = index / frameCount;
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, decay);
    }
  }

  return buffer;
}

function createNoiseBuffer(audioContext, durationSeconds) {
  const frameCount = Math.floor(audioContext.sampleRate * durationSeconds);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function getAudioContext() {
  if (!state.audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }

    state.audioContext = new AudioCtor();
  }

  return state.audioContext;
}

function playDomainSound() {
  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  const convolver = audioContext.createConvolver();
  const wetGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const delay = audioContext.createDelay(0.45);
  const feedback = audioContext.createGain();
  convolver.buffer = createImpulseResponse(audioContext, 2.6, 3.4);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.12);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
  wetGain.gain.value = 0.35;
  dryGain.gain.value = 0.8;
  delay.delayTime.value = 0.22;
  feedback.gain.value = 0.22;
  delay.connect(feedback);
  feedback.connect(delay);
  master.connect(audioContext.destination);
  convolver.connect(wetGain);
  wetGain.connect(master);
  delay.connect(master);
  dryGain.connect(master);

  const sub = audioContext.createOscillator();
  const subGain = audioContext.createGain();
  sub.type = "triangle";
  sub.frequency.setValueAtTime(82, now);
  sub.frequency.exponentialRampToValueAtTime(32, now + 1.8);
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.exponentialRampToValueAtTime(0.14, now + 0.12);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  sub.connect(subGain);
  subGain.connect(dryGain);
  subGain.connect(convolver);
  sub.start(now);
  sub.stop(now + 2.3);

  const shimmer = audioContext.createOscillator();
  const shimmerGain = audioContext.createGain();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(420, now + 0.02);
  shimmer.frequency.exponentialRampToValueAtTime(1500, now + 0.5);
  shimmer.frequency.exponentialRampToValueAtTime(260, now + 2.2);
  shimmerGain.gain.setValueAtTime(0.0001, now);
  shimmerGain.gain.exponentialRampToValueAtTime(0.05, now + 0.08);
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 2);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(dryGain);
  shimmerGain.connect(delay);
  shimmer.start(now);
  shimmer.stop(now + 2.2);

  const whisper = audioContext.createBufferSource();
  const whisperFilter = audioContext.createBiquadFilter();
  const whisperGain = audioContext.createGain();
  whisper.buffer = createNoiseBuffer(audioContext, 3.2);
  whisperFilter.type = "bandpass";
  whisperFilter.frequency.setValueAtTime(1400, now);
  whisperFilter.frequency.exponentialRampToValueAtTime(380, now + 2.6);
  whisperFilter.Q.value = 1.2;
  whisperGain.gain.setValueAtTime(0.0001, now);
  whisperGain.gain.exponentialRampToValueAtTime(0.06, now + 0.16);
  whisperGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
  whisper.connect(whisperFilter);
  whisperFilter.connect(whisperGain);
  whisperGain.connect(dryGain);
  whisperGain.connect(convolver);
  whisper.start(now);
  whisper.stop(now + 2.9);

  const strike = audioContext.createOscillator();
  const strikeGain = audioContext.createGain();
  strike.type = "sawtooth";
  strike.frequency.setValueAtTime(220, now);
  strike.frequency.exponentialRampToValueAtTime(68, now + 0.42);
  strikeGain.gain.setValueAtTime(0.0001, now);
  strikeGain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
  strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  strike.connect(strikeGain);
  strikeGain.connect(dryGain);
  strikeGain.connect(delay);
  strike.start(now);
  strike.stop(now + 0.62);
}

function generateParticles() {
  state.effectParticles = Array.from({ length: 36 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 36,
    radius: 0.14 + Math.random() * 0.28,
    drift: 0.18 + Math.random() * 0.4,
    size: 1 + Math.random() * 3.2,
  }));
}

function triggerVisibleEffect() {
  refs.domainOverlay.classList.remove("active");
  void refs.domainOverlay.offsetWidth;
  refs.domainOverlay.classList.add("active");
  refs.stageFrame.classList.add("domain-live");
  window.setTimeout(() => {
    refs.stageFrame.classList.remove("domain-live");
    refs.domainOverlay.classList.remove("active");
  }, EFFECT_DURATION_MS);
}

function activateDomain() {
  const now = Date.now();
  if (now < state.domainCooldownUntil) {
    return;
  }

  state.domainCooldownUntil = now + 5200;
  state.gestureActive = false;
  state.needsGestureReset = true;
  state.stableFrames = 0;
  state.effectStartAt = now;
  state.effectCenter = {
    x: state.lastMetrics?.centerX || 0.5,
    y: state.lastMetrics?.centerY || 0.45,
  };
  generateParticles();
  triggerVisibleEffect();
  playDomainSound();
  queueClipCapture();
  setPill(refs.gestureStatus, "Ativado", "hot");
  setDebug("Unlimited Void disparado. Espera o cooldown e rearmamento.");

  if (navigator.vibrate) {
    navigator.vibrate([130, 40, 170, 60, 220]);
  }

  window.setTimeout(() => {
    if (state.cameraActive) {
      setDebug("Pronto para outra invocacao. Solta o gesto e faz de novo.");
    }
  }, EFFECT_DURATION_MS);
}

function drawCompositeFrame(timestamp) {
  const width = refs.compositeCanvas.width;
  const height = refs.compositeCanvas.height;
  if (!width || !height || refs.camera.readyState < 2) {
    state.animationFrameId = window.requestAnimationFrame(drawCompositeFrame);
    return;
  }

  const context = refs.compositeCanvas.getContext("2d");
  context.save();
  context.clearRect(0, 0, width, height);

  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(refs.camera, 0, 0, width, height);
  context.restore();

  const vignette = context.createRadialGradient(
    width * 0.5,
    height * 0.48,
    width * 0.1,
    width * 0.5,
    height * 0.5,
    width * 0.7
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(3, 10, 18, 0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  if (state.lastLandmarks) {
    drawConnectors(context, state.lastLandmarks, HAND_CONNECTIONS, {
      color: state.lastGestureResult?.overall > 0.78 ? "#ffd880" : "#8fefff",
      lineWidth: 4,
    });
    drawLandmarks(context, state.lastLandmarks, {
      color: state.lastGestureResult?.overall > 0.78 ? "#ffffff" : "#12d7ff",
      radius: 4,
      lineWidth: 1.2,
    });
  }

  drawDomainCanvasEffect(context, width, height, timestamp);
  drawHudText(context, width, height);
  state.animationFrameId = window.requestAnimationFrame(drawCompositeFrame);
}

function drawHudText(context, width, height) {
  context.save();
  context.font = "700 22px 'Segoe UI'";
  context.fillStyle = "rgba(242, 247, 251, 0.84)";
  context.fillText("UNLIMITED VOID TRIGGER", 28, 40);
  context.font = "500 14px 'Segoe UI'";
  context.fillStyle = "rgba(242, 247, 251, 0.68)";
  context.fillText(
    `Gesture ${Math.round((state.lastGestureResult?.overall || 0) * 100)}%  |  Stability ${Math.round(
      clamp(state.stableFrames / 12, 0, 1) * 100
    )}%`,
    28,
    64
  );
  context.restore();
}

function drawDomainCanvasEffect(context, width, height, timestamp) {
  if (!state.effectStartAt) {
    return;
  }

  const elapsed = timestamp - state.effectStartAt;
  if (elapsed < 0 || elapsed > EFFECT_DURATION_MS) {
    return;
  }

  const progress = clamp(elapsed / EFFECT_DURATION_MS, 0, 1);
  const centerX = state.effectCenter.x * width;
  const centerY = state.effectCenter.y * height;
  const flashAlpha = clamp(1 - progress * 4.2, 0, 0.9);
  const haloAlpha = clamp(0.9 - progress * 0.8, 0, 0.9);

  context.save();
  context.globalCompositeOperation = "screen";

  const flash = context.createRadialGradient(centerX, centerY, width * 0.04, centerX, centerY, width * 0.52);
  flash.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
  flash.addColorStop(0.16, `rgba(195,243,255,${haloAlpha})`);
  flash.addColorStop(0.5, `rgba(69,176,214,${haloAlpha * 0.45})`);
  flash.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = flash;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = `rgba(200, 248, 255, ${0.45 - progress * 0.35})`;
  context.lineWidth = 2;
  for (let line = -16; line <= 16; line += 1) {
    const offset = line * 24 + progress * 180;
    context.beginPath();
    context.moveTo(0, centerY + offset);
    context.lineTo(width, centerY + offset + progress * 18);
    context.stroke();
  }

  state.effectParticles.forEach((particle) => {
    const orbit = particle.radius * Math.min(width, height);
    const travel = orbit + progress * particle.drift * 220;
    const x = centerX + Math.cos(particle.angle + progress * 6) * travel;
    const y = centerY + Math.sin(particle.angle + progress * 4.8) * travel;
    context.beginPath();
    context.arc(x, y, particle.size, 0, Math.PI * 2);
    context.fillStyle = `rgba(255,255,255,${0.75 - progress * 0.55})`;
    context.fill();
  });

  context.beginPath();
  context.arc(centerX, centerY, width * (0.1 + progress * 0.48), 0, Math.PI * 2);
  context.strokeStyle = `rgba(255, 216, 128, ${0.7 - progress * 0.45})`;
  context.lineWidth = 4;
  context.stroke();

  if (progress > 0.16) {
    context.font = `700 ${Math.max(30, width * 0.055)}px 'Segoe UI'`;
    context.textAlign = "center";
    context.fillStyle = `rgba(255,255,255,${0.9 - progress * 0.7})`;
    context.fillText("UNLIMITED VOID", width * 0.5, height * 0.58);
    context.font = `600 ${Math.max(12, width * 0.016)}px 'Segoe UI'`;
    context.fillStyle = `rgba(255,255,255,${0.7 - progress * 0.55})`;
    context.fillText("DOMAIN EXPANSION", width * 0.5, height * 0.52);
  }

  context.restore();
}

function startRenderLoop() {
  if (state.animationFrameId) {
    return;
  }

  state.animationFrameId = window.requestAnimationFrame(drawCompositeFrame);
}

async function startHandTracking() {
  if (!window.Hands || !window.Camera) {
    throw new Error("MediaPipe nao carregou. Confira a conexao com a internet.");
  }

  state.hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  state.hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.76,
    minTrackingConfidence: 0.7,
  });

  state.hands.onResults((results) => {
    state.lastFrameAt = Date.now();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      state.lastLandmarks = null;
      state.lastMetrics = null;
      state.lastGestureResult = null;
      state.gestureActive = false;
      state.stableFrames = Math.max(0, state.stableFrames - 2);
      setMeter(refs.gestureMeter, 0);
      setMeter(refs.stabilityMeter, clamp(state.stableFrames / 12, 0, 1));
      setPill(refs.handStatus, "Sem mao", "idle");
      setPill(refs.gestureStatus, "Nao detectado", "idle");
      clearHandOverlay();
      setFeedbackItem(refs.feedbackFrame, "warn", "Mostre a mao inteira para a camera");
      if (!state.calibrationMode) {
        setDebug("Posiciona a mao no centro para o rastreio voltar.");
      }
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const metrics = computeGestureMetrics(landmarks);
    const result = scoreGesture(metrics);
    const gestureScore = result.overall;

    state.lastLandmarks = landmarks;
    state.lastMetrics = metrics;
    state.lastGestureResult = result;
    state.scoreHistory.push(gestureScore);
    if (state.scoreHistory.length > 12) {
      state.scoreHistory.shift();
    }

    if (gestureScore > 0.76) {
      state.stableFrames += 1;
    } else {
      state.stableFrames = Math.max(0, state.stableFrames - 2);
    }

    const stabilityScore = clamp(state.stableFrames / 12, 0, 1);
    const gestureReady = gestureScore > 0.76 && stabilityScore > 0.68;

    setMeter(refs.gestureMeter, gestureScore);
    setMeter(refs.stabilityMeter, stabilityScore);
    drawHandOverlay(landmarks, gestureScore);
    setPill(refs.handStatus, "Mao rastreada", "ok");

    if (state.needsGestureReset) {
      if (gestureScore < 0.34) {
        state.needsGestureReset = false;
        setPill(refs.gestureStatus, "Rearmado", "idle");
        setDebug("Rearmado. Agora pode montar o gesto de novo.");
      } else {
        setPill(refs.gestureStatus, "Solte e refaca", "warn");
      }
      updateGuidance(metrics, result, false);
      return;
    }

    if (state.calibrationMode) {
      setPill(refs.gestureStatus, "Calibrando", "warn");
      updateGuidance(metrics, result, false);
      updateCalibrationState(metrics);
      return;
    }

    setPill(
      refs.gestureStatus,
      gestureReady ? "Pronto" : gestureScore > 0.48 ? "Lendo" : "Nao detectado",
      gestureReady ? "ok" : gestureScore > 0.48 ? "warn" : "idle"
    );

    updateGuidance(metrics, result, gestureReady);

    const motionSatisfied = state.motionGranted ? motionRecentlyDetected() : true;
    if (gestureReady && motionSatisfied) {
      activateDomain();
    }
  });

  state.cameraFeed = new Camera(refs.camera, {
    onFrame: async () => {
      await state.hands.send({ image: refs.camera });
    },
    width: 1280,
    height: 720,
  });

  await state.cameraFeed.start();
  state.cameraActive = true;
  resizeCanvases();
  startRenderLoop();
  startCompositeRecorder();
  setPill(refs.cameraStatus, "Ativa", "ok");
  refs.calibrateButton.disabled = false;
  refs.resetCalibrationButton.disabled = !state.calibrationProfile;
  setDebug("Camera online. Faz o gesto com indicador e medio cruzados para o detector aprender.");
  updateRecordingText();
}

async function registerProgressiveWebApp() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  if (standalone) {
    refs.pwaText.textContent = "Rodando como app instalado.";
  }

  if (!("serviceWorker" in navigator)) {
    refs.pwaText.textContent = "Service Worker nao suportado aqui.";
    return;
  }

  if (!window.isSecureContext) {
    refs.pwaText.textContent = "PWA pronto, mas o Service Worker precisa de localhost ou HTTPS.";
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
    refs.pwaText.textContent = "PWA pronto. A shell e os assets vao ficar disponiveis offline apos a primeira carga.";
  } catch (error) {
    refs.pwaText.textContent = "Falhou ao registrar o PWA neste navegador.";
  }
}

function handleInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    refs.installButton.hidden = false;
    refs.pwaText.textContent = "Instalacao disponivel. Toque em instalar para fixar como app.";
  });

  window.addEventListener("appinstalled", () => {
    refs.installButton.hidden = true;
    refs.pwaText.textContent = "App instalado com sucesso.";
  });
}

async function installApp() {
  if (!state.installPrompt) {
    refs.pwaText.textContent = "Ainda nao existe prompt de instalacao neste dispositivo.";
    return;
  }

  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  refs.installButton.hidden = true;
}

function beginCalibration() {
  if (!state.cameraActive) {
    setDebug("Liga a camera antes de calibrar.");
    return;
  }

  if (state.calibrationMode) {
    state.calibrationMode = false;
    state.calibrationSamples = [];
    refs.calibrateButton.textContent = state.calibrationProfile ? "Recalibrar gesto" : "Calibrar gesto";
    updateCalibrationText();
    setDebug("Calibracao cancelada.");
    return;
  }

  state.calibrationMode = true;
  state.calibrationSamples = [];
  refs.calibrateButton.textContent = "Calibrando...";
  setDebug("Segure o gesto do Gojo por um instante para salvar o seu padrao.");
}

function resetCalibration() {
  clearCalibrationProfile();
  refs.calibrateButton.textContent = "Calibrar gesto";
  setDebug("Calibracao removida. O detector voltou para o perfil padrao.");
}

async function startExperience() {
  refs.startButton.disabled = true;
  refs.startButton.textContent = "Inicializando...";
  setDebug("Pedindo camera, carregando rastreio e ligando sensores.");

  try {
    await requestMotionAccess();
    await startHandTracking();
    refs.startButton.textContent = "Sensores liberados";
  } catch (error) {
    refs.startButton.disabled = false;
    refs.startButton.textContent = "Tentar novamente";
    setPill(refs.cameraStatus, "Falhou", "hot");
    setDebug(error.message || "Nao foi possivel iniciar o demo.");
  }
}

function initUi() {
  updateCalibrationText();
  updateRecordingText();
  handleInstallPrompt();
  registerProgressiveWebApp();

  if (!state.motionSupported) {
    setPill(refs.motionStatus, "Nao suportado", "warn");
  } else {
    setPill(refs.motionStatus, "Aguardando", "idle");
  }

  if (!state.recorder.supported) {
    refs.recordingText.textContent = "Clip recorder indisponivel neste navegador.";
  }
}

refs.startButton.addEventListener("click", startExperience);
refs.installButton.addEventListener("click", installApp);
refs.calibrateButton.addEventListener("click", beginCalibration);
refs.resetCalibrationButton.addEventListener("click", resetCalibration);

initUi();
