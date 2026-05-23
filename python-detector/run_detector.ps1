Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $raiz ".venv\Scripts\python.exe"
$launcherPy = Join-Path $env:LOCALAPPDATA "Programs\Python\Launcher\py.exe"

if (Test-Path $venvPython) {
  & $venvPython (Join-Path $raiz "run_detector.py")
  exit $LASTEXITCODE
}

if (Get-Command python -ErrorAction SilentlyContinue) {
  python (Join-Path $raiz "run_detector.py")
  exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
  py -3 (Join-Path $raiz "run_detector.py")
  exit $LASTEXITCODE
}

if (Test-Path $launcherPy) {
  & $launcherPy -3 (Join-Path $raiz "run_detector.py")
  exit $LASTEXITCODE
}

throw "Nenhum interpretador Python foi encontrado. Rode setup_detector.ps1 primeiro."
