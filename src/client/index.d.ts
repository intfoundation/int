export {BigNumber} from 'bignumber.js';
import {LoggerInstance} from 'winston';
export {LoggerInstance} from 'winston';
export enum ErrorCode {
    RESULT_OK = 0,
    RESULT_FAILED = 1,

    RESULT_WAIT_INIT = 2,
    RESULT_ERROR_STATE = 3,
    RESULT_INVALID_TYPE = 4,
    RESULT_SCRIPT_ERROR = 5,
    RESULT_NO_IMP = 6,
    RESULT_ALREADY_EXIST = 7,
    RESULT_NEED_SYNC = 8,
    RESULT_NOT_FOUND = 9,
    RESULT_EXPIRED = 10,
    RESULT_INVALID_PARAM = 11,
    RESULT_PARSE_ERROR = 12,
    RESULT_REQUEST_ERROR = 13,
    RESULT_NOT_SUPPORT = 14,
    RESULT_TIMEOUT = 15,
    RESULT_EXCEPTION = 16,
    RESULT_INVALID_FORMAT = 17,
    RESULT_UNKNOWN_VALUE = 18,
    RESULT_INVALID_TOKEN = 19, // token无效
    RESULT_INVALID_SESSION = 21, // 会话无效
    RESULT_OUT_OF_LIMIT = 22, // 超出最大限制
    RESULT_PERMISSION_DENIED = 23, // 权限不足
    RESULT_OUT_OF_MEMORY = 24, // 内存不足
    RESULT_INVALID_STATE = 25,  // 无效状态
    RESULT_NOT_ENOUGH = 26, // 转账时钱不够,
    RESULT_ERROR_NONCE_IN_TX = 27, // tx中的nonce错误
    RESULT_INVALID_BLOCK = 28, // 无效的Block
    RESULT_CANCELED = 29, // 操作被取消

    RESULT_FEE_TOO_SMALL = 30, // 操作被取消
    RESULT_READ_ONLY = 31,
    RESULT_BALANCE_LOCK_EXIST = 32,
    RESULT_BALANCE_LOCK_NOT_EXIST= 33,
    RESULT_TX_EXIST = 34,
    RESULT_VER_NOT_SUPPORT = 35,
    RESULT_EXECUTE_ERROR = 36,
    RESULT_VERIFY_NOT_MATCH = 37,
    RESULT_TX_CHECKER_ERROR = 38,
    RESULT_TX_FEE_NOT_ENOUGH = 39,

    RESULT_SKIPPED = 40,

    RESULT_FORK_DETECTED = 50,

    // token 相关
    RESULT_NO_PERMISSIONS = 10011, // 没有权限
    RESULT_IS_FROZEN = 10012, // 帐户已冻结
    RESULT_INVALID_ADDRESS = 10013, // 地址不合法

    // 交易费用
    RESULT_LIMIT_NOT_ENOUGH = 10021, // limit不足
    RESULT_LIMIT_TOO_BIG = 10022, // tx limit太大
    RESULT_LIMIT_TOO_SMALL = 10023, // tx limit太小
    RESULT_BLOCK_LIMIT_TOO_BIG = 10024, // block limit太大
    RESULT_PRICE_TOO_BIG = 10025, // price太大
    RESULT_PRICE_TOO_SMALL = 10026, // price太小
    RESULT_NOT_BIGNUMBER = 10027, // 不是 bignumber
    RESULT_CANT_BE_LESS_THAN_ZERO = 10028, // 不能小于 0
    RESULT_CANT_BE_DECIMAL = 10029, // 不能为小数
    RESULT_NOT_INTEGER = 10030, // 不是整数
    RESULT_OUT_OF_RANGE = 10031, // 超过最大值

    RESULT_ADDRESS_NOT_EXIST = 10040,
    RESULT_KEYSTORE_ERROR = 10041,
}

export type LoggerOptions = {
    logger?: LoggerInstance;
    loggerOptions?: {console: boolean, file?: {root: string, filename?: string}, level?: string};
};

export function initLogger(options: LoggerOptions): LoggerInstance;

export function stringifyErrorCode(err: ErrorCode): string;
export function stringify(v: any, parsable?:boolean): any;
export function parseJSON(v: any): any;
export function rejectifyValue<T>(func: (...args: any[]) => Promise<{err: ErrorCode}&any>, _this: any, _name?: string): (...args: any[]) => Promise<T>;
export function rejectifyErrorCode(func: (...args: any[]) => Promise<ErrorCode>, _this: any): (...args: any[]) => Promise<void>;

export class Transaction {
   constructor();

    readonly address?:string;

    method: string;

    nonce: number;

    input: any;

    readonly hash?: string;

    sign(privateKey: Buffer|string): void;

    static fromRaw(raw: string|Buffer, T: new () => Transaction): Transaction|undefined;
}

import {BigNumber} from 'bignumber.js';

export class ValueTransaction extends Transaction {
    constructor();

    value: BigNumber;

    fee: BigNumber;
}

export class EventLog {
    name: string;
    param: any;
}

export class Receipt {
    transactionHash: string;
    returnCode: number;
    eventLogs: EventLog[];
}

export class ValueReceipt extends Receipt {
    cost: BigNumber;
}


export interface IReadableKeyValue {
    // 单值操作
    get(key: string): Promise<{ err: ErrorCode, value?: any }>;

    // hash
    hexists(key: string, field: string): Promise<{ err: ErrorCode, value?: boolean}>;
    hget(key: string, field: string): Promise<{ err: ErrorCode, value?: any }>;
    hmget(key: string, fields: string[]): Promise<{ err: ErrorCode, value?: any[] }>;
    hlen(key: string): Promise<{ err: ErrorCode, value?: number }>;
    hkeys(key: string): Promise<{ err: ErrorCode, value?: string[] }>;
    hvalues(key: string): Promise<{ err: ErrorCode, value?: any[] }>;
    hgetall(key: string): Promise<{ err: ErrorCode; value?: {key: string, value: any}[]; }>;

    // array
    lindex(key: string, index: number): Promise<{ err: ErrorCode, value?: any }>;
    llen(key: string): Promise<{ err: ErrorCode, value?: number }>;
    lrange(key: string, start: number, stop: number): Promise<{ err: ErrorCode, value?: any[] }>;
}

export interface IWritableKeyValue {
    // 单值操作
    set(key: string, value: any): Promise<{ err: ErrorCode }>;
    
    // hash
    hset(key: string, field: string, value: any): Promise<{ err: ErrorCode }>;
    hmset(key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode }>;
    hclean(key: string): Promise<ErrorCode>;
    hdel(key: string, field: string): Promise<{err: ErrorCode}>;
    
    // array
    lset(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
    lpush(key: string, value: any): Promise<{ err: ErrorCode }>;
    lpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
    lpop(key: string): Promise<{ err: ErrorCode, value?: any }>;

    rpush(key: string, value: any): Promise<{ err: ErrorCode }>;
    rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
    rpop(key: string): Promise<{ err: ErrorCode, value?: any }>;

    linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
    lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }>;
}

export type IReadWritableKeyValue = IReadableKeyValue & IWritableKeyValue;

export interface IReadableDataBase {
    getReadableKeyValue(name: string): Promise<{ err: ErrorCode, kv?: IReadableKeyValue }>;
}

export interface IWritableDataBase {
    createKeyValue(name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}>;
    getReadWritableKeyValue(name: string): Promise<{ err: ErrorCode, kv?: IReadWritableKeyValue }>;
}

export type IReadWritableDataBase = IReadableDataBase & IWritableDataBase;

export type ExecutorContext = {
    now: number;
    height: number;
    logger: LoggerInstance;
};

export type TransactionContext = {
    caller: string;
    storage: IReadWritableDataBase;
    emit: (name: string, param?: any) => void;
    createAddress: () => string;
} & ExecutorContext;

export type EventContext = {
    storage: IReadWritableDataBase;
} & ExecutorContext;

export type ViewContext = {
    storage: IReadableDataBase;
} & ExecutorContext;

export type ValueTransactionContext = {
    value: BigNumber;
    fee: BigNumber;
    getBalance: (address: string) => Promise<BigNumber>;
    transferTo: (address: string, amount: BigNumber) => Promise<ErrorCode>;
    cost: (fee: BigNumber) => ErrorCode;
} & TransactionContext;

export type ValueEventContext = {
    getBalance: (address: string) => Promise<BigNumber>;
    transferTo: (address: string, amount: BigNumber) => Promise<ErrorCode>;
} & EventContext;

export type ValueViewContext = {
    getBalance: (address: string) => Promise<BigNumber>;
} & ViewContext;

export type DposTransactionContext = {
    vote: (from: string, candiates: string) => Promise<ErrorCode>;
    mortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    unmortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    register: (from: string) => Promise<ErrorCode>;
} & ValueTransactionContext;

export type DposEventContext = {
    vote: (from: string, candiates: string) => Promise<ErrorCode>;
    mortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    unmortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    register: (from: string) => Promise<ErrorCode>;
} & ValueEventContext;

export type DposViewContext = {
    getVote: () => Promise<Map<string, BigNumber> >;
    getStake: (address: string) => Promise<BigNumber>;
    getCandidates: () => Promise<string[]>;
} & ValueViewContext;

export type DbftTransactionContext = {
    register: (caller: string) => Promise<ErrorCode>;
    // unregister: (caller: string, address: string) => Promise<ErrorCode>;
    mortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    unmortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    vote: (from: string, candiates: string[]) => Promise<ErrorCode>;
} & ValueTransactionContext;

export type DbftEventContext = {
    register: (caller: string) => Promise<ErrorCode>;
    // unregister: (caller: string, address: string) => Promise<ErrorCode>;
    mortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    unmortgage: (from: string, amount: BigNumber) => Promise<ErrorCode>;
    vote: (from: string, candiates: string[]) => Promise<ErrorCode>;
} & ValueEventContext;

export type DbftViewContext = {
    getMiners: () => Promise<string[]>;
    getVote: () => Promise<Array<{address: string, vote: BigNumber}>>;
    getStake: (address: string) => Promise<BigNumber>;
    getCandidates: () => Promise<string[]>;
} & ValueViewContext;

export class ChainClient {
    constructor(options: {host: string, port: number, logger: LoggerInstance});

    getBlock(params: {which: string|number|'lastest', transactions?: boolean}): Promise<{err: ErrorCode, block?: any}>;

    getTransactionReceipt(params: {tx: string}): Promise<{err: ErrorCode, block?: any, tx?: any, receipt?: any}>;

    getNonce(params: {address: string}): Promise<{err: ErrorCode, nonce?: number}>;

    sendTransaction(params: {tx: ValueTransaction}): Promise<{err: ErrorCode}>;

    view(params: {method: string, params: any, from?: number|string|'latest'}): Promise<{err: ErrorCode, value?: any}>;

    on(event: 'tipBlock', listener: (block: any) => void): this;
    once(event: 'tipBlock', listener: (block: any) => void): this;
}

// export * from './lib/simple_command';
// export {init as initUnhandledRejection} from './lib/unhandled_rejection';

type TxListener = (context: any, params: any) => Promise<ErrorCode>;
type TxPendingChecker = (tx: Transaction) => ErrorCode;
type BlockHeigthFilter = (height: number) => Promise<boolean>;
type BlockHeightListener = (context: any) => Promise<ErrorCode>;
type ViewListener = (context: any, params: any) => Promise<any>;

export class BaseHandler {
    constructor();

    genesisListener?: BlockHeightListener;
    
    addTX(name: string, listener: TxListener, checker?: TxPendingChecker): void;

    getTxListener(name: string): TxListener|undefined;

    getTxPendingChecker(name: string): TxPendingChecker|undefined

    addViewMethod(name: string, listener: ViewListener): void;

    getViewMethod(name: string): ViewListener|undefined;

    addPreBlockListener(filter: BlockHeigthFilter, listener: BlockHeightListener): void;

    getPreBlockListeners(h: number): Promise<BlockHeightListener[]>;

    addPostBlockListener(filter: BlockHeigthFilter, listener: BlockHeightListener): void;

    getPostBlockListeners(h: number): Promise<BlockHeightListener[]>;
}


type MinerWageListener = (height: number) => Promise<BigNumber>; 

export class ValueHandler extends BaseHandler {
    constructor();

    onMinerWage(l: MinerWageListener): any;

    getMinerWageListener(): MinerWageListener;
}


export class ValueIndependDebugSession {
    init(options: {
        height: number, 
        accounts: Buffer[] | number, 
        coinbase: number,
        interval: number,
        preBalance?: BigNumber
    }): Promise<ErrorCode>;

    updateHeightTo(height: number, coinbase: number, events?: boolean): ErrorCode;

    transaction(options: {caller: number|Buffer, method: string, input: any, value: BigNumber, fee: BigNumber, nonce?: number}): Promise<{err: ErrorCode, receipt?: Receipt}>;
    wage(): Promise<{err: ErrorCode}>;
    view(options: {method: string, params: any}): Promise<{err: ErrorCode, value?: any}>;
    getAccount(index: number): string;
}

export class ValueChainDebugSession {
    init(storageDir: string): Promise<ErrorCode>;
    block(hash: string): Promise<{err: ErrorCode}>;
    transaction(hash: string): Promise<{err: ErrorCode}>;
    view(from: string, method: string, params: any): Promise<{err: ErrorCode, value?: any}>;
}

export const valueChainDebuger: {
    createIndependSession(loggerOptions: {logger?: LoggerInstance, loggerOptions?: {console: boolean, file?: {root: string, filename?: string}}, level?: string}, dataDir: string): Promise<{err: ErrorCode, session?: ValueIndependDebugSession}>;
    createChainSession(loggerOptions: {logger?: LoggerInstance, loggerOptions: {console: boolean, file?: {root: string, filename?: string}}, level?: string}, dataDir: string, debugerDir: string): Promise<{err: ErrorCode, session?: ValueChainDebugSession}>;
};

export function addressFromSecretKey(secret: Buffer|string): string|undefined;
export function isValidAddress(address: string): boolean;
export function createKeyPair():[Buffer, Buffer];

export function toWei(value: string | number | BigNumber): BigNumber;
export function fromWei(value: string | number | BigNumber): BigNumber;
export function toCoin(value: string | number | BigNumber): BigNumber;
export function fromCoin(value: string | number | BigNumber): BigNumber;