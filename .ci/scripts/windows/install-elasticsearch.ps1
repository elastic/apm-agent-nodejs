# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Installing Elasticsearch..."
& choco install elasticsearch --no-progress -y --version=6.7.0

Write-Host "Starting Elasticsearch service..."
& elasticsearch-service.bat start

do {
  Write-Host "Waiting for Elasticsearch service to bootstrap..."
  sleep 1
} until(Test-NetConnection localhost -Port 9200 | ? { $_.TcpTestSucceeded } )

Write-Host "Elasticsearch installed" -ForegroundColor Green
