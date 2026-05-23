# Detector Python do Selo do Gojo

Este app existe para priorizar o que mais importa agora: `sensor da mao confiavel`.

Ele usa:

- `OpenCV` para camera
- `MediaPipe Hands` para landmarks da mao
- `NumPy` para apoio nos calculos

## Objetivo

Esta versao deixa a camera mais fluida e nitida enquanto processa a mao em um quadro menor por baixo. Assim o resultado visual continua detalhado, mas o detector nao precisa carregar o custo inteiro da resolucao maxima.

## Fluxo recomendado

1. Instale Python `3.11` ou `3.12` se o `mediapipe` falhar no seu `3.13`.
2. Rode `setup_detector.ps1`.
3. Rode `run_detector.ps1`.
4. Aponte a mao para a camera e monte o selo.
5. Quando o status ficar em `Selo pronto`, o dominio ativa sozinho.

## Controles

- `Q` ou `Esc`: sair
- `F`: fullscreen
- `H`: esconder ou mostrar HUD
- `C`: iniciar ou parar calibracao
- `R`: limpar calibracao

## O que observar no teste real

- `Status`: deve sair de `Sem mao` para `Lendo o gesto` e depois `Selo pronto`
- `Score suave`: deve subir e se manter
- `Estabilidade`: deve crescer enquanto voce segura o selo
- `Presenca no quadro`: deve melhorar quando a mao fica mais proxima e inteira na tela

## Notas de qualidade

- A camera tenta abrir em `1920x1080` e cai para resolucoes menores se preciso.
- O detector processa em largura maxima de `960px` para preservar fluidez.
- O desenho na tela continua usando o quadro de alta resolucao da camera.

## Se o MediaPipe nao instalar

Algumas combinacoes novas de Python podem ainda nao ter wheel pronta do `mediapipe`. Se isso acontecer:

1. instale Python `3.12`
2. refaca `setup_detector.ps1`

## Arquivos

- `run_detector.py`: app principal
- `requirements.txt`: dependencias
- `perfil_calibracao.json`: criado automaticamente depois da calibracao
