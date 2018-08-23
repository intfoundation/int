"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
function init() {
    process.on('unhandledRejection', (reason, p) => {
        console.error('Unhandled Rejection at: Promise ', p, ' reason: ', reason.stack);
    });
    process.on('uncaughtException', (err) => {
        console.error('uncaught exception at: ', err.stack);
    });
}
exports.init = init;
