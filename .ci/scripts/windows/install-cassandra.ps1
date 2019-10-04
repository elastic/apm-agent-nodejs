# Abort with non zero exit code on errors
$ErrorActionPreference = "Stop"

Write-Host "Preparing to download and install Cassandra..." -ForegroundColor Cyan
$cassandraVersion = "3.11.3"
$downloadUrl = "http://archive.apache.org/dist/cassandra/$cassandraVersion/apache-cassandra-$cassandraVersion-bin.tar.gz"
$extractRoot = "$env:SYSTEMDRIVE"
$tgzPath = "$extractRoot\cassandra.tar.gz"
$tarPath = "$extractRoot\cassandra.tar"
$cassandra = "$extractRoot\apache-cassandra-$cassandraVersion\bin\cassandra.bat"

Write-Host "Downloading Cassandra..." -ForegroundColor Cyan
(New-Object Net.WebClient).DownloadFile($downloadUrl, $tgzPath)

Write-Host "Extracting Cassandra..."
7z e $tgzPath -tgzip -y -o"$extractRoot" | Out-Null
7z x $tarPath -ttar -r -aou -o"$extractRoot" | Out-Null
del $tgzPath

Write-Host "Starting Cassandra..."
Start-Process $cassandra -PassThru

Write-Host "Cassandra $cassandraVersion running" -ForegroundColor Green
