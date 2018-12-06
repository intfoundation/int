"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../../../src/client");
const txPendingChecker = require("../../../src/core/chain/tx_pending_checker");
const core_1 = require("../../../src/core");
function registerHandler(handler) {
    handler.addViewMethod('getBalance', async (context, params) => {
        return await context.getBalance(params.address);
    });
    // handler.addViewMethod('isMiner', async (context: DbftViewContext, params: any): Promise<boolean> => {
    //     return await context.isMiner(params.address);
    // });
    handler.addTX('transferTo', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.transferTo(params.to, context.value);
    }, txPendingChecker.transferToChecker);
    handler.addTX('register', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.register(context.caller);
    }, txPendingChecker.registerChecker);
    // handler.addTX('unregister', async (context: DbftTransactionContext, params: any): Promise<ErrorCode> => {
    //     let err = context.cost(context.totallimit.times(context.price));
    //     if (err) {
    //         return err;
    //     }
    //     return await context.unregister(context.caller, params.address);
    // });
    handler.addTX('mortgage', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.mortgage(context.caller, new client_1.BigNumber(params.amount));
    }, txPendingChecker.mortgageChecker);
    handler.addTX('unmortgage', async (context, params) => {
        let errC = context.cost(context.totallimit.times(context.price));
        if (errC) {
            return errC;
        }
        let err = await context.transferTo(context.caller, new client_1.BigNumber(params.amount));
        if (err) {
            return err;
        }
        return await context.unmortgage(context.caller, new client_1.BigNumber(params.amount));
    }, txPendingChecker.unmortgageChecker);
    handler.addTX('vote', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        return await context.vote(context.caller, params.candidates);
    }, txPendingChecker.voteChecker);
    handler.addViewMethod('getVote', async (context, params) => {
        console.log(`dbft getVote`);
        return await context.getVote();
    });
    handler.addViewMethod('getStake', async (context, params) => {
        return await context.getStake(params.address);
    });
    handler.addViewMethod('getCandidates', async (context, params) => {
        return await context.getCandidates();
    });
    handler.addViewMethod('getMiners', async (context, params) => {
        return await context.getMiners();
    });
    async function getTokenBalance(balanceKv, address) {
        let retInfo = await balanceKv.get(address);
        return retInfo.err === client_1.ErrorCode.RESULT_OK ? retInfo.value : new client_1.BigNumber(0);
    }
    handler.addTX('createToken', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let kvRet = await context.storage.createKeyValue(params.tokenid);
        if (kvRet.err) {
            return kvRet.err;
        }
        await kvRet.kv.set('creator', context.caller);
        await kvRet.kv.set(context.caller, new client_1.BigNumber(params.amount));
        await kvRet.kv.set('contract', params.tokenid);
        await kvRet.kv.set('supply', new client_1.BigNumber(params.amount));
        await kvRet.kv.set('name', params.name);
        await kvRet.kv.set('symbol', params.symbol);
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.createTokenChecker);
    handler.addTX('transferTokenTo', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget('freeze', context.caller);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let toInfo = await tokenkv.kv.hget('freeze', params.to);
        if (toInfo.err === client_1.ErrorCode.RESULT_OK && toInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (toInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let fromTotal = await getTokenBalance(tokenkv.kv, context.caller);
        let amount = new client_1.BigNumber(params.amount);
        if (fromTotal.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        await (tokenkv.kv.set(context.caller, fromTotal.minus(amount)));
        await (tokenkv.kv.set(params.to, (await getTokenBalance(tokenkv.kv, params.to)).plus(amount)));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferTokenToChecker);
    /**
     * 转移其它地址的 tokens
     */
    handler.addTX('transferFrom', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let amount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let fromInfo = await tokenkv.kv.hget('freeze', params.from);
        if (fromInfo.err === client_1.ErrorCode.RESULT_OK && fromInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (fromInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let toInfo = await tokenkv.kv.hget('freeze', params.to);
        if (toInfo.err === client_1.ErrorCode.RESULT_OK && toInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (toInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let callerInfo = await tokenkv.kv.hget('freeze', context.caller);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let callerApproval = await tokenkv.kv.hget('approval', params.from);
        if (callerApproval.err !== client_1.ErrorCode.RESULT_OK) {
            return callerApproval.err;
        }
        let callerMap = core_1.MapFromObject(callerApproval.value);
        if (callerMap.get(context.caller).lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let fromBalance = await getTokenBalance(tokenkv.kv, params.from);
        if (fromBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let toBalance = await getTokenBalance(tokenkv.kv, params.to);
        callerMap.set(context.caller, callerMap.get(context.caller).minus(amount));
        await tokenkv.kv.hset('approval', params.from, core_1.MapToObject(callerMap));
        await tokenkv.kv.set(params.from, fromBalance.minus(amount));
        await tokenkv.kv.set(params.to, toBalance.plus(amount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferFromChecker);
    /**
     * 授权
     */
    handler.addTX('approve', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let spender = params.spender;
        let amount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let senderBalance = await getTokenBalance(tokenkv.kv, context.caller);
        if (senderBalance.lt(amount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        let senderApproval = await tokenkv.kv.hget('approval', context.caller);
        if (senderApproval.err === client_1.ErrorCode.RESULT_OK) {
            let senderMap = core_1.MapFromObject(senderApproval.value);
            senderMap.set(spender, senderMap.get(spender).plus(amount));
            let senderObj = core_1.MapToObject(senderMap);
            await tokenkv.kv.hset('approval', context.caller, senderObj);
        }
        else if (senderApproval.err === client_1.ErrorCode.RESULT_NOT_FOUND) {
            let approvalMap = new Map();
            approvalMap.set(spender, amount);
            let approvalObj = core_1.MapToObject(approvalMap);
            await tokenkv.kv.hset('approval', context.caller, approvalObj);
        }
        else {
            return senderApproval.err;
        }
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.approveChecker);
    /**
     * 冻结帐户
     */
    handler.addTX('freezeAccount', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let freeze = params.freeze;
        let freezeAddress = params.freezeAddress;
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.get('creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        if (owner !== context.caller) {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        await tokenkv.kv.hset('freeze', freezeAddress, freeze);
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.freezeAccountChecker);
    /**
     * 燃烧
     */
    handler.addTX('burn', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let burnAmount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let callerInfo = await tokenkv.kv.hget('freeze', context.caller);
        if (callerInfo.err === client_1.ErrorCode.RESULT_OK && callerInfo.value === true) {
            return client_1.ErrorCode.RESULT_IS_FROZEN;
        }
        else if (callerInfo.err === client_1.ErrorCode.RESULT_EXCEPTION) {
            return client_1.ErrorCode.RESULT_EXCEPTION;
        }
        let totalSupply = await tokenkv.kv.get('supply');
        let callerBalance = await getTokenBalance(tokenkv.kv, context.caller);
        if (totalSupply.err !== client_1.ErrorCode.RESULT_OK) {
            return totalSupply.err;
        }
        if (callerBalance.lt(burnAmount)) {
            return client_1.ErrorCode.RESULT_NOT_ENOUGH;
        }
        await tokenkv.kv.set('supply', totalSupply.value.minus(burnAmount));
        await tokenkv.kv.set(context.caller, callerBalance.minus(burnAmount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.burnChecker);
    /**
     * 铸币
     */
    handler.addTX('mintToken', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let mintAmount = new client_1.BigNumber(params.amount);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.get('creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        if (owner !== context.caller) {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        let totalSupply = await tokenkv.kv.get('supply');
        let ownerBalance = await getTokenBalance(tokenkv.kv, owner);
        if (totalSupply.err !== client_1.ErrorCode.RESULT_OK) {
            return totalSupply.err;
        }
        await tokenkv.kv.set('supply', totalSupply.value.plus(mintAmount));
        await tokenkv.kv.set(owner, ownerBalance.plus(mintAmount));
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.mintTokenChecker);
    /**
     * 转移权限
     */
    handler.addTX('transferOwnership', async (context, params) => {
        let err = context.cost(context.totallimit.times(context.price));
        if (err) {
            return err;
        }
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }
        let ret = await tokenkv.kv.get('creator');
        if (ret.err !== client_1.ErrorCode.RESULT_OK) {
            return ret.err;
        }
        let owner = ret.value;
        let newOwner = params.newOwner;
        if (owner === context.caller) {
            await tokenkv.kv.set('creator', newOwner);
        }
        else {
            return client_1.ErrorCode.RESULT_NO_PERMISSIONS;
        }
        return client_1.ErrorCode.RESULT_OK;
    }, txPendingChecker.transferOwnershipChecker);
    /**
     * 获取 token 总量
     */
    handler.addViewMethod('getTokenTotalSupply', async (context, params) => {
        let balancekv = await context.storage.getReadableKeyValue(params.tokenid);
        let retInfo = await balancekv.kv.get('supply');
        return retInfo.err === client_1.ErrorCode.RESULT_OK ? retInfo.value : new client_1.BigNumber(0);
    });
    handler.addViewMethod('getTokenBalance', async (context, params) => {
        let balancekv = await context.storage.getReadableKeyValue(params.tokenid);
        return await getTokenBalance(balancekv.kv, params.address);
    });
}
exports.registerHandler = registerHandler;
