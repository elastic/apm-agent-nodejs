
PROM_BIN=./prometheus-2.41.0.darwin-amd64/prometheus

all:
	npm install

log:
	mkdir -p ./log

start: start-prom start-apps

stop: stop-apps stop-prom

restart: restart-prom restart-apps


start-apps: log
	node use-prom.js >./log/use-prom.log 2>&1 &
	node use-otel-prom.js >./log/use-otel-prom.log 2>&1 &
	OTEL_RESOURCE_ATTRIBUTES=service.name=use-otel-otlp \
		./node_modules/.bin/dotenv -- node use-otel-otlp.js >./log/use-otel-otlp.log 2>&1 &
	ELASTIC_APM_SERVICE_NAME=use-otel-prom-elastic \
		PROM_PORT=3004 \
		./node_modules/.bin/dotenv -- node -r elastic-apm-node/start use-otel-prom.js >./log/use-otel-prom-elastic.log 2>&1 &
	ELASTIC_APM_SERVICE_NAME=use-otel-api \
		./node_modules/.bin/dotenv -- node -r elastic-apm-node/start use-otel-api.js >./log/use-otel-api.log 2>&1 &

stop-apps:
	ps -f | grep "use-prom.js" | grep -vw grep || true
	kill $(shell ps -f | grep "use-prom.js" | grep -vw grep | awk '{print $$2}') || true
	ps -f | grep "use-otel-prom.js" | grep -vw grep || true
	kill $(shell ps -f | grep "use-otel-prom.js" | grep -vw grep | awk '{print $$2}') || true
	ps -f | grep "use-otel-otlp.js" | grep -vw grep || true
	kill $(shell ps -f | grep "use-otel-otlp.js" | grep -vw grep | awk '{print $$2}') || true
	ps -f | grep "use-otel-api.js" | grep -vw grep || true
	kill $(shell ps -f | grep "use-otel-api.js" | grep -vw grep | awk '{print $$2}') || true

restart-apps: stop-apps start-apps

start-prom: log
	$(PROM_BIN) --config.file=prometheus.yml >./log/prom.log 2>&1 &
	echo "Prometheus: http://localhost:9090/"

stop-prom:
	ps -f | grep "$(PROM_BIN)"
	kill $(shell ps -f | grep "$(PROM_BIN)" | grep -vw grep | awk '{print $$2}')

restart-prom: stop-prom start-prom

tail:
	tail -f log/*.log
