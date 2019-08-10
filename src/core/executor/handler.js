"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const util_1 = require("util");
class BaseHandler {
    constructor() {
        this.m_txListeners = new Map();
        this.m_viewListeners = new Map();
        this.m_preBlockListeners = [];
        this.m_postBlockListeners = [];
        this.m_eventDefinations = new Map();
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
    getViewMethodNames() {
        return [...this.m_viewListeners.keys()];
    }
    addPreBlockListener(filter, listener) {
        this.m_preBlockListeners.push({ filter, listener });
    }
    addPostBlockListener(filter, listener) {
        this.m_postBlockListeners.push({ filter, listener });
    }
    getPreBlockListeners(h) {
        let listeners = [];
        for (let index = 0; index < this.m_preBlockListeners.length; ++index) {
            let s = this.m_preBlockListeners[index];
            if (util_1.isNullOrUndefined(h) || s.filter(h)) {
                listeners.push({ listener: s.listener, index });
            }
        }
        return listeners;
    }
    getPostBlockListeners(h) {
        let listeners = [];
        for (let index = 0; index < this.m_postBlockListeners.length; ++index) {
            let s = this.m_postBlockListeners[index];
            if (util_1.isNullOrUndefined(h) || s.filter(h)) {
                listeners.push({ listener: s.listener, index });
            }
        }
        return listeners;
    }
    defineEvent(name, def) {
        this.m_eventDefinations.set(name, def);
    }
    getEventDefination(name) {
        return this.m_eventDefinations.get(name);
    }
    getEventDefinations() {
        const d = this.m_eventDefinations;
        return d;
    }
}
exports.BaseHandler = BaseHandler;
