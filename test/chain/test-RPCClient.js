const RPCClient = require('./RPC/RPCClient');

let client = new RPCClient('127.0.0.1', 3050);

client.Call('func1', "", (respStr, statusCode) => {
    console.log('call func1 resp:'+respStr+', statusCode:'+statusCode);
})

client.Call('func2', "", (respStr, statusCode) => {
    console.log('call func2 resp:'+respStr+', statusCode:'+statusCode);
})

client.Call('func3', "", (respStr, statusCode) => {
    console.log('call func3 resp:'+respStr+', statusCode:'+statusCode);
})