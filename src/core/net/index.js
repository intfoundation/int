"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./connection"));
__export(require("./node"));
__export(require("./package"));
__export(require("./reader"));
__export(require("./writer"));
var static_out_node_1 = require("./static_out_node");
exports.StaticOutNode = static_out_node_1.instance;
const static_peerid_ip_1 = require("./static_peerid_ip");
const staticPeeridIp = {
    mapInstance: static_peerid_ip_1.mapInstance,
    splitInstance: static_peerid_ip_1.splitInstance
};
exports.staticPeeridIp = staticPeeridIp;
