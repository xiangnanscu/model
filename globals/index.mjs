export { Model } from "~/lib/model";

export function p() {
  console.log.apply(this, arguments);
}

export const toUpper = (s) => s.toUpperCase();
