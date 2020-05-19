"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../../client");
const process = require("process");
const core_1 = require("../../core");
let fs = require('fs');
let moment = require('moment/moment');
process.on('message', async (messageData) => {
    messageData.commandOptions = core_1.MapFromObject(messageData.commandOptions);
    if (messageData.messageFlag == "startPeer") {
        console.log(`${moment().format("YYYY-MM-DD hh:mm:ss")},restart peer async blocks`)
        // fs.appendFile('./peer-log.txt', `\n ${moment().format("YYYY-MM-DD HH:mm:ss")},restart peer async blocks`);
        let result = await client_1.host.initPeer(messageData.commandOptions);
        if (!result.ret) {
            process.exit(1);
        }
    }
});
