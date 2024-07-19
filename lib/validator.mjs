class SkipValidateError extends Error {}

function required(message) {
  message = message || "此项必填";
  function required_validator(v) {
    if (v === undefined || v === "") {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return required_validator;
}
function not_required(v) {
  if (v === undefined || v === "") {
    throw new SkipValidateError();
  } else {
    return v;
  }
}
function decode(v) {
  return JSON.parse(v);
}
function encode(v) {
  return JSON.stringify(v);
}
function number(v) {
  const n = Number(v);
  if (isNaN(n)) {
    throw new Error(`${v}不是数字`);
  } else {
    return n;
  }
}
const bool_map = {
  [true]: true,
  [false]: false,
  t: true,
  f: false,
  on: true,
  off: false,
  [1]: true,
  [0]: false,
  ["TRUE"]: true,
  ["FALSE"]: false,
  ["是"]: true,
  ["否"]: false,
};
function boolean(v) {
  const bv = bool_map[v];
  if (bv === undefined) {
    throw new Error(`invalid boolean value: ${v}(${typeof v})`);
  } else {
    return bv;
  }
}
function boolean_cn(v) {
  const bv = bool_map[v];
  if (bv === undefined) {
    throw new Error("请填“是”或“否”");
  } else if (bv === true) {
    return "是";
  } else {
    return "否";
  }
}
function as_is(v) {
  return v;
}
function string(v) {
  if (typeof v === "string") {
    return v;
  } else if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  } else {
    throw new Error("string type required, not " + typeof v);
  }
}
function trim(v) {
  return v.trim();
}
function year_month(v) {
  if (/^\d{4}[-.][01]\d$/.test(v)) {
    return v;
  } else {
    throw new Error("格式不正确，正确举例：2010.01");
  }
}
function year(v) {
  if (/^\d{4}$/.test(v)) {
    return v;
  } else {
    throw new Error("只能填写4位表示年份的数字");
  }
}

function delete_spaces(v) {
  return v.replace(/\s/g, "");
}
function maxlength(len, message) {
  message = message || "字数不能多于%s个";
  message = message.replaceAll("%s", String(len));
  function maxlength_validator(v) {
    if (v.length > len) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return maxlength_validator;
}
function length(len, message) {
  message = message || "字数需等于%s个";
  message = message.replaceAll("%s", String(len));
  function length_validator(v) {
    if (v.length !== len) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return length_validator;
}
function minlength(len, message) {
  message = message || "字数不能少于%s个";
  message = message.replaceAll("%s", String(len));
  function minlength_validator(v) {
    if (v.length < len) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return minlength_validator;
}
function pattern(regex, message) {
  message = message || "格式错误";
  const re = new RegExp(regex);
  function pattern_validator(v) {
    if (!re.test(v)) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return pattern_validator;
}
function max(n, message) {
  message = message || "值不能大于%s";
  message = message.replaceAll("%s", String(n));
  function max_validator(v) {
    if (v > n) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return max_validator;
}
function min(n, message) {
  message = message || "值不能小于%s";
  message = message.replaceAll("%s", String(n));
  function min_validator(v) {
    if (v < n) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return min_validator;
}
function valid_date(year, month, day) {
  if (month > 12 || month < 1) {
    throw new Error("月份数字" + (month + "错误"));
  }
  if (day > 31 || day < 1) {
    throw new Error("日期数字" + (day + "错误"));
  }
  if ((month === 4 || month === 6 || month === 9 || month === 11) && day > 30) {
    throw new Error(`${month}月只有30天`);
  } else if (month === 2) {
    if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) {
      if (day > 29) {
        throw new Error("闰年2月最多29天");
      }
    } else if (day > 28) {
      throw new Error("普通年份2月最多28天");
    }
  } else if (day > 31) {
    throw new Error(`${month}月只有31天`);
  }
  return [year, month, day];
}
function date(v) {
  v = /^(\d{4})([^\d])(\d\d?)([^\d])(\d\d?)([^\d])?$/.exec(v);
  if (v) {
    valid_date(Number(v[1]), Number(v[3]), Number(v[5]));
    return `${v[1]}-${v[3]}-${v[5]}`;
  } else {
    throw new Error("日期格式错误, 正确格式举例: 2010-01-01");
  }
}
function time(v) {
  const m = /^(\d\d?):(\d\d?):(\d\d?)$/.exec(v);
  if (m) {
    const hour = Number(m[1]);
    if (hour > 24 || hour < 0) {
      throw new Error("小时数字" + (m[1] + "错误"));
    }
    const minute = Number(m[2]);
    if (minute > 60 || minute < 0) {
      throw new Error("分钟数字" + (m[2] + "错误"));
    }
    const second = Number(m[3]);
    if (second > 60 || second < 0) {
      throw new Error("秒数字" + (m[3] + "错误"));
    }
    return v;
  } else {
    throw new Error("时间格式错误, 正确格式举例: 01:30:00");
  }
}
function datetime(v) {
  v = /^(\d{4})([^\d])(\d\d?)(\2)(\d\d?) (\d\d?):(\d\d?):(\d\d?)(\+\d\d?)?$/.exec(v);
  if (v) {
    valid_date(Number(v[1]), Number(v[3]), Number(v[5]));
    const hour = Number(v[6]);
    if (hour > 24 || hour < 0) {
      throw new Error("小时数字" + (v[6] + "错误"));
    }
    const minute = Number(v[7]);
    if (minute > 60 || minute < 0) {
      throw new Error("分钟数字" + (v[7] + "错误"));
    }
    const second = Number(v[8]);
    if (second > 60 || second < 0) {
      throw new Error("秒数字" + (v[8] + "错误"));
    }
    return `${v[1]}-${v[3]}-${v[5]} ${v[6]}:${v[7]}:${v[8]}`;
  } else {
    throw new Error("日期格式错误, 正确格式举例: 2010-01-01 01:30:00");
  }
}
function non_empty_array_required(message) {
  message = message || "此项必填";
  function array_validator(v) {
    if (v.length === 0) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return array_validator;
}
function integer(v) {
  const n = Number(v);
  if (!Number.isInteger(n)) {
    throw new Error("要求整数");
  } else {
    return n;
  }
}
function float(v) {
  const n = parseFloat(v);
  if (!Number.isNaN(n)) {
    throw new Error("要求数字");
  } else {
    return n;
  }
}
const URL_REGEX = /^(https?:)?\/\/.*$/;
function url(v) {
  if (!URL_REGEX.test(v)) {
    throw new Error("错误链接格式");
  } else {
    return v;
  }
}
const a = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const b = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
function validate_sfzh(s) {
  let n = 0;
  for (let i = 0; i < 17; i = i + 1) {
    n = n + Number(s[i]) * a[i];
  }
  if (b[n % 11] === s[17]) {
    return s;
  } else {
    throw new Error("身份证号错误");
  }
}
function sfzh(v) {
  if (v.length !== 18) {
    throw new Error(`身份证号必须为18位，当前${v.length}位`);
  }
  v = v.toUpperCase();
  if (!/^\d{17}[\dX]$/.test(v)) {
    throw new Error("身份证号前17位必须为数字，第18位必须为数字或大写字母X");
  }
  try {
    valid_date(Number(v.slice(6, 10)), Number(v.slice(10, 12)), Number(v.slice(12, 14)));
  } catch (error) {
    throw new Error("身份证号日期部分错误:" + error.message);
  }
  return validate_sfzh(v);
}

function email(v) {
  const regex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/;
  const ok = regex.test(v);
  if (ok) {
    return v;
  } else {
    throw new Error("电子邮件格式不正确");
  }
}
export {
  SkipValidateError,
  required,
  not_required,
  string,
  year_month,
  year,
  maxlength,
  minlength,
  length,
  max,
  min,
  pattern,
  non_empty_array_required,
  integer,
  float,
  url,
  encode,
  decode,
  number,
  as_is,
  date,
  datetime,
  time,
  trim,
  delete_spaces,
  boolean,
  boolean_cn,
  sfzh,
  email,
  validate_sfzh,
  bool_map,
};
