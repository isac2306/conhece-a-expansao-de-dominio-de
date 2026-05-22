# Android Plugin Template

Este template entrega a casca do plugin Android que conversa com os providers C# da base Unity.

## O que vem aqui

- `HandLandmarkerBridge.java`
- `ImageSegmenterBridge.java`
- `build.gradle`
- `AndroidManifest.xml`

## Objetivo

O template ja define o contrato que o C# espera:

- `create()`
- `initialize()`
- `hasLatestFrame()` ou `hasLatestMask()`
- `consumeLatestFrame()` ou `consumeLatestMask()`
- `dispose()`

## Como usar

1. Rode `unity-project\sync-unity-base.ps1`.
2. Abra a pasta `unity-project\AndroidPluginTemplate` no Android Studio.
3. Complete a inferencia real usando `com.google.mediapipe:tasks-vision`.
4. Gere um `.aar` com `assembleRelease`.
5. Copie o `.aar` para `unity-project\Assets\Plugins\Android`.

## Estado atual

Os bridges deste template sao stubs funcionais para o contrato de interoperabilidade. Eles ainda nao executam a inferencia do MediaPipe por conta propria.

## Proximo passo tecnico

Substitua os metodos `updateLatestFrame` e `updateLatestMask` por um pipeline real que:

1. receba os frames da camera
2. execute `HandLandmarker`
3. execute `ImageSegmenter`
4. converta o resultado para `float[]` e `byte[]`

Para a arquitetura sugerida, consulte `../docs/GoogleAiEdgeAndroidBridge.md`.
