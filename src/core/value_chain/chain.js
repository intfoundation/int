"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const chain_1 = require("../chain");
const block_1 = require("./block");
const transaction_1 = require("./transaction");
const executor_1 = require("./executor");
const ValueContext = require("./context");
class ValueChain extends chain_1.Chain {
    constructor(options) {
        super(options);
    }
    async newBlockExecutor(block, storage) {
        let kvBalance = (await storage.getKeyValue(chain_1.Chain.dbSystem, ValueChain.kvBalance)).kv;
        let ve = new ValueContext.Context(kvBalance);
        let externContext = Object.create(null);
        externContext.getBalance = (address) => {
            return ve.getBalance(address);
        };
        externContext.transferTo = (address, amount) => {
            return ve.transferTo(ValueChain.sysAddress, address, amount);
        };
        let executor = new executor_1.ValueBlockExecutor({ logger: this.logger, block, storage, handler: this.handler, externContext, globalOptions: this.m_globalOptions });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor };
    }
    async newViewExecutor(header, storage, method, param) {
        let dbSystem = (await storage.getReadableDataBase(chain_1.Chain.dbSystem)).value;
        let kvBalance = (await dbSystem.getReadableKeyValue(ValueChain.kvBalance)).kv;
        let ve = new ValueContext.ViewContext(kvBalance);
        let externContext = Object.create(null);
        externContext.getBalance = (address) => {
            return ve.getBalance(address);
        };
        let executor = new chain_1.ViewExecutor({ logger: this.logger, header, storage, method, param, handler: this.handler, externContext });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor };
    }
    _getBlockHeaderType() {
        return block_1.ValueBlockHeader;
    }
    _getTransactionType() {
        return transaction_1.ValueTransaction;
    }
}
// 存储每个address的money，其中有一个默认的系统账户
ValueChain.kvBalance = 'balance'; // address<--->blance
ValueChain.sysAddress = '0';
exports.ValueChain = ValueChain;
