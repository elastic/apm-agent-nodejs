APP_NAME=$(USER)-example-azure-function-app

.PHONY: print-app-name
print-app-name:
	@echo "APP_NAME: $(APP_NAME)"

.PHONY: publish
publish:
	func azure functionapp publish "$(APP_NAME)"

# Note that the Azure Functions log stream is extremely flaky. Don't expect it
# to reliably be able to show logs from the deployed function app.
.PHONY: logstream
logstream:
	func azure functionapp logstream "$(APP_NAME)"
