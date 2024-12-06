const addressMap = new Map();
addressMap.set("ab", [1211, 123]);
addressMap.set("abc", [1211, 123]);
let ss = [...addressMap.keys(), "dsa", "dev"];
let defValue = [22, 13, 11];
ss.forEach((s, i) => {
  let ref = [...defValue];
  ref[2] = 3 * i;
  addressMap.set(s, ref);
});
console.log(addressMap);
