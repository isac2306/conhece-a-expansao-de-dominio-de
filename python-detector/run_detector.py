from __future__ import annotations

import json
import math
import os
import platform
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import cv2
import mediapipe as mp
import numpy as np


TITULO_JANELA = "Selo do Gojo | Detector Python"
CAMINHO_PERFIL = Path(__file__).with_name("perfil_calibracao.json")
JANELA_SUAVIZACAO = 10
QUADROS_CALIBRACAO = 24
DURACAO_EFEITO_SEG = 2.9
DURACAO_RESIDUO_SEG = 1.1
COOLDOWN_SEG = 5.2
INTERVALO_SEGMENTACAO = 2
BUFFER_REPLAY_QUADROS = 72


def limitar(valor: float, minimo: float, maximo: float) -> float:
    return min(max(valor, minimo), maximo)


def media(valores: Iterable[float]) -> float:
    valores_lista = list(valores)
    if not valores_lista:
        return 0.0
    return sum(valores_lista) / len(valores_lista)


def distancia(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def vetor(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return (b[0] - a[0], b[1] - a[1])


def magnitude(vetor_2d: tuple[float, float]) -> float:
    return math.hypot(vetor_2d[0], vetor_2d[1])


def angulo_entre(a: tuple[float, float], b: tuple[float, float]) -> float:
    denominador = magnitude(a) * magnitude(b)
    if not denominador:
        return 0.0
    cosseno = limitar((a[0] * b[0] + a[1] * b[1]) / denominador, -1.0, 1.0)
    return math.degrees(math.acos(cosseno))


def orientacao(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])


def ponto_no_segmento(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> bool:
    return (
        b[0] <= max(a[0], c[0])
        and b[0] >= min(a[0], c[0])
        and b[1] <= max(a[1], c[1])
        and b[1] >= min(a[1], c[1])
    )


def segmentos_se_cruzam(
    p1: tuple[float, float],
    q1: tuple[float, float],
    p2: tuple[float, float],
    q2: tuple[float, float],
) -> bool:
    epsilon = 1e-5
    o1 = orientacao(p1, q1, p2)
    o2 = orientacao(p1, q1, q2)
    o3 = orientacao(p2, q2, p1)
    o4 = orientacao(p2, q2, q1)

    if (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0):
        return True

    if abs(o1) < epsilon and ponto_no_segmento(p1, p2, q1):
        return True
    if abs(o2) < epsilon and ponto_no_segmento(p1, q2, q1):
        return True
    if abs(o3) < epsilon and ponto_no_segmento(p2, p1, q2):
        return True
    if abs(o4) < epsilon and ponto_no_segmento(p2, q1, q2):
        return True

    return False


def normalizar_pontuacao(valor: float, minimo: float, maximo: float) -> float:
    if maximo <= minimo:
        return 0.0
    return limitar((valor - minimo) / (maximo - minimo), 0.0, 1.0)


def inverter_pontuacao(valor: float, ideal_maximo: float, tolerancia: float) -> float:
    if valor <= ideal_maximo:
        return 1.0
    return limitar(1.0 - (valor - ideal_maximo) / tolerancia, 0.0, 1.0)


def pontuacao_proximidade(valor: float, alvo: float, tolerancia: float) -> float:
    return limitar(1.0 - abs(valor - alvo) / tolerancia, 0.0, 1.0)


@dataclass
class PerfilGesto:
    index_extension: float = 0.30
    middle_extension: float = 0.30
    tip_gap: float = 0.42
    angle: float = 22.0
    ring_curl: float = 0.04
    pinky_curl: float = 0.05
    updated_at: float = 0.0


@dataclass(frozen=True)
class PresetQualidade:
    nome: str
    largura_processamento: int
    suavizacao_pontos: float
    nitidez: float
    clahe_clip: float


PRESETS_QUALIDADE = {
    "1": PresetQualidade("Detalhe", 1280, 0.70, 0.32, 2.6),
    "2": PresetQualidade("Balanceado", 960, 0.62, 0.24, 2.2),
    "3": PresetQualidade("Fluido", 768, 0.54, 0.16, 1.8),
}

TEMAS_VISUAIS = {
    "anime": {
        "nome": "Anime",
        "primaria": (255, 228, 162),
        "secundaria": (138, 238, 255),
        "acento": (255, 255, 255),
        "fundo": (12, 14, 22),
        "cartao": (10, 18, 28),
        "texto": (244, 248, 252),
        "texto_fraco": (170, 194, 214),
        "sucesso": (162, 255, 214),
        "alerta": (255, 228, 170),
    },
    "clean": {
        "nome": "Clean",
        "primaria": (238, 238, 238),
        "secundaria": (176, 230, 239),
        "acento": (255, 255, 255),
        "fundo": (18, 24, 30),
        "cartao": (24, 30, 38),
        "texto": (245, 248, 250),
        "texto_fraco": (182, 196, 210),
        "sucesso": (180, 255, 228),
        "alerta": (255, 235, 190),
    },
}


@dataclass
class MetricasGesto:
    hand_scale: float
    center_x: float
    center_y: float
    index_extension: float
    middle_extension: float
    ring_curl: float
    pinky_curl: float
    tip_gap: float
    angle: float
    crossing: bool
    order_flip: bool


class CapturaCamera:
    def __init__(self, indice_camera: int = 0) -> None:
        self.indice_camera = indice_camera
        self._captura: cv2.VideoCapture | None = None
        self._quadro: np.ndarray | None = None
        self._tempo_quadro = 0.0
        self._lock = threading.Lock()
        self._rodando = False
        self._thread: threading.Thread | None = None

    def iniciar(self) -> tuple[int, int]:
        backend = cv2.CAP_DSHOW if platform.system() == "Windows" and hasattr(cv2, "CAP_DSHOW") else cv2.CAP_ANY
        self._captura = cv2.VideoCapture(self.indice_camera, backend)
        if not self._captura.isOpened():
            raise RuntimeError("Nao foi possivel abrir a camera.")

        self._captura.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self._captura.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        self._captura.set(cv2.CAP_PROP_FPS, 60)
        for nome_prop, valor in (
            ("CAP_PROP_AUTOFOCUS", 1),
            ("CAP_PROP_AUTO_WB", 1),
            ("CAP_PROP_SHARPNESS", 180),
            ("CAP_PROP_CONTRAST", 40),
            ("CAP_PROP_SATURATION", 48),
        ):
            if hasattr(cv2, nome_prop):
                self._captura.set(getattr(cv2, nome_prop), valor)
        for largura, altura in ((1920, 1080), (1600, 900), (1280, 720), (960, 540)):
            self._captura.set(cv2.CAP_PROP_FRAME_WIDTH, largura)
            self._captura.set(cv2.CAP_PROP_FRAME_HEIGHT, altura)
            time.sleep(0.05)
            real_largura = int(self._captura.get(cv2.CAP_PROP_FRAME_WIDTH))
            real_altura = int(self._captura.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if real_largura >= largura * 0.9 and real_altura >= altura * 0.9:
                break

        self._rodando = True
        self._thread = threading.Thread(target=self._loop_captura, name="captura-camera", daemon=True)
        self._thread.start()

        inicio = time.time()
        while self._quadro is None and time.time() - inicio < 2.0:
            time.sleep(0.01)

        if self._quadro is None:
            raise RuntimeError("A camera abriu, mas nenhum quadro chegou.")

        altura, largura = self._quadro.shape[:2]
        return largura, altura

    def _loop_captura(self) -> None:
        assert self._captura is not None
        while self._rodando:
            ok, quadro = self._captura.read()
            if not ok:
                time.sleep(0.01)
                continue
            with self._lock:
                self._quadro = quadro
                self._tempo_quadro = time.time()

    def ler(self) -> tuple[np.ndarray | None, float]:
        with self._lock:
            if self._quadro is None:
                return None, 0.0
            return self._quadro.copy(), self._tempo_quadro

    def encerrar(self) -> None:
        self._rodando = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        if self._captura is not None:
            self._captura.release()


class DetectorGojo:
    def __init__(self) -> None:
        self.perfil = self._carregar_perfil()
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_styles = mp.solutions.drawing_styles
        self.mp_segmentation = mp.solutions.selfie_segmentation
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=0,
            min_detection_confidence=0.58,
            min_tracking_confidence=0.50,
        )
        self.segmentacao = self.mp_segmentation.SelfieSegmentation(model_selection=1)
        self.captura = CapturaCamera()
        self.historico_pontuacao: deque[float] = deque(maxlen=JANELA_SUAVIZACAO)
        self.buffer_replay: deque[np.ndarray] = deque(maxlen=BUFFER_REPLAY_QUADROS)
        self.quadros_estaveis = 0
        self.precisa_rearmar = False
        self.cooldown_ate = 0.0
        self.efeito_inicio = 0.0
        self.preset_qualidade_id = "2"
        self.pontos_suavizados: np.ndarray | None = None
        self.mascara_pessoa: np.ndarray | None = None
        self.contador_segmentacao = 0
        self.ultimas_metricas: MetricasGesto | None = None
        self.ultimas_landmarks = None
        self.ultimo_resultado: dict[str, object] | None = None
        self.calibrando = False
        self.amostras_calibracao: list[MetricasGesto] = []
        self.fps_historico: deque[float] = deque(maxlen=30)
        self.ultimo_tempo_fps = time.perf_counter()
        self.fullscreen = False
        self.mostrar_hud = True
        self.melhoria_visual = True
        self.mostrar_referencia = True
        self.modo_visual = "anime"
        self.intensidade_pre_ativacao = 0.0
        self.cache_vinheta: dict[tuple[int, int], np.ndarray] = {}

    def _carregar_perfil(self) -> PerfilGesto:
        if not CAMINHO_PERFIL.exists():
            return PerfilGesto()
        try:
            dados = json.loads(CAMINHO_PERFIL.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return PerfilGesto()
        return PerfilGesto(**{**asdict(PerfilGesto()), **dados})

    def _salvar_perfil(self) -> None:
        CAMINHO_PERFIL.write_text(json.dumps(asdict(self.perfil), indent=2), encoding="utf-8")

    def _limpar_perfil(self) -> None:
        self.perfil = PerfilGesto()
        if CAMINHO_PERFIL.exists():
            CAMINHO_PERFIL.unlink()

    def _preset_atual(self) -> PresetQualidade:
        return PRESETS_QUALIDADE[self.preset_qualidade_id]

    def _extrair_pontos(self, landmarks) -> np.ndarray:
        return np.array([(lm.x, lm.y) for lm in landmarks.landmark], dtype=np.float32)

    def _suavizar_pontos(self, pontos: np.ndarray) -> np.ndarray:
        alpha = self._preset_atual().suavizacao_pontos
        if self.pontos_suavizados is None or self.pontos_suavizados.shape != pontos.shape:
            self.pontos_suavizados = pontos.copy()
        else:
            self.pontos_suavizados = self.pontos_suavizados * alpha + pontos * (1.0 - alpha)
        return self.pontos_suavizados

    def _aplicar_melhoria_visual(self, quadro: np.ndarray) -> np.ndarray:
        if not self.melhoria_visual:
            return quadro

        preset = self._preset_atual()
        lab = cv2.cvtColor(quadro, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=preset.clahe_clip, tileGridSize=(8, 8))
        l = clahe.apply(l)
        melhorado = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
        borrado = cv2.GaussianBlur(melhorado, (0, 0), 1.2)
        return cv2.addWeighted(melhorado, 1.0 + preset.nitidez, borrado, -preset.nitidez, 0)

    def _alternar_preset(self, preset_id: str) -> None:
        if preset_id not in PRESETS_QUALIDADE:
            return
        self.preset_qualidade_id = preset_id
        self.pontos_suavizados = None

    def _alternar_modo_visual(self) -> None:
        self.modo_visual = "clean" if self.modo_visual == "anime" else "anime"

    def _tema_atual(self) -> dict[str, object]:
        return TEMAS_VISUAIS[self.modo_visual]

    def _misturar_overlay(self, quadro: np.ndarray, overlay: np.ndarray, alpha: float) -> None:
        cv2.addWeighted(overlay, limitar(alpha, 0.0, 1.0), quadro, 1.0 - limitar(alpha, 0.0, 1.0), 0, quadro)

    def _obter_vinheta(self, altura: int, largura: int) -> np.ndarray:
        chave = (altura, largura)
        if chave in self.cache_vinheta:
            return self.cache_vinheta[chave]

        y = np.linspace(-1.0, 1.0, altura, dtype=np.float32)[:, None]
        x = np.linspace(-1.0, 1.0, largura, dtype=np.float32)[None, :]
        distancia_centro = np.sqrt(x * x + y * y)
        vinheta = np.clip((distancia_centro - 0.08) / 1.2, 0.0, 1.0)
        self.cache_vinheta[chave] = vinheta
        return vinheta

    def _aplicar_vinheta(self, quadro: np.ndarray, intensidade: float) -> None:
        if intensidade <= 0.0:
            return
        altura, largura = quadro.shape[:2]
        vinheta = self._obter_vinheta(altura, largura)
        fator = 1.0 - vinheta[..., None] * (0.48 * limitar(intensidade, 0.0, 1.0))
        quadro[:] = np.clip(quadro.astype(np.float32) * fator, 0, 255).astype(np.uint8)

    def _aplicar_aberracao_cromatica(self, quadro: np.ndarray, intensidade: float) -> np.ndarray:
        deslocamento = max(0, int(round(8 * intensidade)))
        if deslocamento <= 0:
            return quadro

        azul, verde, vermelho = cv2.split(quadro)
        azul = np.roll(azul, -deslocamento, axis=1)
        vermelho = np.roll(vermelho, deslocamento, axis=1)
        return cv2.merge((azul, verde, vermelho))

    def _aplicar_zoom_pulso(self, quadro: np.ndarray, intensidade: float) -> np.ndarray:
        intensidade = limitar(intensidade, 0.0, 1.0)
        if intensidade <= 0.0:
            return quadro

        altura, largura = quadro.shape[:2]
        corte = int(min(altura, largura) * 0.06 * intensidade)
        if corte <= 1 or corte * 2 >= min(altura, largura):
            return quadro

        zoom = quadro[corte : altura - corte, corte : largura - corte]
        return cv2.resize(zoom, (largura, altura), interpolation=cv2.INTER_LINEAR)

    def _atualizar_buffer_replay(self, quadro: np.ndarray) -> None:
        self.buffer_replay.append(quadro.copy())

    def _obter_quadro_replay(self, progresso: float) -> np.ndarray | None:
        if not self.buffer_replay:
            return None

        indice = int(limitar(progresso, 0.0, 0.999) * len(self.buffer_replay))
        indice = max(1, min(indice, len(self.buffer_replay)))
        return self.buffer_replay[-indice].copy()

    def _atualizar_mascara_pessoa(self, quadro: np.ndarray, forcar: bool = False) -> None:
        precisa_segmentar = forcar or self.efeito_inicio or self.intensidade_pre_ativacao > 0.26
        if not precisa_segmentar:
            return

        self.contador_segmentacao = (self.contador_segmentacao + 1) % INTERVALO_SEGMENTACAO
        if self.contador_segmentacao != 0 and self.mascara_pessoa is not None and not forcar:
            return

        altura, largura = quadro.shape[:2]
        largura_seg = 448
        escala = min(1.0, largura_seg / float(largura))
        quadro_seg = quadro
        if escala < 1.0:
            quadro_seg = cv2.resize(
                quadro,
                (int(largura * escala), int(altura * escala)),
                interpolation=cv2.INTER_AREA,
            )

        resultado = self.segmentacao.process(cv2.cvtColor(quadro_seg, cv2.COLOR_BGR2RGB))
        if resultado.segmentation_mask is None:
            return

        mascara = cv2.GaussianBlur(resultado.segmentation_mask, (0, 0), 2.8)
        if escala < 1.0:
            mascara = cv2.resize(mascara, (largura, altura), interpolation=cv2.INTER_CUBIC)
        mascara = np.clip((mascara - 0.10) / 0.82, 0.0, 1.0).astype(np.float32)
        self.mascara_pessoa = mascara

    def _gerar_fundo_dominio(
        self,
        altura: int,
        largura: int,
        progresso: float,
        intensidade: float,
        centro_relativo: tuple[float, float],
    ) -> np.ndarray:
        tema = self._tema_atual()
        escala = 2
        altura_baixa = max(220, altura // escala)
        largura_baixa = max(360, largura // escala)
        fundo = np.zeros((altura_baixa, largura_baixa, 3), dtype=np.uint8)
        fundo[:] = (8, 6, 18) if self.modo_visual == "anime" else (18, 20, 26)

        centro = (
            int(centro_relativo[0] * largura_baixa),
            int(centro_relativo[1] * altura_baixa),
        )
        horizonte_y = int(altura_baixa * 0.44)
        for indice, cor in enumerate(((32, 18, 92), (96, 46, 150), (126, 196, 255), (255, 232, 160))):
            angulo = progresso * 3.2 + indice * 1.1
            raio = int(min(altura_baixa, largura_baixa) * (0.12 + indice * 0.05))
            deslocamento_x = int(math.cos(angulo) * largura_baixa * 0.14 * (0.5 + indice * 0.16))
            deslocamento_y = int(math.sin(angulo * 1.2) * altura_baixa * 0.08 * (0.5 + indice * 0.12))
            ponto = (centro[0] + deslocamento_x, centro[1] + deslocamento_y)
            cv2.circle(fundo, ponto, raio, cor, -1, cv2.LINE_AA)

        fundo = cv2.GaussianBlur(fundo, (0, 0), 24)

        for indice in range(-9, 10):
            base_x = int(centro[0] + indice * largura_baixa * 0.12)
            topo_x = int(centro[0] + indice * largura_baixa * 0.018)
            cor = tema["secundaria"] if indice % 3 else tema["primaria"]
            cv2.line(
                fundo,
                (base_x, altura_baixa),
                (topo_x, horizonte_y),
                cor,
                1,
                cv2.LINE_AA,
            )

        for indice in range(15):
            curva = (indice / 14.0) ** 1.8
            y = horizonte_y + int((altura_baixa - horizonte_y) * curva)
            deslocamento = int((progresso * 12 + indice * 2) * (0.4 + curva))
            cv2.line(
                fundo,
                (0, y),
                (largura_baixa, min(altura_baixa - 1, y + deslocamento)),
                (58, 102, 166),
                1,
                cv2.LINE_AA,
            )

        for indice in range(80):
            base = indice * 0.31 + progresso * 2.0
            px = int((math.sin(base * 1.7) * 0.5 + 0.5) * largura_baixa)
            py = int((math.cos(base * 2.3 + indice) * 0.5 + 0.5) * altura_baixa * 0.78)
            raio = 1 + (indice % 3 == 0)
            brilho = 140 + int(80 * math.sin(base * 2.1))
            cor = (brilho, min(255, brilho + 30), 255)
            cv2.circle(fundo, (px, py), raio, cor, -1, cv2.LINE_AA)

        for indice in range(22):
            angulo = progresso * 4.6 + indice * (math.pi * 2.0 / 22.0)
            distancia_orbita = min(largura_baixa, altura_baixa) * (0.16 + (indice % 4) * 0.03)
            px = centro[0] + int(math.cos(angulo) * distancia_orbita)
            py = centro[1] + int(math.sin(angulo * 1.2) * distancia_orbita * 0.58)
            cv2.circle(fundo, (px, py), 2, tema["primaria"], -1, cv2.LINE_AA)

        cv2.circle(
            fundo,
            centro,
            int(min(largura_baixa, altura_baixa) * (0.08 + 0.05 * intensidade)),
            (255, 255, 255),
            -1,
            cv2.LINE_AA,
        )

        fundo = cv2.GaussianBlur(fundo, (0, 0), 2.2)
        return cv2.resize(fundo, (largura, altura), interpolation=cv2.INTER_CUBIC)

    def _compor_pessoa_e_fundo(self, quadro: np.ndarray, fundo: np.ndarray, intensidade: float) -> np.ndarray:
        if self.mascara_pessoa is None:
            return cv2.addWeighted(fundo, 0.68, quadro, 0.58, 0)

        mascara = np.clip(self.mascara_pessoa[..., None], 0.0, 1.0)
        composto = quadro.astype(np.float32) * mascara + fundo.astype(np.float32) * (1.0 - mascara)
        composto = np.clip(composto, 0, 255).astype(np.uint8)

        borda = cv2.Canny((self.mascara_pessoa * 255).astype(np.uint8), 60, 140)
        borda = cv2.GaussianBlur(borda, (0, 0), 1.0)
        if np.any(borda):
            brilho = np.dstack([borda * 0.36, borda * 0.72, borda]).astype(np.float32)
            composto = np.clip(composto.astype(np.float32) + brilho * intensidade * 0.22, 0, 255).astype(np.uint8)
        return composto

    def _calcular_metricas_de_pontos(self, pontos_array: np.ndarray) -> MetricasGesto:
        pontos = [tuple(map(float, ponto)) for ponto in pontos_array]
        wrist = pontos[0]
        index_mcp, index_pip, index_tip = pontos[5], pontos[6], pontos[8]
        middle_mcp, middle_pip, middle_tip = pontos[9], pontos[10], pontos[12]
        ring_pip, ring_tip = pontos[14], pontos[16]
        pinky_mcp, pinky_pip, pinky_tip = pontos[17], pontos[18], pontos[20]
        hand_scale = max(distancia(index_mcp, pinky_mcp), 0.001)
        index_vector = vetor(index_pip, index_tip)
        middle_vector = vetor(middle_pip, middle_tip)
        tip_gap = distancia(index_tip, middle_tip) / hand_scale
        angle = angulo_entre(index_vector, middle_vector)
        order_flip = (index_tip[0] - middle_tip[0]) * (index_mcp[0] - middle_mcp[0]) < 0
        crossing = segmentos_se_cruzam(index_pip, index_tip, middle_pip, middle_tip)
        return MetricasGesto(
            hand_scale=hand_scale,
            center_x=media([wrist[0], index_mcp[0], middle_mcp[0], pinky_mcp[0]]),
            center_y=media([wrist[1], index_mcp[1], middle_mcp[1], pinky_mcp[1]]),
            index_extension=(distancia(index_tip, wrist) - distancia(index_pip, wrist)) / hand_scale,
            middle_extension=(distancia(middle_tip, wrist) - distancia(middle_pip, wrist)) / hand_scale,
            ring_curl=(distancia(ring_pip, wrist) - distancia(ring_tip, wrist)) / hand_scale,
            pinky_curl=(distancia(pinky_pip, wrist) - distancia(pinky_tip, wrist)) / hand_scale,
            tip_gap=tip_gap,
            angle=angle,
            crossing=crossing,
            order_flip=order_flip,
        )

    def _pontuar_gesto(self, metricas: MetricasGesto) -> dict[str, object]:
        perfil = self.perfil
        index_score = normalizar_pontuacao(
            metricas.index_extension,
            max(0.14, perfil.index_extension * 0.68),
            max(0.26, perfil.index_extension * 1.08),
        )
        middle_score = normalizar_pontuacao(
            metricas.middle_extension,
            max(0.14, perfil.middle_extension * 0.68),
            max(0.26, perfil.middle_extension * 1.08),
        )
        close_score = inverter_pontuacao(
            metricas.tip_gap,
            max(0.30, perfil.tip_gap * 1.14),
            max(0.20, perfil.tip_gap * 0.90),
        )
        cross_by_angle = pontuacao_proximidade(
            metricas.angle,
            limitar(perfil.angle, 12.0, 42.0),
            max(12.0, perfil.angle * 0.80),
        )
        cross_score = (
            1.0
            if metricas.crossing
            else max(0.72, cross_by_angle)
            if metricas.order_flip
            else cross_by_angle * 0.30
        )
        ring_score = normalizar_pontuacao(
            metricas.ring_curl,
            min(-0.05, perfil.ring_curl - 0.12),
            max(0.02, perfil.ring_curl + 0.08),
        )
        pinky_score = normalizar_pontuacao(
            metricas.pinky_curl,
            min(-0.05, perfil.pinky_curl - 0.12),
            max(0.02, perfil.pinky_curl + 0.08),
        )
        framing_score = normalizar_pontuacao(metricas.hand_scale, 0.095, 0.25)
        balance_score = pontuacao_proximidade(metricas.index_extension, metricas.middle_extension, 0.18)
        overall = (
            index_score * 0.17
            + middle_score * 0.17
            + close_score * 0.19
            + cross_score * 0.20
            + ring_score * 0.08
            + pinky_score * 0.08
            + framing_score * 0.05
            + balance_score * 0.06
        )
        return {
            "overall": overall,
            "parts": {
                "framing": framing_score,
                "index": index_score,
                "middle": middle_score,
                "close": close_score,
                "cross": cross_score,
                "ring": ring_score,
                "pinky": pinky_score,
                "balance": balance_score,
            },
        }

    def _status_texto(self, score: float, score_suave: float, pronto: bool) -> str:
        if self.calibrando:
            faltam = max(0, QUADROS_CALIBRACAO - len(self.amostras_calibracao))
            return f"Calibrando selo... faltam {faltam} amostras"
        if self.precisa_rearmar:
            return "Solte o gesto e refaca para rearmar"
        if pronto:
            return "Selo pronto"
        if score_suave > 0.55 or score > 0.62:
            return "Lendo o gesto"
        return "Monte o selo"

    def _explicacao_gesto(self, partes: dict[str, float], pronto: bool) -> str:
        extend_score = media([partes["index"], partes["middle"]])
        fold_score = media([partes["ring"], partes["pinky"]])
        if pronto:
            return "O dominio ativa so com o selo firme."
        if partes["framing"] < 0.55:
            return "Aproxime a mao e deixe o pulso inteiro no quadro."
        if extend_score < 0.62:
            return "Estique mais indicador e medio."
        if partes["cross"] < 0.62:
            return "Cruze mais os dois dedos no centro."
        if partes["close"] < 0.62:
            return "Aproxime mais as pontas do indicador e do medio."
        if fold_score < 0.45:
            return "Dobre mais anelar e mindinho."
        return "Segure o gesto firme por um instante."

    def _atualizar_calibracao(self, metricas: MetricasGesto, score: float) -> None:
        if not self.calibrando:
            return
        if metricas.hand_scale < 0.14 or score < 0.48:
            return
        self.amostras_calibracao.append(metricas)
        if len(self.amostras_calibracao) < QUADROS_CALIBRACAO:
            return
        self.perfil = PerfilGesto(
            index_extension=media(m.index_extension for m in self.amostras_calibracao),
            middle_extension=media(m.middle_extension for m in self.amostras_calibracao),
            tip_gap=media(m.tip_gap for m in self.amostras_calibracao),
            angle=media(m.angle for m in self.amostras_calibracao),
            ring_curl=media(m.ring_curl for m in self.amostras_calibracao),
            pinky_curl=media(m.pinky_curl for m in self.amostras_calibracao),
            updated_at=time.time(),
        )
        self._salvar_perfil()
        self.calibrando = False
        self.amostras_calibracao.clear()

    def _atualizar_fps(self) -> float:
        agora = time.perf_counter()
        delta = agora - self.ultimo_tempo_fps
        self.ultimo_tempo_fps = agora
        if delta > 0:
            self.fps_historico.append(1.0 / delta)
        return media(self.fps_historico)

    def _ativar_dominio(self) -> None:
        agora = time.perf_counter()
        if agora < self.cooldown_ate:
            return
        self.cooldown_ate = agora + COOLDOWN_SEG
        self.precisa_rearmar = True
        self.quadros_estaveis = 0
        self.efeito_inicio = agora

    def _desenhar_overlay_mao(self, quadro: np.ndarray, pontos_suaves: np.ndarray, score: float) -> None:
        if self.ultimas_metricas is None:
            return

        tema = self._tema_atual()
        gesture_strong = score > 0.72
        altura, largura = quadro.shape[:2]
        pontos_px = [(int(x * largura), int(y * altura)) for x, y in pontos_suaves]
        cor_linhas = tema["primaria"] if gesture_strong else tema["secundaria"]
        cor_pontos = tema["acento"]

        brilho = np.zeros_like(quadro)
        linhas = np.zeros_like(quadro)
        for origem, destino in self.mp_hands.HAND_CONNECTIONS:
            cv2.line(brilho, pontos_px[origem], pontos_px[destino], cor_linhas, 8, cv2.LINE_AA)
            cv2.line(linhas, pontos_px[origem], pontos_px[destino], cor_linhas, 2, cv2.LINE_AA)

        brilho = cv2.GaussianBlur(brilho, (0, 0), 4.8)
        self._misturar_overlay(quadro, brilho, 0.28 if not gesture_strong else 0.36)
        cv2.addWeighted(quadro, 1.0, linhas, 0.95, 0, quadro)

        for indice, ponto in enumerate(pontos_px):
            raio = 7 if indice in (8, 12) else 4
            cv2.circle(quadro, ponto, raio, cor_pontos, -1, cv2.LINE_AA)

        centro = (
            int(self.ultimas_metricas.center_x * largura),
            int(self.ultimas_metricas.center_y * altura),
        )
        cv2.circle(quadro, centro, 52, cor_linhas, 2, lineType=cv2.LINE_AA)
        cv2.circle(quadro, centro, 72, cor_linhas, 1, lineType=cv2.LINE_AA)

        ponta_indicador = pontos_px[8]
        ponta_medio = pontos_px[12]
        cv2.line(quadro, ponta_indicador, ponta_medio, tema["alerta"], 2, lineType=cv2.LINE_AA)

    def _desenhar_chip(
        self,
        quadro: np.ndarray,
        texto: str,
        posicao: tuple[int, int],
        cor_borda: tuple[int, int, int],
        cor_texto: tuple[int, int, int],
        cor_fundo: tuple[int, int, int],
    ) -> int:
        x, y = posicao
        (largura_texto, altura_texto), _ = cv2.getTextSize(texto, cv2.FONT_HERSHEY_SIMPLEX, 0.56, 1)
        largura_caixa = largura_texto + 28
        altura_caixa = altura_texto + 18
        overlay = quadro.copy()
        cv2.rectangle(overlay, (x, y), (x + largura_caixa, y + altura_caixa), cor_fundo, -1, cv2.LINE_AA)
        cv2.rectangle(overlay, (x, y), (x + largura_caixa, y + altura_caixa), cor_borda, 1, cv2.LINE_AA)
        self._misturar_overlay(quadro, overlay, 0.64)
        cv2.putText(
            quadro,
            texto,
            (x + 14, y + altura_caixa - 7),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.56,
            cor_texto,
            1,
            cv2.LINE_AA,
        )
        return x + largura_caixa + 10

    def _desenhar_barra(
        self,
        quadro: np.ndarray,
        rotulo: str,
        valor: float,
        posicao: tuple[int, int],
        largura: int,
        cor_barra: tuple[int, int, int],
        cor_texto: tuple[int, int, int],
    ) -> None:
        x, y = posicao
        valor = limitar(valor, 0.0, 1.0)
        cv2.putText(quadro, rotulo, (x, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.52, cor_texto, 1, cv2.LINE_AA)
        cv2.rectangle(quadro, (x, y), (x + largura, y + 12), (34, 42, 54), -1, cv2.LINE_AA)
        cv2.rectangle(quadro, (x, y), (x + largura, y + 12), (88, 106, 122), 1, cv2.LINE_AA)
        cv2.rectangle(quadro, (x + 2, y + 2), (x + 2 + int((largura - 4) * valor), y + 10), cor_barra, -1, cv2.LINE_AA)

    def _desenhar_guia_enquadramento(self, quadro: np.ndarray, intensidade: float, pronto: bool) -> None:
        tema = self._tema_atual()
        altura, largura = quadro.shape[:2]
        centro = (largura // 2, int(altura * 0.5))
        cor = tema["sucesso"] if pronto else tema["secundaria"]
        overlay = quadro.copy()
        raio_x = int(largura * 0.16)
        raio_y = int(altura * 0.24)
        cv2.ellipse(overlay, centro, (raio_x, raio_y), 0, 0, 360, cor, 2, cv2.LINE_AA)
        cv2.ellipse(overlay, centro, (raio_x + 22, raio_y + 22), 0, 18, 162, cor, 1, cv2.LINE_AA)
        cv2.ellipse(overlay, centro, (raio_x + 22, raio_y + 22), 0, 198, 342, cor, 1, cv2.LINE_AA)
        cv2.line(overlay, (centro[0] - 24, centro[1]), (centro[0] + 24, centro[1]), cor, 1, cv2.LINE_AA)
        cv2.line(overlay, (centro[0], centro[1] - 24), (centro[0], centro[1] + 24), cor, 1, cv2.LINE_AA)
        self._misturar_overlay(quadro, overlay, 0.12 + intensidade * 0.18)

    def _desenhar_referencia_selo(self, quadro: np.ndarray) -> None:
        if not self.mostrar_referencia:
            return

        tema = self._tema_atual()
        altura, largura = quadro.shape[:2]
        painel_largura = min(300, max(240, int(largura * 0.19)))
        painel_altura = min(280, max(220, int(altura * 0.28)))
        x1 = largura - painel_largura - 28
        y1 = 30
        x2 = largura - 28
        y2 = y1 + painel_altura

        overlay = quadro.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), tema["cartao"], -1, cv2.LINE_AA)
        cv2.rectangle(overlay, (x1, y1), (x2, y2), tema["secundaria"], 1, cv2.LINE_AA)
        self._misturar_overlay(quadro, overlay, 0.56)

        cv2.putText(quadro, "REFERENCIA DO SELO", (x1 + 16, y1 + 28), cv2.FONT_HERSHEY_SIMPLEX, 0.58, tema["texto"], 1, cv2.LINE_AA)
        cv2.putText(quadro, "T alterna", (x1 + 16, y1 + 52), cv2.FONT_HERSHEY_SIMPLEX, 0.48, tema["texto_fraco"], 1, cv2.LINE_AA)

        origem_x = x1 + painel_largura // 2
        origem_y = y1 + painel_altura - 40
        escala = painel_altura / 180.0
        pontos = {
            "pulso": (origem_x, int(origem_y)),
            "palma": (origem_x - int(8 * escala), int(origem_y - 46 * escala)),
            "indicador_base": (origem_x - int(18 * escala), int(origem_y - 68 * escala)),
            "indicador_meio": (origem_x - int(6 * escala), int(origem_y - 104 * escala)),
            "indicador_ponta": (origem_x + int(18 * escala), int(origem_y - 142 * escala)),
            "medio_base": (origem_x + int(14 * escala), int(origem_y - 66 * escala)),
            "medio_meio": (origem_x - int(2 * escala), int(origem_y - 112 * escala)),
            "medio_ponta": (origem_x - int(22 * escala), int(origem_y - 146 * escala)),
            "anelar": (origem_x + int(34 * escala), int(origem_y - 84 * escala)),
            "mindinho": (origem_x + int(54 * escala), int(origem_y - 64 * escala)),
            "polegar": (origem_x - int(40 * escala), int(origem_y - 54 * escala)),
        }
        linhas = [
            ("pulso", "palma"),
            ("palma", "indicador_base"),
            ("indicador_base", "indicador_meio"),
            ("indicador_meio", "indicador_ponta"),
            ("palma", "medio_base"),
            ("medio_base", "medio_meio"),
            ("medio_meio", "medio_ponta"),
            ("palma", "anelar"),
            ("palma", "mindinho"),
            ("palma", "polegar"),
        ]
        for origem, destino in linhas:
            cv2.line(quadro, pontos[origem], pontos[destino], tema["secundaria"], 2, cv2.LINE_AA)
        cv2.line(quadro, pontos["indicador_ponta"], pontos["medio_ponta"], tema["alerta"], 2, cv2.LINE_AA)
        for nome, ponto in pontos.items():
            raio = 6 if "ponta" in nome else 4
            cv2.circle(quadro, ponto, raio, tema["acento"], -1, cv2.LINE_AA)

        cv2.putText(
            quadro,
            "Cruze indicador e medio.",
            (x1 + 16, y2 - 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.46,
            tema["texto_fraco"],
            1,
            cv2.LINE_AA,
        )

    def _desenhar_hud(
        self,
        quadro: np.ndarray,
        fps: float,
        score: float,
        score_suave: float,
        estabilidade: float,
        pronto: bool,
        status: str,
        explicacao: str,
        partes: dict[str, float] | None,
    ) -> None:
        tema = self._tema_atual()
        framing = partes["framing"] if partes else 0.0
        self._desenhar_guia_enquadramento(quadro, max(0.12, 1.0 - framing), pronto)

        if self.mostrar_referencia:
            self._desenhar_referencia_selo(quadro)
        if not self.mostrar_hud:
            return

        altura, largura = quadro.shape[:2]
        chip_x = 26
        chip_y = 24
        chip_x = self._desenhar_chip(quadro, "SELO DO GOJO", (chip_x, chip_y), tema["primaria"], tema["texto"], tema["cartao"])
        chip_x = self._desenhar_chip(quadro, status.upper(), (chip_x, chip_y), tema["secundaria"], tema["texto"], tema["cartao"])

        chip_direita = largura - 26
        for texto in (self._preset_atual().nome, tema["nome"], f"{fps:04.1f} FPS"):
            (largura_texto, _), _ = cv2.getTextSize(texto, cv2.FONT_HERSHEY_SIMPLEX, 0.56, 1)
            chip_direita -= largura_texto + 38
            self._desenhar_chip(quadro, texto, (chip_direita, chip_y), tema["secundaria"], tema["texto"], tema["cartao"])
            chip_direita -= 10

        painel_x = 28
        painel_y = altura - 152
        painel_largura = min(540, largura - 56)
        overlay = quadro.copy()
        cv2.rectangle(overlay, (painel_x, painel_y), (painel_x + painel_largura, altura - 24), tema["cartao"], -1, cv2.LINE_AA)
        cv2.rectangle(overlay, (painel_x, painel_y), (painel_x + painel_largura, altura - 24), tema["secundaria"], 1, cv2.LINE_AA)
        self._misturar_overlay(quadro, overlay, 0.58)

        cv2.putText(quadro, explicacao, (painel_x + 18, painel_y + 34), cv2.FONT_HERSHEY_SIMPLEX, 0.60, tema["alerta"] if not pronto else tema["sucesso"], 1, cv2.LINE_AA)
        self._desenhar_barra(quadro, "Confianca do selo", score_suave, (painel_x + 18, painel_y + 56), 238, tema["primaria"], tema["texto"])
        self._desenhar_barra(quadro, "Estabilidade", estabilidade, (painel_x + 18, painel_y + 92), 238, tema["secundaria"], tema["texto"])
        self._desenhar_barra(quadro, "Enquadramento", framing, (painel_x + 280, painel_y + 56), 220, tema["sucesso"], tema["texto"])

        cv2.putText(
            quadro,
            f"Score {score * 100:05.1f}%  |  Camera {largura}x{altura}  |  Visual {'ON' if self.melhoria_visual else 'OFF'}",
            (painel_x + 18, painel_y + 126),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            tema["texto_fraco"],
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            quadro,
            "1-3 preset  M modo  V visual  T referencia  C calibrar  R resetar  F fullscreen  H HUD  Q sair",
            (painel_x + 18, altura - 34),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            tema["texto_fraco"],
            1,
            cv2.LINE_AA,
        )

    def _desenhar_pre_ativacao(self, quadro: np.ndarray, intensidade: float) -> None:
        if intensidade <= 0.02:
            return

        tema = self._tema_atual()
        altura, largura = quadro.shape[:2]
        if self.ultimas_metricas is not None:
            centro = (int(self.ultimas_metricas.center_x * largura), int(self.ultimas_metricas.center_y * altura))
        else:
            centro = (largura // 2, int(altura * 0.46))

        overlay = quadro.copy()
        cv2.circle(overlay, centro, int(min(largura, altura) * (0.10 + intensidade * 0.10)), tema["primaria"], 2, cv2.LINE_AA)
        cv2.circle(overlay, centro, int(min(largura, altura) * (0.18 + intensidade * 0.12)), tema["secundaria"], 1, cv2.LINE_AA)
        for indice in range(10):
            angulo = intensidade * 3.6 + indice * (math.pi * 2.0 / 10.0)
            raio = min(largura, altura) * (0.12 + intensidade * 0.24)
            destino = (
                centro[0] + int(math.cos(angulo) * raio),
                centro[1] + int(math.sin(angulo) * raio),
            )
            cv2.line(overlay, centro, destino, tema["secundaria"], 1, cv2.LINE_AA)
        self._misturar_overlay(quadro, overlay, 0.10 + intensidade * 0.16)
        self._aplicar_vinheta(quadro, 0.16 + intensidade * 0.22)

    def _desenhar_efeito(self, quadro: np.ndarray, score_suave: float, estabilidade: float) -> None:
        intensidade_meta = limitar((score_suave - 0.44) / 0.30, 0.0, 1.0) * max(estabilidade, 0.35)
        self.intensidade_pre_ativacao = self.intensidade_pre_ativacao * 0.82 + intensidade_meta * 0.18
        if self.intensidade_pre_ativacao > 0.02 and not self.efeito_inicio and not self.calibrando:
            self._desenhar_pre_ativacao(quadro, self.intensidade_pre_ativacao)
            self._atualizar_mascara_pessoa(quadro)

        if not self.efeito_inicio:
            return

        agora = time.perf_counter()
        duracao_total = DURACAO_EFEITO_SEG + DURACAO_RESIDUO_SEG
        decorrido = agora - self.efeito_inicio
        if decorrido < 0:
            return
        if decorrido > duracao_total:
            self.efeito_inicio = 0.0
            return

        tema = self._tema_atual()
        progresso = limitar(decorrido / DURACAO_EFEITO_SEG, 0.0, 1.0)
        residuo = limitar((decorrido - DURACAO_EFEITO_SEG) / DURACAO_RESIDUO_SEG, 0.0, 1.0)
        intensidade = 1.0 if decorrido <= DURACAO_EFEITO_SEG else 1.0 - residuo
        altura, largura = quadro.shape[:2]
        centro_relativo = (
            self.ultimas_metricas.center_x if self.ultimas_metricas else 0.5,
            self.ultimas_metricas.center_y if self.ultimas_metricas else 0.46,
        )

        self._atualizar_mascara_pessoa(quadro, forcar=decorrido <= DURACAO_EFEITO_SEG)
        fundo = self._gerar_fundo_dominio(altura, largura, progresso, intensidade, centro_relativo)
        quadro[:] = self._compor_pessoa_e_fundo(quadro, fundo, intensidade)

        replay = self._obter_quadro_replay(1.0 - progresso * 0.9)
        if replay is not None and progresso > 0.48:
            replay = self._aplicar_aberracao_cromatica(replay, 0.15 + intensidade * 0.12)
            self._misturar_overlay(quadro, replay, 0.05 + (1.0 - progresso) * 0.14)

        centro = (int(centro_relativo[0] * largura), int(centro_relativo[1] * altura))
        overlay = quadro.copy()
        raio = int(min(largura, altura) * (0.12 + progresso * 0.36))
        cv2.circle(overlay, centro, raio, tema["primaria"], 4, cv2.LINE_AA)
        cv2.circle(overlay, centro, max(14, int(raio * 0.22)), tema["acento"], -1, cv2.LINE_AA)
        for linha in range(-18, 19):
            deslocamento = int(linha * 22 + progresso * 210)
            cv2.line(
                overlay,
                (0, centro[1] + deslocamento),
                (largura, centro[1] + deslocamento + int(progresso * 20)),
                tema["primaria"],
                1,
                cv2.LINE_AA,
            )
        self._misturar_overlay(quadro, overlay, 0.12 + intensidade * 0.16)

        quadro[:] = self._aplicar_zoom_pulso(quadro, math.sin(progresso * math.pi) * 0.18 * intensidade)
        quadro[:] = self._aplicar_aberracao_cromatica(quadro, 0.08 + intensidade * 0.18)
        self._aplicar_vinheta(quadro, 0.34 + intensidade * 0.34)

        alpha_flash = max(0.0, 1.0 - progresso * 5.2)
        if alpha_flash > 0:
            flash = np.full_like(quadro, 255)
            self._misturar_overlay(quadro, flash, alpha_flash * 0.22)

        if progresso > 0.18:
            texto_alpha = max(0.0, (1.0 - progresso * 0.72) * intensidade)
            texto_overlay = quadro.copy()
            cv2.putText(
                texto_overlay,
                "DOMAIN EXPANSION",
                (centro[0] - 176, centro[1] + 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.92,
                tema["acento"],
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                texto_overlay,
                "UNLIMITED VOID",
                (centro[0] - 226, centro[1] + 118),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.58,
                tema["acento"],
                3,
                cv2.LINE_AA,
            )
            self._misturar_overlay(quadro, texto_overlay, texto_alpha * 0.64)

    def _alternar_fullscreen(self) -> None:
        self.fullscreen = not self.fullscreen
        modo = cv2.WINDOW_FULLSCREEN if self.fullscreen else cv2.WINDOW_NORMAL
        cv2.setWindowProperty(TITULO_JANELA, cv2.WND_PROP_FULLSCREEN, modo)

    def executar(self) -> None:
        cv2.namedWindow(TITULO_JANELA, cv2.WINDOW_NORMAL)
        largura, altura = self.captura.iniciar()
        cv2.resizeWindow(TITULO_JANELA, max(960, largura), max(540, altura))

        try:
            while True:
                quadro, _ = self.captura.ler()
                if quadro is None:
                    time.sleep(0.01)
                    continue

                quadro = cv2.flip(quadro, 1)
                quadro_saida = self._aplicar_melhoria_visual(quadro.copy())
                altura, largura = quadro.shape[:2]
                escala = 1.0
                quadro_processamento = quadro
                largura_processamento = self._preset_atual().largura_processamento
                if largura > largura_processamento:
                    escala = largura_processamento / float(largura)
                    novo_tamanho = (int(largura * escala), int(altura * escala))
                    quadro_processamento = cv2.resize(quadro, novo_tamanho, interpolation=cv2.INTER_AREA)

                quadro_rgb = cv2.cvtColor(quadro_processamento, cv2.COLOR_BGR2RGB)
                resultado = self.hands.process(quadro_rgb)

                score = 0.0
                score_suave = 0.0
                estabilidade = limitar(self.quadros_estaveis / 10.0, 0.0, 1.0)
                partes: dict[str, float] | None = None
                pronto = False
                status = "Sem mao"
                explicacao = "Mostre a mao inteira para a camera."

                if resultado.multi_hand_landmarks:
                    landmarks = resultado.multi_hand_landmarks[0]
                    pontos = self._extrair_pontos(landmarks)
                    pontos_suaves = self._suavizar_pontos(pontos)
                    metricas = self._calcular_metricas_de_pontos(pontos_suaves)
                    pontuacao = self._pontuar_gesto(metricas)
                    score = float(pontuacao["overall"])
                    partes = pontuacao["parts"]
                    self.ultimas_metricas = metricas
                    self.ultimas_landmarks = landmarks
                    self.ultimo_resultado = pontuacao
                    self.historico_pontuacao.append(score)
                    score_suave = media(self.historico_pontuacao)

                    if score > 0.72 and score_suave > 0.67 and partes["cross"] > 0.55:
                        self.quadros_estaveis += 1
                    else:
                        self.quadros_estaveis = max(0, self.quadros_estaveis - 2)

                    estabilidade = limitar(self.quadros_estaveis / 10.0, 0.0, 1.0)
                    pronto = (
                        score > 0.72
                        and score_suave > 0.69
                        and estabilidade > 0.58
                        and partes["cross"] > 0.64
                        and partes["close"] > 0.58
                        and partes["framing"] > 0.42
                    )

                    if self.precisa_rearmar:
                        if score_suave < 0.34:
                            self.precisa_rearmar = False
                        pronto = False

                    self._atualizar_calibracao(metricas, score)
                    if pronto and not self.calibrando and not self.precisa_rearmar:
                        self._ativar_dominio()

                    status = self._status_texto(score, score_suave, pronto)
                    explicacao = self._explicacao_gesto(partes, pronto)
                    self._desenhar_overlay_mao(quadro_saida, pontos_suaves, score)
                else:
                    self.ultimas_metricas = None
                    self.ultimas_landmarks = None
                    self.ultimo_resultado = None
                    self.pontos_suavizados = None
                    self.historico_pontuacao.clear()
                    self.quadros_estaveis = max(0, self.quadros_estaveis - 2)

                if not self.efeito_inicio:
                    self._atualizar_buffer_replay(quadro_saida)

                fps = self._atualizar_fps()
                self._desenhar_efeito(quadro_saida, score_suave, estabilidade)
                self._desenhar_hud(quadro_saida, fps, score, score_suave, estabilidade, pronto, status, explicacao, partes)

                cv2.imshow(TITULO_JANELA, quadro_saida)
                tecla = cv2.waitKey(1) & 0xFF
                if tecla in (ord("q"), 27):
                    break
                if tecla in (ord("f"),):
                    self._alternar_fullscreen()
                if tecla in (ord("h"),):
                    self.mostrar_hud = not self.mostrar_hud
                if tecla in (ord("c"),):
                    self.calibrando = not self.calibrando
                    if not self.calibrando:
                        self.amostras_calibracao.clear()
                if tecla in (ord("r"),):
                    self._limpar_perfil()
                if tecla in (ord("1"), ord("2"), ord("3")):
                    self._alternar_preset(chr(tecla))
                if tecla in (ord("v"),):
                    self.melhoria_visual = not self.melhoria_visual
                if tecla in (ord("m"),):
                    self._alternar_modo_visual()
                if tecla in (ord("t"),):
                    self.mostrar_referencia = not self.mostrar_referencia

        finally:
            self.hands.close()
            self.segmentacao.close()
            self.captura.encerrar()
            cv2.destroyAllWindows()


def main() -> None:
    os.environ.setdefault("OPENCV_VIDEOIO_PRIORITY_MSMF", "0")
    cv2.setUseOptimized(True)
    detector = DetectorGojo()
    detector.executar()


if __name__ == "__main__":
    main()
