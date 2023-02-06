
PROM_BIN=./prometheus-2.41.0.darwin-amd64/prometheus

all:
	npm install

log:
	mkdir -p ./log

start: start-prom start-apps

stop: stop-apps stop-prom

restart: restart-prom restart-apps


start-apps: log
	node caseA-otel-prom.js >./log/caseA-otel-prom.log 2>&1 &
	node caseB-otel-otlp.js >./log/caseB-otel-otlp.log 2>&1 &
	node caseC-prom.js >./log/caseC-prom.log 2>&1 &
	node caseE-metrics-api-elastic.js >./log/caseE-metrics-api-elastic.log 2>&1 &

stop-apps:
	ps -f | rg "caseA-otel-prom.js"
	kill $(shell ps -f | rg "caseA-otel-prom.js" | rg -vw rg | awk '{print $$2}') || true
	ps -f | rg "caseB-otel-otlp.js"
	kill $(shell ps -f | rg "caseB-otel-otlp.js" | rg -vw rg | awk '{print $$2}') || true
	ps -f | rg "caseC-prom.js"
	kill $(shell ps -f | rg "caseC-prom.js" | rg -vw rg | awk '{print $$2}') || true
	ps -f | rg "caseE-metrics-api-elastic.js"
	kill $(shell ps -f | rg "caseE-metrics-api-elastic.js" | rg -vw rg | awk '{print $$2}') || true

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
