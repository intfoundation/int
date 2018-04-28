//account_node是一种必须绑定有效的Account才能工作的Node，由BlockNode派生，派生出SuperNode和MinerNode
const BlockNode = require('./block_node');
const KeyRing = require('../../chainlib/Account/keyring');
const assert = require('assert');
const DPackage = require('./package');

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
        this.dBFTingFilter = {};
    }

    //根据拜占庭共识的类型来确定需要过滤的节点
    _setFilterByBftType(type, filter) {
        if (filter) {
            this.dBFTingFilter[type.toString()] = filter;
        }
    }
    /*
    type:进行拜占庭共识的类型
    sig:内容的标识
    peerid:发起共识的节点，如果为空或者null，表示自己
    way:'complete'|'simplify' complete表示进行完整的拜占庭共识;simplify表示进行简化的，不需要远端的节点再去和其他节点确认，只需要回复
    data：共识的数据 
    */
    _beginBFTEx(type, sig, peerid, way, data) {
        //console.log(this.m_address.toString()+" have conn count="+this.m_conns.size.toString());
        if (!peerid || peerid === "") {
            peerid = this.m_address.toString();
        }
        let key = sig + peerid;
        if (!this.dBFTingEx.has(key)) {
            this.dBFTingEx.set(key, { agreeCount: 0,peerid:peerid,totalCount:0,data:data});    
        }
        if (this.dBFTingEx.get(key).sended) {
            return;
        }
        let info = this.dBFTingEx.get(key);
        info.sended = true;
        info.agreeCount++;
        info.peerid = peerid;
        info.data = data;

        let filter = null;
        if (type.toString() in this.dBFTingFilter) {
            filter = this.dBFTingFilter[type.toString()];
        }

        let newFilter = (conn) => {
            if (filter && !filter(conn)) {
                //console.log(this.m_address.toString()+" not send to "+conn.remote.peerid.toString());
                return false;
            }

            //不广播给发送者
            if (conn.remote.peerid === peerid) {
                //console.log(this.m_address.toString()+" not send to=== "+conn.remote.peerid.toString()+" faqi peerid="+peerid.toString());
                return false;
            }

            //console.log(this.m_address.toString()+" send to "+conn.remote.peerid.toString());

            return true
        };

        let nCount = this._broadcast(DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.dbft }, { type: type, sig: sig, peerid: peerid, way: way }, data.length).writeData(data), -1
            , newFilter, null);
        if(way === "simplify") {
            this.dBFTingEx.get(key).totalCount = nCount+1;//1表示自己
        }else {
            if(peerid ===this.m_address.toString()) {//共识发起者
                this.dBFTingEx.get(key).totalCount = nCount+1;//1表示自己
                //console.log(this.m_address.toString()+" send finish === count="+(nCount+1).toString()+" faqi="+peerid.toString());
                let f= async ()=>{
                    await this._onBFTFinishEx(type,data); //发起者发送完了就应该直接触发结束流程
                    this.dBFTingEx.delete(key);
                };
                f();
            }
            else {
                this.dBFTingEx.get(key).totalCount = nCount+2;//1表示自己+1个表示先前收到的一个(也就是peerid)
                //console.log(this.m_address.toString()+" send finish count="+(nCount+2).toString()+" faqi="+peerid.toString());
            }
        }
    }

    async _onPkg(conn, pkg) {
        // let data = null;
        // if (pkg.data.length > 1) {
        //     data = Buffer.concat(pkg.data);
        // } else {
        //     data = pkg.data[0];
        // }
        let data = pkg.data[0];
        if (pkg.header.cmdType === DPackage.CMD_TYPE.dbft) {
            //console.log(this.m_address.toString()+" receive from "+conn.remote.peerid.toString());
            const [bRet, resp] = await this._onDBFTEx(pkg.body.type, data);
            if (bRet) {
                let key = pkg.body.sig + pkg.body.peerid;
                if (pkg.body.way === "complete") {
                    //只广播"将军"的消息
                    if (conn.remote.peerid === pkg.body.peerid) {
                        await this._beginBFTEx(pkg.body.type, pkg.body.sig, pkg.body.peerid, pkg.body.way, data)
                    }

                    let arg = this.dBFTingEx.get(key);
                    if (!arg) {
                        this.dBFTingEx.set(key, { agreeCount: 0,peerid:pkg.body.peerid,totalCount:0,data:data});    
                        arg = this.dBFTingEx.get(key);
                    }
                    arg.agreeCount = arg.agreeCount + 1; //认同收到的
                    if (arg.agreeCount === arg.totalCount) {
                        //console.log(this.m_address.toString() + " finish,agreeCount=" + arg.totalCount.toString() + " totalCount=" + arg.totalCount.toString());
                        await this._onBFTFinishEx(pkg.body.type, data)
                        this.dBFTingEx.delete(key);
                    }
                }

                if (pkg.body.way === "simplify") {
                    let body = { type: pkg.body.type, sig: pkg.body.sig, peerid: pkg.body.peerid, way: pkg.body.way }
                    DPackage.createStreamWriter({ cmdType: DPackage.CMD_TYPE.dbftResp }, body, resp.length).writeData(resp).bind(conn);
                    //await this._onBFTFinishEx(pkg.body.type,data)
                   // this.dBFTingEx.delete(key);
                }
            }
        }
        else if (pkg.header.cmdType === DPackage.CMD_TYPE.dbftResp) {
            const bRet = await this._onDBFTRespEx(pkg.body.type, data)
            if (bRet) {
                let key = pkg.body.sig + pkg.body.peerid;
                let arg = this.dBFTingEx.get(key);
                arg.agreeCount = arg.agreeCount + 1;
                if (arg.agreeCount === arg.totalCount) {
                    await this._onBFTFinishEx(pkg.body.type,arg.data)
                    this.dBFTingEx.delete(key);
                }
            }
        }
        else {
            //super._onPkg(conn, pkg);
        }
    }

    //返回true or false 表示同意协商的结果|不同意
    async _onDBFTEx(type,data) { }
    async _onDBFTRespEx(type,data) { }
    async _onBFTFinishEx(type,data) { }
}

module.exports = AccountNode;