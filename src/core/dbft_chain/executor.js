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
            let reBanSelectFlag = false;
            //每隔一段时间进行一次禁用计算，将连续出块失败的节点禁用
            if (this.m_block.number % this.m_globalOptions.banMinerInterval === 0) {
                let banResult = await dbftContext.banMiner(this.m_block.number);
                reBanSelectFlag = banResult.reSelect;
            }
            let reSelectFlag = context_1.DbftContext.isElectionBlockNumber(this.m_globalOptions, this.m_block.number);
            //首先进行解禁计算，所以一旦被ban掉至少要禁用一个出块周期
            if (reSelectFlag) {
                await dbftContext.unBanMiner(this.m_block.number);
            }
            //无论是进行了ban计算或者是到达一个出块周期都更新miner
            if (reSelectFlag || reBanSelectFlag) {
                await dbftContext.updateMiners(this.m_block.number);
            }
        }
        return await super.executePostBlockEvent();
    }
}
exports.DbftBlockExecutor = DbftBlockExecutor;
