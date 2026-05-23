Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDir = Join-Path $raiz ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$launcherPy = Join-Path $env:LOCALAPPDATA "Programs\Python\Launcher\py.exe"
$pastaModelos = Join-Path $raiz "models"
$modeloMaos = Join-Path $pastaModelos "hand_landmarker.task"
$modeloSegmentacao = Join-Path $pastaModelos "selfie_segmenter_landscape.tflite"
$urlModeloMaos = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
$urlModeloSegmentacao = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite"

function Get-PythonBase {
  if (Get-Command python -ErrorAction SilentlyContinue) {
    return @{ Tipo = "python"; Comando = "python" }
  }

  if (Get-Command py -ErrorAction SilentlyContinue) {
    return @{ Tipo = "py"; Comando = "py" }
  }

  if (Test-Path $launcherPy) {
    return @{ Tipo = "py_path"; Comando = $launcherPy }
  }

  throw "Nenhum Python foi encontrado. Instale Python 3.11 ou 3.12 antes de continuar."
}

$pythonBase = Get-PythonBase

if (-not (Test-Path $venvPython)) {
  if ($pythonBase.Tipo -eq "python") {
    & $pythonBase.Comando -m venv $venvDir
  } elseif ($pythonBase.Tipo -eq "py") {
    & $pythonBase.Comando -3 -m venv $venvDir
  } else {
    & $pythonBase.Comando -3 -m venv $venvDir
  }
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $raiz "requirements.txt")

New-Item -ItemType Directory -Force -Path $pastaModelos | Out-Null

if (-not (Test-Path $modeloMaos)) {
  curl.exe -L $urlModeloMaos -o $modeloMaos
}

if (-not (Test-Path $modeloSegmentacao)) {
  curl.exe -L $urlModeloSegmentacao -o $modeloSegmentacao
}

Write-Host ""
Write-Host "Ambiente pronto."
Write-Host "Para rodar o detector: .\\run_detector.ps1"
