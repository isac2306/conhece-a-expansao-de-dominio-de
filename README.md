# Unlimited Void Trigger

Protótipo web inspirado na Expansão de Domínio do Satoru Gojo.

## O que ele faz

- Usa câmera para rastrear a mão com MediaPipe Hands
- Usa segmentação para manter você em primeiro plano
- Detecta uma versão prática do gesto com indicador e médio cruzados
- Mostra uma imagem guia do gesto dentro da interface
- Permite calibração personalizada do gesto
- Ativa pelo gesto estabilizado, sem exigir sensor de movimento
- Troca o fundo por uma animação inspirada no domínio atrás de você
- Dispara efeito visual e sonoro do `Unlimited Void`
- Grava um clipe curto da ativação
- Tem suporte básico a PWA/offline

## Como rodar

```powershell
.\serve.ps1
```

Depois abra:

`http://localhost:4173`

## Observações

- A primeira carga precisa de internet para baixar os arquivos do MediaPipe do CDN.
- `localhost` é o melhor cenário para câmera e PWA.
- Abrir pela rede local sem HTTPS pode limitar permissões no navegador.
