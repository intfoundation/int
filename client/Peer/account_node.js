//account_node是一种必须绑定有效的Account才能工作的Node，由BlockNode派生，派生出SuperNode和MinerNode
const BlockNode = require('./block_node');
const KeyRing = require('../../chainlib/Account/keyring');
const assert = require('assert');
const DPackage = require('./package');
const digest = require('../../chainlib/Crypto/digest');
const LockSimple = require('../../chainlib/Utils/LockSimple');

class AccountNode extends BlockNode {
    constructor(params) {
        assert(params.accountWif);
        const account = KeyRing.fromSecret(params.accountWif);
        assert(account, 'MUST input valid acountWIF!');
        const address = account.getAddress();
        // generate peerid from account when peerid is null
        if (!params.protocolConfig.peerid) {
            params.protocolConfig.peerid = address.toString();
        }

        super(params.protocolConfig);

        this.m_account = account;
        this.m_address = address;

        this.dBFTingEx = new Map();
        this.deletedBFTing = []; //已经处于删除状态的了
        this.dBFTingFilter = {};
        this.locklist = new Map();
        this.dBFingPeerids = [];

        setInterval(() => {
            while (true) {
                if (this.deletedBFTing.length === 0) {
                    break;
                }
                //删除后5s在清理，防止有些延迟返回
                if (Date.now() >= this.deletedBFTing[0].deleteTime + 10*1000) {
                    this.dBFTingEx.delete(this.deletedBFTing[0].key);
                    this.deletedBFTing.shift();
                } else {
                    break;
                }
            }
        }, 3000);
    }

    //根据拜占庭共识的类型来确定需要过滤的节点
    _setFilterByBftType(type, filter) {
        if (filter) {
            this.dBFTingFilter[type.toString()] = filter;
        }
    }

    updateBFTingPeerids(peerids) {
        this.dBFingPeerids = []
        this.dBFingPeerids = this.dBFingPeerids.concat(peerids);
    }

    deleteBFTing(key) {
        if (!this.dBFTingEx.has(key)) {
            return;
        }

        let info = this.dBFTingEx.get(key);
        if (info.delete === 1) {
            return ;
        }
        if (info['timerid'] && info['timerid'] !== 0) {
            clearTimeout(info['timerid']);
            info['timerid'] = 0;
        }

        info.delete = 1;
        this.deletedBFTing.push({key: key, deleteTime: Date.now()});
    }

    getLock(_type) {
        if (this.locklist.has(_type)) {
            return this.locklist.get(_type);
        }

        let lock = new LockSimple();
        this.locklist.set(_type,lock);
        return lock;
    }

    addConsensus(key, data, type,peerid,selfpeerid) {
        if (this.dBFTingEx.has(key)) {
            return;
        }

        let info = {selfpeerid: selfpeerid,noagreeCount: 0, agreeCount: 0,peerid:peerid,totalCount:0,data:data,type:type,key:key,peerids: new Map()};
        info.timerid = setTimeout(async () => {
            console.log('[account_node addConsensus] timeout,'+ this.m_address.toString() + ' finish,type='+info.type.toString()+' reulst=false key='+info.key.toString());
            this.deleteBFTing(key);
            await this._onBFTFinishEx(info.type, info.data,false);
        }, 3*1000);
        this.dBFTingEx.set(key, info);
        this.updatePeerlist(key, this.dBFingPeerids);
    }

    hasConsensus(key) {
        return this.dBFTingEx.has(key);
    }

    isSended(key) {
        return this.dBFTingEx.get(key).sended;
    }

    setSended(key) {
        this.dBFTingEx.get(key).sended = true;
    }

    acceptConsensus(key, peerid) {
        let info = this.dBFTingEx.get(key);
        if (peerid === info.selfpeerid && !info.peerids.has(peerid)) {
            info.peerids.set(peerid,'-1');
        }
        if (!info.peerids.has(peerid) || info.peerids.get(peerid) !== '-1'){
            return ;
        }
        info.peerids.set(peerid,'1');
        info.agreeCount++;
    }

    rejectConsensus(key, peerid) {
        let info = this.dBFTingEx.get(key);
        if (peerid === info.selfpeerid && !info.peerids.has(peerid)) {
            info.peerids.set(peerid,'-1');
        }
        if (!info.peerids.has(peerid) || info.peerids.get(peerid) !== '-1'){
            return ;
        }
        info.peerids.set(peerid,'0');
        info.noagreeCount++;
    }

    isDeletedConsensus(key) {
        let info = this.dBFTingEx.get(key);
        if (!info) {
            return true;
        }

        if (info.delete && info.delete === 1) {
            return true;
        }

        return false;
    }

    getOpinion(key,peerid) {
        let info = this.dBFTingEx.get(key);
        if (!info) {
            //console.log(`[account_node getOpinion] 1 key=${key},peerid=${peerid}`);
            return false;
        }

        if (!info.peerids.has(peerid) || info.peerids.get(peerid) === '-1'){
            //console.log(`[account_node getOpinion] 2 key=${key},peerid=${peerid}`);
            return false;
        }

        if (info.peerids.get(peerid) === '1') {
            //console.log(`[account_node getOpinion] 3 key=${key},peerid=${peerid}`);
            return true;
        }
        //console.log(`[account_node getOpinion] 4 key=${key},peerid=${peerid}`);
        return false;
    }

    /*return:[bFinish,bResult]
        bFinish:协商是否结束
        bResult:结果是否通过
    */
    checkConsensus(key) {
        let info = this.dBFTingEx.get(key);
        if (!info) {
            //console.log(`[account_node,checkConsensus] 1 key=${key}`);
            return [false,false];
        }

        if (info.totalCount === 0) {
            //表明已经删除了超时发来的
            return [true, false];
        }

        if (this.isDeletedConsensus(key)) {
            //console.log(`[account_node,checkConsensus] 2 key=${key}`);
            return [true,false];
        }

        let n = Math.ceil(info.totalCount*2/3); //三分之二
        if (info.agreeCount >= n) {
            //console.log(`[account_node,checkConsensus] 3 key=${key} total=${info.totalCount} agree=${info.agreeCount},noagree=${info.noagreeCount}`);
            return [true,true]
        }

        if (info.noagreeCount >= n) {
            console.log(`[account_node,checkConsensus] 4 key=${key} total=${info.totalCount} agree=${info.agreeCount},noagree=${info.noagreeCount}`);
            return [true,false];
        }

        if (info.totalCount === info.agreeCount + info.noagreeCount) {
            console.log(`[account_node,checkConsensus] 5 key=${key} total=${info.totalCount} agree=${info.agreeCount},noagree=${info.noagreeCount}`);
            return [true,false];
        }
        //console.log(`[account_node,checkConsensus] 6 key=${key} total=${info.totalCount} agree=${info.agreeCount},noagree=${info.noagreeCount}`);

        return [false,false];
    }

    updatePeerlist(key, peerlist) {
        let info = this.dBFTingEx.get(key);
        info.totalCount = peerlist.length;
        for (let peerid of peerlist) {
            if (!info.peerids.has(peerid)) {
                info.peerids.set(peerid,'-1');
            }
        }
    }

    getConsensusData(key) {
        let info = this.dBFTingEx.get(key);
        if (!info) {
            return null;
        }
        return info.data;
    }



    /*
    type:进行拜占庭共识的类型
    sig:内容的标识
    peerid:发起共识的节点，如果为空或者null，表示自己
    data：共识的数据
    */
    async _beginBFTEx(type, sig, peerid, data) {
        if (!peerid || peerid === "") {
            peerid = this.m_address.toString();
        }
        let selfAgree = true;
        if (peerid === this.peerid) {
            let [bRet, resp] = await this._onDBFTEx(type, data, this.peerid);
            selfAgree = bRet;
        }
        let key = digest.md5(sig).toString('hex') + peerid;
        console.log(`[account_node _beginBFTEx] key=${key}`);
        if (!this.dBFTingEx.has(key)) {
            this.addConsensus(key, data,type,peerid,this.peerid);
        }
        if (this.isSended(key)) {
            return;
        }
        this.setSended(key);

        let info = this.dBFTingEx.get(key);

        let filter = null;
        if (type.toString() in this.dBFTingFilter) {
            filter = this.dBFTingFilter[type.toString()];
        }

        let newFilter = (conn) => {
            if (filter && !filter(conn)) {
                //console.log(this.m_address.toString()+" not send to "+conn.remote.peerid.toString());
                return false;
            }

            if (!info.peerids.has(conn.remote.peerid)) {
                return false;
            }
            //不广播给发送者
            // if (conn.remote.peerid === peerid) {
            //     //console.log(this.m_address.toString()+" not send to=== "+conn.remote.peerid.toString()+" faqi peerid="+peerid.toString());
            //     return false;
            // }

            // console.log('[account_node _beginBFTEx]'+this.m_address.toString()+" send to "+conn.remote.peerid.toString()+' key='+key);

            return true
        };

        this._broadcast(DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.dbft }, { type: type, sig: sig, peerid: peerid}, data.length).writeData(data), -1
            , newFilter, null);
        if (selfAgree) {
            this.acceptConsensus(key, this.peerid);
        } else {
            this.rejectConsensus(key,this.peerid);
        }
        if (this.dBFingPeerids.length === 1) {
            this.deleteBFTing(key);
            console.log('[account_node _beginBFTEx]' + this.m_address.toString() + ' finish,type='+type.toString()+' reulst='+selfAgree.toString()+' key='+key.toString());
            await this._onBFTFinishEx(type, data,selfAgree);
        }
    }

    async _onPkg(conn, pkg) {
        let lock = this.getLock(pkg.body.type)
        await lock.enter();
        let data = pkg.data[0];
        let remotePeerid = conn.remote.peerid;
        if (pkg.header.cmdType === DPackage.CMD_TYPE.dbft) {
            let key = digest.md5(pkg.body.sig).toString('hex') + pkg.body.peerid;
            console.log('[account_node _onPkg DPackage.CMD_TYPE.dbft]' +this.m_address.toString()+' receive from '+remotePeerid.toString()+',type='+pkg.body.type.toString()+' key='+key);
            if (!this.hasConsensus(key)) {
                let [bRet, resp] = await this._onDBFTEx(pkg.body.type, data, remotePeerid);
                this.addConsensus(key, data, pkg.body.type, pkg.body.peerid,this.peerid);
                if (bRet) {
                    this.acceptConsensus(key,this.peerid);
                } else {
                    this.rejectConsensus(key,this.peerid);
                }
            }
            if (remotePeerid === pkg.body.peerid) {
                //只广播"将军"的消息
                await this._beginBFTEx(pkg.body.type, pkg.body.sig, pkg.body.peerid, data);
            }

            //回复conn.remote.peerid
            let bAgree = this.getOpinion(key,this.peerid);
            //console.log('[account_node _onPkg DPackage.CMD_TYPE.dbft]' +this.m_address.toString()+',ansert '+remotePeerid.toString()+',type='+pkg.body.type.toString()+',reulst='+bAgree.toString()+',key='+key);
            DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.dbftResp }, { type: pkg.body.type, sig: pkg.body.sig, peerid: pkg.body.peerid,result: bAgree?'1':'0'}, 0).bind(conn);
        }
        else if (pkg.header.cmdType === DPackage.CMD_TYPE.dbftResp) {
            let key = digest.md5(pkg.body.sig).toString('hex') + pkg.body.peerid;
            console.log('[account_node _onPkg DPackage.CMD_TYPE.dbftResp]' + this.m_address.toString() + ' receive from '+remotePeerid.toString()+',type='+pkg.body.type.toString()+',reulst='+pkg.body.result.toString()+',key='+key.toString());
            if (!this.hasConsensus(key) || this.isDeletedConsensus(key)) {
                await lock.leave();
                return;
            }
            assert(this.hasConsensus(key));
            if (pkg.body.result === '1') {
                this.acceptConsensus(key, remotePeerid);
            } else {
                this.rejectConsensus(key, remotePeerid);
            }
            let [bFinish,bResult] = this.checkConsensus(key);
            if (bFinish) {
                let data = this.getConsensusData(key);
                this.deleteBFTing(key);
                console.log('[account_node _onPkg DPackage.CMD_TYPE.dbftResp]' + this.m_address.toString() + ' finish,type='+pkg.body.type.toString()+' reulst='+bResult.toString()+' key='+key.toString());
                await this._onBFTFinishEx(pkg.body.type, data,bResult);
            }
        } else {
            //super._onPkg(conn, pkg);
        }
        await lock.leave();
    }

    //返回true or false 表示同意协商的结果|不同意
    async _onDBFTEx(type,data,fromPeerid) { }
    async _onDBFTRespEx(type,data) { }
    async _onBFTFinishEx(type,data,bSucc) { }
}

module.exports = AccountNode;