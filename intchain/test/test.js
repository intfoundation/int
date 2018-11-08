"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const path = require("path");
const assert = require('assert');
const core_1 = require("../../src/core");
process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});
describe('token', () => {
    const logger = core_1.initLogger({ loggerOptions: { console: true } });
    let session;
    before((done) => {
        async function __test() {
            const mdr = await core_1.createValueDebuger(core_1.initChainCreator({ logger }), path.join(__dirname, '../chain'));
            assert(!mdr.err, 'createValueMemoryDebuger failed', core_1.stringifyErrorCode(mdr.err));
            const debuger = mdr.debuger;
            session = debuger.createIndependSession();
            assert(!(await session.init({ height: 0, accounts: 4, coinbase: 0, interval: 10, preBalance: new core_1.BigNumber(100000) })), 'init session failed');
        }
        __test().then(done);
    });
    it('wage', (done) => {
        async function __test() {
            assert(!(await session.wage()).err, 'wage error');
            const gbr = await session.view({ method: 'getBalance', params: { address: session.getAccount(0) } });
            assert(!gbr.err, 'getBalance failed error');
            assert(gbr.value.eq(100001), `wage value error, actual ${gbr.value.toString()}`);
        }
        __test().then(done);
    });
    it('transferTo', (done) => {
        async function __test() {
            let acc0Balance = (await session.view({ method: 'getBalance', params: { address: session.getAccount(0) } })).value;
            let acc1Balance = (await session.view({ method: 'getBalance', params: { address: session.getAccount(1) } })).value;
            assert(!(await session.transaction({ caller: 0, method: 'transferTo', input: { to: session.getAccount(1) }, value: new core_1.BigNumber(10), fee: new core_1.BigNumber(1) })).err, 'transferTo failed');
            let gbr = await session.view({ method: 'getBalance', params: { address: session.getAccount(0) } });
            assert(gbr.value.eq(acc0Balance.minus(10)), `0 balance value err, actual ${gbr.value.toString()}, except ${acc0Balance.minus(10)}`);
            gbr = await session.view({ method: 'getBalance', params: { address: session.getAccount(1) } });
            assert(gbr.value.eq(acc1Balance.plus(10)), `1 balance value err, actual ${gbr.value.toString()}, except ${acc1Balance.plus(10)}`);
        }
        __test().then(done);
    });
    it('token', (done) => {
        async function __test() {
            let terr = await session.transaction({
                caller: 0,
                method: 'createToken',
                input: {
                    tokenid: 'token1',
                    preBalances: [
                        { address: session.getAccount(0), amount: '1000000' }
                    ]
                },
                value: new core_1.BigNumber(0),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && !terr.receipt.returnCode, `createToken failed. ${terr.err}`);
            terr = await session.transaction({
                caller: 0,
                method: 'createToken',
                input: {
                    tokenid: 'token1',
                    preBalances: [
                        { address: session.getAccount(0), amount: '1000000' }
                    ]
                },
                value: new core_1.BigNumber(0),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && terr.receipt.returnCode === core_1.ErrorCode.RESULT_ALREADY_EXIST, ` reCreateToken failed. ${terr.err}`);
            terr = await session.transaction({
                caller: 0,
                method: 'createToken',
                input: {
                    tokenid: 'token2',
                    preBalances: [
                        { address: session.getAccount(0), amount: '2000000' }
                    ]
                },
                value: new core_1.BigNumber(0),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && !terr.receipt.returnCode, `createToken2 failed. ${terr.err}`);
            let gbr = await session.view({ method: 'getTokenBalance', params: { tokenid: 'token1', address: session.getAccount(0) } });
            assert(gbr.value.eq(1000000), `0 Token balance value err, actual ${gbr.value}`);
            terr = await session.transaction({
                caller: 0,
                method: 'transferTokenTo',
                input: {
                    tokenid: 'token1',
                    to: session.getAccount(1),
                    amount: 100
                },
                value: new core_1.BigNumber(0),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && !terr.receipt.returnCode, `transferTokenTo failed. ${terr.err}`);
            gbr = await session.view({ method: 'getTokenBalance', params: { tokenid: 'token1', address: session.getAccount(0) } });
            assert(gbr.value.eq(1000000 - 100), `0 Token balance value err, actual ${gbr.value}`);
            gbr = await session.view({ method: 'getTokenBalance', params: { tokenid: 'token1', address: session.getAccount(1) } });
            assert(gbr.value.eq(100), '1 Token balance value err, actual ${gbr.value}');
        }
        __test().then(done);
    });
    it('bid', (done) => {
        async function __test() {
            // 发布bid
            let terr = await session.transaction({
                caller: 0,
                method: 'publish',
                input: {
                    name: 'goods1',
                    duation: 5,
                    lowest: new core_1.BigNumber(10)
                },
                value: new core_1.BigNumber(0),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && !terr.receipt.returnCode, `publishGood failed. ${terr.err}`);
            terr = await session.transaction({
                caller: 0,
                method: 'publish',
                input: {
                    name: 'goods1',
                    duation: 100,
                    lowest: new core_1.BigNumber(100)
                },
                value: new core_1.BigNumber(0),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && terr.receipt.returnCode === core_1.ErrorCode.RESULT_ALREADY_EXIST, `rePublishGood failed. ${terr.err}`);
            terr = await session.transaction({
                caller: 1,
                method: 'bid',
                input: {
                    name: 'goods1',
                },
                value: new core_1.BigNumber(11),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && !terr.receipt.returnCode, `BidGood failed. ${terr.err}`);
            let gbr = await session.view({ method: 'GetBidInfo', params: { name: 'goods1' } });
            assert(gbr.value.bidder === session.getAccount(1), `check bidder failed, except ${session.getAccount(1)}, actual ${gbr.value.bidder}`);
            assert(gbr.value.bidvalue.eq(11), `check biddervalue failed, except 11, actual ${gbr.value.bidvalue.toString()}`);
            terr = await session.transaction({
                caller: 2,
                method: 'bid',
                input: {
                    name: 'goods1',
                },
                value: new core_1.BigNumber(11),
                fee: new core_1.BigNumber(1)
            });
            assert(!terr.err && terr.receipt.returnCode === core_1.ErrorCode.RESULT_NOT_ENOUGH, `BidGood2 failed. ${terr.err}`);
            await session.updateHeightTo(6, 0, true);
            gbr = await session.view({ method: 'GetBidInfo', params: { name: 'goods1' } });
            assert(gbr.value.owner === session.getAccount(1), `check owner failed, except ${session.getAccount(1)}, actual ${gbr.value.owner}`);
            assert(gbr.value.value.eq(11), `check value failed, except 11, actual ${gbr.value.value.toString()}`);
        }
        __test().then(done);
    });
});
