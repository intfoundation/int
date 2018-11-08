"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
function rejectifyValue(func, _this, _name) {
    let _func = async (...args) => {
        let ret = await func.bind(_this)(...args);
        if (ret.err) {
            return Promise.reject(new Error(core_1.stringifyErrorCode(ret.err)));
        }
        else {
            return Promise.resolve(ret[_name ? _name : 'value']);
        }
    };
    return _func;
}
exports.rejectifyValue = rejectifyValue;
function rejectifyErrorCode(func, _this) {
    let _func = async (...args) => {
        let err = await func.bind(_this)(...args);
        if (err) {
            return Promise.reject(new Error(`${err}`));
        }
        else {
            return Promise.resolve();
        }
    };
    return _func;
}
exports.rejectifyErrorCode = rejectifyErrorCode;
