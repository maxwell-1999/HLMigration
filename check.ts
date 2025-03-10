import fs from "fs";
function main() {
  const map = JSON.parse(fs.readFileSync("./data.json", "utf-8"));
  console.log(Object.keys(map).length);
}

main();
