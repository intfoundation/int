"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const value_chain_1 = require("../value_chain");
const context_1 = require("./context");
class DbftBlockExecutor extends value_chain_1.ValueBlockExecutor {
    async executePostBlockEvent() {
        if (this.m_block.number > 0) {
            let dbftContext = new context_1.DbftContext(this.m_storage, this.m_globalOptions, this.m_logger);
            //首先更新出块者的最新出块时间
            await dbftContext.updateCreatorHeight(this.m_block.header.miner, this.m_block.number);
            let reSelectFlag = context_1.DbftContext.isElectionBlockNumber(this.m_globalOptions, this.m_block.number);
            //到了选举周期进行禁用,解禁和重新选举的计算
            if (reSelectFlag) {
                await dbftContext.banMiner(this.m_block.number);
                await dbftContext.unBanMiner(this.m_block.number);
                await dbftContext.updateMiners(this.m_block.number);
            }
        }
        return await super.executePostBlockEvent();
    }
}
exports.DbftBlockExecutor = DbftBlockExecutor;
