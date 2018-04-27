const RPCServer = require('./RPC/RPCServer')

let server = new RPCServer('127.0.0.1', 3050);
server.on('func1', (args, resp) => {
    console.log('recv call func1');
    resp.write('call on func1');
    resp.end();
});

server.on('func2', (args, resp) => {
    console.log('recv call func2');
    resp.write('call on func2');
    resp.end();
});

server.Start();