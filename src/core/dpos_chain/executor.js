"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const consensus = require("./consensus");
class DposBlockExecutor extends value_chain_1.ValueBlockExecutor {
    async _executePostBlockEvent() {
        let err = await super._executePostBlockEvent();
        if (err) {
            return err;
        }
        if (this.m_block.number > 0) {
            let dbr = await this.m_storage.getReadWritableDatabase(value_chain_1.Chain.dbSystem);
            if (dbr.err) {
                this.m_logger.error(`execute block failed for get system database ${dbr.err}`);
                return dbr.err;
            }
            let denv = new consensus.Context(dbr.value, this.m_globalOptions, this.m_logger);
            // 修改miner的最后一次出块时间
            // 创世快不算时间，因为创世快产生后可能很长时间才开始出其他块的
            await denv.updateProducerTime(this.m_block.header.coinbase, this.m_block.header.timestamp);
            // 维护被禁用miner信息
            if (this.m_block.number % this.m_globalOptions.unbanBlocks === 0) {
                await denv.unbanProducer(this.m_block.header.timestamp);
            }
            let bReSelect = false;
            if (this.m_block.number % this.m_globalOptions.reSelectionBlocks === 0) {
                // 先禁用那些超过最长时间不出块的miner
                await denv.banProducer(this.m_block.header.timestamp);
                // 更新选举结果
                let ber = await denv.finishElection(this.m_block.header.hash);
                if (ber.err) {
                    return ber.err;
                }
                bReSelect = true;
            }
            if (this.m_block.number === 1 || bReSelect) {
                // 维护miner时间信息
                await denv.maintain_producer(this.m_block.header.timestamp);
            }
        }
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.DposBlockExecutor = DposBlockExecutor;
