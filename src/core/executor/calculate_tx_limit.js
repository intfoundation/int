"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serializable_1 = require("../serializable");
const bignumber_js_1 = require("bignumber.js");
class CalcuateLimit {
    constructor() {
        this.m_options = {
            baseLimit: 500,
            getLimit: 20,
            setLimit: 100,
            createLimit: 50000,
            inputLimit: 5,
            coefficient: 40,
        };
        this.m_methodArray = [
            { method: 'transferTo', operation: [2, 2, false] },
            { method: 'createToken', operation: [5, 0, true] },
            { method: 'transferTokenTo', operation: [2, 4, false] },
            { method: 'transferFrom', operation: [3, 6, false] },
            { method: 'approve', operation: [1, 2, false] },
            { method: 'freezeAccount', operation: [1, 2, false] },
            { method: 'burn', operation: [2, 2, false] },
            { method: 'mintToken', operation: [2, 3, false] },
            { method: 'transferOwnership', operation: [1, 1, false] },
            { method: 'vote', operation: [3, 7, false] },
            { method: 'mortgage', operation: [2, 3, false] },
            { method: 'unmortgage', operation: [3, 3, false] },
            { method: 'register', operation: [1, 1, false] },
            { method: 'lockAccount', operation: [1, 1, true] },
            { method: 'transferFromLockAccount', operation: [3, 2, false] }
        ];
        this.m_baseLimit = new bignumber_js_1.BigNumber(this.m_options.baseLimit);
        this.m_getLimit = new bignumber_js_1.BigNumber(this.m_options.getLimit);
        this.m_setLimit = new bignumber_js_1.BigNumber(this.m_options.setLimit);
        this.m_createLimit = new bignumber_js_1.BigNumber(this.m_options.createLimit);
        this.m_inputLimit = new bignumber_js_1.BigNumber(this.m_options.inputLimit);
        this.m_coefficient = new bignumber_js_1.BigNumber(this.m_options.coefficient);
    }
    // 计算执行tx的 limit
    calcTxLimit(method, input) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        this.m_methodArray.forEach((value, index) => {
            if (value.method === method) {
                txTotalLimit = this.calcLimit(input, value.operation[0], value.operation[1], value.operation[2]);
            }
        });
        return txTotalLimit;
    }
    objectToBuffer(input) {
        let inputString;
        if (input) {
            inputString = JSON.stringify(serializable_1.toStringifiable(input, true));
        }
        else {
            inputString = JSON.stringify({});
        }
        return Buffer.from(inputString);
    }
    calcLimit(input, setN, getN, create) {
        let txTotalLimit = new bignumber_js_1.BigNumber(0);
        let txInputBytes = new bignumber_js_1.BigNumber(this.objectToBuffer(input).length);
        txTotalLimit = txTotalLimit.plus(this.m_baseLimit).plus(this.m_setLimit.times(new bignumber_js_1.BigNumber(setN))).plus(this.m_getLimit.times(new bignumber_js_1.BigNumber(getN))).plus(txInputBytes.times(this.m_inputLimit));
        if (create) {
            txTotalLimit = txTotalLimit.plus(this.m_createLimit);
        }
        txTotalLimit = txTotalLimit.times(this.m_coefficient);
        return txTotalLimit;
    }
}
exports.CalcuateLimit = CalcuateLimit;
