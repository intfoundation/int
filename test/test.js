
/**
 * run all test
 * @return {[type]} [description]
 */
function main(){
  console.log('~~~~~~~~~~~~~~~~');
  console.log('let it chain.')
  console.log('~~~~~~~~~~~~~~~~');

  const testors = {
    bdt: require('./test_bdt_ring.js')
  };

  for(let i in testors){
    let testor = testors[i];
    testor.run();
  }
}

/** hello blockchain!!! */
main();