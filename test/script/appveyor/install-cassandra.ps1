$cassandraVersion = "3.11.2"
$downloadUrl = "http://mirrors.dotsrc.org/apache/cassandra/$cassandraVersion/apache-cassandra-$cassandraVersion-bin.tar.gz"
$extractRoot = "$env:USERPROFILE"
$tgzPath = "$extractRoot\cassandra.tar.gz"
$tarPath = "$extractRoot\cassandra.tar"
$cassandra = "$extractRoot\apache-cassandra-$cassandraVersion\bin\cassandra.bat"

Write-Host "Downloading Cassandra..." -ForegroundColor Cyan
appveyor DownloadFile $downloadUrl -FileName $tgzPath

Write-Host "Extracting Cassandra..."
7z e $tgzPath -tgzip -y -o"$extractRoot" | Out-Null
7z x $tarPath -ttar -r -aou -o"$extractRoot" | Out-Null

Write-Host "Starting Cassandra..."
Start-Process $cassandra -PassThru

Write-Host "Cassandra $cassandraVersion running" -ForegroundColor Green
