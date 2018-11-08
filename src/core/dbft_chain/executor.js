"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const value_chain_1 = require("../value_chain");
const context_1 = require("./context");
class DbftBlockExecutor extends value_chain_1.ValueBlockExecutor {
    async executePostBlockEvent() {
        if (this.m_block.number > 0) {
            let dbftProxy = new context_1.DbftContext(this.m_storage, this.m_globalOptions, this.m_logger);
            if (context_1.DbftContext.isElectionBlockNumber(this.m_globalOptions, this.m_block.number)) {
                await dbftProxy.updateMiners(this.m_block.number);
            }
        }
        return await super.executePostBlockEvent();
    }
}
exports.DbftBlockExecutor = DbftBlockExecutor;
