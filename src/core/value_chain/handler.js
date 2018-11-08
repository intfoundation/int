"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bignumber_js_1 = require("bignumber.js");
const chain_1 = require("../chain");
class ValueHandler extends chain_1.BaseHandler {
    constructor() {
        super();
        this.m_minerWage = (height) => {
            return Promise.resolve(new bignumber_js_1.BigNumber(1));
        };
    }
    onMinerWage(l) {
        if (l) {
            this.m_minerWage = l;
        }
    }
    getMinerWageListener() {
        return this.m_minerWage;
    }
}
exports.ValueHandler = ValueHandler;
