Write-Host "Wait a few seconds until the mysql is ready..."
sleep 15
Write-Host "Create users for remote access..."
mysql -h 127.0.0.1 -P 3306 -u root -e @"
   SELECT user,host FROM mysql.user;
   CREATE USER '$env:MYSQL_USER'@'%' IDENTIFIED WITH mysql_native_password BY '$env:MYSQL_PASSWORD';
   GRANT ALL PRIVILEGES ON *.* TO $env:MYSQL_USER@'%';
   SELECT user,host FROM mysql.user;
"@
Write-Host "Show mysql log output in the console..."
# Keep running the container with the event logs in the stdout.
Get-Content C:\\mysql.log -Wait
