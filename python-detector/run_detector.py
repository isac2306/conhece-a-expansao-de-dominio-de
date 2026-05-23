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
LARGURA_PROCESSAMENTO = 960
JANELA_SUAVIZACAO = 10
QUADROS_CALIBRACAO = 24
DURACAO_EFEITO_SEG = 2.6
COOLDOWN_SEG = 5.2


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
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=0,
            min_detection_confidence=0.58,
            min_tracking_confidence=0.50,
        )
        self.captura = CapturaCamera()
        self.historico_pontuacao: deque[float] = deque(maxlen=JANELA_SUAVIZACAO)
        self.quadros_estaveis = 0
        self.precisa_rearmar = False
        self.cooldown_ate = 0.0
        self.efeito_inicio = 0.0
        self.ultimas_metricas: MetricasGesto | None = None
        self.ultimas_landmarks = None
        self.ultimo_resultado: dict[str, object] | None = None
        self.calibrando = False
        self.amostras_calibracao: list[MetricasGesto] = []
        self.fps_historico: deque[float] = deque(maxlen=30)
        self.ultimo_tempo_fps = time.perf_counter()
        self.fullscreen = False
        self.mostrar_hud = True

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

    def _calcular_metricas(self, landmarks) -> MetricasGesto:
        pontos = [(lm.x, lm.y) for lm in landmarks.landmark]
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

    def _desenhar_overlay_mao(self, quadro: np.ndarray, landmarks, score: float) -> None:
        gesture_strong = score > 0.72
        self.mp_drawing.draw_landmarks(
            quadro,
            landmarks,
            self.mp_hands.HAND_CONNECTIONS,
            self.mp_drawing.DrawingSpec(
                color=(128, 216, 255) if not gesture_strong else (128, 216, 255),
                thickness=3,
                circle_radius=2,
            ),
            self.mp_drawing.DrawingSpec(
                color=(255, 250, 255),
                thickness=2,
                circle_radius=3,
            ),
        )

        altura, largura = quadro.shape[:2]
        centro = (
            int(self.ultimas_metricas.center_x * largura),
            int(self.ultimas_metricas.center_y * altura),
        )
        cor = (120, 216, 255) if not gesture_strong else (128, 216, 255)
        cv2.circle(quadro, centro, 46, cor, 2, lineType=cv2.LINE_AA)

        ponta_indicador = (
            int(landmarks.landmark[8].x * largura),
            int(landmarks.landmark[8].y * altura),
        )
        ponta_medio = (
            int(landmarks.landmark[12].x * largura),
            int(landmarks.landmark[12].y * altura),
        )
        cv2.line(quadro, ponta_indicador, ponta_medio, (255, 240, 190), 2, lineType=cv2.LINE_AA)

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
    ) -> None:
        if not self.mostrar_hud:
            return

        altura, largura = quadro.shape[:2]
        cv2.rectangle(quadro, (24, 20), (560, 182), (6, 16, 24), -1)
        cv2.rectangle(quadro, (24, 20), (560, 182), (66, 110, 138), 1)

        textos = [
            ("SELO DO GOJO", 0.9, (250, 248, 242)),
            (f"Status: {status}", 0.72, (230, 240, 246)),
            (f"Score bruto: {score * 100:05.1f}%   Score suave: {score_suave * 100:05.1f}%", 0.66, (196, 222, 236)),
            (f"Estabilidade: {estabilidade * 100:05.1f}%   FPS medio: {fps:05.1f}", 0.66, (196, 222, 236)),
            (f"Resolucao camera: {largura}x{altura}", 0.66, (196, 222, 236)),
            (explicacao, 0.64, (255, 235, 188) if not pronto else (158, 255, 208)),
        ]

        y = 52
        for texto, escala, cor in textos:
            cv2.putText(quadro, texto, (42, y), cv2.FONT_HERSHEY_SIMPLEX, escala, cor, 2, cv2.LINE_AA)
            y += 24

        dicas = "C calibrar  R resetar  F fullscreen  H HUD  Q sair"
        cv2.putText(
            quadro,
            dicas,
            (42, 170),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.56,
            (168, 196, 214),
            1,
            cv2.LINE_AA,
        )

    def _desenhar_efeito(self, quadro: np.ndarray) -> None:
        if not self.efeito_inicio:
            return

        agora = time.perf_counter()
        decorrido = agora - self.efeito_inicio
        if decorrido < 0 or decorrido > DURACAO_EFEITO_SEG:
            return

        progresso = limitar(decorrido / DURACAO_EFEITO_SEG, 0.0, 1.0)
        altura, largura = quadro.shape[:2]
        centro_x = largura // 2
        centro_y = int(altura * 0.46)

        overlay = quadro.copy()
        alpha_flash = max(0.0, 0.8 - progresso * 1.4)
        alpha_linhas = max(0.0, 0.28 - progresso * 0.18)

        for linha in range(-16, 17):
            deslocamento = int(linha * 24 + progresso * 190)
            cv2.line(
                overlay,
                (0, centro_y + deslocamento),
                (largura, centro_y + deslocamento + int(progresso * 18)),
                (255, 240, 200),
                1,
                cv2.LINE_AA,
            )

        raio = int(largura * (0.1 + progresso * 0.48))
        cv2.circle(overlay, (centro_x, centro_y), raio, (255, 216, 128), 4, cv2.LINE_AA)
        cv2.circle(overlay, (centro_x, centro_y), max(18, int(raio * 0.18)), (255, 255, 255), -1, cv2.LINE_AA)

        cv2.addWeighted(overlay, alpha_linhas, quadro, 1.0 - alpha_linhas, 0, quadro)

        if alpha_flash > 0:
            mascarado = quadro.copy()
            cv2.circle(mascarado, (centro_x, centro_y), int(largura * 0.38), (255, 255, 255), -1, cv2.LINE_AA)
            cv2.addWeighted(mascarado, alpha_flash * 0.16, quadro, 1.0 - alpha_flash * 0.16, 0, quadro)

        if progresso > 0.15:
            texto_alpha = max(0.0, 1.0 - progresso * 0.7)
            texto_overlay = quadro.copy()
            cv2.putText(
                texto_overlay,
                "DOMAIN EXPANSION",
                (centro_x - 170, centro_y + 54),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.92,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                texto_overlay,
                "UNLIMITED VOID",
                (centro_x - 220, centro_y + 108),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.55,
                (255, 255, 255),
                3,
                cv2.LINE_AA,
            )
            cv2.addWeighted(texto_overlay, texto_alpha, quadro, 1.0 - texto_alpha, 0, quadro)

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
                quadro_saida = quadro.copy()
                altura, largura = quadro.shape[:2]
                escala = 1.0
                quadro_processamento = quadro
                if largura > LARGURA_PROCESSAMENTO:
                    escala = LARGURA_PROCESSAMENTO / float(largura)
                    novo_tamanho = (int(largura * escala), int(altura * escala))
                    quadro_processamento = cv2.resize(quadro, novo_tamanho, interpolation=cv2.INTER_AREA)

                quadro_rgb = cv2.cvtColor(quadro_processamento, cv2.COLOR_BGR2RGB)
                resultado = self.hands.process(quadro_rgb)

                score = 0.0
                score_suave = 0.0
                estabilidade = limitar(self.quadros_estaveis / 10.0, 0.0, 1.0)
                pronto = False
                status = "Sem mao"
                explicacao = "Mostre a mao inteira para a camera."

                if resultado.multi_hand_landmarks:
                    landmarks = resultado.multi_hand_landmarks[0]
                    metricas = self._calcular_metricas(landmarks)
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
                    self._desenhar_overlay_mao(quadro_saida, landmarks, score)
                else:
                    self.ultimas_metricas = None
                    self.ultimas_landmarks = None
                    self.ultimo_resultado = None
                    self.historico_pontuacao.clear()
                    self.quadros_estaveis = max(0, self.quadros_estaveis - 2)

                fps = self._atualizar_fps()
                self._desenhar_efeito(quadro_saida)
                self._desenhar_hud(quadro_saida, fps, score, score_suave, estabilidade, pronto, status, explicacao)

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

        finally:
            self.hands.close()
            self.captura.encerrar()
            cv2.destroyAllWindows()


def main() -> None:
    os.environ.setdefault("OPENCV_VIDEOIO_PRIORITY_MSMF", "0")
    cv2.setUseOptimized(True)
    detector = DetectorGojo()
    detector.executar()


if __name__ == "__main__":
    main()
