const assert = require('assert');

const BLOG_STACK_EXP = /^\s*at .*(\S+\:\d+|\(native\))/m;
const BLOG_LINE_EXP = /(.+?)(?:\:(\d+))?(?:\:(\d+))?$/;


class BLogStackHelper {
    static _extractLocation(urlLike) {
        // Fail-fast but return locations like '(native)'
        if (urlLike.indexOf(':') === -1) {
            return [urlLike];
        }

        const parts = BLOG_LINE_EXP.exec(urlLike.replace(/[\(\)]/g, ''));
        return [parts[1], parts[2] || undefined, parts[3] || undefined];
    }

    static _parseStackString(stackString) {
        const filtered = stackString.split('\n').filter((line) => {
            return !!line.match(BLOG_STACK_EXP);
        });

        return filtered.map((line) => {
            if (line.indexOf('(eval ') > -1) {
                // Throw away eval information until we implement stacktrace.js/stackframe#8
                line = line.replace(/eval code/g, 'eval').replace(/(\(eval at [^\()]*)|(\)\,.*$)/g, '');
            }
            const tokens = line.replace(/^\s+/, '').replace(/\(eval code/g, '(').split(/\s+/).slice(1);
            const locationParts = BLogStackHelper._extractLocation(tokens.pop());
            const functionName = tokens.join(' ') || undefined;
            const fileName = ['eval', '<anonymous>'].indexOf(locationParts[0]) > -1 ? undefined : locationParts[0];

            return ({
                functionName: functionName,
                fileName: fileName,
                lineNumber: locationParts[1],
                columnNumber: locationParts[2],
                source: line
            });
        });
    }

    static _getStackString(info) {
        let stack;
        try {
            throw new Error(info);
        } catch (e) {
            stack = e.stack;
        }

        return stack;
    }

    static baseName(path) {
        return path.split(/[\\/]/).pop();
    }
    /*
        info = {
            frame : [integer],
            pos : [boolean],
            stack : [boolean],
        }*/
    static getStack(info) {
        const stackString = BLogStackHelper._getStackString('prepare stack');

        const stack = BLogStackHelper._parseStackString(stackString);
        if (info.pos) {
            const frameIndex = info.frame + 3;
            info.pos = null;
            if (stack && stack.length > 0 && frameIndex < stack.length) {
                const frame = stack[frameIndex];
                info.pos = {
                    'line': frame.lineNumber,
                    'file': frame.fileName,
                    'func': frame.functionName,
                };

                if (info.pos.file && !info.fullpath) {
                    info.pos.file = BLogStackHelper.baseName(info.pos.file);
                }
            }
        }

        if (info.stack) {
            if (stack && stack.length > 0) {
                info.stack = '';
                for (let index = info.frame + 3; index < stack.length; ++index) {
                    const frame = stack[index];
                    info.stack += `at ${frame.functionName} (${frame.fileName}:${frame.lineNumber}:${frame.columnNumber})\n`;
                }
            } else {
                info.stack = stackString;
            }
        }
    }
}


// log中间层，用以增加下述功能:
// 1. 增加新的日志头和日志尾
// 2. 支持输出行号和堆栈
// 3. 支持trace，fatal等函数，兼容blog

class LogShim {
    constructor(log, options) {
        this.m_preHeaders = [];
        this.m_postHeaders = [];
        this.m_log = log;

        // LogShim支持嵌套，用以标识层级
        this.m_nestLevel = log.__nestlevel == null ? 0 : log.__nestlevel + 1;

        this.m_options = this._defaultOptions();
        for (const key in options) {
            this.m_options[key] = options[key];
        }

        this.m_callOptions = null;

        this.m_extProp = {
            'shim': this,
            'LogShim': LogShim,
            '__nestlevel': this.m_nestLevel,
            'with': (options) => {
                this.m_callOptions = options;
                return this.log;
            },
        };

        this.m_logFuncs = ['silly', 'debug', 'verbose', 'info', 'warn', 'error'];
        this.m_handler = {
            get: (target, key, receiver) => {
                if (typeof key === 'string') {
                    if (this.m_extProp.hasOwnProperty(key)) {
                        return this.m_extProp[key];
                    }

                    if (key === 'trace') {
                        key = 'verbose';
                    } else if (key === 'fatal') {
                        key = 'error';
                    }

                    if (this.m_logFuncs.indexOf(key) < 0) {
                        return Reflect.get(target, key, receiver);
                    }

                    return (...args) => {
                        const callOptions = this.m_callOptions;
                        this.m_callOptions = null;

                        const fullArgs = [...this.m_preHeaders, ...args, ...this.m_postHeaders];

                        // 多层Shim嵌套，只有最内层输出pos
                        if (target.__nestlevel == null) {
                            fullArgs.push(this._pos(callOptions? callOptions.frame : 1));
                        }

                        if (target.__nestlevel != null) {
                            const nestOptions = {};
                            nestOptions.frame = callOptions? callOptions.frame + 1 : 2;
                            return target.with(nestOptions)[key](...fullArgs);
                        } else {
                            return target[key](...fullArgs);
                        }
                    };
                } else {
                    if (key === require('util').inspect.custom) {
                        return () => {
                            return { packageInfo: this.m_packageInfo, moduleName: this.m_moduleName };
                        };
                    }
                    return Reflect.get(target, key, receiver);
                }
            },
            ownKeys: () => {
                return [];
            },
        };

        this.m_proxy = new Proxy(this.m_log, this.m_handler);
    }

    _defaultOptions() {
        return {
            pos: true,
            stack: false,
            fullpath: false,
        };
    }

    _pos(frame) {
        assert(frame >= 1);
        const info = {
            frame: frame,
            pos: this.m_options.pos,
            fullpath: this.m_options.fullpath,
            stack: this.m_options.stack,
        };
        BLogStackHelper.getStack(info);

        const pos = info.pos;
        if (pos.file == null) {
            pos.file = '[unknown]';
        }

        return `${pos.file}:${pos.line}`;
    }

    bind(header, pre) {
        if (pre) {
            this.m_preHeaders.push(header);
        } else {
            this.m_postHeaders.push(header);
        }

        return this;
    }

    get log() {
        return this.m_proxy;
    }
}


module.exports.LogShim = LogShim;