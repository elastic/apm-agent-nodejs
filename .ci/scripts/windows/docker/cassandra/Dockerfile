# escape=`
FROM mcr.microsoft.com/windows/servercore:10.0.17763.737 AS installer
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

RUN choco install 7zip.install --no-progress -y

ARG VERSION="3.11.3"
ENV CASSANDRA_HOME="C:\cassandra"
ENV ROOT_URL="http://archive.apache.org/dist/cassandra"
WORKDIR $CASSANDRA_HOME

RUN Write-Host "Downloading: ${env:ROOT_URL}/${env:VERSION}/apache-cassandra-${env:VERSION}-bin.tar.gz"; `
    Invoke-WebRequest "${env:ROOT_URL}/${env:VERSION}/apache-cassandra-${env:VERSION}-bin.tar.gz" -OutFile 'cassandra.tar.gz' -UseBasicParsing; `
    Write-Host "Installing: cassandra.tar.gz"; `
    7z e cassandra.tar.gz -tgzip -y | Out-Null; `
    7z x cassandra.tar -ttar -r -aou | Out-Null; `
    del cassandra.tar.gz;

FROM openjdk:8-windowsservercore-1809
ENV CASSANDRA_HOME="C:\cassandra"
ENV VERSION="3.11.3"
WORKDIR $CASSANDRA_HOME
COPY --from=installer ${CASSANDRA_HOME}\apache-cassandra-${VERSION}\ .
COPY cassandra.yaml .\conf\cassandra.yaml

EXPOSE 9042 7000

SHELL ["cmd", "/S", "/C"]
CMD "bin\cassandra.bat"
