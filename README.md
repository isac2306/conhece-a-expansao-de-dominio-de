# Unlimited Void Trigger

Protótipo web inspirado na Expansão de Domínio do Satoru Gojo.

## O que ele faz

- Usa câmera para rastrear a mão com MediaPipe Hands
- Detecta uma versão prática do gesto com indicador e médio cruzados
- Permite calibração personalizada do gesto
- Usa sensor de movimento como gatilho extra
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
- `localhost` é o melhor cenário para câmera, sensor e PWA.
- Abrir pela rede local sem HTTPS pode limitar permissões no navegador.
