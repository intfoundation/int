"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function parseCommand(argv) {
    if (argv.length < 3) {
        console.log('no enough command');
        return;
    }
    let command = { options: new Map() };
    let start = 2;
    let firstArg = argv[2];
    if (!firstArg.startsWith('--')) {
        command.command = firstArg;
        start = 3;
    }
    let curKey;
    while (start < argv.length) {
        let arg = argv[start];
        if (arg.startsWith('--')) {
            // if (curKey) {
            //     command.options.set(curKey, true);
            // }
            curKey = arg.substr(2);
            command.options.set(curKey, true);
        }
        else {
            if (curKey) {
                command.options.set(curKey, arg);
                curKey = undefined;
            }
            else {
                console.error(`error command ${arg}, key must start with --`);
                return undefined;
            }
        }
        ++start;
    }
    return command;
}
exports.parseCommand = parseCommand;
