
PROM_BIN=./prometheus-2.41.0.darwin-amd64/prometheus

all:
	npm install

log:
	mkdir -p ./log

start: start-prom start-apps

stop: stop-apps stop-prom

restart: restart-prom restart-apps


start-apps: log
	node prom-prom.js >./log/prom-prom.log 2>&1 &
	node otel-prom.js >./log/otel-prom.log 2>&1 &
	node otel-otlp.js >./log/otel-otlp.log 2>&1 &
	node otelapi-elastic.js >./log/otelapi-elastic.log 2>&1 &

stop-apps:
	ps -f | rg "prom-prom.js"
	kill $(shell ps -f | rg "prom-prom.js" | rg -vw rg | awk '{print $$2}') || true
	ps -f | rg "otel-prom.js"
	kill $(shell ps -f | rg "otel-prom.js" | rg -vw rg | awk '{print $$2}') || true
	ps -f | rg "otel-otlp.js"
	kill $(shell ps -f | rg "otel-otlp.js" | rg -vw rg | awk '{print $$2}') || true
	ps -f | rg "otelapi-elastic.js"
	kill $(shell ps -f | rg "otelapi-elastic.js" | rg -vw rg | awk '{print $$2}') || true

restart-apps: stop-apps start-apps

start-prom: log
	$(PROM_BIN) --config.file=prometheus.yml >./log/prom.log 2>&1 &
	echo "Prometheus: http://localhost:9090/"

stop-prom:
	ps -f | rg "$(PROM_BIN)"
	kill $(shell ps -f | rg "$(PROM_BIN)" | rg -vw rg | awk '{print $$2}')

restart-prom: stop-prom start-prom

tail:
	tail -f log/*.log
