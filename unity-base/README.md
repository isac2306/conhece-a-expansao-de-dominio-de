# Unity Base - Unlimited Void

Esta pasta e uma base importavel para uma versao Unity do projeto.

## O que vem pronto

- avaliador do gesto em C#
- controlador de cooldown e ativacao do dominio
- fundo animado estilo `Unlimited Void`
- compositor de foreground para camera + mascara
- camera de webcam
- provedor debug de gesto por teclado
- provedor debug de mascara para simular "fundo atras de mim"

## Projeto recomendado

Crie um projeto novo do tipo `3D Core` no Unity e copie a pasta `Assets` desta base para dentro dele.

Esta base foi pensada para:

- prototipar a cena
- testar a ativacao
- integrar depois um provider real de landmarks de mao
- integrar depois uma mascara real de segmentacao de pessoa

## Estrutura

- `Assets/Scripts/Runtime/App`
- `Assets/Scripts/Runtime/Gesture`
- `Assets/Scripts/Runtime/Rendering`
- `Assets/Scripts/Runtime/Vision`
- `Assets/Shaders`
- `docs/GoogleAiEdgeAndroidBridge.md`

## Cena minima

1. Crie um `Main Camera`.
2. Crie um `Quad` grande atras da camera chamado `BackdropQuad`.
3. Crie um `Quad` em frente chamado `ForegroundQuad`.
4. Crie um `Empty` chamado `DomainRoot`.
5. Crie um `Empty` chamado `WebcamRoot`.
6. Crie um `Empty` chamado `DebugProviders`.

## Materiais

1. Crie um material com shader `UnlimitedVoid/Backdrop`.
2. Aplique esse material no `BackdropQuad`.
3. Crie um material com shader `UnlimitedVoid/Foreground Composite`.
4. Aplique esse material no `ForegroundQuad`.

## Componentes

No `BackdropQuad`:

- `DomainBackdropController`

No `ForegroundQuad`:

- `ForegroundCompositeController`

No `WebcamRoot`:

- `WebcamFeedController`

No `DomainRoot`:

- `DomainActivationController`
- `DomainAppController`

No `DebugProviders`:

- `DebugHoldGestureProvider`
- `DebugEllipseMaskProvider`

## Ligações no Inspector

`DomainActivationController`

- `backdropController` -> componente do `BackdropQuad`

`DomainAppController`

- `webcamFeed` -> `WebcamFeedController`
- `activationController` -> `DomainActivationController`
- `handLandmarkProviderSource` -> `DebugHoldGestureProvider` ou o seu provider real

`ForegroundCompositeController`

- `webcamFeed` -> `WebcamFeedController`
- `maskProviderSource` -> `DebugEllipseMaskProvider` ou o seu provider real

## Debug rapido

- segure `G` para simular um gesto correto
- segure `H` para simular um gesto ruim
- pressione `Space` para forcar a ativacao do dominio

Com o provider debug de mascara, o fundo do dominio ja aparece "atras" de um recorte aproximado do corpo.

## Integracao real depois

Para trocar o debug por visao computacional real:

1. implemente `IHandLandmarkProvider`
2. implemente `IPersonMaskProvider`
3. conecte seus componentes no Inspector

Para um caminho Android com Google AI Edge, veja:

- `docs/GoogleAiEdgeAndroidBridge.md`

## Observacao

Sem um provider real de landmarks e sem uma mascara real de pessoa, esta base e um esqueleto funcional de cena e arquitetura, nao a versao final do app.
