class Func {
  static __IS_FUNCTION__ = true;

  constructor(column) {
    this.column = column;
  }

  get name() {
    return this.constructor.name.toUpperCase();
  }

  get suffix() {
    return `_${this.constructor.name.toLowerCase()}`;
  }

  get __IS_FUNCTION__() {
    return true;
  }
}

class Count extends Func {
  static name = "COUNT";
  static suffix = "_count";

  get name() {
    return "COUNT";
  }

  get suffix() {
    return "_count";
  }
}

class Sum extends Func {
  static name = "SUM";
  static suffix = "_sum";

  get name() {
    return "SUM";
  }

  get suffix() {
    return "_sum";
  }
}

class Avg extends Func {
  static name = "AVG";
  static suffix = "_avg";

  get name() {
    return "AVG";
  }

  get suffix() {
    return "_avg";
  }
}

class Max extends Func {
  static name = "MAX";
  static suffix = "_max";

  get name() {
    return "MAX";
  }

  get suffix() {
    return "_max";
  }
}

class Min extends Func {
  static name = "MIN";
  static suffix = "_min";

  get name() {
    return "MIN";
  }

  get suffix() {
    return "_min";
  }
}

function createCallableClass(ClassConstructor) {
  const callable = function (column) {
    return new ClassConstructor(column);
  };

  // 只复制可写的静态属性
  const staticProps = Object.getOwnPropertyNames(ClassConstructor);
  staticProps.forEach((prop) => {
    if (prop !== "name" && prop !== "length" && prop !== "prototype") {
      try {
        callable[prop] = ClassConstructor[prop];
      } catch (e) {
        // 忽略只读属性的错误
      }
    }
  });

  // 设置原型链
  Object.setPrototypeOf(callable, ClassConstructor);

  return callable;
}

const CountCallable = createCallableClass(Count);
const SumCallable = createCallableClass(Sum);
const AvgCallable = createCallableClass(Avg);
const MaxCallable = createCallableClass(Max);
const MinCallable = createCallableClass(Min);

export {
  CountCallable as Count,
  SumCallable as Sum,
  AvgCallable as Avg,
  MaxCallable as Max,
  MinCallable as Min,
};
