'use strict';

// <TODO> 本模块主要是做一些防御性工作，减少因编码疏忽引入不必要的bug，暂时先不做；计划具体功能如下：
// 1.提供协议body部分属性检查(checkBody)
// 2.给协议body提供默认属性值(_fillDefaultBodyField)
// 3.避免协议body中包含多余的字段(get body())

class DHTPackageFindPeerReq extends DHTPackage {
    constructor(seq) {
        super(CommandType.FIND_PEER_REQ, seq);
        this.m_body = {
            taskid: undefined,
            target: undefined,
        };
    }

    checkBody() {
        super.checkBody();
        LOG_ASSERT(this.m_body && typeof this.m_body === 'object',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body:object) not filled.`);
        LOG_ASSERT(this.m_body.target && typeof this.m_body.target === 'string' && this.m_body.target.length > 0,
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.target:string) not filled.`);
        LOG_ASSERT(this.m_body.taskid && typeof this.m_body.taskid === 'number',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.taskid:number) not filled.`);
    }

    get body() {
        return {target: this.m_body.target};
    }
}

class DHTPackageFindPeerResp extends DHTPackage {
    constructor(seq) {
        super(CommandType.FIND_PEER_RESP, seq);
        this.m_body =  {
            taskid: undefined,
            r_nodes: null,
            n_nodes: null,
        };
    }

    checkBody() {
        super.checkBody();
        LOG_ASSERT(this.m_body && typeof this.m_body === 'object',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body:object) not filled.`);
        LOG_ASSERT(this.m_body.taskid && typeof this.m_body.taskid === 'number',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.taskid:number) not filled.`);
        if (this.m_body.r_nodes) {
            for (let peer of this.m_body.r_nodes) {
                super._checkPeer(peer);
            }
        }
        if (this.m_body.n_nodes) {
            for (let peer of this.m_body.n_nodes) {
                super._checkPeer(peer);
            }
        }
    }

    _fillDefaultBodyField() {
        if (!this.m_body.r_nodes) {
            this.m_body.r_nodes = [];
        }
        if (!this.m_body.n_nodes) {
            this.m_body.n_nodes = [];
        }
    }
}

class DHTPackageUpdateValueReq extends DHTPackage {
    constructor(seq) {
        super(CommandType.UPDATE_VALUE_REQ, seq);
        this.m_body = {
                tableName: undefined,
                key: undefined,
                value: undefined,
            };
    }

    checkBody() {
        super.checkBody();
        LOG_ASSERT(this.m_body && typeof this.m_body === 'object',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body:object) not filled.`);
        LOG_ASSERT(this.m_body.tableName && typeof this.m_body.tableName === 'string' && this.m_body.tableName.length > 0,
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.tableName:string) not filled.`);
        LOG_ASSERT(this.m_body.key && typeof this.m_body.key === 'string' && this.m_body.key.length > 0,
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.key:string) not filled.`);
        LOG_ASSERT(this.m_body.value
            && ((typeof this.m_body.value === 'string' && this.m_body.value.length > 0) || typeof this.m_body.value === 'object'),
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.value:string|object) not filled.`);
    }

    _fillDefaultBodyField() {
    }
}

class DHTPackageUpdateValueResp extends DHTPackage {
    constructor(seq) {
        super(CommandType.UPDATE_VALUE_RESP, seq);
        /*
        this.m_body = null;
        {
            'r_nodes': null,
            'n_nodes': null,
        };
        */
    }

    checkBody() {
        super.checkBody();
        if (this.m_body) {
            if (this.m_body.r_nodes) {
                for (let peer of this.m_body.r_nodes) {
                    super._checkPeer(peer);
                }
            }
            if (this.m_body.n_nodes) {
                for (let peer of this.m_body.n_nodes) {
                    super._checkPeer(peer);
                }
            }
        }
    }

    _fillDefaultBodyField() {
        if (!this.m_body.r_nodes) {
            this.m_body.r_nodes = [];
        }
        if (!this.m_body.n_nodes) {
            this.m_body.n_nodes = [];
        }
    }
}

class DHTPackageFindValueReq extends DHTPackage {
    constructor(seq) {
        super(CommandType.FIND_VALUE_REQ, seq);
        this.m_body = {
                flags: null,
                tableName: undefined,
                key: undefined,
            };
    }

    checkBody() {
        super.checkBody();
        LOG_ASSERT(this.m_body && typeof this.m_body === 'object',
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body:object) not filled.`);
        LOG_ASSERT(this.m_body.tableName && typeof this.m_body.tableName === 'string' && this.m_body.tableName.length > 0,
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.tableName:string) not filled.`);
        LOG_ASSERT(this.m_body.key && typeof this.m_body.key === 'string' && this.m_body.key.length > 0,
            `Package(${CommandType.toString(this.m_common.cmdType)}) field(body.key:string) not filled.`);
    }

    _fillDefaultBodyField() {
        if (!this.m_body.flags) {
            this.m_body.flags = 0;
        }
    }
}

class DHTPackageFindValueResp extends DHTPackage {
    constructor(seq) {
        super(CommandType.FIND_VALUE_RESP, seq);
        this.m_body = {
                // values: null,
                // r_nodes: null,
                // n_nodes: null,
            };
    }

    _fillDefaultBodyField() {
        if (!this.m_body.r_nodes) {
            this.m_body.r_nodes = [];
        }
        if (!this.m_body.n_nodes) {
            this.m_body.n_nodes = [];
        }
    }
}

class DHTPackagePingReq extends DHTPackage {
    constructor(seq) {
        super(CommandType.PING_REQ, seq);
    }
}

class DHTPackagePingResp extends DHTPackage {
    constructor(seq) {
        super(CommandType.PING_RESP, seq);
    }
}

class DHTPackageHoleCallReq extends DHTPackage {
    constructor(seq) {
        super(CommandType.HOLE_CALL_REQ, seq);
    }
}

/* 检查keyvalue合法性
keyValueArrayToMap(keyValueArray) {
    let keyValueMap = null;
    let argValid = false;
    if (typeof keyValueArray === 'object' && typeof keyValueArray.length === 'number') {
        keyValueMap = new Map();
        if (keyValueArray.length > 0) {
            for (let i = 0; i < keyValueArray.length; i++) {
                let keyValue = keyValueArray[i];
                if (keyValue) {
                    let key = keyValue[0];
                    let value = keyValue[1];
                    if (typeof key === 'string' && key.length > 0 && key != DHTUtil.TOTAL_KEY
                        && value !== undefined && value !== null) {

                        keyValueMap.set(key, value);
                        argValid = true;
                    }
                }
            }
        } else if (keyValueArray.length === 0) {
            argValid = true;
        }
    }
    return argValid? keyValueMap : null;
}
*/