const f1 = async (type) => {
  if (type == "async") {
    try {
      const resp = await fetch("/blabla");
      return resp.status;
    } catch (error) {
      return 100;
    }
  } else {
    return 0;
  }
};
const f2 = (type) => {
  if (type == "async") {
    return new Promise((resolve, reject) => {
      fetch("/blabla")
        .then((resp) => resolve(resp.status))
        .catch((error) => resolve(100));
    });
  } else {
    return 0;
  }
};

// console.log(f1());
// console.log(await f1());
// console.log(f1("async"));
// console.log(await f1("async"));

// console.log(f2());
// console.log(await f2());
// console.log(f2("async"));
// console.log(await f2("async"));

import { enhancedFetch } from "./lib/model/utils.mjs";
const { data } = await enhancedFetch("https://httpbin.org/get", {
  progress(event) {
    console.log(event);
  },
});
console.log(data);
