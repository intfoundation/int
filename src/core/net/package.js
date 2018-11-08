"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Package {
    constructor() {
        this.m_header = {
            magic: Package.magic,
            version: 0,
            flags: 0,
            cmdType: 0,
            totalLength: 0,
            bodyLength: 0,
        };
        this.m_body = {};
        this.m_data = [];
    }
    get header() {
        return this.m_header;
    }
    get body() {
        return this.m_body;
    }
    get data() {
        return this.m_data;
    }
    copyData() {
        let buffer = new Buffer(this.dataLength);
        let copyStart = 0;
        for (let data of this.data) {
            data.copy(buffer, copyStart);
            copyStart += data.length;
        }
        return buffer;
    }
    get dataLength() {
        const header = this.m_header;
        return header.totalLength - Package.headerLength - header.bodyLength;
    }
}
Package.headerLength = 16;
Package.magic = 0x8083;
exports.Package = Package;
