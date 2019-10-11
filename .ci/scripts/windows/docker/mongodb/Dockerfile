# escape=`
FROM mcr.microsoft.com/windows/servercore:10.0.17763.737
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

ARG VERSION="4.2.0"
ENV MONGODB_HOME="C:\ProgramData\MongoDB\log"
WORKDIR $MONGODB_HOME
RUN choco install mongodb --version=${env:VERSION} --no-progress -y

EXPOSE 27017

# Override confgs to enable the remote access
ENV MONGODB_BIN="C:\Program Files\MongoDB\Server\4.2\bin"
WORKDIR $MONGODB_BIN
COPY mongod.cfg .
WORKDIR $MONGODB_HOME

# Keep running the container with the event logs in the stdout.
CMD ["powershell", "Get-Content", "mongod.log", "-Wait"]
