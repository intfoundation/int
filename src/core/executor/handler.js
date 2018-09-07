"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
class BaseHandler {
    constructor() {
        this.m_txListeners = new Map();
        this.m_viewListeners = new Map();
        this.m_preBlockListeners = [];
        this.m_postBlockListeners = [];
    }
    addTX(name, listener, checker) {
        if (name.length > 0 && listener) {
            this.m_txListeners.set(name, { listener, checker });
        }
    }
    getTxListener(name) {
        const stub = this.m_txListeners.get(name);
        if (!stub) {
            return undefined;
        }
        return stub.listener;
    }
    getTxPendingChecker(name) {
        const stub = this.m_txListeners.get(name);
        if (!stub) {
            return undefined;
        }
        if (!stub.checker) {
            return (tx) => error_code_1.ErrorCode.RESULT_OK;
        }
        return stub.checker;
    }
    addViewMethod(name, listener) {
        if (name.length > 0 && listener) {
            this.m_viewListeners.set(name, listener);
        }
    }
    getViewMethod(name) {
        return this.m_viewListeners.get(name);
    }
    addPreBlockListener(filter, listener) {
        this.m_preBlockListeners.push({ filter, listener });
    }
    addPostBlockListener(filter, listener) {
        this.m_postBlockListeners.push({ filter, listener });
    }
    getPreBlockListeners(h) {
        let listeners = [];
        for (let l of this.m_preBlockListeners) {
            if (l.filter(h)) {
                listeners.push(l.listener);
            }
        }
        return listeners;
    }
    getPostBlockListeners(h) {
        let listeners = [];
        for (let l of this.m_postBlockListeners) {
            if (l.filter(h)) {
                listeners.push(l.listener);
            }
        }
        return listeners;
    }
}
exports.BaseHandler = BaseHandler;
