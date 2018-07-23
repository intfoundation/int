const consensus = require('../Protocol/consensus');
const assert = require("assert")
const common = require('./common');
const Header = require('../Block/headers');
const thresholdStates = common.thresholdStates;

class HeaderChain {

    //表示整条链的header
    constructor(db) {
        this.nowHeight = -1;
        this.m_db = db;
    }

    isEmpty() {
        return this.nowHeight === -1;
    }

    async init() {
        let maxHeight = await this.m_db.getHeight();
        if (maxHeight) {
            this.nowHeight = maxHeight;
        }
        return;
    }

    /**
     * Compute the version for a new block (BIP9: versionbits).
     * @see https://github.com/bitcoin/bips/blob/master/bip-0009.mediawiki
     * @param {ChainEntry} header - Previous chain entry (usually the tip).
     * @returns {Promise} - Returns Number.
     */

    async computeBlockVersion(header) {
        let version = 0;

        for (const deployment of this.network.deploys) {
            const state = await this.getState(header, deployment);

            if (state === thresholdStates.LOCKED_IN
                || state === thresholdStates.STARTED) {
                version |= 1 << deployment.bit;
            }
        }

        version |= consensus.VERSION_TOP_BITS;
        version >>>= 0;

        return version;
    }

    /**
     * Get chain entry state for a deployment (BIP9: versionbits).
     * @example
     * await chain.getState(tip, deployments.segwit);
     * @see https://github.com/bitcoin/bips/blob/master/bip-0009.mediawiki
     * @param {ChainEntry} prev - Previous chain entry.
     * @param {String} id - Deployment id.
     * @returns {Promise} - Returns Number.
     */

    async getState(prev, deployment) {
        const bit = deployment.bit;

        let window = this.network.minerWindow;
        let threshold = this.network.activationThreshold;

        if (deployment.threshold !== -1)
            threshold = deployment.threshold;

        if (deployment.window !== -1)
            window = deployment.window;

        if (((prev.height + 1) % window) !== 0) {
            const height = prev.height - ((prev.height + 1) % window);

            prev = await this.getHeaderByHeight(height);

            if (!prev)
                return thresholdStates.DEFINED;

            assert(prev.height === height);
            assert(((prev.height + 1) % window) === 0);
        }

        let entry = prev;
        let state = thresholdStates.DEFINED;

        const compute = [];

        while (entry) {
            const time = this.getMedianTime(entry);

            if (time < deployment.startTime) {
                state = thresholdStates.DEFINED;
                break;
            }

            compute.push(entry);

            const height = entry.height - window;

            entry = await this.getHeaderByHeight(height);
        }

        while (compute.length) {
            const entry = compute.pop();

            switch (state) {
                case thresholdStates.DEFINED: {
                    const time = await this.getMedianTime(entry);

                    if (time >= deployment.timeout) {
                        state = thresholdStates.FAILED;
                        break;
                    }

                    if (time >= deployment.startTime) {
                        state = thresholdStates.STARTED;
                        break;
                    }

                    break;
                }
                case thresholdStates.STARTED: {
                    const time = await this.getMedianTime(entry);

                    if (time >= deployment.timeout) {
                        state = thresholdStates.FAILED;
                        break;
                    }

                    let block = entry;
                    let count = 0;

                    for (let i = 0; i < window; i++) {
                        if (block.hasBit(bit))
                            count++;

                        if (count >= threshold) {
                            state = thresholdStates.LOCKED_IN;
                            break;
                        }

                        block = await this.getPrevHeader(block);
                        assert(block);
                    }

                    break;
                }
                case thresholdStates.LOCKED_IN: {
                    state = thresholdStates.ACTIVE;
                    break;
                }
                case thresholdStates.FAILED:
                case thresholdStates.ACTIVE: {
                    break;
                }
                default: {
                    assert(false, 'Bad state.');
                    break;
                }
            }
        }

        return state;
    }

    async getPrevHeader(header) {
        let cache = await this.m_db.getHeaderByHash(header.prevBlock);
        if (cache) {
            return Header.fromRaw(cache);
        }
        return null;
    }

    async getHeaderByHeight(height) {
        let cache = await this.m_db.getHeaderByHeight(height);
        if (cache) {
            return Header.fromRaw(cache);
        }
        return null;
    }

    async getLatestHeader() {
        return this.getHeaderByHeight(this.nowHeight);
    }

    //取前11个块的中位数块的创建时间
    async getMedianTime(header, time) {
        let timespan = 11;

        const median = [];

        // In case we ever want to check
        // the MTP of the _current_ block
        // (necessary for BIP148).
        if (time != null) {
            median.push(time);
            timespan -= 1;
        }

        let entry = header;

        for (let i = 0; i < timespan && entry; i++) {
            median.push(entry.time);

            entry = await this.getPrevHeader(entry);
        }

        median.sort(cmp);

        return median[median.length >>> 1];
    }

    async addHeader(header) {
        if (header.height === this.nowHeight + 1) {
            if (header.height !== 0) {
                let latestHeader = await this.getLatestHeader();
                if (header.prevBlock !== latestHeader.hash('hex')) {
                    console.log('error header, ignore it');
                    return false;
                }
            }

            this.nowHeight = header.height;
            await this.m_db.setHeader(header);
            return true;
        } else {
            console.log(`drop header(height ${header.height}), current ${this.nowHeight}`);
            return false;
        }
    }

    async getHeadersRaw(start, len) {
        if (start > this.nowHeight || len < 1) {
            return null;
        }
        if (start < 0) {
            start = 0;
        }
        let end = start + len - 1;
        if (end > this.nowHeight) {
            end = this.nowHeight;
            len = end - start + 1;
        }

        let headerSize = Header.getSize();
        let buf = new Buffer(len*headerSize);
        let offset = 0;
        for (let index = start; index <= end; index++) {
            let header = await this.getHeaderByHeight(index);
            header.toRaw().copy(buf, offset);
            offset += headerSize;
        }

        return buf;
    }

    getNowHeight() {
        return this.nowHeight;
    }
}
/*
 * Helpers
 */

function cmp(a, b) {
    return a - b;
}

module.exports = HeaderChain;