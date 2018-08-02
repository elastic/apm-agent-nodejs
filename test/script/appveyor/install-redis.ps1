# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Downloading Redis..." -ForegroundColor Cyan
$redisRoot = "$env:SYSTEMDRIVE\Redis"
$zipPath = "$($env:USERPROFILE)\redis-2.8.19.zip"
(New-Object Net.WebClient).DownloadFile('https://github.com/MSOpenTech/redis/releases/download/win-2.8.19/redis-2.8.19.zip', $zipPath)
7z x $zipPath -y -o"$redisRoot" | Out-Null
del $zipPath

Write-Host "Installing Redis as a Windows service..."
& "$redisRoot\redis-server.exe" --service-install

Write-Host "Starting Redis service..."
& "$redisRoot\redis-server.exe" --service-start

Write-Host "Redis installed" -ForegroundColor Green
