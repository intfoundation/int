"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const core_1 = require("../core");
const unhandled_rejection_1 = require("../client/lib/unhandled_rejection");
async function main() {
    const logger = core_1.initLogger({ loggerOptions: { console: true, level: 'debug' } });
    unhandled_rejection_1.init(logger);
    const routine = new core_1.BlockExecutorWorkerRoutine();
    let creator = core_1.initChainCreator({ logger });
    let pr = await new Promise((resolve) => {
        let command = process.argv[2];
        if (command) {
            // for debug from command line
            let raw;
            try {
                raw = JSON.parse(command);
            }
            catch (e) {
                resolve({ err: core_1.ErrorCode.RESULT_INVALID_PARAM });
            }
            const _pr = core_1.BlockExecutorWorkerRoutine.decodeParams(creator, raw);
            resolve(_pr);
        }
        else {
            process.on('message', async (raw) => {
                const _pr = core_1.BlockExecutorWorkerRoutine.decodeParams(creator, raw);
                resolve(_pr);
            });
        }
    });
    let result = Object.create(null);
    do {
        if (pr.err) {
            result.err = pr.err;
            break;
        }
        result = await routine.run(pr.params);
    } while (false);
    const rr = core_1.BlockExecutorWorkerRoutine.encodeResult(result);
    let message;
    if (rr.err) {
        message = rr;
    }
    else {
        message = rr.message;
    }
    await new Promise((resolve) => {
        // node 10以上send才有callback参数；send不是同步的，这里需要一个ack；直接加一个timer算求
        process.send(message);
        setTimeout(() => {
            resolve();
        }, 1000);
    });
    process.exit(0);
}
if (require.main === module) {
    main();
}
