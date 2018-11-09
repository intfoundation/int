"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
function init(logger) {
    process.on('unhandledRejection', (reason, p) => {
        console.log('Unhandled Rejection at: Promise ', p, ' reason: ', reason.stack);
        logger.error('Unhandled Rejection at: Promise ', p, ' reason: ', reason.stack);
        process.exit(-1);
    });
    process.on('uncaughtException', (err) => {
        console.log('uncaught exception at: ', err.stack);
        logger.error('uncaught exception at: ', err.stack);
        process.exit(-1);
    });
}
exports.init = init;
