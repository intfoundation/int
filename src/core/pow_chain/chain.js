"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_code_1 = require("../error_code");
const value_chain_1 = require("../value_chain");
const block_1 = require("./block");
const consensus = require("./consensus");
class PowChain extends value_chain_1.ValueChain {
    _getBlockHeaderType() {
        return block_1.PowBlockHeader;
    }
    _onCheckGlobalOptions(globalOptions) {
        if (!super._onCheckGlobalOptions(globalOptions)) {
            return false;
        }
        return consensus.onCheckGlobalOptions(globalOptions);
    }
    _onCheckTypeOptions(typeOptions) {
        return typeOptions.consensus === 'pow';
    }
    async onCreateGenesisBlock(block, storage, genesisOptions) {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        }
        let gkvr = await storage.getKeyValue(value_chain_1.ValueChain.dbSystem, value_chain_1.ValueChain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv.set('consensus', 'pow');
        if (rpr.err) {
            return rpr.err;
        }
        block.header.bits = this.globalOptions.basicBits;
        block.header.updateHash();
        return error_code_1.ErrorCode.RESULT_OK;
    }
}
exports.PowChain = PowChain;
