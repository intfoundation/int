"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = require("winston");
const path = require("path");
const fs = require("fs-extra");
const { LogShim } = require('./log_shim');
exports.LogShim = LogShim;
function initLogger(options) {
    if (options.logger) {
        return options.logger;
    }
    else if (options.loggerOptions) {
        const loggerTransports = [];
        if (options.loggerOptions.console) {
            loggerTransports.push(new winston_1.transports.Console({
                level: options.loggerOptions.level ? options.loggerOptions.level : 'info',
                timestamp: true,
                handleExceptions: true,
                humanReadableUnhandledException: true
            }));
        }
        if (options.loggerOptions.file) {
            fs.ensureDirSync(options.loggerOptions.file.root);
            loggerTransports.push(new winston_1.transports.File({
                json: false,
                level: options.loggerOptions.level ? options.loggerOptions.level : 'info',
                timestamp: true,
                filename: path.join(options.loggerOptions.file.root, options.loggerOptions.file.filename || 'info.log'),
                datePattern: 'yyyy-MM-dd.',
                prepend: true,
                handleExceptions: true,
                humanReadableUnhandledException: true
            }));
        }
        const logger = new winston_1.Logger({
            level: options.loggerOptions.level || 'info',
            transports: loggerTransports
        });
        return new LogShim(logger).log;
    }
    else {
        const loggerTransports = [];
        loggerTransports.push(new winston_1.transports.Console({
            level: 'info',
            timestamp: true,
            handleExceptions: true
        }));
        const logger = new winston_1.Logger({
            level: 'info',
            transports: loggerTransports
        });
        return new LogShim(logger).log;
    }
}
exports.initLogger = initLogger;
