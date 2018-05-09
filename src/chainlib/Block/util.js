const util = require('../Utils/util');
const consensus = require('../Protocol/consensus');
const encoding = require('../Utils/encoding');
const TX = require('../Transcation/tx');
const Block = require('./block');
const Script = require('../script/script');
const Network = require("../Protocol/network")
const {MetaInfo} = require('../Infos/Info');
const { VerifyError } = require('../Protocol/errors');
const assert = require("assert")

const ChainCommon = require("../Chain/common")


function createGenesisBlock(options, systemKeyring) {
    const block = new Block({
        version: options.version,
        prevBlock: encoding.NULL_HASH,
        time: options.time,
        merkleRoot: "",
        height: 0
    });

    for (const metaInfo of options.metas) {
        let info = new MetaInfo(metaInfo.pubkey, metaInfo.number);
        let dataTX = TX.createDataTX(info.toRaw(), systemKeyring);
        block.txs.push(dataTX);
    }

    block.makeMerkleRoot();

    block.signCreator(systemKeyring, 0);

    return block;
}

/**
* Create a block template (without a lock).
* @method
* @private
* @param {ChainEntry?} tip
* @param {Address?} address
* @returns {Promise} - Returns {@link BlockTemplate}.
*/

async function createBlock(prevHeader, headerChain, network) {
    network = (network) ? network : Network.get();

    const mtp = await headerChain.getMedianTime(prevHeader);
    const time = Math.max(network.now(), mtp + 1);
    const block = new Block({
        version: prevHeader.version,
        prevBlock: prevHeader.hash('hex'),
        merkleRoot: "",
        time: time,
        height: prevHeader.height + 1,
        mtp: mtp
    });

    return block;
};

/**
 * Represents the deployment state of the chain.
 * @alias module:blockchain.DeploymentState
 * @constructor
 * @property {VerifyFlags} flags
 * @property {LockFlags} lockFlags
 * @property {Boolean} bip34
 */

function DeploymentState() {
    if (!(this instanceof DeploymentState))
        return new DeploymentState();

    this.flags = Script.flags.MANDATORY_VERIFY_FLAGS;
    this.flags &= ~Script.flags.VERIFY_P2SH;
    this.lockFlags = ChainCommon.lockFlags.MANDATORY_LOCKTIME_FLAGS;
    this.bip34 = false;
    this.bip91 = false;
    this.bip148 = false;
}

/**
 * Test whether p2sh is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasP2SH = function hasP2SH() {
    return (this.flags & Script.flags.VERIFY_P2SH) !== 0;
};

/**
 * Test whether bip34 (coinbase height) is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasBIP34 = function hasBIP34() {
    return this.bip34;
};

/**
 * Test whether bip66 (VERIFY_DERSIG) is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasBIP66 = function hasBIP66() {
    return (this.flags & Script.flags.VERIFY_DERSIG) !== 0;
};

/**
 * Test whether cltv is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasCLTV = function hasCLTV() {
    return (this.flags & Script.flags.VERIFY_CHECKLOCKTIMEVERIFY) !== 0;
};

/**
 * Test whether median time past locktime is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasMTP = function hasMTP() {
    return (this.lockFlags & ChainCommon.lockFlags.MEDIAN_TIME_PAST) !== 0;
};

/**
 * Test whether csv is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasCSV = function hasCSV() {
    return (this.flags & Script.flags.VERIFY_CHECKSEQUENCEVERIFY) !== 0;
};

/**
 * Test whether segwit is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasWitness = function hasWitness() {
    return (this.flags & Script.flags.VERIFY_WITNESS) !== 0;
};

/**
 * Test whether bip91 is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasBIP91 = function hasBIP91() {
    return this.bip91;
};

/**
 * Test whether bip148 is active.
 * @returns {Boolean}
 */

DeploymentState.prototype.hasBIP148 = function hasBIP148() {
    return this.bip148;
};

/**
 * Check all deployments on a chain, ranging from p2sh to segwit.
 * @param {Number} time
 * @param {ChainEntry} prev
 * @returns {Promise} - Returns {@link DeploymentState}.
 */

function getDeployments(time, prev) {
    const state = new DeploymentState();

    state.flags |= Script.flags.VERIFY_P2SH;

    state.bip34 = true;

    state.flags |= Script.flags.VERIFY_DERSIG;

    state.flags |= Script.flags.VERIFY_CHECKLOCKTIMEVERIFY;

    state.flags |= Script.flags.VERIFY_CHECKSEQUENCEVERIFY;
    state.lockFlags |= ChainCommon.lockFlags.VERIFY_SEQUENCE;
    state.lockFlags |= ChainCommon.lockFlags.MEDIAN_TIME_PAST;

    state.flags |= Script.flags.VERIFY_WITNESS;
    state.flags |= Script.flags.VERIFY_NULLDUMMY;

    state.bip91 = true;

    state.bip148 = true;

    return state;
};

/**
 * Contextual verification for a block, including
 * version deployments (IsSuperMajority), versionbits,
 * coinbase height, finality checks.
 * @private
 * @param {Block} block
 * @param {ChainEntry} prev
 * @param {Number} flags
 * @returns {Promise} - Returns {@link DeploymentState}.
 */

async function verify(block, prev, headerChain, flags) {
    assert(typeof flags === 'number');

    // Extra sanity check.
    if (block.prevBlock !== prev.hash('hex'))
        throw new VerifyError(block, 'invalid', 'bad-prevblk', 0);

    // Non-contextual checks.
    if (flags & ChainCommon.flags.VERIFY_BODY) {
        const [valid, reason, score] = block.checkBody();

        if (!valid)
            throw new VerifyError(block, 'invalid', reason, score, true);
    }

    // Ensure the timestamp is correct.
    const mtp = await headerChain.getMedianTime(prev);

    if (block.time <= mtp) {
        throw new VerifyError(block,
            'invalid',
            'time-too-old',
            0);
    }

    // Check timestamp against adj-time+2hours.
    // If this fails we may be able to accept
    // the block later.
    let network = Network.get()
    if (block.time > network.now() + 2 * 60 * 60) {
        throw new VerifyError(block,
            'invalid',
            'time-too-new',
            0,
            true);
    }

    // Calculate height of current block.
    const height = prev.height + 1;

    // Get the new deployment state.
    const state = getDeployments(block.time, prev);

    // Get timestamp for tx.isFinal().
    const time = state.hasMTP() ? mtp : block.time;

    // Transactions must be finalized with
    // regards to nSequence and nLockTime.
    for (const tx of block.txs) {
        if (!tx.isFinal(height, time)) {
            throw new VerifyError(block,
                'invalid',
                'bad-txns-nonfinal',
                10);
        }
    }

    // Check the commitment hash for segwit.
    let commit = null;
    if (state.hasWitness()) {
        commit = block.getCommitmentHash();
        if (commit) {
            // These are totally malleable. Someone
            // may have even accidentally sent us
            // the non-witness version of the block.
            // We don't want to consider this block
            // "invalid" if either of these checks
            // fail.
            if (!block.getWitnessNonce()) {
                throw new VerifyError(block,
                    'invalid',
                    'bad-witness-nonce-size',
                    100,
                    true);
            }

            if (!commit.equals(block.createCommitmentHash())) {
                throw new VerifyError(block,
                    'invalid',
                    'bad-witness-merkle-match',
                    100,
                    true);
            }
        }
    }

    // Blocks that do not commit to
    // witness data cannot contain it.
    if (!commit) {
        if (block.hasWitness()) {
            throw new VerifyError(block,
                'invalid',
                'unexpected-witness',
                100,
                true);
        }
    }

    return state;
};

/**
 * Check block transactions for all things pertaining
 * to inputs. This function is important because it is
 * what actually fills the coins into the block. This
 * function will check the block reward, the sigops,
 * the tx values, and execute and verify the scripts (it
 * will attempt to do this on the worker pool). If
 * `checkpoints` is enabled, it will skip verification
 * for historical data.
 * @private
 * @see TX#verifyInputs
 * @see TX#verify
 * @param {Block} block
 * @param {ChainEntry} prev
 * @param {DeploymentState} state
 * @returns {Promise} - Returns {@link CoinView}.
 */

function verifyInputs(block, prev, state, coinview) {
    const height = prev.height + 1;

    let sigops = 0;
    let reward = 0;

    // Check all transactions
    for (let i = 0; i < block.txs.length; i++) {
        const tx = block.txs[i];

        // TODO: Ensure tx is not double spending an output.
        

        // Verify sequence locks.

        // Count sigops (legacy + scripthash? + witness?)
        sigops += tx.getSigopsCost(coinview, state.flags);

        if (sigops > consensus.MAX_BLOCK_SIGOPS_COST) {
            throw new VerifyError(block,
                'invalid',
                'bad-blk-sigops',
                100);
        }

        // Contextual sanity checks.
        if (i > 0) {
            const [fee, reason, score] = tx.checkInputs(coinview, height);

            if (fee === -1) {
                throw new VerifyError(block,
                    'invalid',
                    reason,
                    score);
            }

            reward += fee;

            if (reward > consensus.MAX_MONEY) {
                throw new VerifyError(block,
                    'invalid',
                    'bad-cb-amount',
                    100);
            }
        }
    }

    // Push onto verification queue.
    for (let i = 1; i < block.txs.length; i++) {
        if (!block.txs[i].verify(coinview, state.flags)) {
            throw new VerifyError(block,
                'invalid',
                'mandatory-script-verify-flag-failed',
                100);
        }
    }

    return coinview;
};

/**
 * Perform all necessary contextual verification on a block.
 * @private
 * @param {Block} block
 * @param {ChainEntry} prev
 * @param {Number} flags
 * @returns {Promise} - Returns {@link ContextResult}.
 */

async function verifyContext(block, prev, headerChain, coinview, flags) {
    // Initial non-contextual verification.
    const state = await verify(block, prev, headerChain, flags);

    // Verify scripts, spend and add coins.
    const view = verifyInputs(block, prev, state, coinview);

    return [view, state];
};

async function verifyBlock(block, headerChain, coinview) {

    try {
        let prevHeader = headerChain.getHeaderByHeight(block.height - 1);
        if (!prevHeader) {
            return false;
        }
        let flags = ChainCommon.flags.DEFAULT_FLAGS & ~ChainCommon.flags.VERIFY_POW;
        await verifyContext(block, prevHeader, headerChain, coinview, flags);
    } catch (e) {
        if (e.type === 'VerifyError') {
            return false;
        }
        throw e;
    }
    return true;
}

exports.createGenesisBlock = createGenesisBlock
exports.createBlock = createBlock
exports.verifyBlock = verifyBlock
module.exports = exports;

/*
let genesisBlock = BlockUtils.createGenesisBlock({
    version: 1,
    time: 1512318380,
    bits: 0,
    nonce: 0,
    key:Buffer.from(config.systemPubKey, "hex")
  })
*/