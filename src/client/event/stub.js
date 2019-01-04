"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
const util_1 = require("util");
class ChainEventFilterStub {
    constructor(filters) {
        this.m_filters = filters;
    }
    get querySql() {
        const q = this.m_querySql;
        return q;
    }
    get filterFunc() {
        return this.m_filterFunc;
    }
    init() {
        if (!this.m_filters
            || util_1.isObject(this.m_filters)
            || !Object.keys(this.m_filters).length) {
            return core_1.ErrorCode.RESULT_INVALID_PARAM;
        }
        let querySql = new Map();
        let filterFuncs = new Map();
        for (let [event, filter] of Object.entries(this.m_filters)) {
            if (!filter || !Object.keys(filter).length) {
                filterFuncs.set(name, (log) => {
                    return true;
                });
                querySql.set(event, null);
            }
            let pfr = ChainEventFilterStub._parseFilter(filter, (op, ...opr) => {
                if (op === 'and') {
                    let sql = '( ' + opr[0] + ' )';
                    for (let e of opr.slice(1)) {
                        sql += ' AND ( ' + e + ' )';
                    }
                    return sql;
                }
                else if (op === 'or') {
                    let sql = '( ' + opr[0] + ' )';
                    for (let e of opr.slice(1)) {
                        sql += ' OR ( ' + e + ' )';
                    }
                    return sql;
                }
                else if (op === 'eq') {
                    return `e."${opr[0]}" = "${JSON.stringify(opr[1])}"`;
                }
                else if (op === 'neq') {
                    return `e."${opr[0]}" != "${JSON.stringify(opr[1])}"`;
                }
                else if (op === 'in') {
                    let sql = `e."${opr[0]}" IN [`;
                    if (opr[1].length) {
                        sql += `"${JSON.stringify(opr[1][0])}"`;
                    }
                    for (let v of opr[1]) {
                        sql += `,"${JSON.stringify(opr[1][0])}"`;
                    }
                    sql += ']';
                    return sql;
                }
                else {
                    throw new Error();
                }
            });
            if (pfr.err) {
                return pfr.err;
            }
            querySql.set(event, pfr.value);
            pfr = ChainEventFilterStub._parseFilter(filter, (op, ...opr) => {
                if (op === 'and') {
                    let sql = '( ' + opr[0] + ' )';
                    for (let e of opr.slice(1)) {
                        sql += ' && ( ' + e + ' )';
                    }
                    return sql;
                }
                else if (op === 'or') {
                    let sql = '( ' + opr[0] + ' )';
                    for (let e of opr.slice(1)) {
                        sql += ' || ( ' + e + ' )';
                    }
                    return sql;
                }
                else if (op === 'eq') {
                    return `JSON.strigify(l.param.${opr[0]}) === '${JSON.stringify(opr[1])}'`;
                }
                else if (op === 'neq') {
                    return `JSON.strigify(l.param.${opr[0]})" !== '${JSON.stringify(opr[1])}'`;
                }
                else if (op === 'in') {
                    return `${opr[1].map((v) => JSON.stringify(v))}.indexOf(JSON.strigify(l.param.${opr[0]})) !== -1`;
                }
                else {
                    throw new Error();
                }
            });
            if (pfr.err) {
                return pfr.err;
            }
            let _func;
            let funcDef = '_filterFunc = (l) => { return ' + pfr.value + ';};';
            try {
                eval(funcDef);
            }
            catch (e) {
                return core_1.ErrorCode.RESULT_EXCEPTION;
            }
            filterFuncs.set(event, _func);
        }
        this.m_querySql = querySql;
        this.m_filterFunc = (log) => {
            if (!filterFuncs.has(log.name)) {
                return false;
            }
            return (filterFuncs.get(log.name)(log));
        };
        return core_1.ErrorCode.RESULT_OK;
    }
    static _parseFilter(filter, parser) {
        if (!util_1.isObject(filter)) {
            return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
        }
        const keys = Object.keys(filter);
        if (keys.length !== 1) {
            return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
        }
        const op = keys[0];
        if (op === '$and') {
            let exp = filter['$and'];
            if (!util_1.isArray(exp)) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            if (exp.length > 2) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            let opr = [];
            for (let sub of exp) {
                const pfr = this._parseFilter(sub, parser);
                if (pfr.err) {
                    return { err: pfr.err };
                }
                opr.push(pfr.value);
            }
            let value;
            try {
                value = parser('and', ...opr);
            }
            catch (e) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            return { err: core_1.ErrorCode.RESULT_OK, value };
        }
        else if (op === '$or') {
            let exp = filter['$or'];
            if (!util_1.isArray(exp)) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            if (exp.length > 2) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            let opr = [];
            for (let sub of exp) {
                const pfr = this._parseFilter(sub, parser);
                if (pfr.err) {
                    return { err: pfr.err };
                }
                opr.push(pfr.value);
            }
            let value;
            try {
                value = parser('or', ...opr);
            }
            catch (e) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            return { err: core_1.ErrorCode.RESULT_OK, value };
        }
        else if (op === '$eq') {
            let exp = filter['eq'];
            if (!util_1.isObject(exp)) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            const _keys = Object.keys(exp);
            if (_keys.length !== 1) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            const index = _keys[0];
            let value;
            try {
                value = parser('eq', index, exp[index]);
            }
            catch (e) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            return { err: core_1.ErrorCode.RESULT_OK, value };
        }
        else if (op === '$neq') {
            let exp = filter['neq'];
            if (!util_1.isObject(exp)) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            const _keys = Object.keys(exp);
            if (_keys.length !== 1) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            const index = _keys[0];
            let value;
            try {
                value = parser('neq', index, exp[index]);
            }
            catch (e) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            return { err: core_1.ErrorCode.RESULT_OK, value };
        }
        else if (op === '$in') {
            let exp = filter['in'];
            if (!util_1.isObject(exp)) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            const _keys = Object.keys(exp);
            if (_keys.length !== 1) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            const index = _keys[0];
            if (!util_1.isArray(exp[index])) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            let value;
            try {
                value = parser('in', index, exp[index]);
            }
            catch (e) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            return { err: core_1.ErrorCode.RESULT_OK, value };
        }
        else {
            let index = op;
            let value;
            try {
                value = parser('eq', index, filter[index]);
            }
            catch (e) {
                return { err: core_1.ErrorCode.RESULT_INVALID_FORMAT };
            }
            return { err: core_1.ErrorCode.RESULT_OK, value };
        }
    }
}
exports.ChainEventFilterStub = ChainEventFilterStub;
