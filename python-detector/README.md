# Detector Python do Dominio do Gojo

Este app existe para priorizar o que mais importa agora: `sensor da mao confiavel`.

Ele usa:

- `OpenCV` para camera
- `MediaPipe Hands` para landmarks da mao
- `NumPy` para apoio nos calculos

## Objetivo

Esta versao deixa a camera mais fluida e nitida enquanto processa a mao em um quadro menor por baixo. Assim o resultado visual continua detalhado, mas o detector nao precisa carregar o custo inteiro da resolucao maxima.

Tambem entrou um refinamento mais forte de leitura:

- `suavizacao temporal` dos pontos da mao para reduzir tremida
- `presets de qualidade` para escolher entre detalhe e fluidez
- `melhoria visual` com contraste local e nitidez opcional
- `treino real do gesto` para aprender o seu dedo levantado
- `HUD cinematico` com chips, barras e guia de enquadramento
- `referencia do gesto` desenhada na propria tela
- `som procedural` no momento da expansao
- `expansao de dominio` com pre-ativacao, ruptura visual e fundo cosmico atras de voce

## Fluxo recomendado

1. Instale Python `3.11` ou `3.12` se o `mediapipe` falhar no seu `3.13`.
2. Rode `setup_detector.ps1`.
3. Rode `run_detector.ps1`.
4. Aponte a mao para a camera e levante `1 dedo`.
5. Se quiser, aperte `C` e treine o gesto com o dedo que voce quer usar.
6. Quando o status ficar em `Dedo pronto`, o dominio ativa sozinho.

## Controles

- `Q` ou `Esc`: sair
- `F`: fullscreen
- `H`: esconder ou mostrar HUD
- `1`: preset `Detalhe`
- `2`: preset `Balanceado`
- `3`: preset `Fluido`
- `M`: alternar entre visual `Anime` e `Clean`
- `V`: ligar ou desligar melhoria visual
- `T`: mostrar ou esconder a referencia do gesto
- `S`: ligar ou desligar som
- `C`: iniciar ou parar calibracao
- `R`: limpar calibracao

## O que observar no teste real

- `Status`: deve sair de `Sem mao` para `Lendo o gesto` e depois `Dedo pronto`
- `Gesto`: agora o foco e deixar `apenas 1 dedo` levantado
- `Score suave`: deve subir e se manter
- `Estabilidade`: deve crescer enquanto voce segura o dedo no gesto
- `Presenca no quadro`: deve melhorar quando a mao fica mais proxima e inteira na tela
- `Guia central`: ajuda a manter a mao no lugar ideal para o detector
- `Referencia do gesto`: serve como aproximacao visual da pose esperada

## Notas de qualidade

- A camera tenta abrir em `1920x1080` e cai para resolucoes menores se preciso.
- O detector processa em largura menor por baixo, conforme o preset ativo.
- `Detalhe` prioriza leitura mais precisa e imagem mais rica.
- `Balanceado` e o ponto de partida recomendado.
- `Fluido` sacrifica um pouco do detalhe para ganhar resposta em maquinas ou cameras mais fracas.
- O desenho na tela continua usando o quadro de alta resolucao da camera.
- A segmentacao da pessoa so entra forte durante a expansao para colocar o fundo do dominio atras de voce sem pesar tanto o rastreio.
- `setup_detector.ps1` agora tambem baixa os modelos oficiais do MediaPipe para a pasta `models`.

## Se o MediaPipe nao instalar

Algumas combinacoes novas de Python podem ainda nao ter wheel pronta do `mediapipe`. Se isso acontecer:

1. instale Python `3.12`
2. refaca `setup_detector.ps1`

## Arquivos

- `run_detector.py`: app principal
- `requirements.txt`: dependencias
- `models/`: modelos oficiais do MediaPipe usados pelo detector
- `perfil_calibracao.json`: criado automaticamente depois da calibracao
