docker build --tag cassandra cassandra/
docker run -d -p 7000:7000 -p 9042:9042 --name cassandra cassandra
docker build --tag=elasticsearch elasticsearch/
docker run -d -p 9200:9200 -p 9300:9300 --name elasticsearch elasticsearch
docker build --tag=mongodb mongodb/
docker run -d -p 27017:27017 --name mongodb mongodb
docker build --tag=mssql mssql/
docker run -d -p 1433:1433 -e sa_password=%SA_PASSWORD% -e ACCEPT_EULA=Y --name mssql mssql
docker build --tag=mysql mysql/
docker run -d -p 3306:3306 -e MYSQL_ALLOW_EMPTY_PASSWORD=1 --name mysql mysql
docker build --tag=postgres postgres/
docker run -d -p 5432:5432 --name postgres postgres
docker build --tag=redis redis/
docker run -d -p 6379:6379 --name redis redis
docker ps -a
