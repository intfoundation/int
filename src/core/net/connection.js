"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const events_1 = require("events");
class IConnection extends events_1.EventEmitter {
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    send(data) {
        return 0;
    }
    close() {
        return Promise.resolve(error_code_1.ErrorCode.RESULT_OK);
    }
    destroy() {
        return Promise.resolve();
    }
    getRemote() {
        return '';
    }
    setRemote(s) {
    }
    getTimeDelta() {
        return 0;
    }
    setTimeDelta(n) {
    }
}
exports.IConnection = IConnection;
