const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data.json', 'utf-8'));
const batch = JSON.parse(fs.readFileSync('./contract_check_progress.json', 'utf-8'));
const batch2 = JSON.parse(fs.readFileSync('./contract_check_progressv2.json', 'utf-8'));
const isContract = {};
const isContract2 = {};
// console.log(Object.keys(batch));
for (const b in batch) {
    // console.log(b);
    for (const address in batch[b]) {
        isContract[address] = batch[b][address] == "contract" ? true : false;

    }
}
for (const b in batch2) {
    // console.log(b);
    for (const address in batch2[b]) {
        isContract2[address] = batch2[b][address] == "contract" ? true : false;

    }
}
const nonmatch = [];
const match = [];
for (const address in isContract) {
    if (isContract[address] != isContract2[address]) {
        nonmatch.push(address);
    }else{
        console.log(isContract[address],isContract2[address]);
        match.push(address);
    }
}
// for (const address in isContract2) {
//     if (!isContract[address]) {
//         nonmatch.push(address);
//     }
// }
console.log(nonmatch.length,match.length,Object.keys(isContract).length,Object.keys(isContract2).length);

// bfrs.sort((a, b) => a - b);
// console.log(bfrs);
// compare();