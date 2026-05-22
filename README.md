# Selo do Gojo

Prototipo web inspirado na Expansao de Dominio do Satoru Gojo.

Hoje a experiencia principal deste repositorio e o app web. A base Unity continua no projeto,
mas esta em modo experimental e ainda nao entrega a mesma qualidade de rastreio da versao web.

## O que o app web faz

- usa camera com MediaPipe Hands
- rastreia uma mao em tempo real
- reconhece o gesto com indicador e medio cruzados
- mostra um guia fantasma sobre a camera para encaixar a mao
- oferece treino guiado passo a passo
- permite calibracao personalizada
- deixa ajustar sensibilidade e tempo do selo direto na interface
- ativa o dominio so pelo gesto estabilizado
- troca o fundo atras de voce por uma cena inspirada no Unlimited Void
- grava um clipe curto da ativacao
- suporta PWA basico

## Como usar a versao web

1. Abra um terminal nesta pasta.
2. Rode:

```powershell
.\serve.ps1
```

3. Abra `http://localhost:4417`.
4. Clique em `Liberar camera`.
5. Permita o acesso a camera no navegador.
6. Coloque a mao inteira no quadro, com boa luz.
7. Se quiser mais precisao, clique em `Calibrar gesto` e segure o sinal por alguns instantes.
8. Se estiver com dificuldade para acertar, use `Treino guiado`.
9. Se a leitura estiver dificil ou muito rigida, ajuste `Sensibilidade` e `Tempo do selo`.
10. Monte o gesto com:
   - indicador e medio estendidos
   - indicador e medio cruzados
   - pontas proximas
   - anelar e mindinho mais dobrados
11. Espere o status de `Gesto` ficar em `Pronto`.
12. O dominio ativa sozinho quando o gesto fica firme.
13. Depois da ativacao, use `Baixar ultimo clip` se quiser salvar a gravacao.

## Dicas para acertar mais facil

- aproxime a mao da camera sem cortar o pulso
- tente deixar a mao no centro do quadro
- segure o gesto firme por um instante
- evite fundo muito escuro ou luz atras de voce
- se errar demais, limpe a calibracao e faca outra

## Estrutura principal

- [index.html](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/index.html)
- [styles.css](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/styles.css)
- [app.js](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/app.js)

## Observacoes

- A primeira carga precisa de internet para baixar os arquivos do MediaPipe.
- `localhost` e o melhor cenario para camera e PWA.
- O [serve.ps1](C:/Users/isaca/Documents/Codex/2026-05-21/conhece-a-expansao-de-dominio-de/serve.ps1) agora usa a porta `4417` por padrao para evitar conflito com outros projetos locais.
- Abrir pela rede local sem HTTPS pode limitar algumas permissoes do navegador.
- A base Unity ainda depende de integracao real para rastreio de mao e segmentacao no Android.
