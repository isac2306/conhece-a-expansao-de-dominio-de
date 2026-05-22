# Google AI Edge Android Bridge

Esta base Unity ja deixa as interfaces prontas para integrar dois tasks do Google AI Edge:

- `Hand Landmarker`
- `Image Segmenter`

## Arquivos desta base

- `Assets/Scripts/Runtime/Vision/MediaPipeAndroidHandLandmarkProvider.cs`
- `Assets/Scripts/Runtime/Vision/MediaPipeAndroidPersonMaskProvider.cs`
- `android-plugin/README.md`
- `android-plugin/src/main/java/com/isac/unlimitedvoid/bridge/HandLandmarkerBridge.java`
- `android-plugin/src/main/java/com/isac/unlimitedvoid/bridge/ImageSegmenterBridge.java`

Eles sao stubs de bridge para um plugin Android em Java/Kotlin.

Depois de rodar `unity-project\sync-unity-base.ps1`, esse template tambem aparece em `unity-project\AndroidPluginTemplate`.

## Arquitetura sugerida

1. Unity captura a camera ou recebe a textura da webcam.
2. Um plugin Android recebe frames.
3. O plugin chama:
   - `HandLandmarker`
   - `ImageSegmenter`
4. O plugin devolve para o Unity:
   - landmarks normalizados da mao
   - mascara de pessoa em grayscale
5. Os providers desta base convertem o resultado para:
   - `IHandLandmarkProvider`
   - `IPersonMaskProvider`

## Saida esperada do bridge

### HandLandmarkerBridge

- `static create()`
- `initialize()`
- `hasLatestFrame(): boolean`
- `consumeLatestFrame(): float[]`
- `dispose()`

Formato esperado de `consumeLatestFrame()`:

- indice `0`: confidence
- depois `21` pares `x,y`

Total:

- `1 + 42 = 43 floats`

### ImageSegmenterBridge

- `static create()`
- `initialize()`
- `hasLatestMask(): boolean`
- `consumeLatestMask(): byte[]`
- `dispose()`

Formato esperado de `consumeLatestMask()`:

- mascara grayscale achatada
- largura e altura definidas no inspector do provider

## Dependencia Android

No modulo Android, a integracao recomendada e usar o artefato:

- `com.google.mediapipe:tasks-vision`

Ao finalizar o build do plugin, copie o `.aar` gerado para:

- `unity-project\Assets\Plugins\Android`

## Fontes oficiais

- Hand Landmarker Android:
  [Google AI Edge - Hand landmarks detection guide for Android](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/android)
- API Java do HandLandmarker:
  [Google AI Edge - HandLandmarker Java API](https://ai.google.dev/edge/mediapipe/api/solutions/java/com/google/mediapipe/tasks/vision/handlandmarker/HandLandmarker)
- Image Segmenter Android:
  [Google AI Edge - Image segmentation guide for Android](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/android)

## Observacao importante

O Google AI Edge nao entrega aqui um plugin Unity pronto para este caso especifico dentro desta base. O caminho pratico e:

1. usar Unity para a cena e composicao visual
2. usar Android plugin para inferencia real
3. devolver dados enxutos ao C#

Isso tende a ser mais estavel do que tentar empurrar a inferencia inteira para scripts Unity sem um bridge nativo bem definido.
