import fs from "fs";

function compareArrays(arr1: number[], arr2: number[]): { added: number[], removed: number[] } {
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  
  const added = arr2.filter(num => !set1.has(num));
  const removed = arr1.filter(num => !set2.has(num));
  
  return { added, removed };
}

function main() {
  const map = JSON.parse(fs.readFileSync("./oldData.json", "utf-8"));
  console.log(Object.keys(map).length);
}

function identical() {
  const map1 = JSON.parse(fs.readFileSync("./oldData.json", "utf-8"));
  const map2 = JSON.parse(fs.readFileSync("./data.json", "utf-8"));

  // Find keys that exist in map1 but not in map2
  const onlyInMap1 = Object.keys(map1).filter(key => !(key in map2));
  console.log("\nKeys only in oldData.json:", onlyInMap1.length);
  console.log(onlyInMap1);

  // Find keys that exist in map2 but not in map1
  const onlyInMap2 = Object.keys(map2).filter(key => !(key in map1));
  console.log("\nKeys only in data.json:", onlyInMap2.length);
  console.log(onlyInMap2);

  // Find keys that exist in both but have different values
  const differentValues = Object.keys(map1)
    .filter(key => key in map2)
    .filter(key => JSON.stringify(map1[key]) !== JSON.stringify(map2[key]));
  
  console.log("\nKeys with different values:", differentValues.length);
  differentValues.forEach(key => {
    // console.log(`\nKey: ${key}`);
    const arr1 = map1[key] as number[];
    const arr2 = map2[key] as number[];
    
    // console.log("oldData.json array length:", arr1.length);
    // console.log("data.json array length:", arr2.length);
    
    const { added, removed } = compareArrays(arr1, arr2);
    
    if (added.length > 0) {
      console.log("Added numbers:", added);
    }
    if (removed.length > 0) {
      console.log("Removed numbers:", removed);
    }
  });
}

identical();
