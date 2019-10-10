Write-Host "Wait a few seconds until the mysql is ready..."
sleep 15
Write-Host "List current users..."
mysql -h 127.0.0.1 -P 3306 -u root -e "select user,host from mysql.user;"
Write-Host "Create users for remote access..."
mysql -h 127.0.0.1 -P 3306 -u root -e @"
   CREATE USER root@'%';
   GRANT ALL PRIVILEGES ON *.* TO root@'%';
"@
mysql -h 127.0.0.1 -P 3306 -u root -e "select user,host from mysql.user;"

Write-Host "Show mysql log output in the console..."
# Keep running the container with the event logs in the stdout.
Get-Content C:\\mysql.log -Wait
