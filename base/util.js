'use strict';

const net = require('net');
const os = require('os');
const assert = require('assert');

const EndPoint = {
    PROTOCOL: {
        udp: 'u',
        tcp: 't',
    },


    toString(address, protocol) {
        let ipv = 0;
        if (address.family === 'IPv6') {
            ipv = 6;
        } else if (address.family === 'IPv4') {
            ipv = 4;
        }

        assert(protocol || address.protocol);
        return `${ipv}@${address.address}@${address.port}@${protocol || address.protocol || EndPoint.PROTOCOL.udp}`;
    },

    toAddress(epString) {
        let el = epString.split('@');
        if (el.length >= 3) {
            let addr = {};
            if (net.isIPv4(el[1])) {
                addr.family = 'IPv4';
            } else if (net.isIPv6(el[1])) {
                addr.family = 'IPv6';
            } else {
                if (el[0] === '4') {
                    addr.family = 'IPv4';
                } else if (el[0] === '6') {
                    addr.family = 'IPv6';
                }
            }
            addr.address = el[1];
            addr.port = parseInt(el[2]);
            assert(el.length === 4);
            addr.protocol = EndPoint.PROTOCOL.udp;
            if (el.length >= 4) {
                addr.protocol = el[3];
            }
            return addr;
        } else {
            return null;
        }        
    },

    isZero(address) {
        let host = '';
        if (typeof address === 'string') {
            let el = address.split('@');
            host = el[1];
        } else {
            host = address.address;
        }

        return host === '0.0.0.0';
    },

    isLoopback(address) {
        let host = '';
        if (typeof address === 'string') {
            let el = address.split('@');
            host = el[1];
        } else {
            host = address.address;
        }

        return host === '127.0.0.1';
    },

    isNAT(address) {
        if (typeof address === 'string') {
            let el = address.split('@');
            address = {};
            switch(el[0]) {
                case '4': address.family = 'IPv4'; break;
                case '6': address.family = 'IPv6'; break;
                default: break;
            }
            address.family = el[0];
            address.address = el[1];
            address.port = el[2];
        }

        if (EndPoint.isZero(address) || EndPoint.isLoopback(address)) {
            return true;
        }

        if (!address.family || address.family == 'IPv4') {
            let el = address.address.split('.');
            if (el.length === 4) {
                let el1 = parseInt(el[1]);
                switch(el[0]) {
                    case '10': return true;
                    case '172': return el1 >= 0 && el1 <= 31;
                    case '192': return el1 === 168;
                }
            }
        }
        return false;
    }

};


// 高阶函数, 生成检查protocol的check函数
// @param 用作检查的类型
// @return function 检查函数
function generateProtocolCheck(protocol) {
    return function(address) {
        if ( typeof address === 'object' ) {
            return address.protocol === protocol
        } else if ( typeof address === 'string' ) {
            // 如果address 是 'u' 或者 't'
            // 直接比较即可
            // 如果address 字符串形式的endpoint, 则需要转化
            if ( address.length == 1 ) {
                return address === protocol
            } else {
                return EndPoint.toAddress(address).protocol === protocol
            }
        }
        return false
    }
}

EndPoint.isTCP = generateProtocolCheck(EndPoint.PROTOCOL.tcp)
EndPoint.isUDP = generateProtocolCheck(EndPoint.PROTOCOL.udp)


const NetHelper = {
    getLocalIPs(withInternal) {
        let ips = [];
        let netInterface = os.networkInterfaces();
        for (let name of Object.keys(netInterface)) {
            netInterface[name].forEach(info => {
                if (withInternal || !info.internal) {
                    ips.push(info.address);
                }
            });
        }
        return ips;
    },
}


/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
}


// 如果一个endpoint的ip是0地址或者内网ip
// 并且这个endpoint的协议是tcp协议,
// 就返回一个判断结果和NAT的ip:port( 公网ip:声明时的监听端口 )
// @return [bool 是否达成NAT条件, string 有效的公网访问endpoint]
function doNAT(endpoint, internetAddress) {
    // make endpoint to be an object
    if ( typeof endpoint == 'string' ) {
        endpoint = EndPoint.toAddress(endpoint)
    } else if ( Array.isArray(endpoint) ) {
        endpoint = EndPoint.toAddress(endpoint.join('@'))
    }

    const isNAT = EndPoint.isNAT(endpoint);
    const isZero = EndPoint.isZero(endpoint);
    const isTCP = EndPoint.PROTOCOL.tcp == endpoint.protocol;

    if ( ( isNAT || isZero ) &&  isTCP ) {
        let tcpListenerAddress = {
            family: internetAddress.family,
            address: internetAddress.address,
            port: endpoint.port,
            protocol: endpoint.protocol,
        };
        // 拼接公网ip和绑定端口
        const newEp = EndPoint.toString(tcpListenerAddress);
        return [true, newEp];
    }

    return [false, ''];

}

module.exports.EndPoint = EndPoint;
module.exports.NetHelper = NetHelper;
module.exports.mergeDeep = mergeDeep;
module.exports.doNAT = doNAT;
