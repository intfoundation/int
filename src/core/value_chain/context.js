"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const bignumber_js_1 = require("bignumber.js");
class ViewContext {
    constructor(kvBalance) {
        this.kvBalance = kvBalance;
    }
    async getBalance(address) {
        let retInfo = await this.kvBalance.get(address);
        return retInfo.err === error_code_1.ErrorCode.RESULT_OK ? retInfo.value : new bignumber_js_1.BigNumber(0);
    }
}
exports.ViewContext = ViewContext;
class Context extends ViewContext {
    constructor(kvBalance) {
        super(kvBalance);
    }
    async transferTo(from, to, amount) {
        let fromTotal = await this.getBalance(from);
        if (fromTotal.lt(amount)) {
            return error_code_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        await this.kvBalance.set(from, fromTotal.minus(amount));
        await this.kvBalance.set(to, (await this.getBalance(to)).plus(amount));
        return error_code_1.ErrorCode.RESULT_OK;
    }
    async issue(to, amount) {
        let sh = await this.kvBalance.set(to, (await this.getBalance(to)).plus(amount));
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.Context = Context;
