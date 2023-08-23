export const clone = (o) => JSON.parse(JSON.stringify(o));
export const string_format = (s, ...varargs) => {
  let status = 0;
  const res = [];
  let j = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "%") {
      if (status === 0) {
        status = 1;
      } else if (status === 1) {
        status = 0;
        res.push("%");
      }
    } else if (c === "s" && status === 1) {
      j = j + 1;
      res.push(varargs[j]);
      status = 0;
    } else {
      res.push(c);
    }
  }
  return res.join("");
};
export function assert(bool, err_msg) {
  if (!bool) {
    throw new Error(err_msg);
  } else {
    return bool;
  }
}
export function next(obj) {
  for (const key in obj) {
    return key;
  }
}

export function make_token(s) {
  function raw_token() {
    return s;
  }
  Object.freeze(raw_token);
  return raw_token;
}

export const NULL = make_token("NULL");
export const DEFAULT = make_token("DEFAULT");

const sizeTable = {
  k: 1024,
  m: 1024 * 1024,
  g: 1024 * 1024 * 1024,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};
export function parse_size(t) {
  if (typeof t === "string") {
    const unit = t.replace(/^(\d+)([^\d]+)$/, "$2").toLowerCase();
    const ts = t.replace(/^(\d+)([^\d]+)$/, "$1").toLowerCase();
    const bytes = sizeTable[unit];
    if (!bytes) throw new Error("invalid size unit: " + unit);
    const num = parseFloat(ts);
    if (isNaN(num)) throw new Error("can't convert `" + ts + "` to a number");
    return num * bytes;
  } else if (typeof t === "number") {
    return t;
  } else {
    throw new Error("invalid type: " + typeof t);
  }
}

export const FK_TYPE_NOT_DEFIEND = Object.freeze(Symbol("FK_TYPE_NOT_DEFIEND"));

export function get_localtime(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
}

export class Http {}
