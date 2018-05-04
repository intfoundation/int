const SuperNodeClient = require('./Peer/superNodeClient');

async function run() {
    let client = new SuperNodeClient('127.0.0.1', 11111);
    await client.createCoinbase([
        { address: '19fHD2uxWtQ5xJ9rjhDVhFNEMp659u7JHb', amount: 50000 },
        { address: '1HH3SwayDsS2MsXVi6b3dLBbuZPQp3P8wH', amount: 50000 },
        { address: '12cnRvyhCEVFVcx8BawPbn4kgp3ixsdedM', amount: 50000 },
        { address: '19jAKRouUbCtGcYJgZqqimUw2DGbAZzDUZ', amount: 50000 },
        { address: '1Fbfv5f5QjWCGsCRSY8tA7Whmg2FPyNJ5j', amount: 50000 },
        { address: '1JSjsnzXf6A8GKAd8eytwPHqr6Ci33FCbp', amount: 50000 },
    ]);
}


let fn = run();
fn.then(()=>{
    console.log('create Wage Success');
    process.exit(0);
})
