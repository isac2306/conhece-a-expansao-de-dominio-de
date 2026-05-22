param(
  [int]$Port = 4417,
  [switch]$BindAll
)

Set-Location -LiteralPath $PSScriptRoot
$HostTarget = if ($BindAll) { "0.0.0.0" } else { "127.0.0.1" }

Write-Host "Servidor local em http://localhost:$Port"
if ($BindAll) {
  Write-Host "Aviso: abrir pela rede local pode bloquear camera, sensor e PWA sem HTTPS."
}

py -3 -m http.server $Port --bind $HostTarget
