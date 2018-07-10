"use strict";
const path = require("path");
var assert = require("assert");
const fs = require("fs-extra");
const os = require("os");
const events = require('events');
const net = require('net');
const keypair = require('keypair');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const child_process = require("child_process");
const crypto = require('crypto');
const EVAL_ENABLE = true;
const BX_UID_TYPE_CORE = "CORE";
const BX_UID_TYPE_APP = "APP";
const BX_UID_TYPE_DEVELOPER = "DEV";
const BX_UID_TYPE_RUNTIME = "RTM";
const BX_UID_TYPE_TOOL = "TOOL";
const BX_RUNTIME_LEVEL = 5;
const DeviceType = {
    PC_SERVER : 'pc_server',
    PC_CLIENT : 'pc_client',
    WX_CLIENT : 'wx_client',
    IOS_CLIENT : 'ios_client',
    ANDROID_CLIENT : 'android_client',
};
const RuntimeType = {
    PC_SERVER_BUCKY : 'pc_server.bucky',
    PC_CLIENT_NODE : 'pc_client.node',
    PC_CLIENT_H5 : 'pc_client.h5',
    WX_CLIENT_WX : 'wx_client.wx',
};
const DeviceDriver = {
    MYSQL : 'bx.mysql.client',
    REDIS : 'bx.redis.client',
    MONGO : 'bx.mongo.client',
};
const DeviceAbility = {
    WLAN : 'wlan-interface',
    LAN : 'lan-interface',
    CACHE : 'cache',
    STORAGE : 'storage',
    BUS : 'bus',
};
const STAT_CMD = {
    RTM_RES: 'res',
    COST: 'cost',
    COUNT: 'count',
    START: 'start',
    END: 'end',
    VALUE: 'value'
};
const MONITOR_CMD = {
    RES: 'res',
    COST: 'cost',
    COUNT: 'count',
    TICK: 'tick',
    VALUE: 'value'
};
const BuckyDomain = {
    "services": "dev.buckycloud.com",
    "device": "dev.buckycloud.com",
    "runtime": "runtimes.buckycloud.com",
    "bus": "buses.buckycloud.com"
};
const AppKnowledgeKeys = {
    APPINFO : 'global.appinfo',
    RUNTIMES : 'global.runtimes',
    EVENTS : 'global.events',
    STORAGES : 'global.storages',
    LOADRULES : 'global.loadrules',
    SYSTEM_TIMERS : 'system.timers',
    MYSQL_INSTANCES : 'global.mysql.instances',
    MYSQL_CONFIGS : 'global.mysql.configs',
    MYSQL_SCHEMAS : 'global.mysql.schemas',
    MONGO_INSTANCES : 'global.mongo.instances',
    MONGO_CONFIGS : 'global.mongo.configs',
};
const AppState = {
    RUNNING : 'running',
    STOPED : 'stoped',
};

class NodeInfo {
    constructor() {
        this.id = "";
        this.type = "";
        this.interfaces = [];
    }
}
const ErrorCode = {
    RESULT_OK: 0,
    RESULT_FAILED: 1,
    RESULT_WAIT_INIT: 2,
    RESULT_ERROR_STATE: 3,
    RESULT_INVALID_TYPE: 4,
    RESULT_SCRIPT_ERROR: 5,
    RESULT_NO_IMP: 6,
    RESULT_ALREADY_EXIST: 7,
    RESULT_NEED_SYNC: 8,
    RESULT_NOT_FOUND: 9,
    RESULT_EXPIRED: 10,
    RESULT_INVALID_PARAM: 11,
    RESULT_PARSE_ERROR: 12,
    RESULT_REQUEST_ERROR: 13,
    RESULT_NOT_SUPPORT: 14,
    RESULT_TIMEOUT: 15,
    RESULT_EXCEPTION: 16,
    RESULT_INVALID_FORMAT: 17,
    RESULT_UNKNOWN_VALUE: 18,
    RESULT_INVALID_TOKEN: 19,
    RESULT_INVALID_SESSION: 21,
    RESULT_OUT_OF_LIMIT: 22,
    RESULT_PERMISSION_DENIED: 23,
    RESULT_OUT_OF_MEMORY: 24,
    RESULT_INVALID_STATE : 25,
    RESULT_NO_TARGET_RUNTIME: 30,
    RESULT_INVALID_RULES: 31,
    RESULT_POST_FAILED: 40,
    RESULT_MONGO_ERROR: 50,
    RESULT_CONNECT_ERROR: 51,
    RESULT_CREATE_USER_ERROR: 52,
    RESULT_REMOVE_USER_ERROR: 53,
    RESULT_SIGNUP_FAILED: 60,
    RESULT_SIGNIN_FAILED: 61,
    RESULT_INVALID_CONFIG: 80,
    RESULT_INVALID_VERSION: 81,
    RESULT_UNMATCH_RUNTIME: 82,
    RESULT_REACH_LIMIT: 100,
    RESULT_LEVEL_UNMATCH: 101,
    RESULT_DB_QUERY_ERROR: 110,
    RESULT_DB_OPEN_FAILED: 111,
    RESULT_DB_TRANSACTION_FAILED: 112,
    RESULT_DB_CONDITION_NOT_MATCH: 113,
    RESULT_METHOD_NOT_FOUND: 114,
    RESULT_DB_DATA_NON_CONSISTENCY: 115,
    RESULT_NOT_EMPTY: 180,
    RESULT_LOCK_WRITE: 181,
    RESULT_LOCK_READ: 182,
    RESULT_LOCK_NONE: 183,
    RESULT_LOCK_UNMATCH: 184,
    RESULT_AUTH_FAILED: 185,
    RESULT_RES_DROP: 200,
    RESULT_RES_OFFLINE: 201,
    RESULT_RES_INVALID_STATE: 202,
    RESULT_MYSQL_INSTANCE_NOT_FOUND: 203,
    RESULT_MONGO_INSTANCE_NOT_FOUND: 204,
    RESULT_APP_STOPED: 210,
    RESULT_ZIP_WRITE_FAILED: 220,
    RESULT_ZIP_FILE_NOT_EXSIT: 221,
    RRESULT_ZIP_LOAD_FAILED: 222,
    RESULT_UNKNOWN: 255,
};
ErrorCode.getErrorDesc = (errorCode) => {};
const RRESULT = {
    'SUCCESS': 0,
    'FAILED': 1,
    'UID_NOT_VALID': 300,
    'CHECKTOKEN_FAILED': 301,
    'DB_OPEN_FAILED': 302,
    'DB_OP_FAILED': 303,
    'DB_EXCEPTION': 304,
    'ZIP_WRITE_FAILED': 305,
    'ZIP_FILE_NOT_EXSIT': 306,
    'ZIP_LOAD_FAILED': 307,
    'PKG_NOT_COMMIT': 308,
    'INVALID_PARAM': 309,
};

class BLogNodeEnv {
    platform() {
        return os.platform();
    }
    filterOptions(options) {
    }
}

class BLogConsoleTarget {
    constructor() {
        this.m_clFuncs = {
            [BLogLevel.TRACE]: console.trace,
            [BLogLevel.DEBUG]: console.log,
            [BLogLevel.INFO]: console.info,
            [BLogLevel.WARN]: console.warn,
            [BLogLevel.ERROR]: console.error,
            [BLogLevel.CHECK]: console.error,
            [BLogLevel.FATAL]: console.error,
        };
    }
    output(logStringItem, options) {
        let func = this.m_clFuncs[options.level];
        if (func) {
            func(logStringItem);
        } else {
            console.log(logStringItem);
        }
    }
}

class BLogStackHelper {
    static _getStack(func) {
        const old = Error.prepareStackTrace;
        Error.prepareStackTrace = (error, stack) => {
            return stack;
        };
        const err = new Error();
        Error.captureStackTrace(err, func);
        const stack = err.stack;
        Error.prepareStackTrace = old;
        return stack;
    }
    static _getPos(stack, frameIndex) {
        const frame = stack[frameIndex];
        const pos = {
            "line": frame.getLineNumber(),
            "file": frame.getFileName(),
            "func": frame.getFunctionName(),
        };
        return pos;
    }
    static getStack(info) {
        const stack = BLogStackHelper._getStack(BLogStackHelper.getStack);
        if (info.pos) {
            info.pos = BLogStackHelper._getPos(stack, info.frame + 1);
            if (info.pos.file && !info.fullpath) {
                info.pos.file = path.basename(info.pos.file);
            }
        }
        if (info.stack) {
            info.stack = '';
            for (let index = info.frame + 1; index < stack.length; ++index) {
                info.stack += `${stack[index].toString()}\n`;
            }
        }
    }
}

class BLogArgConvert {
    constructor() {
        this.m_util = require('util');
    }
    convertArg(arg) {
        if (typeof arg === 'string') {
            return arg;
        } else {
            return this.m_util.inspect(arg, { showHidden: true, depth: 3 });
        }
    }
}

class BLogKeyFilter {
    constructor(keyList) {
        this.m_keyList = keyList;
        this.m_handler = {
            get : (target, key) => {
                return this._get(target, key);
            },
            getOwnPropertyDescriptor: (target, key) => {
                return this._getOwnPropertyDescriptor(target, key);
            }
        }
    }
    filter(obj) {
        return new Proxy(obj, this.m_handler);
    }
    _private(key) {
        return (Object.getOwnPropertyDescriptor(this.m_keyList, key) != null);
    }
    _get(target, key) {
        const obj = this._private(key) ? '******' : Reflect.get(target, key);
        if (obj && typeof obj === 'object') {
            return new Proxy(obj, this.m_handler);
        } else {
            return obj;
        }
    }
    _getOwnPropertyDescriptor(target, key) {
        const obj = Reflect.getOwnPropertyDescriptor(target, key);
        if (this._private(key)) {
            obj.value = '******';
        }
        else if (obj && typeof obj.value === 'object') {
            obj.value = new Proxy(obj.value, this.m_handler);
        }
        return obj;
    }
}

class BLogStaticConfig {
    constructor(option) {
        this.m_option = option;
        this.m_configFile = '';
        this.m_configFileName = 'blog.cfg';
        this.m_globalDir = '';
        if (BLogEnv.platform() === "win32") {
            this.m_globalDir = 'c:\\blog';
        } else if (BLogEnv.platform() === "darwin") {
            this.m_globalDir = '/etc/blog';
        } else {
        }
    }
    init() {
        if (!this._findCFGFile()) {
            return false;
        }
        return this._load();
    }
    _findCFGFile() {
        assert(this.m_configFile == '');
        const mainfile = process.argv[1];
        assert(mainfile);
        const fileInfo = path.parse(mainfile);
        const processConfig = fileInfo.dir + '/' + this.m_configFileName;
        if (fs.existsSync(processConfig)) {
            console.log('will use blog process config:', processConfig);
            this.m_configFile = processConfig;
            return true;
        }
        const globalConfig = this.m_globalDir + '/' + this.m_configFileName;
        if (fs.existsSync(globalConfig)) {
            console.log('will use blog global config:', globalConfig);
            this.m_configFile = globalConfig;
            return true;
        }
        return false;
    }
    _load() {
        assert(this.m_configFile);
        let ret = false;
        try {
            const context = fs.readFileSync(this.m_configFile, 'utf8');
            const jsonConfig = JSON.parse(context);
            if (jsonConfig) {
                this._parse(jsonConfig);
                ret = true;
            }
        } catch (err) {
            console.error(`parse blog config failed! file=${this.m_configFile}, err=${err}`);
        }
        return ret;
    }
    _parse(jsonConfig) {
        for (let key in jsonConfig) {
            const value = jsonConfig[key];
            if (key === 'off') {
                this.m_option.setSwitch(!value);
            } else if (key === 'level') {
                this.m_option.setLevel(value);
            } else if (key === 'pos') {
                this.m_option.enablePos(value);
            } else if (key === 'fullpath') {
                this.m_option.enableFullPath(value);
            } else if (key === 'stack') {
                this.m_option.enableStack(value);
            } else if (key === 'separator') {
                this.m_option.setSeparator(value);
            } else if (key === 'console') {
                this.m_option.enableConsoleTarget(value);
            } else if (key === 'filetarget') {
                if (value instanceof Array) {
                    for (const item of value) {
                        this._parseFileTarget(item);
                    }
                } else {
                    this._parseFileTarget(value);
                }
            } else {
                console.error('unknown blog config key:', key, value);
            }
        }
    }
    _parseFileTarget(configValue) {
        const options = {};
        for (let key of configValue) {
            const value = configValue[key];
            if (key === 'rootdir') {
                options.rootFolder = value;
            } else if (key === 'subdir') {
                options.subFolder = value;
            } else if (key === 'filename') {
                options.filename = value;
            } else if (key === 'filemaxsize') {
                options.filemaxsize = value;
            } else if (key === 'filemaxcount') {
                options.filemaxcount = value;
            } else if (key === 'mode') {
                options.mode = value;
            } else {
                console.error('unknown filetarget config key:', key, value);
            }
        }
        this.m_option.addFileTarget(options);
    }
}
const BLogEnv = new BLogNodeEnv();

class LinkedListItem {
    constructor(data, pre, next) {
        this.m_data = data;
        this.m_pre = pre;
        this.m_next = next;
    }
}

class LinkedList {
    constructor() {
        this.m_head = null;
        this.m_tail = null;
        this.m_current = null;
        this.m_length = 0;
        this.m_forward = false;
    }
    size() {
        return this.m_length;
    }
    count() {
        return this.m_length;
    }
    empty() {
        return this.m_length === 0;
    }
    back() {
        if (this.m_length === 0) {
            return;
        } else {
            return this.m_tail.m_data;
        }
    }
    front() {
        if (this.m_length === 0) {
            return;
        } else {
            return this.m_head.m_data;
        }
    }
    push_back(data) {
        let item = new LinkedListItem(data, this.m_tail, null);
        if (this.m_length > 0) {
            this.m_tail.m_next = item;
            this.m_tail = item;
        } else {
            this.m_head = item;
            this.m_tail = item;
        }
        ++this.m_length;
        return item;
    }
    pop_back() {
        if (this.m_length <= 0) {
            assert(this.m_head === null);
            assert(this.m_tail === null);
            return;
        }
        assert(this.m_tail);
        let item = this.m_tail;
        --this.m_length;
        if (this.m_length > 0) {
            this.m_tail = item.m_pre;
            this.m_tail.m_next = null;
        } else {
            this.m_head = null;
            this.m_tail = null;
        }
        if (this.m_current === item) {
            this._correct_current();
        }
        return item.m_data;
    }
    push_front(data) {
        let item = new LinkedListItem(data, null, this.m_head);
        if (this.m_length > 0) {
            this.m_head.m_pre = item;
            this.m_head = item;
        } else {
            this.m_tail = item;
            this.m_head = item;
        }
        ++this.m_length;
        return item;
    }
    pop_front() {
        if (this.m_length <= 0) {
            assert(this.m_head === null);
            assert(this.m_tail === null);
            return;
        }
        assert(this.m_head);
        let item = this.m_head;
        --this.m_length;
        if (this.m_length > 0) {
            this.m_head = item.m_next;
            this.m_head.m_pre = null;
        } else {
            this.m_head = null;
            this.m_tail = null;
        }
        if (this.m_current === item) {
            this._correct_current();
        }
        return item.m_data;
    }
    current() {
        if (this.m_current) {
            return this.m_current.m_data;
        } else {
            return;
        }
    }
    current_iterator() {
        return this.m_current;
    }
    _correct_current() {
        if (this.m_current) {
            let item = this.m_current;
            if (this.m_forward) {
                this.m_current = item.m_pre;
            } else {
                this.m_current = item.m_next;
            }
        }
    }
    delete(data) {
        let iterator = this.m_head;
        while (iterator) {
            if (data === iterator.m_data) {
                this.erase(iterator);
                return true;
            }
            iterator = iterator.m_next;
        }
        return false;
    }
    erase(iterator) {
        if (iterator === this.m_head) {
            this.pop_front();
        } else if (iterator === this.m_tail) {
            this.pop_back();
        } else {
            --this.m_length;
            let item = iterator;
            if (iterator === this.m_current) {
                this._correct_current();
            }
            assert(item.m_pre);
            assert(item.m_next);
            item.m_pre.m_next = item.m_next;
            item.m_next.m_pre = item.m_pre;
        }
    }
    reset() {
        this.m_current = null;
    }
    next() {
        this.m_forward = true;
        if (this.m_current) {
            this.m_current = this.m_current.m_next;
        } else {
            this.m_current = this.m_head;
        }
        if (this.m_current) {
            return true;
        } else {
            return false;
        }
    }
    prev() {
        this.m_forward = false;
        if (this.m_current) {
            this.m_current = this.m_current.m_pre;
        } else {
            this.m_current = this.m_tail;
        }
        if (this.m_current) {
            return true;
        } else {
            return false;
        }
    }
    [Symbol.iterator]() {
        return {
            iterator: this.m_head,
            self: this,
            next() {
                if (this.iterator) {
                    const ret = { value: this.iterator.m_data, done: false };
                    this.iterator = this.iterator.m_next;
                    return ret;
                } else {
                    return { value: undefined, done: true };
                }
            }
        };
    }
    clear() {
        let iterator = this.m_head;
        while (iterator) {
            delete iterator.m_data;
            iterator = iterator.m_next;
        }
        this.m_head = null;
        this.m_tail = null;
        this.m_current = null;
        this.m_length = 0;
    }
    exists(data) {
        let iterator = this.m_head;
        while (iterator) {
            if (data === iterator.m_data) {
                return true;
            }
            iterator = iterator.m_next;
        }
        return false;
    }
}
var BLogGetDefaultConsoleTarget = function() {
    let instance;
    return function() {
        if (!instance) {
            instance = new BLogConsoleTarget();
        }
        return instance;
    };
}();
const LogTargetMode = {
    'ASYNC' : 0,
    'SYNC' : 1,
};
const LogMemoryCacheStatus = {
    'READY': 0,
    'PENDING': 1,
};

class LogMemoryCache {
    constructor(options, target) {
        this.m_maxSize = -1;
        this.m_maxCount = 1024 * 10;
        if (options.maxSize) {
            this.m_maxSize = options.maxSize;
        }
        if (options.maxCount) {
            this.m_maxCount = options.maxCount;
        }
        this.m_retryInterval = 1000;
        this.m_retryMaxCount = 5;
        this.m_target = target;
        assert(this.m_target);
        this.m_logs = new LinkedList();
        this.m_size = 0;
    }
    chain(nextTarget, mode) {
        this.m_target = nextTarget;
        this.m_mode = mode;
        if (!nextTarget) {
            this.m_mode = "copy";
        }
    }
    _onItemCompelte(logItem, ret) {
        const cb = logItem.c;
        if (cb) {
            cb(ret, logItem.l, logItem.o);
        }
    }
    _continue() {
        this._checkLimit();
        while (!this.m_logs.empty()) {
            const logItem = this.m_logs.pop_front();
            if (this._outputItem(logItem)) {
            } else {
                break;
            }
        }
    }
    _cacheLog(logString, options, onComplete, back = true) {
        const item = {
            "l": logString,
            "o": options,
            "c": onComplete,
            "r": 0,
        };
        this._cacheItem(item, back);
    }
    _cacheItem(logItem, back = true) {
        this.m_size += logItem.l.length;
        if (back) {
            this.m_logs.push_back(logItem);
        } else {
            this.m_logs.push_front(logItem);
        }
    }
    _checkLimit() {
        if (this.m_maxCount > 0) {
            while (this.m_logs.size() > this.m_maxCount) {
                const oldItem = this.m_logs.pop_front();
                this._onItemCompelte(oldItem);
            }
        }
        if (this.m_maxSize > 0) {
            while (this.m_size > this.m_maxSize) {
                const oldItem = this.m_logs.pop_front();
                if (oldItem) {
                    this.m_size -= oldItem.l.length;
                    assert(this.m_size >= 0);
                    this._onItemCompelte(oldItem);
                } else {
                    break;
                }
            }
        }
    }
}

class AsyncLogMemoryCache extends LogMemoryCache {
    constructor(options, target) {
        super(options, target);
        this.m_status = LogMemoryCacheStatus.READY;
    }
    output(logString, options, onComplete) {
        const item = {
            "l": logString,
            "o": options,
            "c": onComplete,
            "r": 0,
        };
        let ret = false;
        if (this.m_status === LogMemoryCacheStatus.READY &&
            this.m_logs.empty()) {
            ret = this._outputItem(item);
        } else {
            this._cacheItem(item, true);
        }
        return ret;
    }
    flush() {
        while (!this.m_logs.empty()) {
            const logItem = this.m_logs.pop_front();
            if (this._outputItem(logItem)) {
            } else {
                break;
            }
        }
    }
    _outputItem(logItem) {
        assert(this.m_status === LogMemoryCacheStatus.READY);
        this.m_status = LogMemoryCacheStatus.PENDING;
        let inCall = true;
        const outputRet = this.m_target.output(logItem.l, logItem.o, (ret) => {
            assert(this.m_status === LogMemoryCacheStatus.PENDING);
            this.m_status = LogMemoryCacheStatus.READY;
            if (ret === 0) {
                if (logItem.c) {
                    logItem.c(ret);
                }
                if (inCall) {
                    setTimeout(() => {
                        this._continue();
                    }, 0);
                } else {
                    this._continue();
                }
            } else {
                ++logItem.r;
                if (logItem.r > this.m_retryMaxCount) {
                    if (logItem.c) {
                        logItem.c(ErrorCode.RESULT_FAILED);
                    }
                    if (inCall) {
                        setTimeout(() => {
                            this._continue();
                        }, 0);
                    } else {
                        this._continue();
                    }
                } else {
                    this._cacheItem(logItem, false);
                    setTimeout(() => {
                        this._continue();
                    }, this.m_retryInterval);
                }
            }
        });
        inCall = false;
        if (outputRet) {
            this.m_status = LogMemoryCacheStatus.READY;
        }
        return outputRet;
    }
}

class SyncLogMemoryCache extends LogMemoryCache {
    constructor(options, target) {
        super(options, target);
        this.m_timer = null;
    }
    output(logString, options, onComplete) {
        const item = {
            "l": logString,
            "o": options,
            "c": onComplete,
            "r": 0,
        };
        let ret = false;
        if (this.m_logs.empty()) {
            ret = this._outputItem(item);
        } else {
            this._cacheLog(item, true);
        }
        return ret;
    }
    flush() {
        this._continue();
    }
    _outputItem(logItem) {
        let ret = this.m_target.output(logItem.l, logItem.o);
        if (ret) {
            if (logItem.c) {
                logItem.c(ret, logItem.l, logItem.o);
            }
        } else {
            this._cacheItem(logItem, false);
            if (this.m_timer == null) {
                this.m_timer = setTimeout(() => {
                    this.m_timer = null;
                    this._continue();
                } , this.m_retryInterval);
            }
        }
        return ret;
    }
}

class LogFileTarget {
    constructor(options) {
        assert(options.folder);
        assert(options.filename);
        this.m_folder = options.folder;
        this.m_filename = options.filename;
        this.m_filePath = null;
        this.m_fileMaxSize = 1024 * 1024 * 16;
        if (options.filemaxsize) {
            this.m_fileMaxSize = options.filemaxsize;
        }
        this.m_fileMaxCount = 10;
        if (options.filemaxcount) {
            this.m_fileMaxCount = options.filemaxcount;
        }
        this.m_fd = null;
        this.m_curFileIndex = 0;
        this.m_writtenSize = 0;
        this.m_retryInterval = 1000 * 5;
        this.m_status = 1;
        this._nextFilePath((index, filePath) => {
            this.m_curFileIndex = index;
            this.m_filePath = filePath;
            this._open();
        });
    }
    _nextFilePath(OnComplete) {
        let tm = null;
        let index = 0;
        let curIndex = this.m_curFileIndex;
        for (let i = 0; i < this.m_fileMaxCount; ++i) {
            const fullPath = this.m_folder + "/" + this.m_filename + "." + curIndex + ".log";
            if (!fs.existsSync(fullPath)) {
                index = curIndex;
                break;
            }
            const stat = fs.lstatSync(fullPath);
            if (stat.isFile()) {
                if (!tm) {
                    console.log("init index", curIndex, stat.mtime);
                    tm = stat.mtime;
                    index = curIndex;
                } else if (stat.mtime < tm) {
                    tm = stat.mtime;
                    console.log("update index", index, curIndex);
                    index = curIndex;
                }
            } else {
            }
            curIndex++;
            curIndex = curIndex % this.m_fileMaxCount;
        }
        const filePath = this.m_folder + "/" + this.m_filename + "." + index + ".log";
        console.log(filePath);
        OnComplete(index, filePath);
    }
}

class AsyncLogFileTarget extends LogFileTarget {
    constructor(options) {
        super(options);
        this.m_fs = null;
        this.m_ready = false;
    }
    output(logString, option, onComplete) {
        if (this.m_fs) {
            if (this.m_ready) {
                this.m_writtenSize += logString.length;
                if (this.m_writtenSize >= this.m_fileMaxSize) {
                    console.log("size extend!", this.m_writtenSize, this.m_fileMaxSize);
                    this._close();
                    this._nextFilePath((index, filePath) => {
                        this.m_curFileIndex = index;
                        this.m_filePath = filePath;
                        this._open();
                    });
                    onComplete(ErrorCode.RESULT_FAILED, logString, option);
                    return false;
                }
                this.m_ready = this.m_fs.write(logString + option.lbr, 'utf8', (err) => {
                    if (err) {
                        onComplete(ErrorCode.RESULT_FAILED, logString, option);
                    } else {
                        onComplete(0, logString, option);
                    }
                });
            } else {
                onComplete(ErrorCode.RESULT_FAILED, logString, option);
            }
        } else {
            onComplete(ErrorCode.RESULT_FAILED, logString, option);
        }
        return false;
    }
    flush() {
    }
    _close() {
        if (this.m_fd) {
            let fd = this.m_fd;
            this.m_fd = null;
            this.m_fs = null;
            this.m_ready = false;
            this.m_writtenSize = 0;
            fs.close(fd, () => {
                console.log("close fd success!", fd);
            });
        }
    }
    _open() {
        try {
            if (fs.existsSync(this.m_filePath)) {
                fs.removeSync(this.m_filePath);
            }
        } catch(e) {
            console.error('delete log file failed! file=', this.m_filePath, e);
        }
        fs.open(this.m_filePath, 'w+', (err, fd) => {
            if (err) {
                console.error("open log file failed: file={0}, err={1}", this.m_path, err);
                this._onOpenFailed(err);
            } else {
                console.info("open log file success: file={0}", this.m_filePath);
                this._onOpenSuccess(fd);
            }
        });
    }
    _onOpenSuccess(fd) {
        assert(!this.m_fs);
        assert(fd);
        const opt = {
            'flags': 'w',
            'fd': fd,
            'mode': 0o666,
            'autoClose': true,
        };
        this.m_fd = fd;
        this.m_fs = fs.createWriteStream(null, opt);
        this.m_ready = true;
        this.m_fs.on('drain', () => {
            this.m_ready = true;
        });
    }
    _onOpenFailed(err) {
        if (!fs.existsSync(this.m_folder)) {
            console.log("will create dir", this.m_folder);
            fs.ensureDir(this.m_folder, (err) => {
                if (err) {
                    console.error("create dir failed:", this.m_folder);
                    this._stopOpen(err);
                } else {
                    console.info("create dir success:", this.m_folder);
                    this._open();
                }
            });
        } else {
            this._stopOpen(err);
        }
    }
    _stopOpen(error) {
        setTimeout(() => {
            this._open();
        }, this.m_retryInterval);
    }
}

class SyncLogFileTarget extends LogFileTarget {
    constructor(options) {
        super(options);
        this.m_pos = 0;
    }
    output(logString, option) {
        if (this.m_fd == null) {
            return false;
        }
        this.m_writtenSize += logString.length;
        if (this.m_writtenSize >= this.m_fileMaxSize) {
            console.log("size extend:", this.m_writtenSize, this.m_fileMaxSize);
            this._close();
            let ret = false;
            this._nextFilePath((index, filePath) => {
                this.m_curFileIndex = index;
                this.m_filePath = filePath;
                ret = this._open();
            });
            if (!ret) {
                return false;
            }
        }
        let ret = true;
        try {
            this.m_pos += fs.writeSync(this.m_fd, logString + option.lbr, this.m_pos, 'utf8');
        } catch (error) {
            console.log('write log failed:', error, this.m_filePath, logString);
            ret = false;
        }
        return ret;
    }
    _open() {
        assert(this.m_fd == null);
        try {
            this.m_fd = fs.openSync(this.m_filePath, 'w+');
        } catch (error) {
            this.m_fd = null;
            console.error('open file failed:', this.m_filePath, error);
        }
        if (this.m_fd) {
            console.error("open log file success: file={0}", this.m_filePath);
            this.m_pos = 0;
            return true;
        } else {
            console.error("open log file failed: file={0}", this.m_filePath);
            this._onOpenFailed();
            return false;
        }
    }
    _close() {
        if (this.m_fd) {
            let fd = this.m_fd;
            this.m_fd = null;
            this.m_writtenSize = 0;
            try {
                fs.closeSync(fd);
                console.log("close fd success!", fd);
            } catch (error) {
                console.error("close fd failed!", fd, error);
            }
        }
    }
    _onOpenFailed(err) {
        if (!fs.existsSync(this.m_folder)) {
            console.log("will create dir", this.m_folder);
            try {
                fs.ensureDirSync(this.m_folder);
            } catch (err) {
                console.error("create dir exception:", this.m_folder, err);
            }
            if (fs.existsSync(this.m_folder)) {
                console.info("create dir success:", this.m_folder);
                this._open();
            } else {
                console.error("create dir failed:", this.m_folder);
                this._stopOpen(err);
            }
        } else {
            this._stopOpen(err);
        }
    }
    _stopOpen(error) {
        this.m_status = -1;
        this.m_lastOpenTime = new Date();
        setTimeout(() => {
            this._open();
        }, this.m_retryInterval);
    }
}
const LOG_AGENT_PROTOCAL_VERSION = 1;
const LOG_AGENT_MAGIC_NUM = 201707019;
const LOG_AGENT_CMD = {
    NONE: 0,
    REG: 1,
    LOG: 2
};
const MAX_SEQ = 4294967295;
const LogTCPTargetPackageHeader = {
    "magic": LOG_AGENT_MAGIC_NUM,
    "version": LOG_AGENT_PROTOCAL_VERSION,
    "cmd": 0,
    "seq": 0,
    "bodyLen": 0,
};
const g_logTCPTargetPackageHeaderSize = 20;

class LogTCPTargetPackageEncoder {
    constructor() {
        this.m_buffer = null;
        this.m_dataLength = 0;
    }
    encode(cmd, seq, logString) {
        const bodyLength = Buffer.byteLength(logString);
        const fullLength = g_logTCPTargetPackageHeaderSize + bodyLength;
        let buffer = Buffer.allocUnsafe(g_logTCPTargetPackageHeaderSize + bodyLength);
        buffer.writeUInt32LE(LogTCPTargetPackageHeader.magic, 0);
        buffer.writeUInt32LE(LogTCPTargetPackageHeader.version, 4);
        buffer.writeUInt32LE(cmd, 8);
        buffer.writeUInt32LE(seq, 12);
        buffer.writeUInt32LE(bodyLength, 16);
        buffer.write(logString, 20, bodyLength, "utf8");
        this.m_dataLength = fullLength;
        this.m_buffer = buffer;
    }
    getBuffer() {
        return this.m_buffer;
    }
    getDataLength() {
        return this.m_dataLength;
    }
    _grow(fullLength) {
    }
}

class LogTCPTarget {
    constructor(options) {
        assert(options);
        this.m_host = options.host;
        this.m_port = options.port;
        this.m_initString = options.init;
        if (this.m_initString) {
            assert(typeof this.m_initString === "string");
        }
        blog.info('options:', options);
        this.m_retryInterval = 1000 * 5;
        this.m_connected = false;
        this.m_pending = false;
        this.m_seq = 0;
        this.m_encoder = new LogTCPTargetPackageEncoder();
        this.m_needOpen = true;
        this._open();
    }
    increaseSeq() {
        ++this.m_seq;
        if (this.m_seq >= MAX_SEQ) {
            this.m_seq = 0;
        }
    }
    formatLog(logString) {
        if (logString[0] != '[') {
            return null;
        }
        let len = logString.length;
        let level = '',
            time = '',
            extInfo = '';
        let index = 1;
        for (; index < len && logString[index] != ']'; ++index) {
            level += logString[index];
        }
        index += 3;
        for (; index < len && logString[index] != ']'; ++index) {
            time += logString[index];
        }
        index += 3;
        for (; index < len && logString[index] != '>'; ++index) {
            extInfo += logString[index];
        }
        if (index == len) {
            return null;
        }
        let logBody = logString.slice(index + 2);
        let header = [BLogLevel.toLevel(level), new Date(time).getTime(), extInfo];
        return header.join('@') + '*' + logBody;
    }
    output(logString, option, OnComplete) {
        let ret;
        if (this.m_connected && !this.m_pending) {
            let formatString = this.formatLog(logString);
            assert(formatString);
            this.m_encoder.encode(LOG_AGENT_CMD.LOG, this.m_seq, formatString);
            this.increaseSeq();
            let needCallback = false;
            ret = this.m_sock.write(this.m_encoder.getBuffer(), 'binary', () => {
                if (needCallback) {
                    assert(this.m_pending);
                    this.m_pending = false;
                    OnComplete(0, logString, option);
                }
            });
            if (ret) {
                this.m_pending = false;
            } else {
                this.m_pending = true;
                needCallback = true;
            }
        } else {
            ret = false;
            OnComplete(ErrorCode.RESULT_FAILED, logString, option);
        }
        return ret;
    }
    _open() {
        assert(!this.m_sock);
        assert(!this.m_connected);
        this.m_sock = new net.Socket({
            "readable": false,
            "writable": true,
        });
        let parser = null;
        this.m_sock.on("connect", () => {
            BX_DEBUG('connect log sock target success!');
            parser = new LogTCPDataParser((header, buffer, pos) => {
                if (header.m_magicNum != LOG_AGENT_MAGIC_NUM) {
                    BX_WARN('magic num not match, header:', header);
                    return ErrorCode.RESULT_INVALID_PARAM;
                }
                if (header.m_cmd === LOG_AGENT_CMD.REG) {
                    let bodyData = buffer.toString('utf8', pos, pos + header.m_dataLength);
                    let body = JSON.parse(bodyData);
                    if (body.enableFileLog == 1) {
                        let logDir = '';
                        let logFileName = '';
                        if (body.logDir) {
                            logDir = body.logDir;
                        } else {
                            logDir = '/var/blog/' + body.serviceid;
                        }
                        if (body.logFileName) {
                            logFileName = body.logFileName;
                        } else {
                            logFileName = `${body.serviceid}[${body.nodeid}][${process.pid}]`;
                        }
                        BX_EnableFileLog(logDir, logFileName, null, body.logFileMaxSize, body.logFileMaxCount);
                        BX_INFO('return from agent, will output file log:', logDir, logFileName);
                    }
                } else if (header.m_cmd === LOG_AGENT_CMD.LOG) {
                }
                return ErrorCode.RESULT_OK;
            });
            this.m_needOpen = false;
            assert(!this.m_connected);
            this.m_connected = true;
            this._sendInitPackage();
        });
        this.m_sock.on("data", (data) => {
            if (!parser.pushData(data)) {
                BX_WARN(`parse data error`);
                this.m_sock.destroy();
            }
        });
        this.m_sock.on("close", (hadError) => {
            this.m_connected = false;
            parser = null;
            BX_DEBUG('log sock target connection closed! hadError=', hadError);
            this._retryConnect();
        });
        this.m_sock.on('error', (err) => {
            this.m_connected = false;
            parser = null;
            BX_WARN('connect log sock target err! err=', err);
        });
        this._connect();
    }
    _connect() {
        assert(this.m_sock);
        assert(!this.m_connected);
        const options = {
            "host": this.m_host,
            "port": this.m_port,
        };
        this.m_sock.connect(options);
    }
    _sendInitPackage() {
        if (this.m_initString) {
            this.m_encoder.encode(LOG_AGENT_CMD.REG, this.m_seq, this.m_initString);
            this.increaseSeq();
            this.m_sock.write(this.m_encoder.getBuffer(), 'binary');
        }
    }
    _retryConnect() {
        setTimeout(() => {
            this._connect();
        }, this.m_retryInterval);
    }
}

class LogTCPPackageHeader {
    constructor() {
        this.reset();
    }
    reset() {
        this.m_magicNum = LOG_AGENT_MAGIC_NUM;
        this.m_version = LOG_AGENT_PROTOCAL_VERSION;
        this.m_cmd = LOG_AGENT_CMD.NONE;
        this.m_dataLength = 0;
        this.m_seq = 0;
    }
    decode(buffer, pos) {
        if (buffer.length < pos + g_logTCPTargetPackageHeaderSize) {
            return false;
        }
        this.m_magicNum = buffer.readUInt32LE(pos);
        this.m_version = buffer.readUInt32LE(pos + 4);
        this.m_cmd = buffer.readUInt32LE(pos + 8);
        this.m_seq = buffer.readUInt32LE(pos + 12);
        this.m_dataLength = buffer.readUInt32LE(pos + 16);
        if (this.m_magicNum != LOG_AGENT_MAGIC_NUM) {
            BX_WARN(`magic num not match, magic=${this.m_magicNum}`);
            return false;
        }
        if (this.m_dataLength <= 0 || this.m_dataLength > PACKAGE_MAX_LENGTH) {
            BX_WARN(`invalid package length, length=${this.m_dataLength}`);
            return false;
        }
        return true;
    }
    getDataLength() {
        return this.m_dataLength;
    }
    getCmd() {
        return this.m_cmd;
    }
    getSeq() {
        return this.m_seq;
    }
    getInfo() {
        return {
            magicNum: this.m_magicNum,
            version: this.m_version,
            cmd: this.m_cmd,
            seq: this.m_seq,
            dataLength: this.m_dataLength
        };
    }
}
const PACKAGE_MAX_LENGTH = 1024 * 8;

class LogTCPDataParser {
    constructor(onRecvPackage) {
        this.m_dataBuffer = Buffer.allocUnsafe(PACKAGE_MAX_LENGTH + 1);
        this.m_onRecvPackage = onRecvPackage;
        this.m_header = new LogTCPPackageHeader();
        this.m_data = null;
        this.reset();
    }
    reset() {
        this.m_leftSize = g_logTCPTargetPackageHeaderSize;
        this.m_status = 0;
        this.m_dataSize = 0;
    }
    pushData(srcBuffer) {
        let srcLen = srcBuffer.length;
        let offset = 0;
        let ret = true;
        let copyLen = 0;
        let start = 0;
        let parsePos = 0;
        let parseBuffer = null;
        for (;;) {
            if (srcLen < this.m_leftSize) {
                copyLen = srcBuffer.copy(this.m_dataBuffer, this.m_dataSize, offset, offset + srcLen);
                this.m_dataSize += srcLen;
                this.m_leftSize -= srcLen;
                break;
            } else {
                if (this.m_dataSize != 0) {
                    copyLen = srcBuffer.copy(this.m_dataBuffer, this.m_dataSize, offset, offset + this.m_leftSize);
                    this.m_dataSize = 0;
                    parseBuffer = this.m_dataBuffer;
                    parsePos = 0;
                } else {
                    parseBuffer = srcBuffer;
                    parsePos = offset;
                }
                srcLen -= this.m_leftSize;
                offset += this.m_leftSize;
                if (this.m_status === 0) {
                    ret = this.onRecvHeader(parseBuffer, parsePos);
                } else if (this.m_status === 1) {
                    ret = this.onRecvBody(parseBuffer, parsePos);
                    this.reset();
                } else {
                    BX_WARN("unexpected status!", this.m_status);
                    ret = false;
                }
                if (!ret) {
                    break;
                }
            }
        }
        return ret;
    }
    onRecvHeader(buffer, pos) {
        if (!this.m_header.decode(buffer, pos)) {
            BX_WARN("decode header failed! ");
            return false;
        }
        assert(this.m_status === 0);
        this.m_status = 1;
        this.m_leftSize = this.m_header.m_dataLength;
        return true;
    }
    onRecvBody(buffer, pos) {
        let ret = this.m_onRecvPackage(this.m_header, buffer, pos);
        return ret === ErrorCode.RESULT_OK;
    }
}
const BLogLevel = {
    "ALL": 0,
    "TRACE": 1,
    "DEBUG": 2,
    "INFO": 3,
    "WARN": 4,
    "ERROR": 5,
    "CHECK": 6,
    "FATAL": 7,
    "CTRL": 8,
    "OFF": 9,
    "strings": ['all', 'trace', 'debug', 'info', 'warn', 'error', 'check', 'fatal', 'ctrl', 'off'],
    "toString": (level) => {
        return BLogLevel.strings[level];
    },
    "toLevel": (str) => {
        let level = BLogLevel[str.toUpperCase()];
        if (level == null) {
            level = 0;
        }
        return level;
    }
};

class BLogNormalFormatter {
    constructor() {
        this.m_converter = new BLogArgConvert();
        if (BLogEnv.platform() === "win32") {
            this.m_lineBreak = "\r\n";
        } else if (BLogEnv.platform() === "darwin") {
            this.m_lineBreak = "\r";
        } else if (BLogEnv.platform() === "wx") {
            this.m_lineBreak = "\n";
        } else {
            this.m_lineBreak = "\n";
        }
    }
    getLineBreak() {
        return this.m_lineBreak;
    }
    format(values, options) {
        let strValue = "";
        const separator = options.getSeparator();
        strValue += '[' + values.level + ']' + separator;
        strValue += '[' + BLogNormalFormatter.formatTime(values.time) + ']' + separator;
        strValue += values.traceInfo + separator;
        let stringHeaders = options.getStringHeaders();
        if (stringHeaders) {
            for (let item in stringHeaders) {
                strValue += stringHeaders[item];
                strValue += separator;
            }
        }
        strValue += this.formatArgs(values.args);
        if (values.pos) {
            strValue += separator + ' ' + values.pos.file + ':' + values.pos.line;
        }
        if (values.stack) {
            strValue += separator + 'stack:' + values.stack;
        }
        return strValue;
    }
    convertArg(arg) {
        let result;
        try {
            result = this.m_converter.convertArg(arg);
        } catch (err) {
            result = "[!!!exception args!!!]";
        }
        return result;
    }
    formatArgs(args) {
        if (args.length < 1) {
            return "";
        }
        let maxIndex = 0;
        let value = "";
        if (typeof args[0] === 'string') {
            value = args[0].replace(/{(\d+)}/g,
                (match, index) => {
                    const numIndex = parseInt(index) + 1;
                    if (numIndex > maxIndex) {
                        maxIndex = numIndex;
                    }
                    return this.convertArg(args[numIndex]);
                });
        } else {
            value = this.convertArg(args[0]);
        }
        for (let index = maxIndex + 1; index < args.length; ++index) {
            value += ' ' + this.convertArg(args[index]);
        }
        return value;
    }
    static fixNumber(num) {
        let ret;
        if (num >= 0 && num <= 9) {
            ret = '0' + num;
        } else {
            ret = num;
        }
        return ret;
    }
    static formatTime(date) {
        const dateString = date.getFullYear() + '-' + BLogNormalFormatter.fixNumber(date.getMonth() + 1) +
            '-' + BLogNormalFormatter.fixNumber(date.getDate()) +
            ' ' + BLogNormalFormatter.fixNumber(date.getHours()) +
            ':' + BLogNormalFormatter.fixNumber(date.getMinutes()) +
            ':' + BLogNormalFormatter.fixNumber(date.getSeconds()) +
            '.' + date.getMilliseconds();
        return dateString;
    }
}

class BLogOptions {
    constructor(options) {
        this.m_switch = true;
        this.m_level = BLogLevel.ALL;
        this.m_logger = "global";
        this.m_pos = true;
        this.m_stack = true;
        this.m_fullPath = false;
        this.m_headers = {};
        this.m_stringHeaders = {};
        this.m_separator = ',';
        this.m_targets = [];
        this.m_appid = null;
        this.m_cc = null;
        this.m_levelConfig = [];
        this._initDefaultLevelConfig();
        if (options) {
            this.m_parent = options;
            for (let item in options) {
                const type = typeof options[item];
                if (type !== "object") {
                    this[item] = options[item];
                }
            }
            for (const item in options.m_levelConfig) {
                this.m_levelConfig[item] = options.m_levelConfig[item];
            }
            this.m_targets = [];
            for (let i = 0; i < options.m_targets.length; ++i) {
                this.m_targets.push(options.m_targets[i]);
            }
            for (let item in options.m_headers) {
                this.m_headers[item] = options.m_headers[item];
            }
            for (let item in options.m_stringHeaders) {
                this.m_stringHeaders[item] = options.m_stringHeaders[item];
            }
        }
        if (!this.m_formatter) {
            this.m_formatter = new BLogNormalFormatter();
        }
        if (this.m_targets.length <= 0) {
            this.enableConsoleTarget(true);
        }
        BLogEnv.filterOptions(this);
    }
    _initDefaultLevelConfig() {
        for (let i = BLogLevel.ALL; i < BLogLevel.OFF; ++i) {
            this.m_levelConfig[i] = {
                on: true,
                stack: false,
                pos: this.m_pos,
            };
        }
        this.m_levelConfig[BLogLevel.CHECK].stack = true;
    }
    setSwitch(on) {
        if (on) {
            this.m_switch = true;
        } else {
            this.m_switch = false;
        }
    }
    _getLevelIndex(level) {
        let ret = 0;
        if (typeof(level) === "number") {
            ret = level;
        } else if (typeof(level) === "string") {
            ret = BLogLevel[level.toUpperCase()];
            if (typeof ret === 'undefined') {
                ret = 0;
            }
        } else {
            assert(false);
        }
        return ret;
    }
    setLevel(level) {
        let index = this._getLevelIndex(level);
        assert(index >= BLogLevel.ALL && index <= BLogLevel.OFF);
        if (index >= BLogLevel.OFF) {
            index = BLogLevel.OFF - 1;
        }
        for (let i = BLogLevel.ALL; i < index; ++i) {
            this.m_levelConfig[i].on = false;
        }
        for (let i = index; i < BLogLevel.OFF; ++i) {
            this.m_levelConfig[i].on = true;
        }
    }
    setLevelConfig(level, config) {
        const index = this._getLevelIndex(level);
        assert(index >= BLogLevel.ALL && index < BLogLevel.OFF);
        const levelConfig = this.m_levelConfig[index];
        for (const key of config) {
            levelConfig[key] = config[key];
            if (key === 'pos' && !this.m_pos) {
                levelConfig[key] = false;
            } else if (key === 'stack' && !this.m_stack) {
                levelConfig[key] = false;
            }
        }
    }
    getLevelConfig(level) {
        const index = this._getLevelIndex(level);
        assert(index >= BLogLevel.ALL && index < BLogLevel.OFF);
        return this.m_levelConfig[index];
    }
    isLevelOn(level) {
        const index = this._getLevelIndex(level);
        const levelConfig = this.m_levelConfig[index];
        if (levelConfig && levelConfig.on) {
            return true;
        } else {
            return false;
        }
    }
    isOn() {
        return this.m_switch;
    }
    clone() {
        return new BLogOptions(this);
    }
    setLoggerName(name) {
        this.m_logger = name;
    }
    getLoggerName() {
        return this.m_logger;
    }
    setFormatter(formatter) {
        this.m_formatter = formatter;
    }
    getFormatter() {
        return this.m_formatter;
    }
    setSeparator(separator) {
        this.m_separator = separator;
    }
    getSeparator() {
        return this.m_separator;
    }
    enablePos(enable) {
        this.m_pos = enable;
    }
    getPos() {
        return this.m_pos;
    }
    enableFullPath(enable) {
        this.m_fullPath = enable;
    }
    getFullPath() {
        return this.m_fullPath;
    }
    enableStack(enable) {
        this.m_stack = enable;
    }
    getStack() {
        return this.m_stack;
    }
    addHeader(name, value) {
        this.m_headers[name] = value;
        this.m_stringHeaders[name] = this.genStringHeader(name);
    }
    removeHeader(name) {
        delete this.m_headers[name];
        delete this.m_stringHeaders[name];
    }
    setAppID(appid) {
        this.m_appid = appid;
    }
    getAppID() {
        if (this.m_appid == null && this.m_parent) {
            this.m_appid = this.m_parent.getAppID();
        }
        return this.m_appid;
    }
    bindCC(cc) {
        this.m_cc = cc;
    }
    unbindCC() {
        const cc = this.m_cc;
        this.m_cc = null;
        return cc;
    }
    getCC() {
        return this.m_cc;
    }
    setTraceID(traceid) {
        this.m_traceid = traceid;
    }
    getTraceID() {
        return this.m_traceid;
    }
    genStringHeader(name) {
        let headerString = '[' + name + '=' + this.m_headers[name] + ']';
        return headerString;
    }
    getHeaders() {
        return this.m_headers;
    }
    getStringHeaders() {
        return this.m_stringHeaders;
    }
    getTargets() {
        return this.m_targets;
    }
    addTarget(target) {
        this.m_targets.push(target);
    }
    enableConsoleTarget(enable) {
        const defaultConsoleTarget = BLogGetDefaultConsoleTarget();
        if (enable) {
            let exists = false;
            if (this.m_targets.indexOf(defaultConsoleTarget) >= 0) {
                exists = true;
            }
            if (!exists) {
                this.m_targets.push(defaultConsoleTarget);
            }
            return defaultConsoleTarget;
        } else {
            let ret = false;
            const index = this.m_targets.indexOf(defaultConsoleTarget);
            if (index >= 0) {
                this.m_targets.splice(index, 1);
                ret = true;
            }
            return ret;
        }
    }
    addFileTarget(options) {
        let rootFolder;
        if (os.platform() === 'win32') {
            rootFolder = "C:\\blog\\";
        } else {
            rootFolder = "/var/blog/";
        }
        let fileName = path.basename(require.main.filename, ".js");
        if (!fileName || fileName.length <= 0) {
            fileName = "node";
        }
        const subFolder = fileName;
        fileName += "[" + process.pid + "]";
        const defaultOptions = {
            "rootFolder": rootFolder,
            "subFolder": subFolder,
            "filename": fileName,
            "filemaxsize": 1024 * 1024 * 16,
            "filemaxcount": 20,
        };
        if (options) {
            for (let item in options) {
                defaultOptions[item] = options[item];
            }
            if (defaultOptions.rootFolder[defaultOptions.rootFolder.length - 1] != '/' &&
                defaultOptions.rootFolder[defaultOptions.rootFolder.length - 1] != '\\') {
                defaultOptions.rootFolder += '/';
            }
        }
        defaultOptions.folder = defaultOptions.rootFolder + defaultOptions.subFolder;
        let target;
        if (options.mode && options.mode === 'sync') {
            let fileTarget = new SyncLogFileTarget(defaultOptions);
            target = new SyncLogMemoryCache({}, fileTarget);
        } else {
            let fileTarget = new AsyncLogFileTarget(defaultOptions);
            target = new AsyncLogMemoryCache({}, fileTarget);
        }
        this.m_targets.push(target);
        return target;
    }
    addSocketTarget(options) {
        assert(options.host);
        assert(options.port);
        const defaultOptions = {};
        for (const item in options) {
            defaultOptions[item] = options[item];
        }
        const sockTarget = new LogTCPTarget(defaultOptions);
        const target = new AsyncLogMemoryCache({}, sockTarget);
        this.m_targets.push(target);
        return target;
    }
}
function _BLogGetGlobalInstance() {
    if (global.__blog_instance__ == null) {
        global.__blog_instance__ = new BLog();
    }
    return global.__blog_instance__;
}
function _BLogGetGlobalOptions() {
    if (global.__blog_options__ == null) {
        global.__blog_options__ = new BLogOptions();
        const staticConfig = new BLogStaticConfig(global.__blog_options__);
        staticConfig.init();
    }
    return global.__blog_options__;
}
const BLogGetGlobalOptions = function() {
    let instance;
    return () => {
        if (instance == null) {
            instance = _BLogGetGlobalOptions();
        }
        return instance;
    };
}();

class BLog {
    constructor(options) {
        if (options) {
            this.m_options = new BLogOptions(options);
        } else {
            this.m_options = BLogGetGlobalOptions();
        }
    }
    getOptions() {
        return this.m_options;
    }
    setFunc(func) {
        this.m_framefunc = func;
    }
    log(level, frameIndex, args, cc) {
        const options = this.m_options;
        if (!options.isOn()) {
            return;
        }
        const levelConfig = options.getLevelConfig(level);
        if (levelConfig == null || !levelConfig.on) {
            return;
        }
        const values = {};
        if (cc == null) {
            cc = options.getCC();
        }
        if (cc) {
            values.traceInfo = `<${cc.appid || ''}@${cc.traceid || ''}@${cc.frameid || ''}@${cc.getSeq(true) || ''}>`;
        } else {
            const appid = options.getAppID();
            if (appid != null) {
                values.traceInfo = `<${appid}>`;
            } else {
                values.traceInfo = '<>';
            }
        }
        values.level = BLogLevel.toString(level);
        values.time = new Date();
        values.args = args;
        values.headers = options.getHeaders();
        if (levelConfig.pos || levelConfig.stack) {
            const info = {
                frame: frameIndex,
                pos: levelConfig.pos,
                fullpath: options.getFullPath(),
                stack: levelConfig.stack,
            };
            BLogStackHelper.getStack(info);
            if (levelConfig.pos && info.pos) {
                values.pos = info.pos;
                if (values.pos.file == null) {
                    values.pos.file = '[unknown]';
                }
            }
            if (levelConfig.stack && info.stack) {
                values.stack = info.stack;
            }
        }
        const formatter = options.getFormatter();
        assert(formatter);
        const stringValue = formatter.format(values, this.m_options);
        const targets = options.getTargets();
        const targetOptions = {
            "level": level,
            "lbr": formatter.getLineBreak(),
        };
        targets.forEach((target) => {
            target.output(stringValue, targetOptions);
        });
        return this;
    }
    bind(name, options) {
        if (options == null) {
            options = {};
        }
        for (const i in this.m_options) {
            if (!options[i]) {
                options[i] = this.m_options[i];
            }
        }
        const newObj = new BLog(options);
        const __Log = () => {
            return newObj.log(arguments);
        };
        newObj.setFunc(__Log);
        if (name) {
            module.exports[name] = __Log;
        }
        return __Log;
    }
    clone() {
        return new BLog(this.m_options.clone());
    }
}
const BLogGetDefaultLog = (() => {
    let logInstance = null;
    return () => {
        if (logInstance == null) {
            logInstance = _BLogGetGlobalInstance();
        }
        return logInstance;
    };
})();

class BLogManager {
    constructor() {
        this.m_loggers = {};
    }
    addLogger(name, obj) {
        assert(!this.m_loggers[name]);
        this.m_loggers[name] = obj;
    }
    getLogger(name, option) {
        let blogObj = this.m_loggers[name];
        if (!blogObj) {
            console.log("create new logger:", name);
            blogObj = new BLog(option);
            this.m_loggers[name] = blogObj;
        }
        return blogObj;
    }
}
const BLogGetLogManager = (() => {
    let managerInstance;
    return () => {
        if (!managerInstance) {
            managerInstance = new BLogManager();
        }
        return managerInstance;
    };
})();
function BLogModule(logObj) {
    let blog;
    let __cc;
    const getCC = () => {
        let ret = __cc;
        __cc = null;
        return ret;
    };
    const withcc = (cc) => {
        __cc = cc;
        return blog;
    };
    const trace = (...args) => {
        logObj.log(BLogLevel.TRACE, 1, args, getCC());
        return blog;
    };
    const debug = (...args) => {
        logObj.log(BLogLevel.DEBUG, 1, args, getCC());
        return blog;
    };
    const info = (...args) => {
        logObj.log(BLogLevel.INFO, 1, args, getCC());
    };
    const warn = (...args) => {
        logObj.log(BLogLevel.WARN, 1, args, getCC());
    };
    const error = (...args) => {
        logObj.log(BLogLevel.ERROR, 1, args, getCC());
    };
    const check = (exp, ...args) => {
        if (!exp) {
            logObj.log(BLogLevel.CHECK, 1, args, getCC());
        }
    };
    const fatal = (...args) => {
        logObj.log(BLogLevel.FATAL, 1, args, getCC());
    };
    const ctrl = (...args) => {
        logObj.log(BLogLevel.CTRL, 1, args, getCC());
    };
    const output = (level, frameIndex, args) => {
        logObj.log(level, frameIndex, args, getCC());
    }
    const getLogger = function(name, options) {
        if (!options) {
            options = logObj.getOptions();
        }
        let newLogObj = BLogGetLogManager().getLogger(name, options);
        newLogObj.getOptions().setLoggerName(name);
        return BLogModule(newLogObj);
    };
    const clone = (options) => {
        return BLogModule(logObj.clone(null, options));
    };
    const cloneCC = (cc) => {
        const newLogObj = logObj.clone();
        newLogObj.getOptions().bindCC(cc);
        return BLogModule(newLogObj);
    };
    const getOptions = () => {
        return logObj.getOptions();
    };
    const setLevel = (levelName) => {
        return logObj.getOptions().setLevel(levelName);
    };
    const setSwitch = (on) => {
        return logObj.getOptions().setSwitch(on);
    };
    const addHeader = (name, value) => {
        return logObj.getOptions().addHeader(name, value);
    };
    const removeHeader = (name, value) => {
        return logObj.getOptions().removeHeader(name, value);
    };
    const setAppID = (appid) => {
        return logObj.getOptions().setAppID(appid);
    };
    const getAppID = (appid) => {
        return logObj.getOptions().getAppID(appid);
    };
    const bindCC = (cc) => {
        return logObj.getOptions().bindCC(cc);
    };
    const unbindCC = () => {
        return logObj.getOptions().unbindCC();
    };
    const setSeparator = (separator) => {
        return logObj.getOptions().setSeparator(separator);
    };
    const enablePos = (enable) => {
        return logObj.getOptions().enablePos(enable);
    };
    const enableFullPath = (enable) => {
        return logObj.getOptions().enableFullPath(enable);
    };
    const addFileTarget = (options) => {
        return logObj.getOptions().addFileTarget(options);
    };
    const addSocketTarget = (options) => {
        return logObj.getOptions().addSocketTarget(options);
    };
    const addTarget = (target) => {
        return logObj.getOptions().addTarget(target);
    };
    const enableConsoleTarget = (enable) => {
        return logObj.getOptions().enableConsoleTarget(enable);
    };
    const _defaultFilter = (() => {
        const s_keyList = { 'password': true };
        const s_filter = new BLogKeyFilter(s_keyList);
        return () => {
            return s_filter;
        };
    })();
    const filter = (obj, keyList) => {
        let filter;
        if (keyList == null) {
            filter = _defaultFilter();
        } else {
            filter = new BLogKeyFilter(keyList);
        }
        return obj == null ? obj : filter.filter(obj);
    };
    blog = {
        "withcc": withcc,
        "trace": trace,
        "debug": debug,
        "info": info,
        "warn": warn,
        "error": error,
        "check": check,
        "fatal": fatal,
        "ctrl": ctrl,
        "log": info,
        "assert": check,
        "output": output,
        "getLogger": getLogger,
        "clone": clone,
        "cloneCC": cloneCC,
        "getOptions": getOptions,
        "setLevel": setLevel,
        "setSwitch": setSwitch,
        "addHeader": addHeader,
        "removeHeader": removeHeader,
        "setAppID": setAppID,
        "getAppID": getAppID,
        "bindCC": bindCC,
        "unbindCC": unbindCC,
        "setSeparator": setSeparator,
        "enablePos": enablePos,
        "enableFullPath": enableFullPath,
        "addTarget": addTarget,
        "addFileTarget": addFileTarget,
        "addSocketTarget": addSocketTarget,
        "enableConsoleTarget": enableConsoleTarget,
        'filter': filter,
    };
    return blog;
}
const blog = BLogModule(BLogGetDefaultLog());
const BLOG_LEVEL_ALL = BLogLevel.ALL;
const BLOG_LEVEL_TRACE = BLogLevel.TRACE;
const BLOG_LEVEL_DEBUG = BLogLevel.DEBUG;
const BLOG_LEVEL_INFO = BLogLevel.INFO;
const BLOG_LEVEL_WARN = BLogLevel.WARN;
const BLOG_LEVEL_ERROR = BLogLevel.ERROR;
const BLOG_LEVEL_CHECK = BLogLevel.CHECK;
const BLOG_LEVEL_FATAL = BLogLevel.FATAL;
const BLOG_LEVEL_OFF = BLogLevel.OFF;
function BX_SetLogLevel(level) {
    blog.setLevel(level);
}
function BX_EnableFileLog(filedir, appid, fileNameExtra = null, filemaxsize = null, filemaxcount = null) {
    let logOptions = {};
    if (path.isAbsolute(filedir)) {
        logOptions.rootFolder = filedir;
        logOptions.subFolder = "";
    } else {
        logOptions.subFolder = filedir;
    }
    if (!appid || appid === '') {
        assert(false);
    }
    let filename = appid;
    if (fileNameExtra) {
        filename += fileNameExtra;
    }
    logOptions.filename = filename;
    if (filemaxsize) {
        logOptions.filemaxsize = filemaxsize;
    }
    if (filemaxcount) {
        logOptions.filemaxcount = filemaxcount;
    }
    let target = blog.addFileTarget(logOptions);
    blog.enableConsoleTarget(true);
}
function BX_EnableSocketLog(options) {
    let targetInitString;
    let logDir = '';
    let logFileName = '';
    if (options.init) {
        assert(typeof options.init === 'string');
        targetInitString = options.init;
    } else {
        assert(typeof options.service === 'string');
        assert(options.nodeid == null || typeof options.nodeid === 'number' || typeof options.nodeid === 'string');
        if (options.nodeid == null) {
            options.nodeid = '';
        }
        let initInfo = {
            serviceid: options.service,
            nodeid: options.nodeid,
            logFileMaxCount: 20,
            logFileMaxSize: 1024 * 1024 * 16,
            enableFileLog: 0
        };
        logDir = '/var/blog/' + options.service;
        logFileName = options.service;
        if (options.nodeid != '') {
            logFileName += '[' + options.nodeid + ']';
        }
        logFileName += '[' + process.pid + ']';
        if (options.logDir) {
            logDir = options.logDir;
        }
        if (options.logFileName) {
            logFileName = options.logFileName;
        }
        initInfo.logDir = logDir;
        initInfo.logFileName = logFileName;
        if (options.enableFileLog != null) {
            initInfo.enableFileLog = options.enableFileLog;
        }
        if (options.logFileMaxCount) {
            initInfo.logFileMaxCount = options.logFileMaxCount;
        }
        if (options.logFileMaxSize) {
            initInfo.logFileMaxSize = options.logFileMaxSize;
        }
        targetInitString = JSON.stringify(initInfo);
    }
    const targetDefaultOptions = {
        host: '127.0.0.1',
        port: 6110,
        init: targetInitString,
    };
    for (const item in options) {
        targetDefaultOptions[item] = options[item];
    }
    blog.addSocketTarget(targetDefaultOptions);
}
function BX_EnableLogAutoUpload(watcherid, logPaths, host) {
    if (BaseLib.fileExistsSync(__dirname + "/logUploader.js")) {
        let watchpaths = [];
        let logPathsType = Object.prototype.toString.call(logPaths).toLowerCase();
        if (logPathsType === '[object array]') {
            watchpaths = logPaths.slice(0);
        } else if (logPathsType === '[object string]') {
            watchpaths.push(logPaths);
        } else {
            BX_ERROR('unexpect type of logPaths, must be an array or a string!');
            return;
        }
        watchpaths.forEach((logPath) => {
            BaseLib.mkdirsSync(logPath);
        });
        BX_DEBUG('log paths:', JSON.stringify(watchpaths));
        let args = [
            "-host", host,
            "-watcherid", watcherid,
            "-watchpaths", JSON.stringify(watchpaths),
            "-linebreak", JSON.stringify(blog.getOptions().m_formatter.m_lineBreak)
        ];
        let master = new CommensalMaster(__dirname + "/logUploader.js", args, {});
        master.start();
    } else {
        BX_ERROR('file logUploader.js not found!');
    }
}
function assert_dummy(val) {}
var assert = assert || assert_dummy;

class CryptoUtility {
    static getRandomNum(min, max) {
        let range = max - min;
        let thisValue = Math.random();
        return (min + Math.round(thisValue * range));
    }
    static getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min)) + min;
    }
    static sortObject(object) {
        var sortedObj = {},
            keys = Object.keys(object);
        keys.sort(function(key1, key2) {
            key1 = key1.toLowerCase(), key2 = key2.toLowerCase();
            if (key1 < key2) return -1;
            if (key1 > key2) return 1;
            return 0;
        });
        for (var index in keys) {
            var key = keys[index];
            if (typeof object[key] == 'object' && !(object[key] instanceof Array)) {
                sortedObj[key] = BaseLib.sortObject(object[key]);
            } else {
                sortedObj[key] = object[key];
            }
        }
        return sortedObj;
    }
    static hash(method, s, format) {
        var sum = crypto.createHash(method);
        var isBuffer = Buffer.isBuffer(s);
        if (!isBuffer && typeof s === 'object') {
            s = JSON.stringify(BaseLib.sortObject(s));
        }
        sum.update(s, isBuffer ? 'binary' : 'utf8');
        return sum.digest(format || 'hex');
    }
    static md5(s, format) {
        return BaseLib.hash('md5', s, format);
    }
    static privateEncrypt( private_key, text) {
        return crypto.privateEncrypt(private_key, Buffer.from(text))
            .toString('base64');
    }
    static publicDecrypt( public_key, ciphertext) {
        return crypto.publicDecrypt(public_key, Buffer.from(ciphertext, 'base64'))
            .toString();
    }
}

class FileUtility {
    static fsExistsSync(filePath) {
        try {
            return fs.statSync(filePath);
        } catch (err) {
            return false;
        }
    }
    static fileExistsSync(filePath) {
        try {
            return fs.statSync(filePath).isFile();
        } catch (err) {
            return false;
        }
    }
    static dirExistsSync(filePath) {
        try {
            return fs.statSync(filePath).isDirectory();
        } catch (err) {
            return false;
        }
    }
    static mkdirsSync(dirpath, mode) {
        dirpath = path.normalize(dirpath);
        try {
            if (!FileUtility.dirExistsSync(dirpath)) {
                var pathtmp = "";
                dirpath.split(path.sep).forEach(function(dirname) {
                    if (dirname.length == 0) {
                        pathtmp = path.sep;
                    }
                    if (pathtmp.length > 0) {
                        pathtmp = path.join(pathtmp, dirname);
                    } else {
                        pathtmp = dirname;
                    }
                    if (!FileUtility.dirExistsSync(pathtmp)) {
                        console.log("makdir: " + pathtmp);
                        if (!fs.mkdirSync(pathtmp, mode)) {
                            return false;
                        }
                    }
                });
            }
        } catch (err) {
            return false;
        }
        return true;
    }
    static deleteFolderRecursive(dir) {
        if (FileUtility.dirExistsSync(dir)) {
            fs.readdirSync(dir).forEach(function(file, index) {
                var curDir = dir + "/" + file;
                if (fs.lstatSync(curDir).isDirectory()) {
                    FileUtility.deleteFolderRecursive(curDir);
                } else {
                    fs.unlinkSync(curDir);
                }
            });
            fs.rmdirSync(dir);
        }
    }
    static findSync(root, pattern, recoursive) {
        if (typeof pattern === 'boolean') {
            recoursive = pattern;
            pattern = undefined;
        }
        let files = [];
        fs.readdirSync(root).forEach(function(file) {
            const fullFileName = path.join(root, file);
            if (FileUtility.dirExistsSync(fullFileName) && recoursive) {
                files = files.concat(FileUtility.findSync(fullFileName, pattern, recoursive));
            }
            if (!pattern || pattern.test(fullFileName)) {
                files.push(path.normalize(fullFileName) + (FileUtility.dirExistsSync(fullFileName) ? path.sep : ""));
            }
        });
        return files;
    }
    static findOnceSync(root, pattern, type, recoursive) {
        if (FileUtility.dirExistsSync(root)) {
            const files = fs.readdirSync(root);
            for (const i in files) {
                const fullFileName = path.join(root, files[i]);
                let exist = FileUtility.fsExistsSync(fullFileName);
                if (exist) {
                    if (exist.isFile()) {
                        if (type == 'file') {
                            if (pattern.test(fullFileName)) {
                                return path.normalize(fullFileName);
                            }
                        }
                    } else if (exist.isDirectory()) {
                        if (type == 'dir') {
                            if (pattern.test(fullFileName)) {
                                return path.normalize(fullFileName) + path.sep;
                            }
                        }
                        if (recoursive == true) {
                            let sub = FileUtility.findOnceSync(fullFileName, pattern, type, recoursive);
                            if (sub != null) {
                                return sub;
                            }
                        }
                    }
                }
            }
        }
        return null;
    }
    static findOutFile(root, target, type, start_here) {
        if (start_here) {
        } else {
            root = path.dirname(root);
        }
        let condition = true;
        while (condition) {
            var name = FileUtility.findOnceSync(root, target, type);
            if (name != null) {
                BX_INFO(name);
                return name;
            } else {
                var old = root;
                root = path.dirname(root);
                if (old === root) {
                    return null;
                }
            }
        }
    }
    static findFiles(root) {
        return FileUtility.findSync(root, true);
    }
    static writeFileTo( fileName, content, overwrite, attr) {
        if (FileUtility.fileExistsSync(fileName)) {
            if (!overwrite) {
                return false;
            }
        }
        var folder = path.dirname(fileName);
        if (!FileUtility.dirExistsSync(folder)) {
            FileUtility.mkdirsSync(folder);
        }
        try {
            var fd;
            try {
                fd = fs.openSync(fileName, 'w', 438);
            } catch (e) {
                fs.chmodSync(fileName, 438);
                fd = fs.openSync(fileName, 'w', 438);
            }
            if (fd) {
                fs.writeSync(fd, content, 0, content.length, 0);
                fs.closeSync(fd);
            }
            fs.chmodSync(fileName, attr || 438);
        } catch (e) {
            return false;
        }
        return true;
    }
    static writeFileToAsync( filePath, content, overwrite, attr, callback) {
        if (typeof attr === 'function') {
            callback = attr;
            attr = undefined;
        }
        if (FileUtility.fileExistsSync(filePath)) {
            if (!overwrite) {
                callback(false);
                return;
            }
        }
        var folder = path.dirname(filePath);
        if (!FileUtility.dirExistsSync(folder)) {
            FileUtility.mkdirsSync(folder);
        }
        fs.open(filePath, 'w', 438, function(err, fd) {
            if (err) {
                fs.chmod(filePath, 438, function(err) {
                    if (err) {
                        callback(false);
                        return;
                    }
                    fs.open(filePath, 'w', 438, function(err, fd) {
                        fs.write(fd, content, 0, content.length, 0, function(err, written, buffer) {
                            fs.close(fd, function(err) {
                                fs.chmod(filePath, attr || 438, function() {
                                    callback(true);
                                });
                            });
                        });
                    });
                });
            } else {
                if (fd) {
                    fs.write(fd, content, 0, content.length, 0, function(err, written, buffer) {
                        fs.close(fd, function(err) {
                            fs.chmod(filePath, attr || 438, function() {
                                callback(true);
                            });
                        });
                    });
                } else {
                    fs.chmod(filePath, attr || 438, function() {
                        callback(true);
                    });
                }
            }
        });
    }
}

class HTTPUtility {
    static xmlHttpRequest(method, url, headers, body, options, onComplete) {
        assert(typeof onComplete === 'function');
        const cc = getCurrentCallChain();
        let complete = false;
        const fireComplete = (resp, status, errCode) => {
            if (!complete) {
                complete = true;
                onComplete(resp, status, errCode);
            } else {
                BX_WARN('fire complete more than once!', resp, status, errCode);
            }
        };
        let timeoutTimer;
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = () => {
            if (xmlhttp.readyState === xmlhttp.DONE) {
                BX_LEAVE_ASYNC_CALL(cc);
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                }
                let errCode = 0;
                if (xmlhttp.status !== 200) {
                    errCode = ErrorCode.RESULT_REQUEST_ERROR;
                }
                fireComplete(xmlhttp.responseText, xmlhttp.status, errCode);
            }
        };
        xmlhttp.ontimeout = (err) => {
            BX_LEAVE_ASYNC_CALL(cc);
            fireComplete(null, 504, ErrorCode.RESULT_TIMEOUT);
        };
        xmlhttp.open(method, url, true);
        if (headers) {
            for (const key in headers) {
                xmlhttp.setRequestHeader(key, headers[key]);
            }
        }
        if (options && options.timeout) {
            timeoutTimer = setTimeout(() => {
                if (xmlhttp.status !== xmlhttp.DONE) {
                    xmlhttp.abort();
                }
            }, options.timeout);
        }
        BX_ENTER_ASYNC_CALL();
        xmlhttp.send(body);
    }
    static postJSON(postURL, postBody, options, onComplete) {
        if (typeof options === 'function') {
            assert(onComplete == null);
            onComplete = options;
            options = {};
        } else {
            assert(typeof options === 'object');
            assert(typeof onComplete === 'function');
        }
        const strPostBody = JSON.stringify(postBody);
        HTTPUtility.postData(postURL, strPostBody, options, (strResp, status, errCode) => {
            let jsonResp = null;
            if (strResp) {
                try {
                    jsonResp = JSON.parse(strResp);
                } catch (err) {
                    onComplete(jsonResp, status, ErrorCode.RESULT_PARSE_ERROR);
                    return;
                }
            }
            onComplete(jsonResp, status, errCode);
        });
    }
    static deleteDataEx(deleteUrl, headers, body, options, onComplete) {
        if (typeof options === 'function') {
            assert(onComplete == null);
            onComplete = options;
            options = {};
        } else {
            assert(typeof options === 'object');
            assert(typeof onComplete === 'function');
        }
        return HTTPUtility.xmlHttpRequest('DELETE', deleteUrl, headers, body, options, onComplete);
    }
    static postJSONEx(postURL, postBody, options, onComplete) {
        const strPostBody = JSON.stringify(postBody);
        const headers = { "Content-Type": "application/json" };
        HTTPUtility.postDataEx(postURL, headers, strPostBody, options, onComplete);
    }
    static isJSONEmpty(jsonObj) {
        return (Object.keys(jsonObj).length == 0);
    }
    static postData(postURL, postBody, options, onComplete) {
        if (typeof options === 'function') {
            assert(onComplete == null);
            onComplete = options;
            options = {};
        } else {
            assert(typeof options === 'object');
            assert(typeof onComplete === 'function');
        }
        const headers = { "Content-Type": "application/x-www-form-urlencoded" };
        HTTPUtility.xmlHttpRequest('POST', postURL, headers, postBody, options, (responseText, status, errCode) => {
            if (status === 200 && errCode === 0) {
                onComplete(responseText, status, errCode);
            } else {
                onComplete(null, status, errCode);
            }
        });
    }
    static postDataEx(postURL, headers, postBody, options, onComplete) {
        if (typeof options === 'function') {
            assert(onComplete == null);
            onComplete = options;
            options = {};
        } else {
            assert(typeof options === 'object');
            assert(typeof onComplete === 'function');
        }
        if (!headers || !headers["Content-Type"]) {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
        HTTPUtility.xmlHttpRequest('POST', postURL, headers, postBody, options, (responseText, status, errCode) => {
            onComplete(responseText, status, errCode);
        });
    }
    static getData(postURL, options, onComplete) {
        if (typeof options === 'function') {
            assert(onComplete == null);
            onComplete = options;
            options = {};
        } else {
            assert(typeof options === 'object');
            assert(typeof onComplete === 'function');
        }
        const headers = { "Content-Type": "application/x-www-form-urlencoded" };
        HTTPUtility.xmlHttpRequest('GET', postURL, headers, null, options, (responseText, status, errCode) => {
            onComplete(responseText, status, errCode);
        });
    }
    static syncGetData(postURL) {
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", postURL, false);
        xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        xmlhttp.send(null);
        if (xmlhttp.status == 200) {
            return [xmlhttp.responseText, 200, ErrorCode.RESULT_OK];
        } else {
            return [xmlhttp.responseText, xmlhttp.status, ErrorCode.RESULT_FAILED];
        }
    }
    static postJSONCall(postURL, postBody, options, onComplete) {
        if (typeof options === 'function') {
            assert(onComplete == null);
            onComplete = options;
            options = {};
        } else {
            assert(typeof options === 'object');
            assert(typeof onComplete === 'function');
        }
        HTTPUtility.postJSON(postURL, postBody, options, (jsonResp, statusCode, errCode) => {
            if (statusCode === 200 && errCode !== ErrorCode.RESULT_PARSE_ERROR) {
                if (jsonResp) {
                    const result = BaseLib.decodeResultFromJSON(jsonResp);
                    if (result.seq == postBody.seq) {
                        if (errCode == null || errCode === 0) {
                            errCode = result.error_code;
                        }
                        onComplete(result.result, statusCode, errCode);
                    } else {
                        onComplete(null, statusCode, errCode);
                    }
                } else {
                    onComplete(null, statusCode, errCode);
                }
            } else {
                onComplete(null, statusCode, errCode);
            }
        });
    }
    static genBusURL(nodeInfo) {
        let schema = "ws://";
        assert(nodeInfo.addr.host && nodeInfo.addr.port);
        const url = `${schema}${nodeInfo.addr.host}:${nodeInfo.addr.port}`;
        BX_INFO("get bus url from nodeInfo:" + nodeInfo + ", url:" + url);
        return url;
    }
    static genRuntimeURL(nodeInfo) {
        assert(nodeInfo.runtime_id);
        let schema = "http://";
        assert(nodeInfo.addr);
        assert(nodeInfo.addr.host != null && nodeInfo.addr.port != null);
        const address = schema + nodeInfo.addr.host + ":" + nodeInfo.addr.port;
        return address;
    }
}

class PathUtility {
    constructor() {}
    static isSeparator(char) {
        return (char === '/' || char === '\\');
    }
    static isRelative(path) {
        if (path == null || path.length <= 0) {
            return true;
        }
        if (PathUtility.isSeparator([path[0]])) {
            return false;
        } else if (path[0] !== '\0' && path[1] === ':') {
            return false;
        } else {
            return true;
        }
    }
    static findExt(path) {
        let extPos;
        for (let pos = path.length; pos >= 0; --pos) {
            const ch = path.charAt(pos);
            if (ch === '.') {
                extPos = pos;
                break;
            } else if (ch === '/' || ch === '\\') {
                break;
            }
        }
        if (extPos) {
            return path.slice(extPos);
        } else {
            return null;
        }
    }
    static combine(dir, file) {
        let needStart = false;
        if(dir[0] == "/") {
            needStart = true;
        }
        if (dir == null || dir.length === 0) {
            return file;
        } else if (file == null || file.length === 0) {
            return dir;
        } else {
            const dirParts = PathUtility._parse(dir);
            const fileParts = PathUtility._parse(file);
            const fullParts = dirParts.concat(fileParts);
            const newParts = [];
            for (let part of fullParts) {
                if (part == null || part.length === 0 || part === '.') {
                    continue;
                }
                if (part === '..') {
                    if (newParts.length !== 0) {
                        const last = newParts[newParts.length - 1];
                        if (last === '') {
                            break;
                        } else if (last === '..') {
                        } else {
                            newParts.pop();
                        }
                    } else {
                        newParts.push(part);
                    }
                } else {
                    newParts.push(part);
                }
            }
            if(needStart) {
                return "/" + newParts.join('/');
            }
            return newParts.join('/');
        }
    }
    static _parse(path) {
        return path.split(/[\\/]/);
    }
}
const URLKnownProtocol = ['http', 'https', 'ftp', 'ws', 'wss'];

class URLPath {
    constructor(url) {
        this.m_url = url;
        this.m_parts = null;
    }
    get url() {
        return this.m_url;
    }
    getURL() {
        return this.m_url;
    }
    clone() {
        return new URLPath(this.m_url);
    }
    append(url) {
        const parts = this._parse(url);
        const fullParts = this._parts().concat(parts);
        const newParts = [];
        for (let part of fullParts) {
            if (part == null || part.length === 0 || part === '.') {
                continue;
            }
            if (part === '..') {
                if (newParts.length !== 0) {
                    const last = newParts[newParts.length - 1];
                    if (last === '') {
                        return false;
                    } else if (last === '..') {
                    } else {
                        newParts.pop();
                    }
                } else {
                    newParts.push(part);
                }
            } else {
                newParts.push(part);
            }
        }
        this.m_parts = newParts;
        this._genURL(newParts);
        return true;
    }
    checkProtocol(value) {
        const lowerValue = value.toLowerCase();
        for (const item of URLKnownProtocol) {
            if (item === lowerValue || item + ':' === lowerValue) {
                return true;
            }
        }
        return false;
    }
    trimRight() {
        const parts = this._parts();
        if (parts.length >= 2) {
            const last = parts[parts.length - 1];
            if (last === '') {
                if (!this.checkProtocol(parts[parts.length - 2])) {
                    parts.pop();
                    this._genURL(parts);
                }
            }
        }
    }
    removeFileName() {
        const parts = this._parts();
        parts.pop();
        this._genURL(parts);
    }
    _parse(path) {
        return path.split(/[\\/]/);
    }
    _parts() {
        if (this.m_parts == null) {
            this.m_parts = this._parse(this.m_url);
            this.trimRight();
        }
        return this.m_parts;
    }
    _genURL(parts) {
        let url;
        parts.forEach((item, index) => {
            if (index === 0) {
                url = item;
                if (this.checkProtocol(item)) {
                    url += '/';
                }
            } else {
                url += '/' + item;
            }
        }, this);
        this.m_url = url;
    }
}

class PlatformUtility {
    static getClientType() {
        return RuntimeType.PC_SERVER_BUCKY;;
    }
    static getClientMode() {
        return 'normal';
    }
    static getLocalIp(name, type) {
        const list = [];
        const ifaces = os.networkInterfaces();
        for (const dev in ifaces) {
            if (dev.indexOf(name) != -1) {
                if (type == 4) {
                    ifaces[dev].forEach(function(details) {
                        if (details.family == 'IPv4') {
                            list.push({ "name": dev, "ip": details.address });
                        }
                    });
                } else if (type == 6) {
                    ifaces[dev].forEach(function(details) {
                        if (details.family == 'IPv6') {
                            list.push({ "name": dev, "ip": details.address });
                        }
                    });
                }
            }
        }
        return list;
    }
}

class StringUtility {
    static replaceAll(stringValue, search, replacement) {
        if (typeof(stringValue) === 'string') {
            return stringValue.replace(new RegExp(search, 'g'), replacement);
        }
        return null;
    }
    static parseFunctionName(functionName) {
        let listA = functionName.split("@");
        if (listA.length > 2) {
            return null;
        }
        let instanceID = null;
        if (listA.length == 2) {
            instanceID = listA[1];
        }
        let listB = listA[0].split("::");
        if (listB.length != 2) {
            return null;
        }
        let functionID = listB[1];
        let listC = listB[0].split(":");
        if (listC.length > 2) {
            return null;
        }
        let packageInfo = null;
        let moduleID = null;
        if (listC.length == 2) {
            packageInfo = listC[0];
            moduleID = listC[1];
        } else {
            moduleID = listC[0];
        }
        let result = {};
        result.packageInfo = packageInfo;
        result.moduleID = moduleID;
        result.functionID = functionID;
        result.instanceID = instanceID;
        return result;
    }
    static parseModuleName(moduleName) {
        let listA = moduleName.split(":");
        if (listA.length === 0 || listA.length > 2) {
            return null;
        }
        let packageInfo = null;
        let moduleID = null;
        if (listA.length == 2) {
            packageInfo = listA[0];
            moduleID = listA[1];
        } else {
            moduleID = listA[0];
        }
        let result = {};
        result.packageInfo = packageInfo;
        result.moduleID = moduleID;
        return result;
    }
    static inet_aton(ip) {
        var a = ip.split('.');
        var buffer = new ArrayBuffer(4);
        var dv = new DataView(buffer);
        for (var i = 0; i < 4; i++) {
            dv.setUint8(i, a[i]);
        }
        return (dv.getUint32(0));
    }
    static inet_ntoa(num) {
        var nbuffer = new ArrayBuffer(4);
        var ndv = new DataView(nbuffer);
        ndv.setUint32(0, num);
        var a = new Array();
        for (var i = 0; i < 4; i++) {
            a[i] = ndv.getUint8(i);
        }
        return a.join('.');
    }
    static isBlank(str) {
        return (!str || /^\s*$/.test(str));
    }
    static createUID(typeid, levelid, parentid = "") {
        let guid = StringUtility.createGUID();
        return typeid + '@' + levelid + '@' + guid + '@' + parentid;
    }
    static decodeUID(uid) {
        let infos = uid.split('@');
        return { typeid: infos[0], levelid: infos[1], guid: infos[2], parentid: infos[3] };
    }
    static createGUID() {
        var s = [];
        var hexDigits = "0123456789abcdef";
        for (var i = 0; i < 36; i++) {
            s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        s[14] = "4";
        s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);
        s[8] = s[13] = s[18] = s[23] = "-";
        var uuid = s.join("");
        return uuid;
    }
    static parseRuntimeType(runtimeType) {
        let deviceType, subType;
        if (typeof runtimeType === 'string') {
            [deviceType, subType] = runtimeType.split('.');
        } else {
            BX_WARN('unknown runtime type:', runtimeType)
        }
        return [deviceType, subType];
     }
}

class TimeFormater {
    static init() {
        TimeFormater._inited = true;
        Date.prototype.Format = function(fmt) {
            var o = {
                "M+": this.getMonth() + 1,
                "d+": this.getDate(),
                "h+": this.getHours(),
                "m+": this.getMinutes(),
                "s+": this.getSeconds(),
                "q+": Math.floor((this.getMonth() + 3) / 3),
                "S": this.getMilliseconds()
            };
            if (/(y+)/.test(fmt)) {
                fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
            }
            for (var k in o) {
                if (new RegExp("(" + k + ")").test(fmt)) {
                    fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
                }
            }
            return fmt;
        };
    }
    static getFormatTimeHoursAgo(housrs, formatString) {
        if (!TimeFormater._inited) {
            TimeFormater.init();
        }
        if (!housrs) {
            housrs = 0;
        }
        if (formatString == null) {
            return new Date(Date.now() - housrs * TimeFormater._msInHour).Format("yyyy-MM-dd hh:mm:ss");
        }
        return new Date(Date.now() - housrs * TimeFormater._msInHour).Format(formatString);
    }
    static getFormatTimeSecondsAgo(seconds, formatString) {
        if (!TimeFormater._inited) {
            TimeFormater.init();
        }
        if (!seconds) {
            seconds = 0;
        }
        if (formatString == null) {
            return new Date(Date.now() - seconds * 1000).Format("yyyy-MM-dd hh:mm:ss");
        }
        return new Date(Date.now() - seconds * 1000).Format(formatString);
    }
    static getFormatTime(formatString) {
        if (!TimeFormater._inited) {
            TimeFormater.init();
        }
        if (formatString == null) {
            return new Date().Format("yyyy-MM-dd hh:mm:ss");
        }
        return new Date().Format(formatString);
    }
}
TimeFormater._inited = false;
TimeFormater._msInHour = 3600 * 1000;

class TimerUtility {
    static setTimer(func, timeout) {
        const cc = getCurrentCallChain();
        return setInterval(() => {
            beginSubCallChain(cc, 'setTimer');
            func();
        }, timeout);
    }
    static killTimer(timerID) {
        clearInterval(timerID);
    }
    static setInterval(func, interval) {
        const cc = getCurrentCallChain();
        return setInterval(() => {
            beginSubCallChain(cc, 'setInterval');
            func();
        }, interval);
    }
    static clearInterval(id) {
        return clearInterval(id);
    }
    static setOnceTimer(func, timeout) {
        const cc = getCurrentCallChain();
        return setTimeout(() => {
            beginSubCallChain(cc, 'setOnceTimer');
            func();
        }, timeout);
    }
    static killOnceTimer(timerID) {
        return clearTimeout(timerID);
    }
    static setTimeout(func, timeout) {
        const cc = getCurrentCallChain();
        return setTimeout(() => {
            beginSubCallChain(cc, 'setTimeout');
            func();
        }, timeout);
    }
    static clearTimeout(timerID) {
        return clearTimeout(timerID);
    }
    static asynCall(func, timeout = 0) {
        const cc = BX_ENTER_ASYNC_CALL();
        return setTimeout(() => {
            BX_LEAVE_ASYNC_CALL(cc);
            func();
        }, timeout);
    }
    static stopAsynCall(id) {
        clearTimeout(id);
    }
    static getNow() {
        return Date.now();
    }
}

class BuckyAsync {
    static retry(times, task, callback) {
        let attempt = 0;
        function retryAttempt() {
            task(function (err) {
                if (err && attempt++ < times) {
                    BaseLib.asynCall(retryAttempt);
                } else {
                    callback.apply(null, arguments);
                }
            });
        }
        retryAttempt();
    }
    static waterfall(tasks, callback) {
        if (!tasks.length) return callback();
        let util = null;
        util = require("util");
        let taskIndex = 0;
        function nextTask(args) {
            if (taskIndex === tasks.length) {
                return callback.apply(null, [null].concat(args));
            }
            const taskCallback = function (err, ...args) {
                if (err) {
                    if (util) BX_ERROR(`waterfall task return=${util.inspect(err)}`);
                    return callback.apply(null, [err].concat(args));
                }
                nextTask(args);
            };
            args.push(taskCallback);
            const task = tasks[taskIndex++];
            task.apply(null, args);
        }
        nextTask([]);
    }
    static once(callback) {
        let hadCalled = false;
        return (...args) => {
            if (!hadCalled) {
                hadCalled = true;
                callback.apply(null, args);
            }
        };
    }
    static parallel(tasks, callback) {
        callback = BuckyAsync.once(callback);
        const results = [];
        let count = 0;
        for (const key in tasks) {
            tasks[key]((err, result) => {
                count++;
                if (err) {
                    callback(err);
                } else {
                    results[key] = result;
                    if (count === Object.keys(tasks).length) {
                        callback(null, results);
                    }
                }
            });
        }
    }
    static map(coll, iteratee, callback) {
        const results = [];
        let occusError = false;
        let count = 0;
        if (coll.length == 0) {
            return callback(null, results);
        }
        for (let i = 0; i < coll.length; i++) {
            if (occusError) return;
            iteratee(coll[i], (err, result) => {
                if (occusError) return;
                results[i] = result;
                if (err) {
                    occusError = true;
                    return callback(err, results);
                }
                count++;
                if (count === coll.length) {
                    callback(null, results);
                }
            });
        }
    }
    static loadModule(moduleName) {
        return (cb) => {
            let thisRuntime = getCurrentRuntime();
            thisRuntime.loadModule(moduleName, cb);
        };
    }
    static loadModules(moduleNames) {
        return (cb) => {
            let thisRuntime = getCurrentRuntime();
            thisRuntime.loadModules(moduleNames, (modules) => {
                if (modules) {
                    return cb(null, modules);
                }
                cb(`could not load ${moduleNames}`);
            });
        };
    }
    static step(step, count, asyncWork, onComplete) {
        BuckyAsync.stepImpl(0, step, count, asyncWork, onComplete);
    }
    static stepImpl(index, step, count, asyncWork, onComplete) {
        if (count === 0) {
            return onComplete(0);
        }
        let j = 0;
        let currentStep = step;
        let rest = count - index;
        if (rest < step) {
            currentStep = rest;
        }
        for (let i = 0; i < currentStep; i++) {
            let currentIndex = index + i;
            asyncWork(currentIndex, (err, result) => {
                if (err) {
                    return onComplete(err, result);
                }
                j++;
                if (j === currentStep) {
                    index += currentStep;
                    if (index >= count) {
                        onComplete(null);
                    } else {
                        BuckyAsync.stepImpl(index, step, count, asyncWork, onComplete);
                    }
                }
            });
        }
    }
}

class SimpleAsync {
    static parallel(arrayFuncs, callback) {
        assert(arrayFuncs instanceof Array);
        assert(callback);
        if (arrayFuncs.length === 0) {
            callback(0);
            return;
        }
        let finalRet = 0;
        let steps = arrayFuncs.length;
        const completeFunc = (ret) => {
            assert(steps > 0);
            --steps;
            if (finalRet === 0) {
                finalRet = ret;
                if (steps <= 0 || finalRet !== 0) {
                    callback(ret);
                }
            } else {
            }
        };
        for (let func of arrayFuncs) {
            func(completeFunc);
        }
    }
    static waterfall(arrayFuncs, callback) {
        assert(arrayFuncs instanceof Array);
        assert(callback);
        if (arrayFuncs.length === 0) {
            callback(0);
            return;
        }
        let index = 0;
        const completeFunc = (ret, ...paramlist) => {
            ++index;
            if (ret === 0) {
                if (index >= arrayFuncs.length) {
                    callback(ret, ...paramlist);
                } else {
                    arrayFuncs[index](completeFunc);
                }
            } else {
                callback(ret, ...paramlist);
            }
        };
        arrayFuncs[0](completeFunc);
    }
    static until(arrayFuncs, callback) {
        assert(arrayFuncs instanceof Array);
        assert(callback);
        if (arrayFuncs.length === 0) {
            callback(0);
            return;
        }
        let index = 0;
        const completeFunc = (ret, ...paramlist) => {
            ++index;
            if (ret !== 0) {
                if (index >= arrayFuncs.length) {
                    callback(ret, ...paramlist);
                } else {
                    arrayFuncs[index](completeFunc);
                }
            } else {
                callback(ret, ...paramlist);
            }
        };
        arrayFuncs[0](completeFunc);
    }
}

class AWaitPatch {
    static patchStaticFunction(c, func) {
        assert(typeof c[func] === 'function');
        const newName = '__' + func;
        if (c[newName] == null) {
            c[newName] = c[func];
            c[func] = async function() {
                if (typeof arguments[arguments.length - 1] === 'function') {
                    c[newName](...arguments);
                } else {
                    return new Promise((resolve) => {
                        c[newName](...arguments, function() {
                            resolve([...arguments]);
                        });
                    });
                }
            };
        }
    }
    static _patchProtoFunction(proto, func) {
        assert(typeof(proto[func]) === 'function');
        const newName = '__' + func;
        if (proto[newName] == null) {
            proto[newName] = proto[func];
            proto[func] = async function() {
                if (typeof arguments[arguments.length - 1] === 'function') {
                    this[newName](...arguments);
                } else {
                    return new Promise((resolve) => {
                        this[newName](...arguments, function() {
                            resolve([...arguments]);
                        });
                    });
                }
            };
        }
    }
    static patchMemberFunction(c, func) {
        assert(c.prototype);
        AWaitPatch._patchProtoFunction(c.prototype, func);
    }
    static patchMemberFunctionFromInstance(obj, func) {
        const proto = Object.getPrototypeOf(obj);
        assert(proto);
        AWaitPatch._patchProtoFunction(proto, func);
    }
    static patch(patchList) {
        for (const item of patchList) {
            if (item.class != null) {
                AWaitPatch.patchClass(item.class, item.mlist);
            } else {
            }
        }
    }
    static patchClass(c, memberList) {
        for (const member of memberList) {
            if (member.type === 1) {
                AWaitPatch.patchStaticFunction(c, member.name);
            } else {
                assert(member.type === 0);
                AWaitPatch.patchMemberFunction(c, member.name);
            }
        }
    }
}

class BaseCallChain {
    constructor(appid) {
        this.m_appid = appid;
         this.m_duringAsync = false;
    }
    get appid() {
        return this.m_appid;
    }
    enterAsyncCall() {
        this.m_duringAsync = true;
    }
    leaveAsyncCall() {
        this.m_duringAsync = false;
    }
    isDuringAsyncCall() {
        return this.m_duringAsync;
    }
}

class CallChain extends BaseCallChain {
    constructor(appid, parentid, ccid, frameid = 0, framename = null) {
        super(appid);
        this.m_parentid = parentid;
        this.m_ccid = ccid;
        let subCC = false;
        if (this.m_ccid == null || this.m_ccid == '') {
            this.m_ccid = BaseLib.createGUID();
            subCC = true;
        }
        this.m_end = false;
        this.m_frameid = frameid;
        if (this.m_frameid == null) {
            this.m_frameid = 0;
        }
        this.m_callStack = [];
        if (framename == null) {
            framename = '__ccbase';
        }
        this.m_frameid++;
        const frame = new CCFrame(this, this.m_frameid, framename);
        this.m_callStack.push(frame);
        this.m_blog = null;
    }
    get ccid() {
        return this.m_ccid;
    }
    get traceid() {
        return this.m_ccid;
    }
    get parentid() {
        return this.m_parentid;
    }
    get frameid() {
        return this.m_frameid;
    }
    getSeq(autoInc) {
        const frame = this.getCurrentFrame();
        if (frame) {
            return frame.getSeq(autoInc);
        } else {
            return -1;
        }
    }
    get blog() {
        if (this.m_blog == null) {
            this.m_blog = blog.cloneCC(this);
        }
        return this.m_blog;
    }
    getCurrentFrame() {
        assert(this.m_callStack.length > 0);
        if (this.m_callStack.length > 0) {
            return this.m_callStack[this.m_callStack.length - 1];
        } else {
            return null;
        }
    }
    enter(name) {
        this.checkEnd();
        this.m_frameid++;
        const frame = new CCFrame(this, this.m_frameid, name);
        this.m_callStack.push(frame);
        blog.withcc(this).ctrl(`!##ENTER CCFRAME, ${frame.name}@${frame.frameid}`);
        return frame;
    }
    leave(name) {
        this.checkEnd();
        const frame = this.getCurrentFrame();
        if (frame) {
            if (name == null || frame.name === name) {
                this.m_callStack.pop();
                --this.m_frameid;
                blog.withcc(this).ctrl(`!##LEAVE CCFRAME, ${frame.name}@${frame.frameid}`);
            } else {
                blog.withcc(this).fatal(`leave ccframe error, unmatch name: name=${name}, expect=${frame.name}`);
            }
        } else {
            blog.withcc(this).fatal(`leave ccframe error, empty callstack: func=${name}`);
        }
    }
    checkEnd() {
        if (this.m_end) {
            blog.withcc(this).fatal('cc is already ended!');
        }
    }
    end() {
        this.checkEnd();
        if (this.m_callStack.length > 1) {
            blog.withcc(this).fatal(`end error, still in frames! frame=${this.getCurrentFrame().name}`);
            return;
        } else if (this.m_callStack.length < 1) {
            blog.withcc(this).fatal('end error, base frame is not exists!');
            return;
        }
        this.m_isEnd = true;
        blog.withcc(this).ctrl('!##END CALLCHAIN');
        this.m_callStack.pop();
        --this.m_frameid;
    }
    subCC(firstFrameName) {
        return new CallChain(this.m_appid, this.m_ccid, null, 0, firstFrameName);
    }
    serialize(obj) {
        assert(typeof obj === 'object');
        obj.cc = {
            enable: true,
            appid: this.m_appid,
            ccid: this.m_ccid,
            frameid: this.m_frameid,
        };
    }
    static unserialize(obj, framename) {
        let appid = typeof obj.cc === 'object'? obj.cc.appid : null;
        if ((appid == null || appid == '' || appid === 'unknown') && (obj.appid || obj.app_id)) {
            if (obj.appid || obj.app_id) {
                appid = obj.appid || obj.app_id;
            } else if (blog.getAppID()) {
                appid = blog.getAppID();
            } else {
                appid = 'unknown';
            }
        }
        if (obj.cc && obj.cc.enable) {
            return new CallChain(appid, null, obj.cc.ccid || obj.cc.traceid, obj.cc.frameid, framename);
        } else {
            return new DummyCallChain(appid);
        }
    }
    static registerBLogMethods(type) {
        const methods = [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            "ctrl",
        ];
        for (const name of methods) {
            const level = BLogLevel.toLevel(name);
            assert(type.prototype[name] == undefined);
            type.prototype[name] = function(...args) {
                this.blog.output(level, 2, args);
            };
        }
        assert(type.prototype.log == undefined);
        type.prototype.log = function(...args) {
            this.blog.output(BLogLevel.INFO, 2, args);
        };
        assert(type.prototype.assert == undefined);
        type.prototype.assert = function(exp, ...args) {
            this.blog.assert(exp, args);
        };
        assert(type.prototype.check == undefined);
        type.prototype.check = function(exp, ...args) {
            this.blog.check(exp, args);
        };
        type.prototype.filter = blog.filter;
    }
    static outputLog(level, args) {
        const cc = getCurrentCallChain();
        cc.blog.output(level, 3, args);
    }
    static checkLog(exp, args) {
        const cc = getCurrentCallChain();
        cc.blog.check(exp, args);
    }
    static registerStaticBLogMethods(type) {
        const methods = [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            "ctrl",
        ];
        for (const name of methods) {
            const level = BLogLevel.toLevel(name);
            assert(type[name] == undefined);
            type[name] = function(...args) {
                CallChain.outputLog(level, args);
            };
        }
        assert(type.log == undefined);
        type.log = function(...args) {
            CallChain.outputLog(BLogLevel.INFO, args);
        };
        assert(type.assert == undefined);
        type.assert = function(...args) {
            CallChain.checkLog(args);
        };
        assert(type.check == undefined);
        type.check = function(...args) {
            CallChain.checkLog(args);
        };
        type.filter = blog.filter;
    }
    static _newCallChain(firstFrameName = null) {
        let appid = blog.getAppID();
        if (typeof getCurrentApp === 'function') {
            const app = getCurrentApp();
            if (app) {
                appid = app.getID();
            }
        }
        return new CallChain(appid, null, null, 0, firstFrameName);
    }
    static setCurrentCallChain(cc, firstFrameName = null) {
        if (cc) {
            CallChain.s_one = cc;
        } else {
            if (CallChain.s_one) {
                CallChain.s_one = CallChain.s_one.subCC(firstFrameName);
            } else {
                CallChain.s_one = CallChain._newCallChain(firstFrameName);
            }
        }
    }
    static beginSubCallChain(cc, firstFrameName) {
        let newCC;
        if (cc) {
            newCC = cc.subCC(firstFrameName);
        } else {
            newCC = CallChain._newCallChain(firstFrameName);
        }
        CallChain.setCurrentCallChain(newCC);
    }
    static getCurrentCallChain(firstFrameName = null) {
        if (CallChain.s_one == null) {
            CallChain.setCurrentCallChain(null, firstFrameName);
        } else if (CallChain.s_one.isDuringAsyncCall()) {
            CallChain.setCurrentCallChain(null, firstFrameName);
        }
        return CallChain.s_one;
    }
    static enterAsyncCall() {
        const cc = CallChain.getCurrentCallChain();
        cc.enterAsyncCall();
        return cc;
    }
    static leaveAsyncCall(cc) {
        assert(cc);
        cc.leaveAsyncCall();
        CallChain.setCurrentCallChain(cc);
    }
}

class CCFrame extends BaseCallChain {
    constructor(cc, frameid, name = '') {
        super(cc.appid);
        this.m_cc = cc;
        this.m_frameid = frameid;
        this.m_name = name;
        this.m_blog = null;
        this.m_seq = 0;
    }
    get cc() {
        return this.m_cc;
    }
    get ccid() {
        return this.m_cc.ccid;
    }
    get traceid() {
        return this.m_cc.traceid;
    }
    get parentid() {
        return this.m_cc.parentid;
    }
    get frameid() {
        return this.m_frameid;
    }
    get name() {
        return this.m_name;
    }
    get blog() {
        if (this.m_blog == null) {
            this.m_blog = this.m_cc.blog.cloneCC(this);
        }
        return this.m_blog;
    }
    getSeq(autoInc) {
        const ret = this.m_seq;
        if (autoInc) {
            ++this.m_seq;
        }
        return ret;
    }
    enter(name) {
        return this.m_cc.enter(name);
    }
    leave() {
        return this.m_cc.leave(this.m_name);
    }
    subCC(firstFrameName) {
        return new CallChain(this.appid, this.ccid, null, 0, firstFrameName);
    }
    serialize(obj) {
        assert(typeof obj === 'object');
        obj.cc = {
            enable: true,
            appid: this.appid,
            ccid: this.ccid,
            frameid: this.m_frameid,
        };
    }
}

class DummyCallChain extends BaseCallChain {
    constructor(appid) {
        super(appid);
    }
    get ccid() {
        return null;
    }
    get traceid() {
        return null;
    }
    get parentid() {
        return null;
    }
    get frameid() {
        return null;
    }
    getSeq() {
        return null;
    }
    get blog() {
        if (this.m_blog == null) {
            if (blog.getAppID() !== this.m_appid) {
                this.m_blog = blog.cloneCC(this);
            } else {
                this.m_blog = blog;
            }
        }
        return this.m_blog;
    }
    serialize(obj) {
        assert(typeof obj === 'object');
        obj.cc = {
            enable: false,
            appid: this.m_appid,
        };
    }
    subCC() {
        return new DummyCallChain(this.m_appid);
    }
}
CallChain.registerBLogMethods(CallChain);
CallChain.registerBLogMethods(CCFrame);
CallChain.registerBLogMethods(DummyCallChain);
CallChain.registerStaticBLogMethods(CallChain);
const BX_LOG = CallChain.log;
const BX_DEBUG = CallChain.debug;
const BX_TRACE = CallChain.trace;
const BX_INFO = CallChain.info;
const BX_WARN = CallChain.warn;
const BX_CHECK = CallChain.check;
const BX_ERROR = CallChain.error;
const BX_FATAL = CallChain.fatal;
const BX_CTRL = CallChain.ctrl;
const BX_ASSERT = CallChain.assert;
const BX_FILTER = CallChain.filter;
const setCurrentCallChain = CallChain.setCurrentCallChain;
const getCurrentCallChain = CallChain.getCurrentCallChain;
const beginSubCallChain = CallChain.beginSubCallChain;
const BX_GET_CURRENT_CALLCHAIN = getCurrentCallChain;
const BX_SET_CURRENT_CALLCHAIN = setCurrentCallChain;
const BX_ENTER_ASYNC_CALL = CallChain.enterAsyncCall;
const BX_LEAVE_ASYNC_CALL = CallChain.leaveAsyncCall;

class BaseLib {
    static getKeyPair(length) {
        let opts = {};
        opts.bits = length;
        return keypair(opts);
    }
    static decodeResultFromJSON(jsonBody) {
        return jsonBody;
    }
    static inArray(arr, obj) {
        var i = arr.length;
        while (i--) {
            if (arr[i] === obj) {
                return true;
            }
        }
        return false;
    }
    static isArrayContained(a, b) {
        if (!(a instanceof Array) || !(b instanceof Array)) {
            return false;
        }
        if (a.length < b.length) {
            return false;
        }
        let blen = b.length;
        for (let i = 0; i < blen; i++) {
            let alen = a.length;
            let isFind = false;
            for (let j = 0; j < alen; ++j) {
                if (b[i] == a[j]) {
                    isFind = true;
                    break;
                }
            }
            if (!isFind) {
                return false;
            }
        }
        return true;
    }
    static mergeArray(a, b) {
        let result = new Set();
        if (a) {
            for (let i = 0; 0 < a.length; ++i) {
                result.add(a[i]);
            }
        }
        if (b) {
            for (let i = 0; 0 < b.length; ++i) {
                result.add(b[i]);
            }
        }
        return Array.from(result);
    }
    static getAsync() {
        return BuckyAsync;
    }
    static isAsyncFunc(fn) {
        return fn.constructor.name === 'AsyncFunction';
    }
    static _fillUtility(utility, ignoreKeys) {
        const keys = Object.getOwnPropertyNames(utility);
        for (let key of keys) {
            if (ignoreKeys[key]) {
                continue;
            }
            if (BaseLib[key] != null) {
                blog.fatal(`repeat baselib function! name=${key}`);
            }
            BaseLib[key] = utility[key];
        }
    }
    static _fillUtilities() {
        const utilities = [CryptoUtility, FileUtility, HTTPUtility, PathUtility, PlatformUtility, StringUtility, TimerUtility];
        const ignoreKeys = {
            'length': 1,
            'prototype': 1,
            'name': 1,
        };
        for (const utility of utilities) {
            assert(utility);
            BaseLib._fillUtility(utility, ignoreKeys);
        }
    }
}
BaseLib._fillUtilities();

class CommensalMaster {
    constructor(modulePath, args, options) {
        this.m_modulePath = modulePath;
        this.m_args = args;
        this.m_options = options;
        this.m_worker = null;
    }
    start() {
        let self = this;
        BX_INFO('fork worker \"'+self.m_modulePath, self.m_args.join(' ')+'\"');
        self.m_worker = child_process.fork(self.m_modulePath, self.m_args || ["&"], self.m_options || {});
        let workerPid = self.m_worker.pid;
        self.m_worker.on('exit', function(code, signal){
            BX_INFO('worker \"'+self.m_modulePath, self.m_args.join(' ')+'\"exit, restart it after 5s!');
            setTimeout(function(){
                self.start();
            }, 5000);
        });
    }
}

class CommensalWorker {
    constructor(detectInterval) {
        this.m_detectInterval = detectInterval;
    }
    start() {
        let pid = process.pid;
        let self = this;
        setInterval(function(){
            process.send({ pid: pid }, function(err) {
                if (err) {
                    BX_INFO('worker', pid ,'send err, quit!');
                    process.exit(0);
                }
            });
        }, self.m_detectInterval);
    }
}
function hashBytes(bytes) {
    let seed = 0;
    for (let i = 0; i < bytes.length; i += 2) {
        const ii = parseInt(bytes.substring(i, i + 2), 16);
        const s = (ii + (0x9e3779b9 + ((((seed << 6) >>> 0) + (seed >>> 2)) >>> 0) >>> 0) >>> 0);
        seed = seed ^ s;
    }
    return seed >>> 0;
}

class ConHashSelector {
    constructor(instances) {
        this.m_instances = instances;
        console.assert(instances);
    }
    _sort() {
        let l = [];
        for (let i in this.m_instances) {
            this.m_instances[i].name = i;
            l.push(this.m_instances[i]);
        }
        return l.sort((a, b) => { return a.index - b.index; });
    }
    select(key) {
        const keyHash = BaseLib.md5(key.toString());
        const uint32Key = hashBytes(keyHash);
        let sortedInstances = this._sort();
        for (let i = 0, len = sortedInstances.length; i < len; i++) {
            const { rangeStart, rangeEnd } = sortedInstances[i];
            if (i !== len - 1) {
                if (uint32Key >= rangeStart && uint32Key < rangeEnd) {
                    return sortedInstances[i].name;
                }
            } else {
                if (uint32Key >= rangeStart && uint32Key <= rangeEnd) {
                    return sortedInstances[i].name;
                }
            }
        }
        return null;
    }
    static makeConHashPartition(instances) {
        if (instances == null) {
            console.log('could not find global.mysql.instances');
            return null;
        }
        const len = Object.keys(instances).length;
        const uintMax = 0xffffffff;
        const perPartitionSize = Math.floor(uintMax / len);
        let start = 0;
        let i = 0;
        for (let id in instances) {
            const rangeStart = start;
            const rangeEnd = ((i == len - 1) ? uintMax : start + perPartitionSize);
            instances[id].rangeStart = `0x${rangeStart.toString(16)}`;
            instances[id].rangeEnd = `0x${rangeEnd.toString(16)}`;
            instances[id].index = i;
            start = rangeEnd;
            i++;
        }
        return instances;
    }
}

class RandomSelector {
    constructor(config) {
        this.m_config = config;
        console.assert(config.value);
        this.m_startIndex = 0;
    }
    select() {
        this.m_startIndex++;
        const selectIndex = this.m_startIndex % this.m_config.value.length;
        return this.m_config.value[selectIndex];
    }
}
module.exports = {
    ConHashSelector,
    RandomSelector
};

class Authentication {
    constructor(client_private_key, client_public_key,
        ca_server,
        login_server,
        options = {}) {
        let { filePath } = options;
        if (filePath) {
            this.private_key = fs.readFileSync(client_private_key, "utf8");
            this.public_key = fs.readFileSync(client_public_key, "utf8");
        } else {
            this.private_key = client_private_key;
            this.public_key = client_public_key;
        }
        this.ca_server = ca_server;
        this.login_server = login_server;
        this.token_cache = new Map();
        Object.defineProperties(this, {
            private_key: {writable: false},
            public_key: {writable: false}
        });
    }
    signup(uid, onComplete, extra_info = {}) {
        let pk = this._genPk();
        let origin_pk = pk;
        let { password, meta } = extra_info;
        let sn = BaseLib.createGUID();
        this._postJSON(this.ca_server + '/register', {
                uid,
                pk,
                password,
                sn,
                meta
            },
            resp => {
                let { uid, pk, result, msg } = resp;
                if (result !== ErrorCode.RESULT_OK) {
                    BX_ERROR('singup error: ', result, msg);
                    BX_INFO(resp);
                    onComplete({ result, msg });
                    return;
                }
                this._signinWithSignedPk({ result: resp.result, msg: resp.msg, uid, signed_pk: pk, pk: origin_pk }, onComplete);
            });
    }
    signin(uid_or_options, onComplete) {
        let uid;
        let pk;
        let signed_pk;
        if (typeof uid_or_options === 'string') {
            uid = uid_or_options;
        } else if (typeof uid_or_options === 'object') {
            signed_pk = uid_or_options.signed_pk;
            pk = uid_or_options.pk;
            uid = uid_or_options.uid;
        } else {
            onComplete({result: ErrorCode.RESULT_INVALID_PARAM, msg: 'illegal `signin` param'});
            return;
        }
        if (pk && signed_pk) {
            this._signinWithSignedPk({ result: ErrorCode.RESULT_OK, uid, signed_pk, pk }, onComplete);
        } else {
            this.updateInfo(uid, null, {}, info => this._signinWithSignedPk(info, onComplete));
        }
    }
    updateInfo(uid, pk = null, user_info = {}, onComplete = null) {
        let sn = BaseLib.createGUID();
        let key = this._genKey(uid, sn);
        let { public_key, private_key, password, levelid, meta } = user_info;
        let new_pk;
        if (public_key) {
            new_pk = this._genPk(public_key);
        } else if (pk == null) {
            new_pk = this._genPk();
        }
        let origin_pk = new_pk || pk;
        this._postJSON(this.ca_server + '/register', { pk: new_pk || pk, levelid, password, sn, meta, uid, key },
            resp => {
                let { pk, uid, result, msg } = resp;
                if (result !== ErrorCode.RESULT_OK) {
                    onComplete({ result, msg });
                    return;
                }
                let signed_pk = pk;
                if (public_key && private_key) {
                    Object.defineProperties(this, {
                        private_key: {writable: true},
                        public_key: {writable: true}
                    });
                    this.public_key = public_key;
                    this.private_key = private_key;
                    Object.defineProperties(this, {
                        private_key: {writable: false},
                        public_key: {writable: false}
                    });
                }
                if (onComplete)
                    onComplete({ uid, pk: origin_pk, signed_pk: signed_pk, result: ErrorCode.RESULT_OK });
            });
    }
    checkToken(arg1, arg2, onComplete) {
        let uid;
        let token;
        let use_cache = false;
        if (typeof arg1 === 'string' && typeof arg2 === 'string') {
            uid = arg1;
            token = arg2;
        } else if (typeof arg1 === 'object' && typeof arg2 === 'boolean') {
            uid = arg1.uid;
            token = arg1.token;
            use_cache = arg2;
            if (use_cache) {
                let resp = this.token_cache.get(token);
                if (resp && resp.expireAt > BaseLib.getNow() + 1000) {
                    onComplete(resp);
                    return;
                } else {
                    this.token_cache.delete(token);
                }
            }
        }else {
            onComplete({result: ErrorCode.RESULT_INVALID_PARAM, msg: 'checkToken wrong params'});
            return;
        }
        this._postJSON(this.login_server + '/checktoken', { uid, token },
            resp => {
                let { result, uid, expireAt, msg } = resp;
                if (result !== ErrorCode.RESULT_OK) {
                    BX_ERROR('checktoken error: ', result, msg);
                    BX_INFO(resp);
                    if (use_cache) {
                        this.token_cache.delete(token);
                    }
                    onComplete({ result, msg });
                    return;
                } else {
                    if (use_cache) {
                        this.token_cache.set(token, resp);
                    }
                    onComplete({ result, uid, expireAt, msg });
                }
            });
    }
    _signinWithSignedPk(info = {}, onComplete) {
        let { uid, signed_pk, pk, result, msg } = info;
        if (info.result !== ErrorCode.RESULT_OK) {
            onComplete({result, msg});
        } else if (uid && signed_pk && pk) {
            let sn = BaseLib.createGUID();
            let key = this._genKey(uid, sn);
            this._postJSON(this.login_server + '/login', {
                    uid,
                    sn,
                    key,
                    pk: signed_pk
                },
                resp => {
                    let { result, token, msg } = resp;
                    if (result != ErrorCode.RESULT_OK) {
                        BX_ERROR('signinWithSignedPk error: ', result, msg);
                        BX_INFO(resp);
                    }
                    onComplete(Object.assign(info, { token, result, msg }));
                });
        } else {
            BX_ERROR('login error: ', {uid, signed_pk, pk});
            onComplete(Object.assign(info, {result: ErrorCode.RESULT_UNKNOWN, msg: 'response miss `uid`, `signed_pk` or `pk`'}));
        }
    }
    _genKey(uid, sn) {
        return BaseLib.privateEncrypt(this.private_key,
            BaseLib.md5(`${uid},${sn}`));
    }
    _genPk(public_key = null) {
        let create_time = Math.floor(Date.now() / 1000);
        let expire_time = create_time + 24 * 3600 * 30;
        return `${public_key || this.public_key},${create_time},${expire_time}`;
    }
    _postJSON(url, data, onComplete) {
        BaseLib.postJSONEx(url, data, (resp, status, errCode) => {
            let json_data;
            if (status !== 200 ) {
                if(status===0){
                    onComplete({ result: ErrorCode.RESULT_POST_FAILED, msg: resp });
                }else{
                    onComplete({ result: status, msg: resp });
                }
                return;
            } else if (errCode !== ErrorCode.RESULT_OK) {
                onComplete({ result: errCode, msg: resp });
                return;
            } else {
                try {
                    json_data = JSON.parse(resp);
                    if (typeof(json_data) !== 'object') {
                        onComplete({ result: ErrorCode.RESULT_INVALID_TYPE, msg: resp });
                        return;
                    }
                } catch (e) {
                    onComplete({ result: ErrorCode.RESULT_INVALID_TYPE, msg: resp });
                    return;
                }
            }
            onComplete(json_data);
        });
    }
}

class DiscoverRegister {
    static registerImpl(discoverHost, data, onComplete) {
        const cc = getCurrentCallChain();
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function() {
            if(xmlhttp.readyState == 4) {
                BX_LEAVE_ASYNC_CALL(cc);
                let code = xmlhttp.status;
                if(code == DiscoverRegister.CODE_SUCCESS) {
                    onComplete(ErrorCode.RESULT_OK);
                } else if (code == DiscoverRegister.CODE_PARAM_ERROR) {
                    onComplete(ErrorCode.RESULT_INVALID_PARAM);
                } else {
                    onComplete(ErrorCode.RESULT_UNKNOWN);
                }
            }
        };
        xmlhttp.open("POST",discoverHost,true);
        xmlhttp.setRequestHeader("Content-Type","application/json");
        BX_ENTER_ASYNC_CALL();
        xmlhttp.send(data);
    }
    static register(discoverHost, name, serviceAddr, protocalType, retryLimit, onComplete) {
        let nodeInfo = {
            id:name,
            addr:serviceAddr,
            type:protocalType
        };
        let postData = JSON.stringify(nodeInfo);
        let retryTime = 0;
        function doRegister() {
            DiscoverRegister.registerImpl(discoverHost, postData, function(ret){
                if (ret == ErrorCode.RESULT_INVALID_PARAM) {
                    BX_LOG('register to discover:', discoverHost, ' failed, retryTime:', retryTime, ', retryLimit:', retryLimit, ', nodeinfo:', postData);
                    if (onComplete) {
                        onComplete(ret);
                    }
                } else if (ret == ErrorCode.RESULT_UNKNOWN) {
                    retryTime++;
                    if (retryLimit == -1 || retryTime < retryLimit) {
                        BX_WARN(`register to discover will retry, host=${discoverHost}, retryTime:${retryTime}, retryLimit:${retryLimit}`);
                        BaseLib.setOnceTimer(function(){
                            doRegister();
                        }, 1000 * 5);
                    } else {
                        if (onComplete) {
                            onComplete(ret);
                        }
                    }
                } else {
                    BaseLib.setOnceTimer(function(){
                        doRegister();
                    }, DiscoverRegister.REGISTER_INTERVAL);
                    if (onComplete) {
                        onComplete(ret);
                    }
                }
            });
        }
        doRegister();
    }
    static registerReplace(discoverHost, name, serviceAddr, protocalType, retryLimit, onComplete) {
        let nodeInfo = {
            id:name,
            addr:serviceAddr,
            type:protocalType,
            replace:true
        };
        let postData = JSON.stringify(nodeInfo);
        let retryTime = 0;
        function doRegister() {
            DiscoverRegister.registerImpl(discoverHost, postData, function(ret){
                if (ret == ErrorCode.RESULT_INVALID_PARAM) {
                    BX_LOG('register to discover:', discoverHost, ' failed, retryTime:', retryTime, ', retryLimit:', retryLimit, ', nodeinfo:', postData);
                    if (onComplete) {
                        onComplete(ret);
                    }
                } else if (ret == ErrorCode.RESULT_UNKNOWN) {
                    retryTime++;
                    if (retryLimit == -1 || retryTime < retryLimit) {
                        BX_WARN(`register to discover will retry, host=${discoverHost}, retryTime:${retryTime}, retryLimit:${retryLimit}`);
                        BaseLib.setOnceTimer(function(){
                            doRegister();
                        }, 1000 * 5);
                    } else {
                        if (onComplete) {
                            onComplete(ret);
                        }
                    }
                } else {
                    BaseLib.setOnceTimer(function(){
                        doRegister();
                    }, DiscoverRegister.REGISTER_INTERVAL);
                    if (onComplete) {
                        onComplete(ret);
                    }
                }
            });
        }
        doRegister();
    }
}
DiscoverRegister.CODE_SUCCESS = 200;
DiscoverRegister.CODE_PARAM_ERROR = 444;
DiscoverRegister.REGISTER_INTERVAL = 20*1000;

class MonitorClient {
    static queryStat(serverHost, cmd, id, key, orig, startISODate, endISODate, queryItemArray, onComplete) {
        if (id == null || key == null || startISODate == null || endISODate == null ||
        (queryItemArray && Object.prototype.toString.call(queryItemArray).toLowerCase() != '[object array]')) {
            if (onComplete) {
                onComplete(ErrorCode.RESULT_INVALID_PARAM, null);
            }
            return;
        }
        let request = {cmd: cmd,
            id: id,
            key: key,
            orig: orig,
            start: startISODate,
            end: endISODate,
            query: []
        };
        if (queryItemArray) {
            request.query = queryItemArray;
        }
        function callback(code, results) {
            if (onComplete) {
                try {
                    onComplete(code, results);
                } catch(e) {
                }
            }
        }
        BaseLib.postDataEx(serverHost, {}, JSON.stringify(request), function(resp, status, code) {
            if (code == ErrorCode.RESULT_OK) {
                if(status == 200){
                    if (resp) {
                        try {
                            let ret = JSON.parse(resp);
                            callback(ret.code, ret.result);
                            return;
                        } catch(e) {
                            BX_ERROR('parse resp got exception:', resp, e);
                        }
                    }
                }else{
                    BX_ERROR("monitor|query resp, status:",status,", resp:", resp);
                }
            }
            callback(ErrorCode.RESULT_UNKNOWN, null);
        });
    }
    static queryResource(serverHost, appid, runtimeid, startISODate, endISODate, queryItemArray, onComplete) {
        MonitorClient.queryStat(serverHost, MONITOR_CMD.RES, appid, runtimeid, false, startISODate, endISODate, queryItemArray, onComplete);
    }
    static queryCostEvent(serverHost, id, key, original, startISODate, endISODate, queryItemArray, onComplete) {
        MonitorClient.queryStat(serverHost, MONITOR_CMD.COST, id, key, original, startISODate, endISODate, queryItemArray, onComplete);
    }
    static queryCountEvent(serverHost, id, key, original, startISODate, endISODate, queryItemArray, onComplete) {
        MonitorClient.queryStat(serverHost, MONITOR_CMD.COUNT, id, key, original, startISODate, endISODate, queryItemArray, onComplete);
    }
    static queryTickEvent(serverHost, id, key, original, startISODate, endISODate, queryItemArray, onComplete) {
        MonitorClient.queryStat(serverHost, MONITOR_CMD.TICK, id, key, original, startISODate, endISODate, queryItemArray, onComplete);
    }
    static queryValue(serverHost, id, key, original, startISODate, endISODate, queryItemArray, onComplete) {
        MonitorClient.queryStat(serverHost, MONITOR_CMD.VALUE, id, key, original, startISODate, endISODate, queryItemArray, onComplete);
    }
}

class StatClient {
    static callback(code, onComplete) {
        if (onComplete) {
            onComplete(code);
        }
    }
    static isJsonObject(o) {
        if (o && Object.prototype.toString.call(o).toLowerCase() === '[object object]') {
            return true;
        }
        return false;
    }
    static cloneJsonObj(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    static trace(serverHost, cmd, id, key, body, onComplete) {
        if (id == null || key == null || id === '' || key === '') {
            StatClient.callback(ErrorCode.RESULT_INVALID_PARAM, onComplete);
            return;
        }
        let request = {cmd: cmd,
            id: id,
            key: key,
            body: body
        };
        BaseLib.postDataEx(serverHost, {}, JSON.stringify(request), function(resp, status, code) {
            if (code == ErrorCode.RESULT_OK) {
                if (status == 200 && resp) {
                    let ret = JSON.parse(resp);
                    StatClient.callback(ret.result, onComplete);
                } else {
                    StatClient.callback(ErrorCode.RESULT_UNKNOWN, onComplete);
                }
            } else {
                StatClient.callback(code, onComplete);
            }
        });
    }
    static traceCostEvent(serverHost, id, key, cost1, cost2, cost3, cost4, extData, onComplete) {
        let body = {};
        if (StatClient.isJsonObject(extData)) {
            body = StatClient.cloneJsonObj(extData);
        }
        if (cost1 != null && typeof(cost1) === 'number') {
            body.cost1 = cost1;
        }
        if (cost2 != null && typeof(cost2) === 'number') {
            body.cost2 = cost2;
        }
        if (cost3 != null && typeof(cost3) === 'number') {
            body.cost3 = cost3;
        }
        if (cost4 != null && typeof(cost4) === 'number') {
            body.cost4 = cost4;
        }
        if (body.cost1 == null && body.cost2 == null && body.cost3 == null && body.cost4 == null) {
            StatClient.callback(ErrorCode.RESULT_INVALID_PARAM, onComplete);
            return;
        }
        StatClient.trace(serverHost, STAT_CMD.COST, id, key, body, onComplete);
    }
    static traceCountEvent(serverHost, id, key, extData, onComplete) {
        StatClient.trace(serverHost, STAT_CMD.COUNT, id, key, extData, onComplete);
    }
    static traceTickStartEvent(serverHost, id, key, time, traceid, extData, onComplete) {
        if (time == null || traceid == null) {
            StatClient.callback(ErrorCode.RESULT_INVALID_PARAM, onComplete);
            return;
        }
        let body = {};
        if (StatClient.isJsonObject(extData)) {
            body = StatClient.cloneJsonObj(extData);
        }
        body.time = time;
        body.traceid = traceid;
        StatClient.trace(serverHost, STAT_CMD.START, id, key, body, onComplete);
    }
    static traceTickEndEvent(serverHost, id, key, time, traceid, extData, onComplete) {
        if (time == null || traceid == null) {
            StatClient.callback(ErrorCode.RESULT_INVALID_PARAM, onComplete);
            return;
        }
        let body = {};
        if (StatClient.isJsonObject(extData)) {
            body = StatClient.cloneJsonObj(extData);
        }
        body.time = time;
        body.traceid = traceid;
        StatClient.trace(serverHost, STAT_CMD.END, id, key, body, onComplete);
    }
    static traceValue(serverHost, id, key, value, extData, onComplete) {
        if (value == null || typeof(value) !== 'number') {
            StatClient.callback(ErrorCode.RESULT_INVALID_PARAM, onComplete);
            return;
        }
        let body = {};
        if (StatClient.isJsonObject(extData)) {
            body = StatClient.cloneJsonObj(extData);
        }
        body.value = value;
        StatClient.trace(serverHost, STAT_CMD.VALUE, id, key, body, onComplete);
    }
}
const KSERVER_PROTOCOL_VERSION = 1;
const KSERVER_PROTOCOL_HEADER = {
    "magic": 0x20161103,
    "length": 40,
    "version": KSERVER_PROTOCOL_VERSION,
    "packageMaxLength": 1024 * 32,
};
const KSERVER_PROTOCOL_CMD = {
    "UNKNOWW": 0,
    "REQ": 1,
    "RESP": 2,
    "EVENT": 3
};

class KServerPackageHeader {
    constructor() {
        this.m_magicNum = KSERVER_PROTOCOL_HEADER.magic;
        this.m_packageLength = 0;
        this.m_protocolVersion = KSERVER_PROTOCOL_HEADER.version;
        this.m_flags = 0;
        this.m_cmdType = KSERVER_PROTOCOL_CMD.UNKNOWW;
        this.m_dataLength = 0;
    }
    decode(buffer, pos) {
        if (buffer.length < pos + KSERVER_PROTOCOL_HEADER.length) {
            return false;
        }
        this.m_magicNum = buffer.readUInt32LE(pos);
        this.m_packageLength = buffer.readUInt32LE(pos + 4);
        this.m_protocolVersion = buffer.readUInt32LE(pos + 8);
        this.m_flags = buffer.readUInt32LE(pos + 12);
        this.m_cmdType = buffer.readUInt32LE(pos + 16);
        this.m_dataLength = buffer.readUInt32LE(pos + 20);
        return true;
    }
    encode(buffer, pos) {
        if (buffer.length < pos + KSERVER_PROTOCOL_HEADER.length) {
            return false;
        }
        buffer.writeUInt32LE(this.m_magicNum, pos);
        buffer.writeUInt32LE(this.m_packageLength, pos + 4);
        buffer.writeUInt32LE(this.m_protocolVersion, pos + 8);
        buffer.writeUInt32LE(this.m_flags, pos + 12);
        buffer.writeUInt32LE(this.m_cmdType, pos + 16);
        buffer.writeUInt32LE(this.m_dataLength, pos + 20);
        buffer.writeUInt32LE(0, pos + 24, 16);
        return true;
    }
}

class KServerPackageCodec {
    static encode(packageInfo) {
        const header = packageInfo.header;
        const data = packageInfo.data;
        const totalLength = data.length + KSERVER_PROTOCOL_HEADER.length;
        header.m_dataLength = data.length;
        header.m_packageLength = totalLength - 8;
        let buffer;
        try {
            buffer = Buffer.allocUnsafe(totalLength);
        } catch (e) {
            BX_WARN("alloc buffer failed!", e);
            buffer = null;
        }
        if (!buffer) {
            return null;
        }
        header.encode(buffer, 0);
        buffer.write(data, KSERVER_PROTOCOL_HEADER.length, data.length);
        return buffer;
    }
}

class KServerPackageParser {
    constructor(onRecvPackage) {
        this.m_dataBuffer = Buffer.allocUnsafe(KSERVER_PROTOCOL_HEADER.packageMaxLength + 64);
        this.m_onRecvPackage = onRecvPackage;
        this.m_header = new KServerPackageHeader();
        this.reset();
    }
    reset() {
        this.m_status = 0;
        this.m_leftSize = KSERVER_PROTOCOL_HEADER.length;
        this.m_dataSize = 0;
    }
    pushData(buffer) {
        let srcLen = buffer.length;
        let offset = 0;
        let ret = true;
        for (;;) {
            if (srcLen < this.m_leftSize) {
                buffer.copy(this.m_dataBuffer, this.m_dataSize, offset, offset + srcLen);
                this.m_dataSize += srcLen;
                this.m_leftSize -= srcLen;
                break;
            }
            srcLen -= this.m_leftSize;
            buffer.copy(this.m_dataBuffer, this.m_dataSize, offset, offset + this.m_leftSize);
            offset += this.m_leftSize;
            this.m_dataSize += this.m_leftSize;
            if (this.m_status === 0) {
                ret = this._onRecvHeader();
            } else if (this.m_status === 1) {
                ret = this._onRecvBody();
            } else {
                BX_WARN("unexpected status!", this.m_status);
                ret = false;
            }
            if (!ret) {
                break;
            }
        }
        return ret;
    }
    _onRecvHeader() {
        if (!this.m_header.decode(this.m_dataBuffer, 0)) {
            BX_WARN("decode header failed! ");
            return false;
        }
        if (this.m_header.m_magicNum != KSERVER_PROTOCOL_HEADER.magic) {
            BX_WARN("unknown magic num:", this.m_header.m_magicNum, KSERVER_PROTOCOL_HEADER.magic);
            return false;
        }
        if (this.m_header.m_packageLength > KSERVER_PROTOCOL_HEADER.packageMaxLength ||
            this.m_header.m_packageLength <= 0) {
            BX_WARN("invalid package length:", this.m_header.m_packageLength);
            return false;
        }
        assert(this.m_status === 0);
        this.m_status = 1;
        this.m_leftSize = this.m_header.m_packageLength - KSERVER_PROTOCOL_HEADER.length + 8;
        return true;
    }
    _onRecvBody() {
        let ret = this.m_onRecvPackage(this.m_header, this.m_dataBuffer.slice(KSERVER_PROTOCOL_HEADER.length, this.m_header.m_packageLength + 8));
        this.m_dataSize = 0;
        this.m_status = 0;
        this.m_leftSize = KSERVER_PROTOCOL_HEADER.length;
        return ret;
    }
}

class KServerRequest {
    constructor(appid, uid, token, seq, onResponse = null) {
        this.m_appid = appid;
        this.m_uid = uid;
        this.m_token = token;
        this.m_seq = seq;
        this.m_onResponse = onResponse;
        this.m_readList = [];
        this.m_readListCB = [];
        this.m_writeList = [];
        this.m_writeListCB = [];
        this.m_watchList = [];
        this.m_watchListCB = [];
        this.m_lock = null;
        this.m_lockResp = null;
    }
    getSeq() {
        return this.m_seq;
    }
    setSID(sid) {
        this.m_sid = sid;
    }
    getSID() {
        return this.m_sid;
    }
    isEmpty() {
        return (this.m_readList.length === 0
            && this.m_writeList.length === 0
            && this.m_watchList.length === 0
            && this.m_lock == null);
    }
    getValue(key, ver, OnResponse) {
        const req = {
            "type": "kvp",
            "key": key,
            "ver": ver
        };
        this.m_readList.push(req);
        this.m_readListCB.push(function(resp) {
            if (typeof resp != 'number') {
                assert(resp.key === key);
                OnResponse(resp.ret, resp);
            } else {
                OnResponse(resp, {
                    key: key,
                    ver: ver,
                });
            }
        });
    }
    getHashValue(key, hkey, ver, OnResponse) {
        const req = {
            "type": "hash",
            "key": key,
            "ver": ver
        };
        if (hkey != null) {
            req.hkey = hkey;
        }
        this.m_readList.push(req);
        this.m_readListCB.push(function(resp) {
            if (typeof resp != 'number') {
                assert(resp.key === key);
                OnResponse(resp.ret, resp);
            } else {
                OnResponse(resp, {
                    key: key,
                    hkey: hkey,
                    ver: ver,
                });
            }
        });
    }
    setValue(key, value, ver, OnResponse) {
        return this.setValueEx(key, value, { "ver": ver }, OnResponse);
    }
    setValueEx(key, value, options, OnResponse) {
        const req = {
            "type": "kvp",
            "key": key,
        };
        if (value != null) {
            req.value = value;
        }
        if (options.hasOwnProperty("ver")) {
            req.ver = options.ver;
        }
        if (options.hasOwnProperty("mode")) {
            req.mode = options.mode;
        }
        this.m_writeList.push(req);
        this.m_writeListCB.push(function(resp) {
            if (typeof resp != 'number') {
                assert(resp.key === key);
                OnResponse(resp.ret, resp);
            } else {
                OnResponse(resp, {
                    key: key,
                    ver: options.ver,
                });
            }
        });
    }
    setHashValue(key, hkey, value, ver, OnResponse) {
        return this.setHashValueEx(key, hkey, value, { "ver": ver }, OnResponse);
    }
    setHashValueEx(key, hkey, value, options, OnResponse) {
        const req = {
            "type": "hash",
            "key": key,
        };
        if (hkey != null) {
            req.hkey = hkey;
        }
        if (value != null) {
            req.value = value;
        }
        if (options.hasOwnProperty("ver")) {
            req.ver = options.ver;
        }
        if (options.hasOwnProperty("mode")) {
            req.mode = options.mode;
        }
        this.m_writeList.push(req);
        this.m_writeListCB.push(function(resp) {
            if (typeof resp != 'number') {
                assert(resp.key === key);
                OnResponse(resp.ret, resp);
            } else {
                OnResponse(resp, {
                    key: key,
                    hkey: hkey,
                    ver: options.ver
                });
            }
        });
    }
    watchKey(key, eventList, OnResponse) {
        const req = {
            "type": "kvp",
            "key": key,
            "events": eventList,
        };
        this.m_watchList.push(req);
        this.m_watchListCB.push((resp) => {
            if (typeof resp != 'number') {
                assert(resp.key === key);
                OnResponse(resp.ret, resp);
            } else {
                OnResponse(resp, {
                    key: key,
                    events: [],
                });
            }
        });
    }
    watchHashKey(key, hkey, eventList, OnResponse) {
        const req = {
            "type": "hash",
            "key": key,
            "events": eventList,
        };
        if (hkey != null) {
            req.hkey = hkey;
        }
        this.m_watchList.push(req);
        this.m_watchListCB.push((resp) => {
            if (typeof resp != 'number') {
                assert(resp.key === key);
                OnResponse(resp.ret, resp);
            } else {
                OnResponse(resp, {
                    key: key,
                    hkey: hkey,
                    events: [],
                });
            }
        });
    }
    lock(path, option, onResponse) {
        assert(path instanceof Array);
        assert(option.sid);
        assert(option.type === 'read' || option.type === 'write');
        const req = {
            op: 'lock',
            sid: option.sid,
            type: option.type,
            path: path,
        };
        if (option.timeout) {
            req.timeout = req.timeout;
        }
        assert(this.m_lock == null);
        this.m_lock = req;
        this.m_lockResp = (ret, resp) => {
            onResponse(ret, resp);
        };
    }
    unlock(lid, sid, onResponse) {
        assert(lid);
        assert(sid);
        const req = {
            op: 'unlock',
            sid: sid,
            lid: lid,
        };
        assert(this.m_lock == null);
        this.m_lock = req;
        this.m_lockResp = (ret, resp) => {
            onResponse(ret, resp);
        };
    }
    encode(tcp) {
        const request = {
            "cmd": "req",
            "seq": this.m_seq,
            "appid": this.m_appid,
            "uid" : this.m_uid,
            "token": this.m_token,
            "ver": 1,
        };
        if (this.m_sid != null) {
            request.sid = this.m_sid;
        }
        if (this.m_readList.length > 0) {
            request.read = this.m_readList;
        }
        if (this.m_writeList.length > 0) {
            request.write = this.m_writeList;
        }
        if (this.m_watchList.length > 0) {
            request.watch = this.m_watchList;
        }
        if (this.m_lock) {
            request.lock = this.m_lock;
        }
        if (typeof getCurrentRuntime === 'function') {
            const thisRuntime = getCurrentRuntime();
            if (thisRuntime) {
                request.srcruntimeid = thisRuntime.getInstanceID();
            }
        }
        getCurrentCallChain().serialize(request);
        const reqData = JSON.stringify(request);
        if (tcp) {
            let header = new KServerPackageHeader();
            header.m_cmdType = KSERVER_PROTOCOL_CMD.REQ;
            const encodeData = KServerPackageCodec.encode({
                "header": header,
                "data": reqData
            });
            return encodeData;
        } else {
            return reqData;
        }
    }
    response(respObj) {
        if (this.isEmpty()) {
            if (this.m_onResponse) {
                this.m_onResponse(respObj);
            }
        }
        if (this.m_readListCB.length > 0) {
            let ret;
            if (typeof respObj === 'number') {
                ret = respObj;
            } else if (typeof respObj === "object") {
                if (respObj.hasOwnProperty("ret") && respObj.ret !== 0) {
                    ret = respObj.ret;
                } else {
                    ret = respObj.read;
                }
            } else {
                ret = ErrorCode.RESULT_FAILED;
            }
            this._responseList(this.m_readListCB, ret);
        }
        if (this.m_writeListCB.length > 0) {
            let ret;
            if (typeof respObj === 'number') {
                ret = respObj;
            } else if (typeof respObj === "object") {
                if (respObj.hasOwnProperty("ret") && respObj.ret !== 0) {
                    ret = respObj.ret;
                } else {
                    ret = respObj.write;
                }
            } else {
                ret = ErrorCode.RESULT_FAILED;
            }
            this._responseList(this.m_writeListCB, ret);
        }
        if (this.m_watchListCB.length > 0) {
            let ret;
            if (typeof respObj === 'number') {
                ret = respObj;
            } else if (typeof respObj === "object") {
                if (respObj.hasOwnProperty("ret") && respObj.ret !== 0) {
                    ret = respObj.ret;
                } else {
                    ret = respObj.watch;
                }
            } else {
                ret = ErrorCode.RESULT_FAILED;
            }
            this._responseList(this.m_watchListCB, ret);
        }
        if (this.m_lockResp) {
            let ret = 0;
            let resp;
            if (typeof respObj === 'number') {
                ret = respObj;
            } else if (typeof respObj === "object") {
                if (respObj.hasOwnProperty("ret") && respObj.ret !== 0) {
                    ret = respObj.ret;
                } else {
                    resp = respObj.lock;
                }
            } else {
                ret = ErrorCode.RESULT_FAILED;
            }
            this.m_lockResp(ret, resp);
        }
    }
    _responseList(cbList, respList) {
        for (let i = 0; i < cbList.length; ++i) {
            let cb = cbList[i];
            if (!cb) {
                continue;
            }
            let resp;
            if (typeof respList === 'object') {
                resp = respList[i];
            } else if (typeof respList === 'number') {
                resp = respList;
            } else {
                resp = ErrorCode.RESULT_NOT_FOUND;
            }
            cb(resp);
        }
    }
}
const KServerTCPClientStatus = {
    "Status_Init": 0,
    "Status_Connecting": 1,
    "Status_Connected": 2,
    "Status_Error": 3,
    "Status_Closed": 4,
};

class KServerTCPClient extends events.EventEmitter {
    constructor(options) {
        super();
        this.m_options = options;
        if (options.addr) {
            let addr = options.addr.toLowerCase();
            const pos = addr.indexOf('tcp://');
            if (pos >= 0) {
                addr = addr.slice(6);
            }
            [options.host, options.port] = addr.split(':');
        }
        assert(options.host != null && options.port != null)
        this.m_status = KServerTCPClientStatus.Status_Init;
        this.m_packageParser = new KServerPackageParser((header, dataBuffer) => {
            return this._onRecvPackage(header, dataBuffer);
        });
        this.m_nextSeq = 16;
        this.m_waitRespList = {};
        this.m_sid = null;
        this.m_needSetSID = true;
    }
    updateToken(uid, token) {
        assert(uid);
        assert(token);
        this.m_options.uid = uid;
        this.m_options.token = token;
    }
    getStatus() {
        return this.m_status;
    }
    init() {
        assert(!this.m_sock);
        this.m_sock = new net.Socket();
        this.m_sock.on('error', (err) => {
            BX_WARN("connect err! err=", err);
            const oldStatus = this.m_status;
            this.m_status = KServerTCPClientStatus.Status_Error;
            this.emit("OnStatusChange", this.m_status, oldStatus, err.name);
        });
        this.m_sock.on('close', (hadError) => {
            BX_WARN("connect close! server=", this.m_options.host + ':' + this.m_options.port, ", err=", hadError);
            const oldStatus = this.m_status;
            this.m_status = KServerTCPClientStatus.Status_Closed;
            this.emit("OnStatusChange", this.m_status, oldStatus, hadError);
        });
        this.m_sock.on('connect', () => {
            const oldStatus = this.m_status;
            this.m_status = KServerTCPClientStatus.Status_Connected;
            this.m_needSetSID = true;
            this.m_packageParser.reset();
            this.emit("OnStatusChange", this.m_status, oldStatus);
        });
        this.m_sock.on('data', (data) => {
            if (!this.m_packageParser.pushData(data)) {
                this.m_sock.destroy(new Error("invalid data"));
            }
        });
        if (this.m_options.timeout) {
            this.m_checkTimer = setInterval(() => {
                this._checkTimeout();
            }, 1000);
        }
    }
    uninit() {
        if (this.m_checkTimer) {
            clearInterval(this.m_checkTimer);
            this.m_checkTimer = null;
        }
        if (this.m_sock) {
            this.m_sock.destroy();
            this.m_sock = null;
        }
    }
    start() {
        assert(this.m_status === KServerTCPClientStatus.Status_Init ||
            this.m_status === KServerTCPClientStatus.Status_Closed);
        const options = {
            "port": this.m_options.port,
            "host": this.m_options.host,
        };
        assert(this.m_sock);
        this.m_sock.connect(options);
    }
    stop() {
        if (this.m_sock) {
            this.m_sock.destroy();
        }
    }
    _checkTimeout() {
        const now = new Date();
        for (let seq in this.m_waitRespList) {
            let request = this.m_waitRespList[seq];
            if (now - request.__sendTick > this.m_options.timeout) {
                BX_INFO(`recv request timeout, seq=${seq}`);
                assert(request.__cc);
                BX_LEAVE_ASYNC_CALL(request.__cc);
                delete this.m_waitRespList[seq];
                request.response(ErrorCode.RESULT_TIMEOUT);
            }
        }
    }
    newRequest(options, onDefaultResponse) {
        const seq = this.m_nextSeq;
        this.m_nextSeq++;
        const opt = options != null ? options : this.m_options;
        assert(opt.appid);
        assert(opt.uid);
        assert(opt.token);
        return new KServerRequest(opt.appid, opt.uid, opt.token, seq, onDefaultResponse);
    }
    commit(request) {
        assert(!this.m_waitRespList[request.getSeq()]);
        assert(this.m_status === KServerTCPClientStatus.Status_Connected);
        BX_DEBUG('commit request, status=', this.m_status, ", sid=", this.m_sid, ", req=", request);
        if (this.m_needSetSID && this.m_sid) {
            request.setSID(this.m_sid);
        }
        let encodeData = request.encode(true);
        if (!encodeData) {
            BX_ERROR.error('encode request failed! req=', request);
            request.response(ErrorCode.RESULT_OUT_OF_MEMORY);
            return false;
        }
        assert(encodeData.length <= KSERVER_PROTOCOL_HEADER.packageMaxLength);
        if (encodeData.length > KSERVER_PROTOCOL_HEADER.packageMaxLength) {
            BX_ERROR(`request encode length extend package max length!! len=${encodeData.length}, maxlen=${KSERVER_PROTOCOL_HEADER.packageMaxLength}`);
            request.response(ErrorCode.RESULT_OUT_OF_LIMIT);
            return false;
        }
        request.__sendTick = Date.now();
        request.__cc = getCurrentCallChain();
        assert(!this.m_waitRespList[request.getSeq()]);
        this.m_waitRespList[request.getSeq()] = request;
        BX_ENTER_ASYNC_CALL();
        this.m_sock.write(encodeData, 'binary');
        return true;
    }
    _onRecvPackage(header, dataBuffer) {
        const bodyString = dataBuffer.toString();
        let respObj;
        try {
            respObj = JSON.parse(bodyString);
        } catch (e) {
            respObj = null;
        }
        if (!respObj) {
            return false;
        }
        if (header.m_cmdType === KSERVER_PROTOCOL_CMD.RESP) {
            this._onRecvResponse(respObj);
        } else if (header.m_cmdType === KSERVER_PROTOCOL_CMD.EVENT) {
            this._onRecvEvent(respObj);
        } else {
            BX_WARN("unknown package cmd! header=", header);
        }
        return true;
    }
    _onRecvResponse(respObj) {
        const seq = respObj.seq;
        if (!seq) {
            BX_WARN('resp seq is empty! res=', respObj);
            return false;
        }
        const request = this.m_waitRespList[seq];
        if (!request) {
            BX_WARN("unknown response seq: ", seq);
            return false;
        }
        delete this.m_waitRespList[seq];
        assert(request.__cc);
        BX_LEAVE_ASYNC_CALL(request.__cc);
        if (respObj.ret === ErrorCode.RESULT_INVALID_SESSION
            && this.m_needSetSID
            && this.m_sid != null) {
            BX_WARN('session maybe timeout, will retry:', this.m_sid);
            request.setSID(null);
            this.m_needSetSID = false;
            this.m_sid = null;
            request.response(respObj);
            return;
        }
        this.m_needSetSID = false;
        if (respObj.sid) {
            BX_INFO('update sid:', respObj.sid);
            this.m_sid = respObj.sid;
        }
        request.response(respObj);
    }
    _onRecvEvent(respObj) {
        BX_INFO("_onRecvEvent:", respObj);
        if (respObj.cc) {
            const cc = CallChain.unserialize(respObj.cc);
            setCurrentCallChain(cc);
        } else {
            setCurrentCallChain(null, 'onKServerEvent');
        }
        assert(respObj.cmd === "event");
        const eventList = respObj.event;
        for (let i = 0; i < eventList.length; ++i) {
            let event = eventList[i];
            event.appid = respObj.appid;
            BX_INFO(`onRecvEvent before emit OnEvent ${i}:`, event);
            this.emit("OnEvent", event);
            BX_INFO(`onRecvEvent after emit OnEvent ${i}:`, event);
        }
        BX_INFO("leave onRecvEvent");
    }
}

class KServerXHRClient {
    constructor(options) {
        this.m_options = options;
        this.m_nextSeq = 16;
    }
    updateToken(uid, token) {
        assert(uid);
        assert(token);
        this.m_options.uid = uid;
        this.m_options.token = token;
    }
    newRequest() {
        const seq = this.m_nextSeq;
        this.m_nextSeq++;
        assert(this.m_options.uid);
        assert(this.m_options.token);
        const req = new KServerRequest(this.m_options.appid, this.m_options.uid, this.m_options.token, seq);
        return req;
    }
    request(request) {
        if (request.isEmpty()) {
            return false;
        }
        const encodeData = request.encode(false);
        if (!encodeData) {
            return false;
        }
        BaseLib.postData(this.m_options.url, encodeData, function(bodyString, errorCode) {
            if (errorCode == 200) {
                let respObj;
                try {
                    respObj = JSON.parse(bodyString);
                } catch (e) {
                    respObj = null;
                }
                if (!respObj) {
                    request.response(ErrorCode.RESULT_INVALID_FORMAT);
                } else {
                    request.response(respObj);
                }
            } else {
                BX_WARN("error request code:" + errorCode);
                request.response(ErrorCode.RESULT_FAILED);
            }
        });
        return true;
    }
}

class InfoNode {
    constructor(km, key, type) {
        this._owner = km;
        this._nodeKey = key;
        this._type = type;
        this._version = -1;
        this._lastUpdate = 0;
        this._cacheObject = null;
        this._cacheMap = null;
        this._cacheMapInfo = null;
        this._onComplete = null;
        this._state = InfoNode.STATE_INIT;
    }
    _show() {
        let info = {};
        info._nodeKey = this._nodeKey;
        info._type = this._type;
        info._version = this._version;
        info._lastUpdate = this._lastUpdate;
        info._cacheObject = this._cacheObject;
        info._cacheMap = this._cacheMap;
        info._cacheMapInfo = this._cacheMapInfo;
        info._state = this._state;
    }
    getType() {
        return this._type;
    }
    getState() {
        return this._state;
    }
    getNodeKey() {
        return this._nodeKey;
    }
    objectRead() {
        if (this._state == InfoNode.STATE_NORMAL || this._state == InfoNode.STATE_LOCAL_CACHED) {
            if (this._type == InfoNode.TYPE_OBJECT) {
                return this._cacheObject;
            } else {
                BX_ERROR("read infonode " + this._nodeKey + " with error type." + this._type);
            }
        }
        return null;
    }
    mapGet(key ) {
        if (this._state == InfoNode.STATE_NORMAL || this._state == InfoNode.STATE_LOCAL_CACHED) {
            if (this._type == InfoNode.TYPE_MAP) {
                return this._cacheMap[key];
            }
        }
        BX_ERROR("can not get map, key:" + this._nodeKey + " " + key + ", state:" + this._state);
        return null;
    }
    mapGetClone() {
        if (this._state == InfoNode.STATE_NORMAL || this._state == InfoNode.STATE_LOCAL_CACHED) {
            if (this._type == InfoNode.TYPE_MAP) {
                return this._cacheMap;
            }
        }
    }
    sync(onComplete,requestObj=null) {
        BX_DEBUG("InfoNode::Sync " + this._nodeKey);
        this._syncImpl(onComplete,requestObj);
    }
    objectUpdate(obj, onComplete) {
        if (this._state !== InfoNode.STATE_NORMAL && this._state !== InfoNode.STATE_LOCAL_CACHED) {
            BX_ERROR("can not update object, error state." + this._nodeKey, "state:", this._state);
            return;
        }
        if (this._type !== InfoNode.TYPE_OBJECT) {
            BX_ERROR("can not update object, error type." + this._nodeKey, "type:", this._type);
            return;
        }
        this._objectUpdateImpl(obj, onComplete);
    }
    mapSet(key, object, onComplete) {
        if (this._state !== InfoNode.STATE_NORMAL && this._state !== InfoNode.STATE_LOCAL_CACHED) {
            BX_ERROR("can not set map, error state." + this._nodeKey, "state:", this._state);
            return;
        }
        if (this._type !== InfoNode.TYPE_MAP) {
            BX_ERROR("can not set map, error type." + this._nodeKey, "type:", this._type);
            return;
        }
        this._mapSetImpl(key, object, onComplete);
    }
    mapDelete(key, onComplete) {
        if (this._type !== InfoNode.TYPE_MAP) {
            BX_ERROR("can not delete map, error type." + this._nodeKey, "type:", this._type);
            return;
        }
        this._mapDeleteImpl(key, onComplete);
    }
    mapClean(onComplete) {
        if (this._type !== InfoNode.TYPE_MAP) {
            BX_ERROR("can not clean map, error type." + this._nodeKey, "type:", this._type);
            return;
        }
        this._mapCleanImpl(onComplete);
    }
    _syncObject(onComplete,requestObj) {
        let request = null;
        let innerSync = false;
        if(requestObj) {
            request = requestObj;
        } else {
            innerSync = true;
            request = this._owner._client.newRequest();
        }
        request.getValue(this._nodeKey, -1, (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                BX_WARN(`knowledge: syncObject failed: ret=${ret}, key=${this._nodeKey}`);
                return onComplete(this, ret);
            }
            if (resp.value == null || resp.value.length <= 0) {
                this._cacheObject = {};
            } else {
                try {
                    this._cacheObject = JSON.parse(resp.value);
                } catch (e) {
                    BX_ERROR('knowledge:parse value error: ', e, resp.value);
                    this._cacheObject = {};
                }
            }
            this._lastUpdate = BaseLib.getNow();
            this._version = resp.ver;
            this._state = InfoNode.STATE_NORMAL;
            let request2 = this._owner._client.newRequest();
            request2.watchKey(this._nodeKey, ["change"], () => {});
            this._owner._sendRequest(request2);
            onComplete(this, ErrorCode.RESULT_OK);
        });
        if(innerSync) {
            this._owner._sendRequest(request);
        }
    }
    _syncMap(onComplete,requestObj) {
        let request = null;
        let innerSync = false;
        if(requestObj) {
            request = requestObj;
        } else {
            innerSync = true;
            request = this._owner._client.newRequest();
        }
        request.getHashValue(this._nodeKey, null, -1, (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                BX_ERROR(`knowledge: syncMap failed: ret=${ret}, map=${this._nodeKey}`);
                return onComplete(this, ret);
            }
            let valueArray = resp.value.split(",");
            this._cacheMap = {};
            this._cacheMapInfo = {};
            this._lastUpdate = BaseLib.getNow();
            this._version = resp.ver;
            this._state = InfoNode.STATE_NORMAL;
            let request2 = this._owner._client.newRequest();
            if (resp.value.length === 0) {
                this._owner._sendRequest(request2);
                onComplete(this, ErrorCode.RESULT_OK);
                return;
            }
            let completeNum = 0;
            for (let i = 0; i < valueArray.length; ++i) {
                request2.getHashValue(this._nodeKey, valueArray[i], -1, (ret, resp) => {
                    const truehkey = decodeURIComponent(resp.hkey);
                    if (ret === ErrorCode.RESULT_OK) {
                        try {
                            this._cacheMap[truehkey] = JSON.parse(resp.value);
                        } catch (e) {
                            BX_ERROR('knowledge:sync error: ', e, resp.value);
                        }
                        this._cacheMapInfo[truehkey] = { "version": resp.ver };
                    } else {
                        BX_ERROR(`knowledge: sync mapvalue failed: ret=${ret}, map=${this._nodeKey}, key=${valueArray[i]}`);
                    }
                    completeNum++;
                    if (completeNum === valueArray.length) {
                        this._state = InfoNode.STATE_NORMAL;
                        onComplete(this, ErrorCode.RESULT_OK);
                    }
                });
            }
            this._owner._sendRequest(request2);
        });
        if(innerSync) {
            this._owner._sendRequest(request);
        }
    }
    _syncImpl(onComplete,requestObj) {
        if (this._type == InfoNode.TYPE_MAP) {
            this._syncMap(onComplete,requestObj);
        } else if (this._type == InfoNode.TYPE_OBJECT) {
            this._syncObject(onComplete,requestObj);
        }
    }
    _objectUpdateImpl(obj, onComplete) {
        let onSetOK = (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                BX_ERROR("update object " + this._nodeKey + " error:" + ret);
                return onComplete(this, ret);
            }
            this._cacheObject = obj;
            this._version = resp.ver;
            this._lastUpdate = BaseLib.getNow();
            onComplete(this, ErrorCode.RESULT_OK);
        };
        let request = this._owner._client.newRequest();
        request.setValue(this._nodeKey, JSON.stringify(obj), this._version, onSetOK);
        this._owner._sendRequest(request);
    }
    _mapDeleteImpl(key, onComplete) {
        if (onComplete == null) {
            onComplete = () => {};
        }
        let onSetOK = (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                BX_ERROR("delete map " + key + " error:" + ret);
                return onComplete(this, ret);
            }
            delete this._cacheMap[resp.hkey];
            delete this._cacheMapInfo[resp.hkey];
            onComplete(this, ret, resp.hkey);
        };
        let request = this._owner._client.newRequest();
        request.setHashValue(this._nodeKey, encodeURIComponent(key), null, -1, onSetOK);
        this._owner._sendRequest(request);
    }
    _mapSetImpl(key, object, onComplete) {
        if (onComplete == null) {
            onComplete = () => {};
        }
        let onSetOK = (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                BX_WARN("update map " + this._nodeKey + ":" + key + " error:" + ret);
                return onComplete(this, ret);
            }
            this._cacheMap[key] = object;
            this._cacheMapInfo[key] = { "version": resp.ver };
            this._version = resp.ver;
            this._lastUpdate = BaseLib.getNow();
            onComplete(this, ret, resp.hkey);
        };
        let request = this._owner._client.newRequest();
        request.setHashValue(this._nodeKey, encodeURIComponent(key), JSON.stringify(object), -1, onSetOK);
        this._owner._sendRequest(request);
    }
    _mapCleanImpl(onComplete) {
        if (onComplete == null) {
            onComplete = () => {};
        }
        let onCleanOK = (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                BX_ERROR("clean map " + this._nodeKey + " error:" + ret);
                return onComplete(this, ret);
            }
            this._cacheMap = {};
            this._cacheMapInfo = {};
            this._version = resp.ver;
            this._lastUpdate = BaseLib.getNow();
            onComplete(this, ret);
        };
        let request = this._owner._client.newRequest();
        request.setHashValue(this._nodeKey, null, null, -1, onCleanOK);
        this._owner._sendRequest(request);
    }
}
InfoNode.TYPE_OBJECT = 0;
InfoNode.TYPE_MAP = 1;
InfoNode.TYPE_LIST = 2;
InfoNode.TYPE_UNKNOWN = 255;
InfoNode.STATE_INIT = 0;
InfoNode.STATE_LOCAL_CACHED = 1;
InfoNode.STATE_NORMAL = 2;
InfoNode.STATE_SYNC = 3;
InfoNode.STATE_ERROR = 4;

class KnowledgeManager {
    constructor(kHost, appid, uid, token, timeout) {
        this._cacheNode = {};
        this._baseURL = kHost;
        this._depends = {};
        this._knowKnowledges = {};
        this._state = KnowledgeManager.STATE_NEED_SYNC;
        this._host = kHost;
        this._appid = appid;
        this._uid = uid;
        this._token = token;
        this._timeout = timeout;
        this._client = null;
        this._initClient();
        this._isConnected = false;
        this.m_stoped = false;
    }
    lock(path, type, onComplete) {
        if (!this._isConnected) {
            onComplete(null, ErrorCode.RESULT_ERROR_STATE);
            return -1;
        }
        let truePath = null;
        if (typeof(path) === "string") {
            truePath = path.split(".");
        } else {
            truePath = path;
        }
        let lockObj = {};
        lockObj.sid = BaseLib.createGUID();
        lockObj.lid = 0;
        lockObj.unlock = (onUnlockComplete) => {
            let request = this._client.newRequest();
            request.unlock(lockObj.lid, lockObj.sid, onUnlockComplete);
            this._sendRequest(request);
        };
        let request = this._client.newRequest();
        const lockOption = {
            sid: lockObj.sid,
            type: type,
        };
        request.lock(truePath, lockOption, (ret, resp) => {
            if (ret == ErrorCode.RESULT_OK) {
                lockObj.lid = resp.lid;
                onComplete(lockObj, ret);
            } else {
                onComplete(null, ret);
            }
        });
        this._sendRequest(request);
        return 0;
    }
    _initClient() {
        assert(this._client == null);
        this._client = new KServerTCPClient({
            "addr": this._host,
            "appid": this._appid,
            "uid" : this._uid,
            "token": this._token,
            "timeout": this._timeout
        });
        this._client.init();
    }
    updateToken(uid, token) {
        assert(uid);
        assert(token);
        this._uid = uid;
        this._token = token;
        if (this._client) {
            this._client.updateToken(uid, token);
        }
    }
    stop() {
        if (this._client) {
            this.m_stoped = true;
            this._client.stop();
        }
    }
    getState() {
        return this._state;
    }
    _onClientEvent(event) {
        if (event.type == "kvp") {
            if (BaseLib.inArray(event.event, "change")) {
                let objNode = this._cacheNode[event.key];
                if (objNode) {
                    this.dependKnowledge(event.key, InfoNode.TYPE_OBJECT, {});
                    BaseLib.setOnceTimer(() => {
                        this.ready(() => {
                            BX_INFO("kobject " + event.key + " change synced.")
                        })
                    }, 100);
                }
            }
        }
        return;
    }
    dependKnowledge(key, nodeType, options) {
        this._knowKnowledges[key] = { "key": key, "nodeType": nodeType };
        let kinfo = { "key": key, "nodeType": nodeType, "isNeedSync": true, "options": options };
        this._depends[key] = kinfo;
        if (this._state == KnowledgeManager.STATE_READY) {
            this._state = KnowledgeManager.STATE_NEED_SYNC;
        } else if (this._state == KnowledgeManager.STATE_SYNCING) {
            this._syncQueue = this._syncQueue || [];
            this._syncQueue.push(kinfo);
        }
    }
    _startSync(onReady) {
        let fireReady = (ret) => {
            if (onReady) {
                BaseLib.asynCall(() => {
                    onReady(ret);
                });
            }
        };
        let fireOtherReady = (ret) => {
            if (this._otherOnReady) {
                for (let i = 0; i < this._otherOnReady.length; ++i) {
                    let onReadyFunc = this._otherOnReady[i];
                    BaseLib.asynCall(() => {
                        onReadyFunc(ret);
                    });
                }
            }
            this._otherOnReady = null;
        };
        let hasFire = false;
        let fire = (ret) => {
            if (hasFire) {
                return;
            }
            hasFire = true;
            fireReady(ret);
            fireOtherReady(ret);
        };
        let updateSynQueue = () => {
            this._syncQueue = this._syncQueue || [];
            for (let key in this._depends) {
                let info = this._depends[key];
                if (info.isNeedSync) {
                    let isFind = false;
                    for(let qnode of this._syncQueue) {
                        if(qnode.key == info.key) {
                            isFind = true;
                        }
                    }
                    if(!isFind) {
                        this._syncQueue.push(info);
                    }
                }
            }
            this._depends = {};
        };
        let request = this._client.newRequest();
        let infoNodeCount = 0;
        let doSync = (onComplete) => {
            let _info = this._syncQueue.pop();
            while(_info) {
                infoNodeCount++;
                let kInfo = this._cacheNode[_info.key];
                if (!kInfo) {
                    kInfo = new InfoNode(this, _info.key, _info.nodeType);
                }
                let infoK = _info.key;
                kInfo.sync((infoNode, resultCode) => {
                    infoNodeCount--;
                    if (resultCode !== ErrorCode.RESULT_OK) {
                        BX_WARN("sync knowledge " + infoNode._nodeKey + " return " + resultCode);
                    }
                    this._cacheNode[infoK] = kInfo;
                    if(infoNodeCount == 0) {
                        onComplete(ErrorCode.RESULT_OK);
                    }
                },request);
                _info = this._syncQueue.pop();
            }
            this._sendRequest(request);
        };
        updateSynQueue();
        if (this._syncQueue.length === 0) {
            this._state = KnowledgeManager.STATE_READY;
            BX_INFO('kmanger ready, empty, sync done.');
            fire(ErrorCode.RESULT_OK);
        } else {
            if (!this._isConnected) {
                BX_ERROR('kmanger ready, not connceted.');
                fire(ErrorCode.RESULT_UNKNOWN);
                return;
            }
            doSync((ret) => {
                this._state = KnowledgeManager.STATE_READY;
                fire(ret);
                return;
            });
        }
    }
    _readyClient(onComplete) {
        let isOnline = false;
        let retryCount = 0;
        let hasComplete = false;
        let doComplete = (ret) => {
            if (hasComplete) {
                return;
            }
            hasComplete = true;
            onComplete(ret);
        };
        if (this._client.m_status === KServerTCPClientStatus.Status_Connected) {
            BX_INFO('kclient is connected.');
            return doComplete(ErrorCode.RESULT_OK);
        }
        let onClientOpen = () => {
            isOnline = true;
            this._client.on("OnEvent", (event) => {
                BX_INFO('knowledgeManager onClientOpen before _onClientEvent', event);
                this._onClientEvent(event);
                BX_INFO('knowledgeManager onClientOpen after _onClientEvent', event);
            });
            BX_WARN("knowledgeManager's kserver_tcp_client connected.");
            doComplete(ErrorCode.RESULT_OK);
        };
        let onClientClose = () => {
            if (this.m_stoped) {
                BX_WARN('knowledgeManager is stopped.');
                doComplete(ErrorCode.RESULT_UNKNOWN);
                return;
            }
            if (!isOnline) {
                BX_WARN("knowledgeManager's kserver_tcp_client connect faield. stop.");
                return doComplete(ErrorCode.RESULT_UNKNOWN);
            }
            BX_WARN("knowledgeManager's kserver_tcp_client break. start trytimer once.");
            BaseLib.setOnceTimer(() => {
                if (!this.m_stoped) {
                    retryCount++;
                    BX_WARN("knowledgeManager's kserver_tcp_client start retry,retryCount=" + retryCount);
                    this._client.start();
                }
            }, 5000);
        };
        this._client.on("OnStatusChange", (newStatus, oldStatus) => {
            BX_INFO(`ktcpclient state change: from ${oldStatus} to ${newStatus}`);
            switch (newStatus) {
                case KServerTCPClientStatus.Status_Init:
                    break;
                case KServerTCPClientStatus.Status_Connecting:
                    break;
                case KServerTCPClientStatus.Status_Connected:
                    this._isConnected = true;
                    onClientOpen();
                    break;
                case KServerTCPClientStatus.Status_Closed:
                    this._isConnected = false;
                    onClientClose();
                    break;
                case KServerTCPClientStatus.Status_Error:
                    this._isConnected = false;
                    BX_ERROR(`ktcpclient state error: from ${oldStatus} to ${newStatus}`);
                    break;
                default:
                    break;
            }
        });
        this._client.start();
    }
    ready(onReady) {
        BX_INFO(`do km ready, state:${this._state}, stopped:${this.m_stoped}, isconected:${this._isConnected}`);
        if (this.m_stoped) {
            onReady(ErrorCode.RESULT_UNKNOWN);
            return
        }
        if (this._state === KnowledgeManager.STATE_READY) {
            onReady(ErrorCode.RESULT_OK);
            return
        }
        if (this._state === KnowledgeManager.STATE_SYNCING) {
            this._otherOnReady.push(onReady);
            return;
        }
        if (this._state !== KnowledgeManager.STATE_NEED_SYNC) {
            onReady(ErrorCode.RESULT_UNKNOWN);
            return
        }
        this._state = KnowledgeManager.STATE_SYNCING;
        if (this._otherOnReady == null) {
            this._otherOnReady = new Array();
        }
        this._readyClient((err) => {
            if (err) {
                BX_ERROR(`do km ready, ready client failed`);
                onReady(ErrorCode.RESULT_UNKNOWN);
            } else {
                BX_INFO(`do km ready, ready client success, do sync`);
                this._startSync(onReady);
            }
        });
    }
    addknowledgeKey(key, info) {
        this._cacheNode[key] = info;
    }
    removeknowledgeKey(key) {
        delete this._knowledge;
    }
    getDependsKnowledgeInfo() {
        let result = {};
        for (let k in this._cacheNode) {
            let aNode = this._cacheNode[k];
            if (aNode) {
                result[k] = aNode._version;
            }
        }
        return result;
    }
    applyKnowledgeInfo(kmInfo, onComplete) {
        onComplete();
        return null;
    }
    getKnowledge(key) {
        let result = this._cacheNode[key];
        if (result && result.getState() == InfoNode.STATE_NORMAL) {
            return result;
        }
        if (this._knowKnowledges[key] == null) {
            BX_ERROR("knowledge " + key + " is not in depends list!");
        } else {
            BX_WARN(key + " is syning,waiting for sync complete.");
        }
        return null;
    }
    _getRootKeyList(onComplete) {
        let request = this._client.newRequest();
        request.getHashValue(null, null, -1, (ret, resp) => {
            if (ret === 0) {
                onComplete(ret, resp.value.split(","));
            } else {
                onComplete(ret, null);
            }
        });
        this._sendRequest(request);
    }
    _createObjectKnowledge(kid, obj, onComplete) {
        let request = this._client.newRequest();
        request.setValue(kid, obj, -1, (ret, resp) => {
            if (ret != ErrorCode.RESULT_OK) {
                onComplete(ret, resp.key);
            } else {
                onComplete(ret, resp.key);
            }
        });
        this._sendRequest(request);
    }
    _mapClean(kid, onComplete) {
        let request = this._client.newRequest();
        function onCleanOK(ret) {
            onComplete(ret);
        }
        request.setHashValue(kid, null, null, -1, onCleanOK);
        this._sendRequest(request);
    }
    _deleteObjectKnowledge(kid, onComplete) {
        let request = this._client.newRequest();
        request.setValue(kid, null, -1, (ret, resp) => {
            if (ret === ErrorCode.RESULT_OK) {
                let kInfo = this._cacheNode[kid];
                if (kInfo) {
                    delete this._cacheNode[kid];
                }
                onComplete(ret, resp.key);
            } else {
                onComplete(ret, resp.key);
            }
        });
        this._sendRequest(request);
    }
    _createMapKnowledge(kid, onComplete) {
        let request = this._client.newRequest();
        request.setHashValue(kid, "fake", "{}", -1, (ret, resp) => {
            if (ret !== ErrorCode.RESULT_OK) {
                return onComplete(ret, resp.key);
            }
            let request2 = this._client.newRequest();
            request2.setHashValue(kid, "fake", null, -1, (ret, resp) => {
                onComplete(ret, resp.key);
            });
            this._sendRequest(request2);
        });
        this._sendRequest(request);
    }
    _deleteMapKnowledge(kid, onComplete) {
        let request = this._client.newRequest();
        request.setValue(kid, null, -1, (ret) => {
            if (ret == ErrorCode.RESULT_OK) {
                let kInfo = this._cacheNode[kid];
                if (kInfo) {
                    delete this._cacheNode[kid];
                }
                onComplete(ret, kid);
            } else {
                onComplete(ret, kid);
            }
        });
        this._sendRequest(request);
    }
    _sendRequest(request) {
        if (this._isConnected === false || this.m_stoped) {
            BX_WARN('knowledgeManager is stopped 1.');
            request.response(ErrorCode.RESULT_INVALID_STATE);
            BX_WARN('knowledgeManager is stopped 2.');
            return false;
        }
        this._client.commit(request);
        return true;
    }
}
KnowledgeManager.STATE_NEED_SYNC = 0;
KnowledgeManager.STATE_READY = 1;
KnowledgeManager.STATE_SYNCING = 2;
module.exports = {};
module.exports.BaseLib = BaseLib;
module.exports.BuckyAsync = BuckyAsync;
module.exports.SimpleAsync = SimpleAsync;
module.exports.CallChain = CallChain;
module.exports.ErrorCode = ErrorCode;
module.exports.DeviceType = DeviceType;
module.exports.RuntimeType = RuntimeType;
module.exports.DeviceDriver = DeviceDriver;
module.exports.AppKnowledgeKeys = AppKnowledgeKeys;
module.exports.AppState = AppState;
module.exports.MONITOR_CMD = MONITOR_CMD;
module.exports.STAT_CMD = STAT_CMD;
module.exports.BX_UID_TYPE_CORE = BX_UID_TYPE_CORE;
module.exports.BX_UID_TYPE_APP = BX_UID_TYPE_APP;
module.exports.BX_UID_TYPE_DEVELOPER = BX_UID_TYPE_DEVELOPER;
module.exports.BX_UID_TYPE_RUNTIME = BX_UID_TYPE_RUNTIME;
module.exports.BX_RUNTIME_LEVEL = BX_RUNTIME_LEVEL;
module.exports.MonitorClient = MonitorClient;
module.exports.StatClient = StatClient;
module.exports.blog = blog;
module.exports.BX_SetLogLevel = BX_SetLogLevel;
module.exports.BX_EnableFileLog = BX_EnableFileLog;
module.exports.BLOG_LEVEL_ALL = BLOG_LEVEL_ALL;
module.exports.BLOG_LEVEL_TRACE = BLOG_LEVEL_TRACE;
module.exports.BLOG_LEVEL_DEBUG = BLOG_LEVEL_DEBUG;
module.exports.BLOG_LEVEL_INFO = BLOG_LEVEL_INFO;
module.exports.BLOG_LEVEL_WARN = BLOG_LEVEL_WARN;
module.exports.BLOG_LEVEL_ERROR = BLOG_LEVEL_ERROR;
module.exports.BLOG_LEVEL_CHECK = BLOG_LEVEL_CHECK;
module.exports.BLOG_LEVEL_FATAL = BLOG_LEVEL_FATAL;
module.exports.BLOG_LEVEL_OFF = BLOG_LEVEL_OFF;
module.exports.BX_LOG = BX_LOG;
module.exports.BX_TRACE = BX_TRACE;
module.exports.BX_INFO = BX_INFO;
module.exports.BX_WARN = BX_WARN;
module.exports.BX_DEBUG = BX_DEBUG;
module.exports.BX_ERROR = BX_ERROR;
module.exports.BX_FATAL = BX_FATAL;
module.exports.BX_CTRL = BX_CTRL;
module.exports.BX_CHECK = BX_CHECK;
module.exports.BX_ASSERT = BX_ASSERT;
module.exports.BX_FILTER = BX_FILTER;
module.exports.BX_GET_CURRENT_CALLCHAIN = BX_GET_CURRENT_CALLCHAIN;
module.exports.BX_SET_CURRENT_CALLCHAIN = BX_SET_CURRENT_CALLCHAIN;
module.exports.BX_ENTER_ASYNC_CALL = BX_ENTER_ASYNC_CALL;
module.exports.BX_LEAVE_ASYNC_CALL = BX_LEAVE_ASYNC_CALL;
module.exports.getCurrentCallChain = getCurrentCallChain;
module.exports.setCurrentCallChain = setCurrentCallChain;
module.exports.beginSubCallChain = beginSubCallChain;
module.exports.BX_EnableSocketLog = BX_EnableSocketLog;
module.exports.LOG_AGENT_PROTOCAL_VERSION = LOG_AGENT_PROTOCAL_VERSION;
module.exports.LOG_AGENT_MAGIC_NUM = LOG_AGENT_MAGIC_NUM;
module.exports.LOG_AGENT_CMD = LOG_AGENT_CMD;
module.exports.BLogLevel = BLogLevel;
module.exports.LinkedList = LinkedList;
module.exports.BX_EnableLogAutoUpload = BX_EnableLogAutoUpload;
module.exports.InfoNode = InfoNode;
module.exports.Authentication = Authentication;
module.exports.KServerTCPClient = KServerTCPClient;
module.exports.KServerTCPClientStatus = KServerTCPClientStatus;
module.exports.KServerXHRClient = KServerXHRClient;
module.exports.KnowledgeManager = KnowledgeManager;
module.exports.KSERVER_PROTOCOL_VERSION = KSERVER_PROTOCOL_VERSION;
module.exports.KSERVER_PROTOCOL_HEADER = KSERVER_PROTOCOL_HEADER;
module.exports.KSERVER_PROTOCOL_CMD = KSERVER_PROTOCOL_CMD;
module.exports.KServerPackageHeader = KServerPackageHeader;
module.exports.KServerPackageParser = KServerPackageParser;
module.exports.KServerPackageCodec = KServerPackageCodec;
module.exports.TimeFormater = TimeFormater;
module.exports.DiscoverRegister = DiscoverRegister;
module.exports.CommensalMaster = CommensalMaster;
module.exports.CommensalWorker = CommensalWorker;
module.exports.ConHashSelector = ConHashSelector;
module.exports.RandomSelector = RandomSelector;
