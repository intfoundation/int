"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function rejectifyValue(func, _this) {
    let _func = async (...args) => {
        let { err, value } = await func(args);
        if (err) {
            return Promise.reject(new Error(`${err}`));
        }
        else {
            return Promise.resolve(value);
        }
    };
    _func.bind(_this);
    return _func;
}
exports.rejectifyValue = rejectifyValue;
function rejectifyErrorCode(func, _this) {
    let _func = async (...args) => {
        let err = await func(args);
        if (err) {
            return Promise.reject(new Error(`${err}`));
        }
        else {
            return Promise.resolve();
        }
    };
    _func.bind(_this);
    return _func;
}
exports.rejectifyErrorCode = rejectifyErrorCode;
