import { relu } from "./utils";

async function main() {
  const contentt = Bun.file("data.json");
  const json = JSON.parse(await contentt.text());
  //   console.log(json);
  let total = 0n;
  for (let acc in json) {
    const tota = json[acc].reduce((prev, curr) => {
      //   try {
      //     prev + (curr);
      //   } catch (e) {
      //     console.log("err in ", prev, curr);
      //   }
      return relu(prev) + relu(curr);
    }, 0n);
    console.log(tota);
    // console.log(.length);
  }
}
main();
