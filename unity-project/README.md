# Unlimited Void Unity Project Scaffold

Este e um scaffold leve de projeto Unity para abrir uma estrutura de projeto de verdade no editor.

## O que ele faz

- traz `Packages/manifest.json`
- traz `ProjectSettings/ProjectVersion.txt`
- traz um script para sincronizar os assets de `unity-base`
- traz um espaco claro para o template do plugin Android

## Como usar

1. Abra a pasta `unity-project` no Unity Hub.
2. Antes de abrir o editor, rode:

```powershell
.\sync-unity-base.ps1
```

3. Depois abra o projeto no Unity.
4. No editor, use `Tools > Unlimited Void > Create Demo Scene`.
5. Se quiser seguir pela integracao Android real, abra tambem `AndroidPluginTemplate`.

## Por que existe essa etapa

Nesta maquina nao ha Unity instalado, entao eu montei:

- a base de runtime em `unity-base`
- o scaffold do projeto em `unity-project`

Assim voce ja tem:

- codigo pronto
- estrutura de projeto
- e uma forma clara de sincronizar tudo
- um template inicial do plugin Android para o bridge
