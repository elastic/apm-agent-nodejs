# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Preparing to download and install Redis..." -ForegroundColor Cyan
$redisVersion = "2.8.19"
$redisRoot = "$env:SYSTEMDRIVE\Redis"
$zipPath = "$($env:USERPROFILE)\redis-$redisVersion.zip"
$downloadUrl = "https://github.com/MSOpenTech/redis/releases/download/win-$redisVersion/redis-$redisVersion.zip"

Write-Host "Downloading Redis..." -ForegroundColor Cyan
(New-Object Net.WebClient).DownloadFile($downloadUrl, $zipPath)
7z x $zipPath -y -o"$redisRoot" | Out-Null
del $zipPath

Write-Host "Installing Redis as a Windows service..."
& "$redisRoot\redis-server.exe" --service-install

Write-Host "Starting Redis service..."
& "$redisRoot\redis-server.exe" --service-start

Write-Host "Redis installed" -ForegroundColor Green
