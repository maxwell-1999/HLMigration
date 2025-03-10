import user from "./users.json";
import datav2 from "./data.json";
let users = user;
console.log(users.length);
const set = new Set(users);
console.log(set.size);
users = new Array(...set);
for (const user of users) {
  const userData = user in datav2;
  if (!userData) {
    console.log(`User ${user} not found in datav2`);
  }
}

/*



User 0x6356817fbce377e682bc4b5f2c9eb4e310303cc5 not found in datav2
User 0xd86a9d7e8694dc38793c5b75f7f496e4143bafc0 not found in datav2
User 0x3b74df87316544334a3b86eba94fd9eedb3d7b94 not found in datav2
User 0xf507f26b5fc510d5a9c9980af4bda3e829ec6190 not found in datav2
*