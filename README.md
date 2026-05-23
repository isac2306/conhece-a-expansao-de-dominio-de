# Selo do Gojo

Este repositorio tem duas frentes:

- uma versao web em [index.html](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/index.html)
- um detector Python em [python-detector](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/python-detector/README.md)

Hoje, o melhor caminho para buscar o `melhor sensor da mao possivel` e o detector Python.

## Caminho recomendado

1. monte e valide o detector em `python-detector`
2. ajuste a leitura com a sua mao real
3. depois decida se quer continuar em Python como app principal

## Web

O app web continua aqui como referencia rapida:

1. Abra um terminal nesta pasta.
2. Rode:

```powershell
.\serve.ps1
```

3. Abra `http://localhost:4417`.

## Python

Para o detector com foco em fluidez, nitidez e resolucao:

1. Entre em [python-detector](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/python-detector/README.md)
2. Rode `.\setup_detector.ps1`
3. Rode `.\run_detector.ps1`

## Observacoes

- A primeira carga da web precisa de internet para baixar os arquivos do MediaPipe.
- `localhost` e o melhor cenario para camera e PWA.
- A base Unity continua no projeto, mas esta separada do fluxo principal.
