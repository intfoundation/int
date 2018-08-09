'use strict';

const Crypto = require('crypto');
const Base = require('../base/base.js');
const BaseUtil = require('../base/util.js');
const LOG_INFO = Base.BX_INFO;
const LOG_ASSERT = Base.BX_ASSERT;

const Result = {
    INVALID_PACKAGE: -4,
    INVALID_ARGS: -3,
    TIMEOUT: -2,
    FAILED: -1,
    SUCCESS: 0,
    PENDING: 1,
    STOPPED: 2,
};

const MAX_SAFE_INTEGER = 0xFFFFFFFFFFFFF;
const MAX_UINT32 = 0xFFFFFFFF;

const HASH_BIT_COUNT = 32;
const HIGH_BIT_MASK = 0x80000000;//(1 << (HASH_BIT_COUNT - 1));
const HASH_MASK = 0xFFFFFFFF;//((1 << HASH_BIT_COUNT) - 1);

const Config = {
    Hash: {
        BitCount: HASH_BIT_COUNT,
    },

    Peer: {
        epTimeout: 300000,
        maxEPCount: 5,
        NATTypeTime: 600000,
        recommandNeighborTime: 120000, // 上线两分钟内可能推荐一次邻居
    },

    Bucket: {
        BucketCount: 16,
        BucketSize: 8,
        PeerTimeoutMS: 300000,
        FindPeerCount: 5,
    },
    
    ValueTable: {
        TableCount: 16,
        TableSize: 8,
        TotalValueCount: 128,
        ValueTimeoutMS: 3600000,
        ValueUpdateIntervalMS: 600000,
        FindCloseKeyCount: 5,
    },

    SaveValue: {
        DupCount: 5,
    },

    GetValue: {
    },

    Package: {
        MagicNum: 0x8084,
        MaxTTL: 1,
        MinSeq: 1,
        MaxSeq: MAX_UINT32,
        Timeout: 10000,
    },

    Task: {
        TimeoutMS: 600000,
        MaxIdleTimeMS: 500,
        MinTaskID: 1,
        MaxTaskID: MAX_UINT32,
        TryTimes: 5,
        HandshakeTimeoutMS: 5000,
    },

    RouteTable: {
        ExpandIntervalMS: {
            Min: 2000,
            Max: 600000,
            dynamic(peerCount, peerDelta) { // 根据当前peer数和上次扩充peer增量动态调整扩充频率
                let interval = 600000;
                if (peerCount <= 16) {
                    interval = 2000;
                } else if (peerCount <= 32) {
                    interval = 30000;
                } else if (peerCount <= 64) {
                    interval = 120000;
                }

                if (peerDelta <= 4) {
                    interval = Math.max(interval, 300000);
                } else if (peerDelta <= 8) {
                    interval *= 2;
                }
                return Math.min(interval, Config.RouteTable.ExpandIntervalMS.Max);
            },
        },
        PingIntervalMS: {
            Min: 40000,
            Max: 256000,
            Retry: 10000,
            dynamic(distRank) { // 根据与目标peer的距离动态调整ping间隔
                let ms = Config.RouteTable.PingIntervalMS.Min + 8000 * distRank;
                return Math.min(ms, Config.RouteTable.PingIntervalMS.Max);
            }
        }
    }
};

const RandomGenerator = {
    // 默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1
    CHAR_SET: 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678',

    string(length = 32) {
        let maxPos = RandomGenerator.CHAR_SET.length;
        let result = '';
        for (let i = 0; i < length; i++) {
            result += RandomGenerator.CHAR_SET.charAt(RandomGenerator.integer(maxPos));
        }
        return result;
    },

    integer(max, min = 0) {
        let result = Math.round(Math.random() * (max - min)) + min;
        if (result > max) {
            result = max;
        }
        return result;
    }
};

class SequenceIncreaseGenerator {
    constructor(lowBound, upBound) {
        this.m_lowBound = lowBound;
        this.m_upBound = upBound;
        this.m_nextSeq = RandomGenerator.integer(upBound, lowBound);
    }

    genSeq() {
        let seq = this.m_nextSeq++;
        if (this.m_nextSeq > this.m_upBound) {
            this.m_nextSeq = this.m_lowBound;
        }
        return seq;
    }
}

function UInt(n) {
    return n >>> 0;
}

/**
 * 用于计算两个KEY（STRING）之间距离的HASH
 * HASH长度暂时只取MD5的32位；便于计算，同时按距离分组时数量也不会太多
 * 考虑到以后可能需要扩展到更多位数，不可以把HASH值直接当作32位整数处理（如：比较，位运算等）；
 * 需要任何运算时要在HashDistance类中添加函数；
 * 如果真要扩展，已经使用的HASH应该放在最高位，或者直接顺着MD5值往后启用更多位，这样不会影响旧版本中两个距离远近比较和分组
 */
const HashDistance = {
    calcDistance(key1, key2) {
        return HashDistance.calcDistanceByHash(HashDistance.checkHash(key1), HashDistance.checkHash(key2));
    },

    hash(key) {
        LOG_ASSERT(typeof key === 'string', `The key(${key}) must be a string.`);

        let md5 = Crypto.createHash('md5');
        md5.update(key);
        let md5Hash = md5.digest();
        let hash = md5Hash.readUInt32BE(0);
        return UInt(hash & (~HIGH_BIT_MASK));
    },
    
    checkHash(key) {
        if (typeof key === 'number') {
            return key;
        } else {
            return HashDistance.hash(key);
        }
    },

    calcDistanceByHash(hash1, hash2) {
        return UInt(hash1 ^ hash2);
    },

    firstDifferentBit(hash1, hash2) {
        if (hash1 === hash2) {
            return HASH_BIT_COUNT;
        }

        let bits = 0;
        let xor = hash1 ^ hash2;
        let highBitMask = HIGH_BIT_MASK;
        while ((xor & (highBitMask >>> bits)) == 0) { // +-0
            bits++;
        }
        return bits;
    },

    hashBit(hash, bitPos, bitCount = 1) {
        // value << 32 == value?
        if (bitCount == 0 || bitPos >= HASH_BIT_COUNT) {
            return 0;
        }

        if (bitCount > HASH_BIT_COUNT - bitPos) {
            bitCount = HASH_BIT_COUNT - bitPos;
        }
        
        // mask = 0x1111111000000
        //                 |(bitCount)
        let mask = (HashDistance.HASH_MASK << (HASH_BIT_COUNT - bitCount));
        // mask = 0x0000111000000
        //              | |(bitPos+bitCount)
        //              |bitPos
        mask = (mask >>> bitPos);
        return UInt(hash & mask);
    },

    isBitSet(hash, bitPos) {
        return !!HashDistance.hashBit(hash, bitPos);
    },

    // 仅仅用于在网络上得到两个理论上应该相等的hash值，这时候不检查最高位
    checkEqualHash(hash1, hash2) {
        return ((hash1 ^ hash2) & (~HIGH_BIT_MASK)) == 0; // +-0
    },

    compareHash(hash1, hash2) {
        return hash1 - hash2;
    },

    sortByDistance(hashObjArray, targetHashObj) {
        hashObjArray.sort((obj1, obj2) => {
            let distance1 = HashDistance.calcDistance(targetHashObj.hash, obj1.hash);
            let distance2 = HashDistance.calcDistance(targetHashObj.hash, obj2.hash);
            return HashDistance.compareHash(distance1, distance2) > 0;
        });
    },

    HASH_MASK: HASH_MASK,
    MAX_HASH: HASH_MASK,
};

// SaveValue(tableName, OBJECT_KEY, value) : table[OBJECT_KEY] = value
// SaveValue(tableName, TOTAL_KEY, value): not support 不支持更新整个表，防止有人恶意刷新整个表导致整个表内容丢失
// DeleteValue(tableName, OBJECT_KEY) : table.delete(OBJECT_KEY) 删除本地发起SaveValue的OBJECT_KEY
// DeleteValue(tableName, TOTAL_KEY): 删除所有本地发起SaveValue的表名为tableName的数据
// GetValue(tableName, OBJECT_KEY): return table[OBJECT_KEY]
// GetValue(tableName, TOTAL_KEY): return table
const OBJECT_KEY = 'DHTValueTable.Object';
const TOTAL_KEY = 'DHTValueTable.TotalTable';

const FLAG_PRECISE = 0x1

module.exports.Result = Result;
module.exports.MAX_SAFE_INTEGER = MAX_SAFE_INTEGER; // 2^53-1 最大安全整数
module.exports.MAX_UINT32 = MAX_UINT32;
module.exports.FLAG_PRECISE = FLAG_PRECISE;
module.exports.OBJECT_KEY = OBJECT_KEY;
module.exports.TOTAL_KEY = TOTAL_KEY;
module.exports.Config = Config;
module.exports.SequenceIncreaseGenerator = SequenceIncreaseGenerator;
module.exports.EndPoint = BaseUtil.EndPoint;
module.exports.RandomGenerator = RandomGenerator;
module.exports.HashDistance = HashDistance;
