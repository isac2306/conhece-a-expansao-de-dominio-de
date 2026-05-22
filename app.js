const CHAVE_ARMAZENAMENTO = "unlimited-void-calibration-v2";
const DURACAO_EFEITO_MS = 4200;
const CHAVE_AJUSTES = "unlimited-void-settings-v1";
const CLIPE_ANTES_MS = 2000;
const CLIPE_DEPOIS_MS = 4200;
const INTERVALO_GRAVADOR_MS = 250;
const INTERVALO_SEGMENTACAO_MS = 180;
const META_AMOSTRAS_CALIBRACAO = 24;
const JANELA_SUAVIZACAO_GESTO = 10;

const referencias = {
  botaoIniciar: document.getElementById("startButton"),
  botaoReferencia: document.getElementById("referenceButton"),
  botaoInstalar: document.getElementById("installButton"),
  botaoCalibrar: document.getElementById("calibrateButton"),
  botaoTreino: document.getElementById("trainButton"),
  botaoResetarCalibracao: document.getElementById("resetCalibrationButton"),
  dicaPermissao: document.getElementById("permissionHint"),
  camera: document.getElementById("camera"),
  overlay: document.getElementById("overlay"),
  quadroPalco: document.getElementById("stageFrame"),
  guiaPalco: document.getElementById("stageGuide"),
  rotuloGuiaPalco: document.getElementById("stageGuideLabel"),
  painelReferencia: document.getElementById("referencePanel"),
  sobreposicaoDominio: document.getElementById("domainOverlay"),
  telaComposta: document.getElementById("compositeCanvas"),
  telaPessoa: document.getElementById("personCanvas"),
  telaSegmentacao: document.getElementById("segmentationCanvas"),
  previaClipe: document.getElementById("clipPreview"),
  seloClipe: document.getElementById("clipBadge"),
  baixarClipe: document.getElementById("downloadClip"),
  statusCamera: document.getElementById("cameraStatus"),
  statusMao: document.getElementById("handStatus"),
  statusGesto: document.getElementById("gestureStatus"),
  statusMovimento: document.getElementById("motionStatus"),
  medidorGesto: document.getElementById("gestureMeter"),
  medidorEstabilidade: document.getElementById("stabilityMeter"),
  medidorMovimento: document.getElementById("motionMeter"),
  statusPalco: document.getElementById("stageStatus"),
  textoDebug: document.getElementById("debugText"),
  textoCalibracao: document.getElementById("calibrationText"),
  textoPwa: document.getElementById("pwaText"),
  textoGravacao: document.getElementById("recordingText"),
  textoAjustes: document.getElementById("tuningText"),
  retornoEnquadramento: document.getElementById("feedbackFrame"),
  retornoEsticar: document.getElementById("feedbackExtend"),
  retornoCruzar: document.getElementById("feedbackCross"),
  retornoAproximar: document.getElementById("feedbackClose"),
  retornoDobrar: document.getElementById("feedbackFold"),
  retornoMovimento: document.getElementById("feedbackMotion"),
  controleSensibilidade: document.getElementById("sensitivityRange"),
  controleSustentacao: document.getElementById("holdRange"),
  valorSensibilidade: document.getElementById("sensitivityValue"),
  valorSustentacao: document.getElementById("holdValue"),
};

const estado = {
  cameraAtiva: false,
  ultimosPontos: null,
  hands: null,
  fluxoCamera: null,
  audioContext: null,
  ultimoQuadroEm: 0,
  ultimasMetricas: null,
  ultimoResultadoGesto: null,
  historicoPontuacao: [],
  pontuacaoSuavizadaGesto: 0,
  quadrosEstaveis: 0,
  precisaRearmarGesto: false,
  resfriamentoDominioAte: 0,
  efeitoIniciadoEm: 0,
  centroEfeito: { x: 0.5, y: 0.45 },
  particulasEfeito: [],
  idQuadroAnimacao: 0,
  segmentacao: {
    modelo: null,
    suportado: typeof window.SelfieSegmentation !== "undefined",
    pronta: false,
    ultimaAtualizacaoEm: 0,
    ultimaSolicitacaoEm: 0,
    requisicaoEmAndamento: false,
  },
  modoCalibracao: false,
  modoTreinoGuiado: false,
  etapaTreino: 0,
  amostrasCalibracao: [],
  perfilCalibracao: carregarPerfilCalibracao(),
  ajustes: carregarAjustes(),
  promptInstalacao: null,
  recorder: {
    suportado: typeof MediaRecorder !== "undefined",
    gravadorMidia: null,
    tipoMime: "",
    armazenamentoBlocos: [],
    finalizing: false,
    urlClipe: "",
    capturaSolicitadaEm: 0,
    capturaFinalizaEm: 0,
  },
};

function carregarPerfilCalibracao() {
  try {
    const raw = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function carregarAjustes() {
  const padrao = {
    sensibilidade: 48,
    sustentacao: 42,
  };

  try {
    const raw = window.localStorage.getItem(CHAVE_AJUSTES);
    return raw ? { ...padrao, ...JSON.parse(raw) } : padrao;
  } catch (error) {
    return padrao;
  }
}

function salvarAjustes() {
  window.localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(estado.ajustes));
}

function salvarPerfilCalibracao(profile) {
  estado.perfilCalibracao = profile;
  window.localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(profile));
  atualizarTextoCalibracao();
  referencias.botaoResetarCalibracao.disabled = false;
}

function limparPerfilCalibracao() {
  window.localStorage.removeItem(CHAVE_ARMAZENAMENTO);
  estado.perfilCalibracao = null;
  atualizarTextoCalibracao();
  referencias.botaoResetarCalibracao.disabled = true;
}

function atualizarTextoCalibracao() {
  if (!estado.perfilCalibracao) {
    referencias.textoCalibracao.textContent = "Sem calibracao personalizada ainda.";
    return;
  }

  const atualizadoEm =
    estado.perfilCalibracao.atualizadoEm ??
    estado.perfilCalibracao.updatedAt ??
    Date.now();
  const timestamp = new Date(atualizadoEm);
  const label = Number.isNaN(timestamp.getTime())
    ? "agora"
    : timestamp.toLocaleString("pt-BR");
  referencias.textoCalibracao.textContent = `Calibracao personalizada salva em ${label}.`;
}

function definirSelo(element, text, tone) {
  element.textContent = text;
  element.className = `status-pill ${tone}`;
}

function definirDebug(message) {
  if (referencias.textoDebug) {
    referencias.textoDebug.textContent = message;
  }
}

function definirStatusPalco(texto, tom = "idle") {
  if (!referencias.statusPalco) {
    return;
  }

  referencias.statusPalco.textContent = texto;
  referencias.statusPalco.className = `stage-status ${tom}`;
}

function definirMedidor(element, value) {
  element.style.width = `${Math.round(limitar(value, 0, 1) * 100)}%`;
}

function definirItemRetorno(element, tone, text) {
  element.className = `feedback-item ${tone}`;
  element.textContent = text;
}

function limitar(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function interpolar(min, max, progress) {
  return min + (max - min) * progress;
}

function media(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vetor(a, b) {
  return { x: b.x - a.x, y: b.y - a.y };
}

function magnitude(vetor2d) {
  return Math.hypot(vetor2d.x, vetor2d.y);
}

function anguloEntre(a, b) {
  const denominator = magnitude(a) * magnitude(b);
  if (!denominator) {
    return 0;
  }

  const cosine = limitar((a.x * b.x + a.y * b.y) / denominator, -1, 1);
  return Math.acos(cosine) * (180 / Math.PI);
}

function orientacao(a, b, c) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function pontoNoSegmento(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function segmentosSeCruzam(p1, q1, p2, q2) {
  const o1 = orientacao(p1, q1, p2);
  const o2 = orientacao(p1, q1, q2);
  const o3 = orientacao(p2, q2, p1);
  const o4 = orientacao(p2, q2, q1);
  const epsilon = 1e-5;

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) {
    return true;
  }

  if (Math.abs(o1) < epsilon && pontoNoSegmento(p1, p2, q1)) return true;
  if (Math.abs(o2) < epsilon && pontoNoSegmento(p1, q2, q1)) return true;
  if (Math.abs(o3) < epsilon && pontoNoSegmento(p2, p1, q2)) return true;
  if (Math.abs(o4) < epsilon && pontoNoSegmento(p2, q1, q2)) return true;

  return false;
}

function normalizarPontuacao(value, min, max) {
  if (max <= min) {
    return 0;
  }

  return limitar((value - min) / (max - min), 0, 1);
}

function inverterPontuacao(value, idealMax, tolerance) {
  if (value <= idealMax) {
    return 1;
  }

  return limitar(1 - (value - idealMax) / tolerance, 0, 1);
}

function pontuacaoProximidade(value, target, tolerance) {
  return limitar(1 - Math.abs(value - target) / tolerance, 0, 1);
}

function progressoSensibilidade() {
  return limitar(estado.ajustes.sensibilidade / 100, 0, 1);
}

function progressoSustentacao() {
  return limitar(estado.ajustes.sustentacao / 100, 0, 1);
}

function obterLimiarGestoBruto() {
  return interpolar(0.61, 0.78, progressoSensibilidade());
}

function obterLimiarGestoSuavizado() {
  return interpolar(0.66, 0.82, progressoSensibilidade());
}

function obterLimiarRearmeGesto() {
  return interpolar(0.22, 0.34, progressoSensibilidade());
}

function obterQuadrosNecessariosAtivacao() {
  return Math.round(interpolar(5, 12, progressoSustentacao()));
}

function descreverSensibilidade(valor) {
  if (valor < 34) {
    return "Facil";
  }

  if (valor < 67) {
    return "Media";
  }

  return "Precisa";
}

function descreverSustentacao(valor) {
  if (valor < 34) {
    return "Curta";
  }

  if (valor < 67) {
    return "Media";
  }

  return "Longa";
}

function atualizarPainelAjustes() {
  if (referencias.controleSensibilidade) {
    referencias.controleSensibilidade.value = String(estado.ajustes.sensibilidade);
  }

  if (referencias.controleSustentacao) {
    referencias.controleSustentacao.value = String(estado.ajustes.sustentacao);
  }

  referencias.valorSensibilidade.textContent = descreverSensibilidade(estado.ajustes.sensibilidade);
  referencias.valorSustentacao.textContent = descreverSustentacao(estado.ajustes.sustentacao);
  referencias.textoAjustes.textContent =
    `Detector em ${descreverSensibilidade(estado.ajustes.sensibilidade).toLowerCase()} ` +
    `com sustentacao ${descreverSustentacao(estado.ajustes.sustentacao).toLowerCase()}.`;
}

function alternarReferencia() {
  if (!referencias.painelReferencia || !referencias.botaoReferencia) {
    return;
  }

  const vaiMostrar = referencias.painelReferencia.classList.contains("hidden");
  referencias.painelReferencia.classList.toggle("hidden", !vaiMostrar);
  referencias.botaoReferencia.textContent = vaiMostrar ? "Ocultar referencia" : "Ver referencia";
  referencias.botaoReferencia.setAttribute("aria-pressed", vaiMostrar ? "true" : "false");
}

function obterEtapasTreino(result) {
  return [
    {
      elemento: referencias.retornoEnquadramento,
      guia: "Traga a mao para o centro do guia.",
      objetivo: "Enquadre a mao inteira.",
      concluida: result?.parts?.framing > 0.58,
    },
    {
      elemento: referencias.retornoEsticar,
      guia: "Agora estique indicador e medio.",
      objetivo: "Estique os dois dedos principais.",
      concluida: media([result?.parts?.index || 0, result?.parts?.middle || 0]) > 0.72,
    },
    {
      elemento: referencias.retornoCruzar,
      guia: "Cruze os dois dedos bem no centro.",
      objetivo: "Cruze indicador e medio.",
      concluida: result?.parts?.cross > 0.7,
    },
    {
      elemento: referencias.retornoAproximar,
      guia: "Aproxime as pontas sem desfazer o X.",
      objetivo: "Deixe as pontas mais proximas.",
      concluida: result?.parts?.close > 0.68,
    },
    {
      elemento: referencias.retornoDobrar,
      guia: "Dobre anelar e mindinho para apoiar.",
      objetivo: "Feche os dedos inferiores.",
      concluida: media([result?.parts?.ring || 0, result?.parts?.pinky || 0]) > 0.48,
    },
  ];
}

function aplicarFocoTreino(result) {
  const etapas = obterEtapasTreino(result);
  etapas.forEach((etapa, indice) => {
    etapa.elemento.classList.toggle(
      "focus",
      estado.modoTreinoGuiado && indice === estado.etapaTreino && !etapa.concluida
    );
  });
}

function atualizarGuiaPalco(options = {}) {
  const { rastreada = false, pronto = false, texto = "" } = options;
  if (!referencias.guiaPalco) {
    return;
  }

  referencias.guiaPalco.classList.toggle("tracked", rastreada);
  referencias.guiaPalco.classList.toggle("ready", pronto);
  referencias.guiaPalco.classList.toggle("hidden", false);

  if (texto) {
    referencias.rotuloGuiaPalco.textContent = texto;
    return;
  }

  if (pronto) {
    referencias.rotuloGuiaPalco.textContent = "Selo alinhado";
  } else if (estado.modoTreinoGuiado) {
    const etapa = obterEtapasTreino(estado.ultimoResultadoGesto)[estado.etapaTreino];
    referencias.rotuloGuiaPalco.textContent = etapa?.guia || "Treino concluido";
  } else if (rastreada) {
    referencias.rotuloGuiaPalco.textContent = "Ajuste ate encaixar no selo";
  } else {
    referencias.rotuloGuiaPalco.textContent = "Encaixe sua mao aqui";
  }
}

function concluirTreinoGuiado() {
  estado.modoTreinoGuiado = false;
  estado.etapaTreino = 0;
  referencias.botaoTreino.textContent = "Treino guiado";
  aplicarFocoTreino(estado.ultimoResultadoGesto);
}

function atualizarTreinoGuiado(result) {
  if (!estado.modoTreinoGuiado) {
    aplicarFocoTreino(result);
    return;
  }

  const etapas = obterEtapasTreino(result);
  const etapaAtual = etapas[estado.etapaTreino];

  if (!etapaAtual) {
    concluirTreinoGuiado();
    definirDebug("Treino concluido. Agora repita o gesto inteiro para abrir o dominio.");
    atualizarGuiaPalco({ rastreada: true, pronto: false, texto: "Treino concluido" });
    return;
  }

  if (etapaAtual.concluida) {
    estado.etapaTreino += 1;
    const proxima = etapas[estado.etapaTreino];
    if (!proxima) {
      concluirTreinoGuiado();
      definirDebug("Treino concluido. Agora repita o gesto inteiro para abrir o dominio.");
      atualizarGuiaPalco({ rastreada: true, pronto: false, texto: "Treino concluido" });
      return;
    }

    definirDebug(`Boa. ${proxima.objetivo}`);
  } else {
    definirDebug(`Treino guiado: ${etapaAtual.objetivo}`);
  }

  aplicarFocoTreino(result);
  const etapaVisivel = etapas[Math.min(estado.etapaTreino, etapas.length - 1)];
  atualizarGuiaPalco({
    rastreada: true,
    pronto: false,
    texto: etapaVisivel?.guia || "Treino concluido",
  });
}

function obterPerfilPadrao() {
  return {
    indexExtension: 0.3,
    middleExtension: 0.3,
    tipGap: 0.42,
    angle: 22,
    ringCurl: 0.04,
    pinkyCurl: 0.05,
  };
}

function obterPerfilAtivo() {
  return estado.perfilCalibracao || obterPerfilPadrao();
}

function calcularMetricasGesto(landmarks) {
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
  const handScale = Math.max(distancia(indexMcp, pinkyMcp), 0.001);
  const indexVector = vetor(indexPip, indexTip);
  const middleVector = vetor(middlePip, middleTip);
  const tipGap = distancia(indexTip, middleTip) / handScale;
  const angle = anguloEntre(indexVector, middleVector);
  const orderFlip = (indexTip.x - middleTip.x) * (indexMcp.x - middleMcp.x) < 0;
  const crossing = segmentosSeCruzam(indexPip, indexTip, middlePip, middleTip);

  return {
    handScale,
    centerX: media([wrist.x, indexMcp.x, middleMcp.x, pinkyMcp.x]),
    centerY: media([wrist.y, indexMcp.y, middleMcp.y, pinkyMcp.y]),
    indexExtension: (distancia(indexTip, wrist) - distancia(indexPip, wrist)) / handScale,
    middleExtension: (distancia(middleTip, wrist) - distancia(middlePip, wrist)) / handScale,
    ringCurl: (distancia(ringPip, wrist) - distancia(ringTip, wrist)) / handScale,
    pinkyCurl: (distancia(pinkyPip, wrist) - distancia(pinkyTip, wrist)) / handScale,
    tipGap,
    angle,
    crossing,
    orderFlip,
  };
}

function pontuarGesto(metrics) {
  const profile = obterPerfilAtivo();
  const indexScore = normalizarPontuacao(
    metrics.indexExtension,
    Math.max(0.14, profile.indexExtension * 0.68),
    Math.max(0.26, profile.indexExtension * 1.08)
  );
  const middleScore = normalizarPontuacao(
    metrics.middleExtension,
    Math.max(0.14, profile.middleExtension * 0.68),
    Math.max(0.26, profile.middleExtension * 1.08)
  );
  const closeScore = inverterPontuacao(
    metrics.tipGap,
    Math.max(0.3, profile.tipGap * 1.14),
    Math.max(0.2, profile.tipGap * 0.9)
  );
  const crossByAngle = pontuacaoProximidade(
    metrics.angle,
    limitar(profile.angle, 12, 42),
    Math.max(12, profile.angle * 0.8)
  );
  const crossScore = metrics.crossing ? 1 : metrics.orderFlip ? Math.max(0.72, crossByAngle) : crossByAngle * 0.3;
  const ringScore = normalizarPontuacao(
    metrics.ringCurl,
    Math.min(-0.05, profile.ringCurl - 0.12),
    Math.max(0.02, profile.ringCurl + 0.08)
  );
  const pinkyScore = normalizarPontuacao(
    metrics.pinkyCurl,
    Math.min(-0.05, profile.pinkyCurl - 0.12),
    Math.max(0.02, profile.pinkyCurl + 0.08)
  );
  const framingScore = normalizarPontuacao(metrics.handScale, 0.095, 0.25);
  const balanceScore = pontuacaoProximidade(metrics.indexExtension, metrics.middleExtension, 0.18);
  const overall =
    indexScore * 0.17 +
    middleScore * 0.17 +
    closeScore * 0.19 +
    crossScore * 0.2 +
    ringScore * 0.08 +
    pinkyScore * 0.08 +
    framingScore * 0.05 +
    balanceScore * 0.06;

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
      balance: balanceScore,
    },
  };
}

function atualizarOrientacoes(metrics, result, gestureReady) {
  const extendScore = media([result.parts.index, result.parts.middle]);
  const foldScore = media([result.parts.ring, result.parts.pinky]);

  definirItemRetorno(
    referencias.retornoEnquadramento,
    result.parts.framing > 0.72 ? "good" : "warn",
    result.parts.framing > 0.72
      ? "Mao enquadrada e com tamanho bom"
      : "Aproxime a mao e mantenha o pulso todo no quadro"
  );
  definirItemRetorno(
    referencias.retornoEsticar,
    extendScore > 0.75 ? "good" : "warn",
    extendScore > 0.75
      ? "Indicador e medio estao estendidos"
      : "Estique mais indicador e medio"
  );
  definirItemRetorno(
    referencias.retornoCruzar,
    result.parts.cross > 0.74 ? "good" : "warn",
    result.parts.cross > 0.74
      ? "Cruzamento do gesto esta convincente"
      : "Cruze mais os dois dedos no centro"
  );
  definirItemRetorno(
    referencias.retornoAproximar,
    result.parts.close > 0.72 ? "good" : "warn",
    result.parts.close > 0.72
      ? "Pontas proximas do suficiente"
      : "Aproxime mais as pontas do indicador e do medio"
  );
  definirItemRetorno(
    referencias.retornoDobrar,
    foldScore > 0.55 ? "good" : "warn",
    foldScore > 0.55
      ? "Anelar e mindinho estao apoiando bem"
      : "Dobre um pouco mais anelar e mindinho"
  );
  definirItemRetorno(
    referencias.retornoMovimento,
    gestureReady ? "good" : "warn",
    gestureReady
      ? "Selo firme. O dominio pode abrir."
      : "Segure o gesto firme por um instante para ativar."
  );

  if (estado.modoCalibracao) {
    const remaining = META_AMOSTRAS_CALIBRACAO - estado.amostrasCalibracao.length;
    definirDebug(`Calibrando: segure o gesto firme. Faltam ${Math.max(remaining, 0)} amostras.`);
    return;
  }

  if (estado.precisaRearmarGesto) {
    definirDebug("Solte o gesto e refaca para rearmar o dominio.");
    return;
  }

  if (!gestureReady) {
    if (result.parts.framing < 0.55) {
      definirDebug("Aproxime a mao da camera e traga o pulso inteiro para o quadro.");
    } else if (extendScore < 0.62) {
      definirDebug("Estique mais indicador e medio antes de tentar cruzar.");
    } else if (result.parts.cross < 0.62) {
      definirDebug("Cruze mais indicador e medio no meio da mao.");
    } else if (result.parts.close < 0.62) {
      definirDebug("As pontas dos dedos ainda estao longe. Aproxima um pouco mais.");
    } else if (foldScore < 0.45) {
      definirDebug("Dobre anelar e mindinho para dar apoio ao sinal.");
    } else if (estado.quadrosEstaveis < Math.max(4, Math.floor(obterQuadrosNecessariosAtivacao() * 0.75))) {
      definirDebug("O gesto esta quase la. Segura firme por um instante.");
    } else {
      definirDebug("Quase pronto. Ajusta um pouco o cruzamento dos dedos.");
    }
    return;
  }

  definirDebug("Gesto estabilizado. Segura firme mais um instante que o dominio ativa sozinho.");
}

function atualizarEstadoCalibracao(metrics) {
  if (!estado.modoCalibracao) {
    return;
  }

  if (metrics.handScale < 0.15) {
    definirDebug("Chega mais perto com a mao para a calibracao ficar precisa.");
    return;
  }

  const calibrationScore = pontuarGesto(metrics);
  if (calibrationScore.overall < 0.48) {
    definirDebug("Mantenha o gesto mais proximo do sinal final antes de salvar a calibracao.");
    return;
  }

  estado.amostrasCalibracao.push(metrics);
  referencias.textoCalibracao.textContent = `Calibrando gesto: ${estado.amostrasCalibracao.length}/${META_AMOSTRAS_CALIBRACAO} amostras.`;

  if (estado.amostrasCalibracao.length < META_AMOSTRAS_CALIBRACAO) {
    return;
  }

  const profile = montarPerfilCalibracao(estado.amostrasCalibracao);
  estado.modoCalibracao = false;
  estado.amostrasCalibracao = [];
  referencias.botaoCalibrar.textContent = "Recalibrar gesto";
  salvarPerfilCalibracao(profile);
  definirDebug("Calibracao concluida. Agora o detector usa o seu gesto como referencia.");
}

function montarPerfilCalibracao(samples) {
  return {
    indexExtension: media(samples.map((sample) => sample.indexExtension)),
    middleExtension: media(samples.map((sample) => sample.middleExtension)),
    tipGap: media(samples.map((sample) => sample.tipGap)),
    angle: media(samples.map((sample) => sample.angle)),
    ringCurl: media(samples.map((sample) => sample.ringCurl)),
    pinkyCurl: media(samples.map((sample) => sample.pinkyCurl)),
    atualizadoEm: Date.now(),
  };
}

function redimensionarTelas() {
  const width = referencias.camera.videoWidth;
  const height = referencias.camera.videoHeight;
  if (!width || !height) {
    return false;
  }

  if (referencias.overlay.width !== width || referencias.overlay.height !== height) {
    referencias.overlay.width = width;
    referencias.overlay.height = height;
  }

  if (referencias.telaComposta.width !== width || referencias.telaComposta.height !== height) {
    referencias.telaComposta.width = width;
    referencias.telaComposta.height = height;
  }

  if (referencias.telaPessoa.width !== width || referencias.telaPessoa.height !== height) {
    referencias.telaPessoa.width = width;
    referencias.telaPessoa.height = height;
  }

  if (referencias.telaSegmentacao.width !== width || referencias.telaSegmentacao.height !== height) {
    referencias.telaSegmentacao.width = width;
    referencias.telaSegmentacao.height = height;
  }

  return true;
}

function desenharSobreposicaoMao(landmarks, gestureScore) {
  if (!redimensionarTelas()) {
    return;
  }

  const context = referencias.overlay.getContext("2d");
  const limiarBruto = obterLimiarGestoBruto();
  const gestoForte = gestureScore > limiarBruto;
  const pulso = 0.5 + Math.sin(performance.now() * 0.01) * 0.5;
  const centroPalma = {
    x: estado.ultimasMetricas.centerX * referencias.overlay.width,
    y: estado.ultimasMetricas.centerY * referencias.overlay.height,
  };
  const pontaIndicador = {
    x: landmarks[8].x * referencias.overlay.width,
    y: landmarks[8].y * referencias.overlay.height,
  };
  const pontaMedio = {
    x: landmarks[12].x * referencias.overlay.width,
    y: landmarks[12].y * referencias.overlay.height,
  };

  context.save();
  context.clearRect(0, 0, referencias.overlay.width, referencias.overlay.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = gestoForte ? "rgba(255, 216, 128, 0.32)" : "rgba(18, 215, 255, 0.18)";
  context.shadowBlur = gestoForte ? 14 : 7;

  drawConnectors(context, landmarks, HAND_CONNECTIONS, {
    color: gestoForte ? "rgba(255, 228, 168, 0.92)" : "rgba(143, 239, 255, 0.78)",
    lineWidth: gestoForte ? 3.4 : 2.8,
  });
  drawLandmarks(context, landmarks, {
    color: gestoForte ? "#fffaf0" : "#dff9ff",
    fillColor: gestoForte ? "#ffd880" : "#12d7ff",
    lineWidth: 0,
    radius: (data) => ([8, 12].includes(data.index) ? 5.2 : 2.6),
  });

  context.shadowBlur = 0;
  context.beginPath();
  context.moveTo(pontaIndicador.x, pontaIndicador.y);
  context.lineTo(pontaMedio.x, pontaMedio.y);
  context.strokeStyle = gestoForte ? "rgba(255, 248, 226, 0.96)" : "rgba(143, 239, 255, 0.9)";
  context.lineWidth = gestoForte ? 3.4 : 2.8;
  context.stroke();

  context.beginPath();
  context.arc(centroPalma.x, centroPalma.y, gestoForte ? 12 + pulso * 2.5 : 9 + pulso * 2, 0, Math.PI * 2);
  context.fillStyle = gestoForte ? "rgba(255, 216, 128, 0.18)" : "rgba(18, 215, 255, 0.14)";
  context.fill();

  for (const ponta of [pontaIndicador, pontaMedio]) {
    context.beginPath();
    context.arc(ponta.x, ponta.y, gestoForte ? 7.5 + pulso * 1.2 : 6.2 + pulso, 0, Math.PI * 2);
    context.fillStyle = gestoForte ? "rgba(255, 216, 128, 0.16)" : "rgba(143, 239, 255, 0.14)";
    context.fill();
  }

  context.restore();
}

function limparSobreposicaoMao() {
  const context = referencias.overlay.getContext("2d");
  context.clearRect(0, 0, referencias.overlay.width, referencias.overlay.height);
}

function escolherTipoMimeGravador() {
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

function iniciarGravadorComposto() {
  if (!estado.recorder.suportado || estado.recorder.gravadorMidia || !referencias.telaComposta.width) {
    atualizarTextoGravacao();
    return;
  }

  const stream = referencias.telaComposta.captureStream(24);
  const mimeType = escolherTipoMimeGravador();
  estado.recorder.tipoMime = mimeType;

  try {
    estado.recorder.gravadorMidia = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (error) {
    referencias.textoGravacao.textContent = "Recorder indisponivel neste navegador.";
    return;
  }

  estado.recorder.gravadorMidia.addEventListener("dataavailable", (event) => {
    if (!event.data || event.data.size === 0) {
      return;
    }

    estado.recorder.armazenamentoBlocos.push({
      blob: event.data,
      at: Date.now(),
    });

    const cutoff = Date.now() - Math.max(CLIPE_ANTES_MS + CLIPE_DEPOIS_MS + 1000, 7000);
    estado.recorder.armazenamentoBlocos = estado.recorder.armazenamentoBlocos.filter((entry) => entry.at >= cutoff);
  });

  estado.recorder.gravadorMidia.start(INTERVALO_GRAVADOR_MS);
  atualizarTextoGravacao();
}

function atualizarTextoGravacao() {
  if (!estado.recorder.suportado) {
    referencias.textoGravacao.textContent = "Clip recorder nao suportado neste navegador.";
    return;
  }

  if (!estado.recorder.gravadorMidia) {
    referencias.textoGravacao.textContent = "Clip recorder aguardando camera.";
    return;
  }

  if (estado.recorder.capturaFinalizaEm > Date.now()) {
    referencias.textoGravacao.textContent = "Gravando janela do dominio: 2s antes + 3s depois.";
    return;
  }

  referencias.textoGravacao.textContent = "Clip recorder ativo. O ultimo dominio pode ser salvo.";
}

function desenharFonteEspelhada(context, source, width, height) {
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0, width, height);
  context.restore();
}

function progressoEfeitoEm(timestamp) {
  if (!estado.efeitoIniciadoEm) {
    return null;
  }

  const elapsed = timestamp - estado.efeitoIniciadoEm;
  if (elapsed < 0 || elapsed > DURACAO_EFEITO_MS) {
    return null;
  }

  return limitar(elapsed / DURACAO_EFEITO_MS, 0, 1);
}

function queueClipCapture() {
  if (!estado.recorder.gravadorMidia) {
    return;
  }

  estado.recorder.capturaSolicitadaEm = Date.now();
  estado.recorder.capturaFinalizaEm = Date.now() + CLIPE_DEPOIS_MS + INTERVALO_GRAVADOR_MS;
  referencias.seloClipe.classList.add("recording");
  atualizarTextoGravacao();

  window.setTimeout(finalizeClipCapture, CLIPE_DEPOIS_MS + INTERVALO_GRAVADOR_MS * 2);
}

function finalizeClipCapture() {
  if (!estado.recorder.gravadorMidia || estado.recorder.finalizing) {
    return;
  }

  estado.recorder.finalizing = true;
  referencias.seloClipe.classList.remove("recording");

  const from = estado.recorder.capturaSolicitadaEm - CLIPE_ANTES_MS;
  const to = estado.recorder.capturaFinalizaEm + INTERVALO_GRAVADOR_MS;
  const clipChunks = estado.recorder.armazenamentoBlocos
    .filter((entry) => entry.at >= from && entry.at <= to)
    .map((entry) => entry.blob);

  if (!clipChunks.length) {
    estado.recorder.finalizing = false;
    atualizarTextoGravacao();
    return;
  }

  if (estado.recorder.urlClipe) {
    URL.revokeObjectURL(estado.recorder.urlClipe);
  }

  const clipBlob = new Blob(clipChunks, {
    type: estado.recorder.tipoMime || "video/webm",
  });
  const clipUrl = URL.createObjectURL(clipBlob);

  estado.recorder.urlClipe = clipUrl;
  referencias.previaClipe.src = clipUrl;
  referencias.previaClipe.classList.remove("hidden");
  referencias.baixarClipe.href = clipUrl;
  referencias.baixarClipe.classList.remove("hidden");
  referencias.baixarClipe.download = `unlimited-void-${Date.now()}.webm`;
  referencias.textoGravacao.textContent = "Clip pronto. Voce pode assistir ou baixar.";
  estado.recorder.capturaFinalizaEm = 0;
  estado.recorder.finalizing = false;
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
  if (!estado.audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }

    estado.audioContext = new AudioCtor();
  }

  return estado.audioContext;
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

function gerarParticulas() {
  estado.particulasEfeito = Array.from({ length: 84 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 84,
    radius: 0.1 + Math.random() * 0.38,
    drift: 0.18 + Math.random() * 0.54,
    size: 1 + Math.random() * 4.6,
    twist: 1.8 + Math.random() * 4.4,
    lane: index % 3,
  }));
}

function dispararEfeitoVisivel() {
  referencias.sobreposicaoDominio.classList.remove("active");
  void referencias.sobreposicaoDominio.offsetWidth;
  referencias.sobreposicaoDominio.classList.add("active");
  referencias.quadroPalco.classList.add("domain-live");
  window.setTimeout(() => {
    referencias.quadroPalco.classList.remove("domain-live");
    referencias.sobreposicaoDominio.classList.remove("active");
  }, DURACAO_EFEITO_MS);
}

function ativarDominio() {
  const now = Date.now();
  if (now < estado.resfriamentoDominioAte) {
    return;
  }

  estado.resfriamentoDominioAte = now + 5200;
  estado.precisaRearmarGesto = true;
  estado.quadrosEstaveis = 0;
  estado.efeitoIniciadoEm = now;
  estado.centroEfeito = {
    x: estado.ultimasMetricas?.centerX || 0.5,
    y: estado.ultimasMetricas?.centerY || 0.45,
  };
  gerarParticulas();
  dispararEfeitoVisivel();
  playDomainSound();
  queueClipCapture();
  definirSelo(referencias.statusGesto, "Ativado", "hot");
  definirStatusPalco("Dominio ativo", "hot");
  definirDebug("Unlimited Void disparado. Espera o cooldown e rearmamento.");

  if (navigator.vibrate) {
    navigator.vibrate([130, 40, 170, 60, 220]);
  }

  window.setTimeout(() => {
    if (estado.cameraAtiva) {
      definirStatusPalco("Solte e refaca", "warn");
      definirDebug("Pronto para outra invocacao. Solta o gesto e faz de novo.");
    }
  }, DURACAO_EFEITO_MS);
}

function desenharFundoAnimeDominio(context, width, height, timestamp, progress) {
  const centerX = width * 0.5;
  const centerY = height * 0.46;
  const sweep = timestamp * 0.001;
  const bg = context.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#020611");
  bg.addColorStop(0.42, "#09172a");
  bg.addColorStop(1, "#040816");
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  const halo = context.createRadialGradient(centerX, centerY, width * 0.05, centerX, centerY, width * 0.75);
  halo.addColorStop(0, "rgba(235,249,255,0.98)");
  halo.addColorStop(0.08, "rgba(173,236,255,0.92)");
  halo.addColorStop(0.2, "rgba(77,171,214,0.58)");
  halo.addColorStop(0.48, "rgba(8,29,52,0.32)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  for (let beam = 0; beam < 8; beam += 1) {
    const offset = (beam - 3.5) * width * 0.05;
    const alpha = 0.06 + (beam % 2) * 0.03;
    const pillar = context.createLinearGradient(centerX + offset, 0, centerX + offset, height);
    pillar.addColorStop(0, "rgba(255,255,255,0)");
    pillar.addColorStop(0.2, `rgba(130, 219, 255, ${alpha})`);
    pillar.addColorStop(0.5, `rgba(214, 246, 255, ${alpha + 0.06})`);
    pillar.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = pillar;
    context.fillRect(centerX + offset - width * 0.015, 0, width * 0.03, height);
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(171, 232, 255, 0.12)";
  context.lineWidth = 1.25;
  for (let column = -12; column <= 12; column += 1) {
    const spread = column / 12;
    const topX = centerX + spread * width * 0.16;
    const bottomX = centerX + spread * width * 0.7;
    context.beginPath();
    context.moveTo(topX, height * 0.16);
    context.lineTo(bottomX, height);
    context.stroke();
  }
  for (let row = 0; row < 18; row += 1) {
    const ratio = row / 17;
    const y = height * (0.22 + ratio * 0.78);
    const inset = width * (0.38 * (1 - ratio));
    context.beginPath();
    context.moveTo(inset, y);
    context.lineTo(width - inset, y);
    context.stroke();
  }
  context.restore();

  context.save();
  context.globalCompositeOperation = "screen";
  context.strokeStyle = "rgba(196, 242, 255, 0.12)";
  for (let tunnel = 0; tunnel < 7; tunnel += 1) {
    const ratio = tunnel / 6;
    context.lineWidth = 1.2 + ratio * 1.4;
    context.beginPath();
    context.ellipse(
      centerX,
      centerY + ratio * height * 0.12,
      width * (0.08 + ratio * 0.34 + progress * 0.05),
      height * (0.025 + ratio * 0.12),
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
  }
  context.restore();

  context.save();
  context.globalCompositeOperation = "screen";
  for (let stripe = 0; stripe < 18; stripe += 1) {
    const x = (stripe / 18) * width;
    const wave = Math.sin(sweep * 1.3 + stripe * 0.7) * 18;
    const stripeGradient = context.createLinearGradient(x, 0, x + wave, height);
    stripeGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    stripeGradient.addColorStop(0.3, "rgba(107, 210, 255, 0.05)");
    stripeGradient.addColorStop(0.7, "rgba(255, 255, 255, 0.09)");
    stripeGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = stripeGradient;
    context.fillRect(x - 6, 0, 18, height);
  }

  for (let index = 0; index < 86; index += 1) {
    const seed = index * 17.31;
    const x = ((seed * 37 + sweep * 28) % width + width) % width;
    const y = ((seed * 53 + sweep * 12) % height + height) % height;
    const alpha = 0.18 + (index % 5) * 0.08;
    const size = 1 + (index % 3);
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    context.fill();
  }
  context.restore();

  context.save();
  context.globalCompositeOperation = "screen";
  context.strokeStyle = `rgba(255,255,255,${0.24 + (1 - progress) * 0.2})`;
  context.lineWidth = 2.5;
  for (let ring = 0; ring < 5; ring += 1) {
    const ringRadius = width * (0.07 + ring * 0.052 + progress * 0.045);
    context.beginPath();
    context.ellipse(centerX, centerY, ringRadius, ringRadius * 0.36, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  context.save();
  context.globalCompositeOperation = "screen";
  for (let arc = 0; arc < 10; arc += 1) {
    const radius = width * (0.11 + arc * 0.028);
    const start = sweep * 0.7 + arc * 0.4;
    const end = start + Math.PI * (0.12 + (arc % 3) * 0.04);
    context.beginPath();
    context.lineWidth = 1.2;
    context.strokeStyle = `rgba(255,255,255,${0.08 + (arc % 4) * 0.03})`;
    context.arc(centerX, centerY, radius, start, end);
    context.stroke();
  }
  context.restore();
}

function desenharRecorteFrontal(context, width, height, progress) {
  if (!estado.segmentacao.pronta) {
    desenharFonteEspelhada(context, referencias.camera, width, height);
    return;
  }

  const personContext = referencias.telaPessoa.getContext("2d");
  personContext.save();
  personContext.clearRect(0, 0, width, height);
  desenharFonteEspelhada(personContext, referencias.camera, width, height);
  personContext.globalCompositeOperation = "destination-in";
  desenharFonteEspelhada(personContext, referencias.telaSegmentacao, width, height);
  personContext.globalCompositeOperation = "source-over";
  personContext.restore();

  context.save();
  context.shadowColor = `rgba(164, 242, 255, ${0.24 + (1 - progress) * 0.22})`;
  context.shadowBlur = 22;
  context.drawImage(referencias.telaPessoa, 0, 0, width, height);
  context.restore();
}

function desenharQuadroComposto(timestamp) {
  const width = referencias.telaComposta.width;
  const height = referencias.telaComposta.height;
  if (!width || !height || referencias.camera.readyState < 2) {
    estado.idQuadroAnimacao = window.requestAnimationFrame(desenharQuadroComposto);
    return;
  }

  const context = referencias.telaComposta.getContext("2d");
  context.save();
  context.clearRect(0, 0, width, height);
  const progress = progressoEfeitoEm(timestamp);
  if (progress !== null) {
    desenharFundoAnimeDominio(context, width, height, timestamp, progress);
    desenharRecorteFrontal(context, width, height, progress);
  } else {
    desenharFonteEspelhada(context, referencias.camera, width, height);
  }
  context.restore();

  const vignette = context.createRadialGradient(width * 0.5, height * 0.48, width * 0.1, width * 0.5, height * 0.5, width * 0.7);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, progress !== null ? "rgba(3, 10, 18, 0.3)" : "rgba(3, 10, 18, 0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  desenharEfeitoTelaDominio(context, width, height, timestamp);
  estado.idQuadroAnimacao = window.requestAnimationFrame(desenharQuadroComposto);
}

function desenharEfeitoTelaDominio(context, width, height, timestamp) {
  const progress = progressoEfeitoEm(timestamp);
  if (progress === null) {
    return;
  }
  const centerX = estado.centroEfeito.x * width;
  const centerY = estado.centroEfeito.y * height;
  const flashAlpha = limitar(1 - progress * 4.2, 0, 0.9);
  const haloAlpha = limitar(0.9 - progress * 0.8, 0, 0.9);
  const pulse = 1 - Math.abs(Math.sin(progress * Math.PI * 2.6));

  context.save();
  context.globalCompositeOperation = "screen";

  const flash = context.createRadialGradient(centerX, centerY, width * 0.04, centerX, centerY, width * 0.52);
  flash.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
  flash.addColorStop(0.16, `rgba(195,243,255,${haloAlpha})`);
  flash.addColorStop(0.5, `rgba(69,176,214,${haloAlpha * 0.45})`);
  flash.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = flash;
  context.fillRect(0, 0, width, height);

  for (let ray = 0; ray < 14; ray += 1) {
    const angle = ray * (Math.PI / 7) + progress * 1.6;
    const inner = width * 0.06;
    const outer = width * (0.26 + progress * 0.42);
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
    context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
    context.strokeStyle = `rgba(220, 247, 255, ${0.08 + pulse * 0.12})`;
    context.lineWidth = 2 + (ray % 3);
    context.stroke();
  }

  context.strokeStyle = `rgba(200, 248, 255, ${0.45 - progress * 0.35})`;
  context.lineWidth = 2;
  for (let line = -16; line <= 16; line += 1) {
    const offset = line * 24 + progress * 180;
    context.beginPath();
    context.moveTo(0, centerY + offset);
    context.lineTo(width, centerY + offset + progress * 18);
    context.stroke();
  }

  estado.particulasEfeito.forEach((particle) => {
    const orbit = particle.radius * Math.min(width, height);
    const travel = orbit + progress * particle.drift * 220;
    const x = centerX + Math.cos(particle.angle + progress * particle.twist) * travel;
    const y = centerY + Math.sin(particle.angle + progress * (particle.twist - 0.8)) * (travel * (0.72 + particle.lane * 0.12));
    context.beginPath();
    context.arc(x, y, particle.size, 0, Math.PI * 2);
    context.fillStyle = particle.lane === 0
      ? `rgba(255,255,255,${0.75 - progress * 0.55})`
      : particle.lane === 1
        ? `rgba(170,234,255,${0.64 - progress * 0.42})`
        : `rgba(255,215,153,${0.52 - progress * 0.35})`;
    context.fill();
  });

  context.beginPath();
  context.arc(centerX, centerY, width * (0.1 + progress * 0.48), 0, Math.PI * 2);
  context.strokeStyle = `rgba(255, 216, 128, ${0.7 - progress * 0.45})`;
  context.lineWidth = 4;
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, width * (0.06 + progress * 0.16), 0, Math.PI * 2);
  context.strokeStyle = `rgba(255,255,255,${0.82 - progress * 0.62})`;
  context.lineWidth = 2.5;
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, width * (0.02 + progress * 0.08), 0, Math.PI * 2);
  context.strokeStyle = `rgba(255,255,255,${0.95 - progress * 0.65})`;
  context.lineWidth = 1.5;
  context.stroke();

  for (let shock = 0; shock < 3; shock += 1) {
    const shockProgress = progress - shock * 0.12;
    if (shockProgress <= 0) {
      continue;
    }

    context.beginPath();
    context.ellipse(
      centerX,
      centerY,
      width * (0.08 + shockProgress * 0.22),
      width * (0.028 + shockProgress * 0.1),
      0,
      0,
      Math.PI * 2
    );
    context.strokeStyle = `rgba(201, 246, 255, ${0.3 - shockProgress * 0.22})`;
    context.lineWidth = 2;
    context.stroke();
  }

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

function iniciarLoopRenderizacao() {
  if (estado.idQuadroAnimacao) {
    return;
  }

  estado.idQuadroAnimacao = window.requestAnimationFrame(desenharQuadroComposto);
}

async function iniciarSegmentacao() {
  if (!window.SelfieSegmentation) {
    estado.segmentacao.suportado = false;
    referencias.textoPwa.textContent = "Segmentacao nao carregou. O fundo especial pode falhar.";
    return;
  }

  estado.segmentacao.modelo = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });

  estado.segmentacao.modelo.setOptions({
    modelSelection: 1,
  });

  estado.segmentacao.modelo.onResults((results) => {
    if (!results.segmentationMask || !redimensionarTelas()) {
      return;
    }

    const width = referencias.telaSegmentacao.width;
    const height = referencias.telaSegmentacao.height;
    const segmentationContext = referencias.telaSegmentacao.getContext("2d");
    segmentationContext.save();
    segmentationContext.clearRect(0, 0, width, height);
    segmentationContext.filter = "blur(4px)";
    segmentationContext.drawImage(results.segmentationMask, 0, 0, width, height);
    segmentationContext.restore();
    estado.segmentacao.pronta = true;
    estado.segmentacao.ultimaAtualizacaoEm = Date.now();
  });
}

async function iniciarRastreamentoMao() {
  if (!window.Hands || !window.Camera) {
    throw new Error("MediaPipe nao carregou. Confira a conexao com a internet.");
  }

  await iniciarSegmentacao();
  estado.hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  estado.hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.45,
  });

  estado.hands.onResults((results) => {
    estado.ultimoQuadroEm = Date.now();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      estado.ultimosPontos = null;
      estado.ultimasMetricas = null;
      estado.ultimoResultadoGesto = null;
      estado.pontuacaoSuavizadaGesto = 0;
      estado.quadrosEstaveis = Math.max(0, estado.quadrosEstaveis - 2);
      definirMedidor(referencias.medidorGesto, 0);
      definirMedidor(referencias.medidorEstabilidade, limitar(estado.quadrosEstaveis / obterQuadrosNecessariosAtivacao(), 0, 1));
      definirMedidor(referencias.medidorMovimento, 0);
      definirSelo(referencias.statusMao, "Sem mao", "idle");
      definirSelo(referencias.statusGesto, "Nao detectado", "idle");
      definirSelo(referencias.statusMovimento, "Sem quadro", "idle");
      definirStatusPalco("Sem mao", "idle");
      limparSobreposicaoMao();
      definirItemRetorno(referencias.retornoEnquadramento, "warn", "Mostre a mao inteira para a camera");
      definirItemRetorno(referencias.retornoMovimento, "warn", "Segure o gesto firme para ativar.");
      aplicarFocoTreino(null);
      atualizarGuiaPalco({
        rastreada: false,
        pronto: false,
        texto: estado.modoTreinoGuiado
          ? "Volte com a mao para continuar o treino"
          : "Encaixe sua mao aqui",
      });
      if (!estado.modoCalibracao) {
        definirDebug("Posiciona a mao no centro para o rastreio voltar.");
      }
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const metrics = calcularMetricasGesto(landmarks);
    const result = pontuarGesto(metrics);
    const gestureScore = result.overall;

    estado.ultimosPontos = landmarks;
    estado.ultimasMetricas = metrics;
    estado.ultimoResultadoGesto = result;
    estado.historicoPontuacao.push(gestureScore);
    if (estado.historicoPontuacao.length > JANELA_SUAVIZACAO_GESTO) {
      estado.historicoPontuacao.shift();
    }
    const gestureScoreSuavizado = media(estado.historicoPontuacao);
    estado.pontuacaoSuavizadaGesto = gestureScoreSuavizado;
    const limiarBruto = obterLimiarGestoBruto();
    const limiarSuavizado = obterLimiarGestoSuavizado();
    const quadrosNecessarios = obterQuadrosNecessariosAtivacao();

    if (
      gestureScore > limiarBruto &&
      gestureScoreSuavizado > limiarBruto - 0.05 &&
      result.parts.cross > 0.55
    ) {
      estado.quadrosEstaveis += 1;
    } else {
      estado.quadrosEstaveis = Math.max(0, estado.quadrosEstaveis - 2);
    }

    const stabilityScore = limitar(estado.quadrosEstaveis / quadrosNecessarios, 0, 1);
    const gestureReady =
      gestureScore > limiarBruto &&
      gestureScoreSuavizado > limiarSuavizado &&
      stabilityScore > 0.62 &&
      result.parts.cross > 0.66 &&
      result.parts.close > 0.6 &&
      result.parts.framing > 0.42;

    definirMedidor(referencias.medidorGesto, gestureScoreSuavizado);
    definirMedidor(referencias.medidorEstabilidade, stabilityScore);
    definirMedidor(referencias.medidorMovimento, result.parts.framing);
    desenharSobreposicaoMao(landmarks, gestureScore);
    atualizarGuiaPalco({ rastreada: true, pronto: gestureReady });
    definirSelo(referencias.statusMao, "Mao rastreada", "ok");
    definirSelo(
      referencias.statusMovimento,
      result.parts.framing > 0.72 ? "Bem enquadrada" : result.parts.framing > 0.46 ? "Quase la" : "Ajuste a mao",
      result.parts.framing > 0.72 ? "ok" : result.parts.framing > 0.46 ? "warn" : "idle"
    );
    definirStatusPalco(gestureReady ? "Selo pronto" : "Mao detectada", gestureReady ? "ok" : "warn");

    if (estado.precisaRearmarGesto) {
      if (gestureScoreSuavizado < obterLimiarRearmeGesto()) {
        estado.precisaRearmarGesto = false;
        definirSelo(referencias.statusGesto, "Rearmado", "idle");
        definirStatusPalco("Rearmado", "idle");
        definirDebug("Rearmado. Agora pode montar o gesto de novo.");
      } else {
        definirSelo(referencias.statusGesto, "Solte e refaca", "warn");
        definirStatusPalco("Solte e refaca", "warn");
      }
      atualizarOrientacoes(metrics, result, false);
      atualizarTreinoGuiado(result);
      return;
    }

    if (estado.modoCalibracao) {
      definirSelo(referencias.statusGesto, "Calibrando", "warn");
      definirStatusPalco("Calibrando", "warn");
      atualizarOrientacoes(metrics, result, false);
      atualizarEstadoCalibracao(metrics);
      aplicarFocoTreino(result);
      return;
    }

    definirSelo(
      referencias.statusGesto,
      gestureReady ? "Pronto" : gestureScoreSuavizado > 0.48 ? "Lendo" : "Nao detectado",
      gestureReady ? "ok" : gestureScoreSuavizado > 0.48 ? "warn" : "idle"
    );

    atualizarOrientacoes(metrics, result, gestureReady);
    atualizarTreinoGuiado(result);

    if (gestureReady) {
      ativarDominio();
    }
  });

  estado.fluxoCamera = new Camera(referencias.camera, {
    onFrame: async () => {
      const agora = Date.now();
      const tasks = [estado.hands.send({ image: referencias.camera })];
      const segmentacaoNecessaria =
        !!estado.efeitoIniciadoEm &&
        agora - estado.efeitoIniciadoEm <= DURACAO_EFEITO_MS + 450;
      const podeAtualizarSegmentacao =
        segmentacaoNecessaria &&
        !!estado.segmentacao.modelo &&
        !estado.segmentacao.requisicaoEmAndamento &&
        agora - estado.segmentacao.ultimaSolicitacaoEm >= INTERVALO_SEGMENTACAO_MS;

      if (podeAtualizarSegmentacao) {
        estado.segmentacao.requisicaoEmAndamento = true;
        estado.segmentacao.ultimaSolicitacaoEm = agora;
        tasks.push(
          estado.segmentacao.modelo
            .send({ image: referencias.camera })
            .catch(() => {})
            .finally(() => {
              estado.segmentacao.requisicaoEmAndamento = false;
            })
        );
      }
      await Promise.all(tasks);
    },
    width: 848,
    height: 480,
  });

  await estado.fluxoCamera.start();
  estado.cameraAtiva = true;
  redimensionarTelas();
  iniciarLoopRenderizacao();
  iniciarGravadorComposto();
  definirSelo(referencias.statusCamera, "Ativa", "ok");
  definirSelo(referencias.statusMovimento, "Aguardando mao", "idle");
  definirStatusPalco("Procure a mao", "idle");
  referencias.botaoCalibrar.disabled = false;
  referencias.botaoTreino.disabled = false;
  referencias.botaoResetarCalibracao.disabled = !estado.perfilCalibracao;
  atualizarGuiaPalco({ rastreada: false, pronto: false });
  definirDebug("Camera online. Monte o selo do Gojo com indicador e medio cruzados.");
  atualizarTextoGravacao();
}

async function registrarAplicativoProgressivo() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  if (standalone) {
    referencias.textoPwa.textContent = "Rodando como app instalado.";
  }

  if (!("serviceWorker" in navigator)) {
    referencias.textoPwa.textContent = "Service Worker nao suportado aqui.";
    return;
  }

  if (!window.isSecureContext) {
    referencias.textoPwa.textContent = "PWA pronto, mas o Service Worker precisa de localhost ou HTTPS.";
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
    referencias.textoPwa.textContent = "PWA pronto. A shell e os assets vao ficar disponiveis offline apos a primeira carga.";
  } catch (error) {
    referencias.textoPwa.textContent = "Falhou ao registrar o PWA neste navegador.";
  }
}

function tratarPromptInstalacao() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    estado.promptInstalacao = event;
    referencias.botaoInstalar.hidden = false;
    referencias.textoPwa.textContent = "Instalacao disponivel. Toque em instalar para fixar como app.";
  });

  window.addEventListener("appinstalled", () => {
    referencias.botaoInstalar.hidden = true;
    referencias.textoPwa.textContent = "App instalado com sucesso.";
  });
}

async function instalarAplicativo() {
  if (!estado.promptInstalacao) {
    referencias.textoPwa.textContent = "Ainda nao existe prompt de instalacao neste dispositivo.";
    return;
  }

  estado.promptInstalacao.prompt();
  await estado.promptInstalacao.userChoice;
  estado.promptInstalacao = null;
  referencias.botaoInstalar.hidden = true;
}

function atualizarSensibilidade(event) {
  estado.ajustes.sensibilidade = Number(event.target.value);
  salvarAjustes();
  atualizarPainelAjustes();
}

function atualizarSustentacao(event) {
  estado.ajustes.sustentacao = Number(event.target.value);
  salvarAjustes();
  atualizarPainelAjustes();
}

function iniciarTreinoGuiado() {
  if (!estado.cameraAtiva) {
    definirDebug("Ligue a camera antes de iniciar o treino.");
    return;
  }

  if (estado.modoTreinoGuiado) {
    concluirTreinoGuiado();
    definirDebug("Treino guiado cancelado.");
    atualizarGuiaPalco({ rastreada: !!estado.ultimosPontos, pronto: false });
    return;
  }

  estado.modoCalibracao = false;
  estado.amostrasCalibracao = [];
  referencias.botaoCalibrar.textContent = estado.perfilCalibracao ? "Recalibrar gesto" : "Calibrar gesto";
  estado.modoTreinoGuiado = true;
  estado.etapaTreino = 0;
  referencias.botaoTreino.textContent = "Parar treino";
  aplicarFocoTreino(estado.ultimoResultadoGesto);
  atualizarGuiaPalco({
    rastreada: !!estado.ultimosPontos,
    pronto: false,
    texto: "Traga a mao para o centro do guia.",
  });
  definirDebug("Treino guiado iniciado. Vamos encaixar a mao e montar o selo passo a passo.");
}

function iniciarCalibracao() {
  if (!estado.cameraAtiva) {
    definirDebug("Liga a camera antes de calibrar.");
    return;
  }

  if (estado.modoCalibracao) {
    estado.modoCalibracao = false;
    estado.amostrasCalibracao = [];
    referencias.botaoCalibrar.textContent = estado.perfilCalibracao ? "Recalibrar gesto" : "Calibrar gesto";
    atualizarTextoCalibracao();
    definirDebug("Calibracao cancelada.");
    return;
  }

  if (estado.modoTreinoGuiado) {
    concluirTreinoGuiado();
  }

  estado.modoCalibracao = true;
  estado.amostrasCalibracao = [];
  referencias.botaoCalibrar.textContent = "Calibrando...";
  definirDebug("Segure o gesto do Gojo por um instante para salvar o seu padrao.");
}

function resetarCalibracao() {
  limparPerfilCalibracao();
  referencias.botaoCalibrar.textContent = "Calibrar gesto";
  definirDebug("Calibracao removida. O detector voltou para o perfil padrao.");
}

async function iniciarExperiencia() {
  referencias.botaoIniciar.disabled = true;
  referencias.botaoIniciar.textContent = "Inicializando...";
  definirStatusPalco("Inicializando", "warn");
  definirDebug("Pedindo camera e carregando o rastreio da mao.");

  try {
    await iniciarRastreamentoMao();
    referencias.botaoIniciar.textContent = "Camera liberada";
  } catch (error) {
    referencias.botaoIniciar.disabled = false;
    referencias.botaoIniciar.textContent = "Tentar novamente";
    definirSelo(referencias.statusCamera, "Falhou", "hot");
    definirStatusPalco("Falhou", "hot");
    definirDebug(error.message || "Nao foi possivel iniciar o demo.");
  }
}

function iniciarInterface() {
  atualizarTextoCalibracao();
  atualizarTextoGravacao();
  atualizarPainelAjustes();
  tratarPromptInstalacao();
  registrarAplicativoProgressivo();

  definirSelo(referencias.statusMovimento, "Aguardando", "idle");
  definirStatusPalco("Aguardando camera", "idle");
  atualizarGuiaPalco({ rastreada: false, pronto: false });
  referencias.textoPwa.textContent = "A versao web e a principal. O dominio ativa so com o gesto.";

  if (!estado.recorder.suportado) {
    referencias.textoGravacao.textContent = "Clip recorder indisponivel neste navegador.";
  }
}

referencias.botaoIniciar.addEventListener("click", iniciarExperiencia);
if (referencias.botaoReferencia) {
  referencias.botaoReferencia.addEventListener("click", alternarReferencia);
}
referencias.botaoInstalar.addEventListener("click", instalarAplicativo);
referencias.botaoCalibrar.addEventListener("click", iniciarCalibracao);
referencias.botaoTreino.addEventListener("click", iniciarTreinoGuiado);
referencias.botaoResetarCalibracao.addEventListener("click", resetarCalibracao);
referencias.controleSensibilidade.addEventListener("input", atualizarSensibilidade);
referencias.controleSustentacao.addEventListener("input", atualizarSustentacao);

iniciarInterface();

