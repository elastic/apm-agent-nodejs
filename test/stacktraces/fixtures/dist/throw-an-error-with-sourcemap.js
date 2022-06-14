"use strict";
/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// TypeScript code that throws an error. We will compile to a JS file with
// a sourcemap to test that stacktrace handling uses the sourcemap properly.
const __1 = __importDefault(require("../../../../"));
__1.default.start({
    serviceName: 'test-throw-an-error-with-sourcemap',
    logUncaughtExceptions: true,
    metricsInterval: '0',
    centralConfig: false,
    logLevel: 'off',
    // This tells the agent to catch unhandled exceptions:
    captureExceptions: true
});
function main(msg) {
    throw new Error(msg);
}
main('boom');
//# sourceMappingURL=throw-an-error-with-sourcemap.js.map