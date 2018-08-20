import {ErrorCode} from '../../core';

export function rejectifyValue<T>(func: (...args: any[]) => Promise<{err: ErrorCode, value?: T}>, _this: any): (...args: any[]) => Promise<T> {
    let _func = async (...args: any[]): Promise<any> => {
        let {err, value} = await func(args);
        if (err) {
            return Promise.reject(new Error(`${err}`));
        } else {
            return Promise.resolve(value);
        }
    };
    _func.bind(_this);
    return _func;
}

export function rejectifyErrorCode(func: (...args: any[]) => Promise<ErrorCode>, _this: any): (...args: any[]) => Promise<void> {
    let _func = async (...args: any[]): Promise<any> => {
        let err = await func(args);
        if (err) {
            return Promise.reject(new Error(`${err}`));
        } else {
            return Promise.resolve();
        }
    };
    _func.bind(_this);
    return _func;
}
