'use strict';

let BufferWriter = require('../Utils/writer');
let Reader = require('../Utils/reader');

class Info {
    constructor(type = Info.type.UNKNOWN) {
        this.type = type;
    }

    getType() {
        return this.type;
    }

    static fromRaw(buffer) {
        let reader = new Reader(buffer);
        let type = reader.readU8();
        switch (type) {
            case Info.type.METAINFO:
                return new MetaInfo(reader.readVarBytes(), reader.readU8());
            case Info.type.GROUPINFO:
                return new GroupInfo(JSON.parse(reader.readNullString()));
            case Info.type.PROOFINFO:
                return new ProofInfo(reader.readNullString(), reader.readU32(), reader.readNullString(), reader.readNullString());
            default:
                //throw new Error('invalid info type!');
                return null;
        }
    }
}

Info.type = {
    UNKNOWN: 0,
    METAINFO: 1,
    GROUPINFO: 2,
    PROOFINFO: 3,
};

class MetaInfo extends Info {
    constructor(pubkey, number) {
        super(Info.type.METAINFO);
        this.pubkey = pubkey;
        this.number = number;
    }

    toRaw() {
        let writer = new BufferWriter();
        writer.writeU8(this.type);
        writer.writeVarBytes(Buffer.from(this.pubkey));
        writer.writeU8(this.number);
        return writer.render();
    }
}

class GroupInfo extends Info {
    constructor(members) {
        super(Info.type.GROUPINFO);
        this.members = members;
    }

    toRaw() {
        let writer = new BufferWriter();
        writer.writeU8(this.type);
        writer.writeNullString(JSON.stringify(this.members));
        return writer.render();
    }
}

class ProofInfo extends Info {
    constructor(pid, block, gid, proof) {
        super(Info.type.PROOFINFO);
        this.pid = pid;
        this.block = block;
        this.gid = gid;
        this.proof = proof;
    }
    toRaw() {
        let writer = new BufferWriter();
        writer.writeU8(this.type);
        writer.writeNullString(this.pid);
        writer.writeU32(this.block);
        writer.writeNullString(this.gid);
        writer.writeNullString(this.proof);
        return writer.render();
    }
}

module.exports = {
    Info: Info,
    MetaInfo: MetaInfo,
    GroupInfo: GroupInfo,
    ProofInfo: ProofInfo,
};