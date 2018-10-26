"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bignumber_js_1 = require("bignumber.js");
const chain_1 = require("../chain");
const serializable_1 = require("../serializable");
class ValueTransaction extends chain_1.Transaction {
    constructor() {
        super();
        this.m_value = new bignumber_js_1.BigNumber(0);
        // this.m_fee = new BigNumber(0);
        this.m_limit = new bignumber_js_1.BigNumber(0);
        this.m_price = new bignumber_js_1.BigNumber(0);
    }
    get value() {
        return this.m_value;
    }
    set value(value) {
        this.m_value = value;
    }
    // get fee(): BigNumber {
    //     return this.m_fee;
    // }
    //
    // set fee(value: BigNumber) {
    //     this.m_fee = value;
    // }
    get limit() {
        return this.m_limit;
    }
    set limit(l) {
        this.m_limit = l;
    }
    get price() {
        return this.m_price;
    }
    set price(p) {
        this.m_price = p;
    }
    _encodeHashContent(writer) {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        writer.writeBigNumber(this.m_value);
        // writer.writeBigNumber(this.m_fee);
        writer.writeBigNumber(this.m_limit);
        writer.writeBigNumber(this.m_price);
        return serializable_1.ErrorCode.RESULT_OK;
    }
    _decodeHashContent(reader) {
        let err = super._decodeHashContent(reader);
        if (err) {
            return err;
        }
        try {
            this.m_value = reader.readBigNumber();
            // this.m_fee = reader.readBigNumber();
            this.m_limit = reader.readBigNumber();
            this.m_price = reader.readBigNumber();
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = super.stringify();
        obj.value = this.value.toString();
        // obj.fee = this.fee.toString();
        obj.limit = this.limit.toString();
        obj.price = this.price.toString();
        return obj;
    }
}
exports.ValueTransaction = ValueTransaction;
class ValueReceipt extends chain_1.Receipt {
    constructor() {
        super();
        this.m_cost = new bignumber_js_1.BigNumber(0);
    }
    get cost() {
        const b = this.m_cost;
        return b;
    }
    set cost(c) {
        this.m_cost = c;
    }
    encode(writer) {
        const err = super.encode(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeBigNumber(this.m_cost);
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    decode(reader) {
        const err = super.decode(reader);
        if (err) {
            return err;
        }
        try {
            this.m_cost = reader.readBigNumber();
        }
        catch (e) {
            return serializable_1.ErrorCode.RESULT_INVALID_FORMAT;
        }
        return serializable_1.ErrorCode.RESULT_OK;
    }
    stringify() {
        let obj = super.stringify();
        obj.cost = this.m_cost.toString();
        return obj;
    }
}
exports.ValueReceipt = ValueReceipt;
