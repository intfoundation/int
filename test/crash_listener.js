 const path = require("path");
const fs = require("fs-extra");
const Base = require('../base/base.js');

const LOG_INFO = Base.BX_INFO;
const LOG_WARN = Base.BX_WARN;
const LOG_DEBUG = Base.BX_DEBUG;
const LOG_CHECK = Base.BX_CHECK;
const LOG_ASSERT = Base.BX_ASSERT;
const LOG_ERROR = Base.BX_ERROR;

class CrashListener {
    constructor() {
        this.m_logFolder = null;
        this.m_crashed = false;
        this.m_onCrashCallback = null;
    }

    listen(onCrash) {
        this.m_onCrashCallback = onCrash;
        process.on('unhandledRejection', err => this._onCrash(err))
        process.on('uncaughtException', err => this._onCrash(err));
    }

    enableFileLog(logFolder) {
        this.m_logFolder = logFolder;
    }

    _onCrash(err) {
       if (this.m_crashed) {
            process.exit(-1);
            return;
        }

        this.m_crashed = true;
        let errFileName = path.basename(require.main.filename, ".js");
        if (!errFileName || errFileName.length <= 0) {
            errFileName = "node";
        }
        errFileName += '_crash_[' + process.pid + '].err';

        let content = "crash time: " + Base.TimeFormater.getFormatTime();
        LOG_ERROR(content);
        let errStack = err.stack;
        // errStack = Base.BaseLib.replaceAll(errStack, '\r', ' ');
        // errStack = Base.BaseLib.replaceAll(errStack, '\n', ' ');
        LOG_ERROR(err.stack);
        content += Base.blog.getOptions().getFormatter().getLineBreak();
        content += err.stack;
        LOG_INFO(content);

        let onCrashResult = '';
        if (this.m_onCrashCallback) {
            onCrashResult = this.m_onCrashCallback(err);
        }

        Promise.resolve(onCrashResult).then(() => {
            if (this.m_logFolder) {
                Base.BaseLib.mkdirsSync(this.m_logFolder + '/errors');
                fs.writeFileSync(this.m_logFolder + '/errors/' + errFileName, content);
            }
            process.exit(-1);
        });
    }
}

module.exports = CrashListener;