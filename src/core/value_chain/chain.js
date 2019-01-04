"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bignumber_js_1 = require("bignumber.js");
const error_code_1 = require("../error_code");
const assert = require('assert');
const address_1 = require("../address");
const chain_1 = require("../chain");
const block_1 = require("./block");
const transaction_1 = require("./transaction");
const executor_1 = require("./executor");
const ValueContext = require("./context");
const pending_1 = require("./pending");
class ValueChain extends chain_1.Chain {
    constructor(options) {
        super(options);
    }
    async newBlockExecutor(block, storage) {
        let kvBalance = (await storage.getKeyValue(chain_1.Chain.dbSystem, ValueChain.kvBalance)).kv;
        let ve = new ValueContext.Context(kvBalance);
        let externContext = Object.create(null);
        externContext.getBalance = async (address) => {
            return await ve.getBalance(address);
        };
        externContext.transferTo = async (address, amount) => {
            return await ve.transferTo(ValueChain.sysAddress, address, amount);
        };
        let executor = new executor_1.ValueBlockExecutor({ logger: this.logger, block, storage, handler: this.m_handler, externContext, globalOptions: this.m_globalOptions });
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
        let executor = new chain_1.ViewExecutor({ logger: this.logger, header, storage, method, param, handler: this.m_handler, externContext });
        return { err: error_code_1.ErrorCode.RESULT_OK, executor };
    }
    _getBlockHeaderType() {
        return block_1.ValueBlockHeader;
    }
    _getTransactionType() {
        return transaction_1.ValueTransaction;
    }
    _getReceiptType() {
        return transaction_1.ValueReceipt;
    }
    _createPending() {
        return new pending_1.ValuePendingTransactions({
            storageManager: this.m_storageManager,
            logger: this.logger,
            overtime: this.m_instanceOptions.pendingOvertime,
            handler: this.m_handler,
            maxCount: this.m_instanceOptions.maxPendingCount,
            warnCount: this.m_instanceOptions.warnPendingCount
        });
    }
    async onCreateGenesisBlock(block, storage, genesisOptions) {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        }
        let dbr = await storage.getReadWritableDatabase(chain_1.Chain.dbSystem);
        if (dbr.err) {
            assert(false, `value chain create genesis failed for no system database`);
            return dbr.err;
        }
        const dbSystem = dbr.value;
        let gkvr = await dbSystem.getReadWritableKeyValue(chain_1.Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv.rpush('features', 'value');
        if (rpr.err) {
            return rpr.err;
        }
        if (!genesisOptions || !address_1.isValidAddress(genesisOptions.coinbase)) {
            this.m_logger.error(`create genesis failed for genesisOptioins should has valid coinbase`);
            return error_code_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        block.header.coinbase = genesisOptions.coinbase;
        let kvr = await dbSystem.createKeyValue(ValueChain.kvBalance);
        // 在这里给用户加钱
        if (genesisOptions && genesisOptions.preBalances) {
            // 这里要给几个账户放钱
            let kvBalance = kvr.kv;
            for (let index = 0; index < genesisOptions.preBalances.length; index++) {
                // 按照address和amount预先初始化钱数
                await kvBalance.set(genesisOptions.preBalances[index].address, new bignumber_js_1.BigNumber(genesisOptions.preBalances[index].amount));
            }
        }
        return kvr.err;
    }
}
// 存储每个address的money，其中有一个默认的系统账户
ValueChain.kvBalance = 'balance'; // address<--->blance
ValueChain.sysAddress = '0';
exports.ValueChain = ValueChain;
