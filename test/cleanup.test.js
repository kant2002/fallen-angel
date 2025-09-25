import { strictEqual } from 'assert';
import { 
    parseParameters,
    extractArrayValues,
    simplifySpreadParameters,
    simplifyDecoding,
    getEnvironmentFileName,
    extractArrayName,
    inlineDecodeHelperCalls,
    inlineStringConcats,
    replaceParameters
} from '../lib/index.js';

describe('Parameter Parsing', () => {
    it('should parse parameters correctly', () => {
        const params = "{get\"I9OeM00\"(){return global},get\"ay\"(){return module},set\"ay\"(a){return module=a},get\"lIPYnc3\"(){return require},get\"vdtG6wf\"(){return __dirname},get\"JljANHr\"(){return buildCharMap},get\"wNdQru\"(){return process},get\"SIMMwg\"(){return Blob},get\"h0soF4n\"(){return URL},get\"az\"(){return typeof global}}";
        const result = parseParameters(params);
        strictEqual(result.get("I9OeM00"), "global");
        strictEqual(result.get("ay"), "module");
        strictEqual(result.get("lIPYnc3"), "require");
        strictEqual(result.get("vdtG6wf"), "__dirname");
        strictEqual(result.get("JljANHr"), "buildCharMap");
        strictEqual(result.get("wNdQru"), "process");
        strictEqual(result.get("SIMMwg"), "Blob");
        strictEqual(result.get("h0soF4n"), "URL");
        strictEqual(result.get("az"), "typeof global");
    });
    it('Replace parsed parameters', () => {
        const params = `{get"TPnx8Ws"(){return global},get"eSwxse9"(){return module},set"eSwxse9"(var_1){return module=var_1},get"WtbISz"(){return process},get"bbHLV3d"(){return Blob},get"LEN0KdE"(){return URL},get"var_173"(){return List},get"cr"(){return typeof global}}`;
        const result = parseParameters(params);
        let code = `("undefined" != typeof window ? window : "undefined" != var_1["cr"] ? var_1["TPnx8Ws"] : this)`;

        code = replaceParameters(code, result, "var_1");
        strictEqual(code, `("undefined" != typeof window ? window : "undefined" != typeof global ? global : this)`);
    });
});

describe('File name building', () => {
    it('should build environment file name correctly', () => {
        const result = getEnvironmentFileName("gsap-3.12.2.min.js");
        strictEqual(result, "gsap-3.12.2.min.environment.js");
    });

    it('should handle files without extension', () => {
        const result = getEnvironmentFileName("file");
        strictEqual(result, "file.environment.js");
    });

    it('should handle files with multiple dots', () => {
        const result = getEnvironmentFileName("a.b.c");
        strictEqual(result, "a.b.c.environment.js");
    });
});

describe('Array Values Extraction', () => {
    it('should extract simple array values', () => {
        const code = 'function test() { const CMYRQT = ["apple", "banana", "cherry"]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result["0"], "\"apple\"");
        strictEqual(result["1"], "\"banana\"");
        strictEqual(result["2"], "\"cherry\"");
    });
    
    it('should extract empty array for var declaration', () => {
        const code = 'function test() { var CMYRQT = ["apple", "banana", "cherry"]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result, null);
    });

    it('should extract numeric array values', () => {
        const code = 'function test() { const CMYRQT = [100, 200, 300]; }';
        const result = extractArrayValues(code, "CMYRQT");

        strictEqual(result[0], 100);
        strictEqual(result[1], 200);
        strictEqual(result[2], 300);
    });

    it('should extract mixed type array values', () => {
        const code = 'function test() { const CMYRQT = ["text", 42, true]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result[0], "\"text\"");
        strictEqual(result[1], 42);
        strictEqual(result[2], true);
    });

    it('should handle array with quoted strings containing commas', () => {
        const code = 'function test() { const CMYRQT = ["hello, world", "test", "another, value"]; }';
        const result = extractArrayValues(code, "CMYRQT");

        strictEqual(result[0], "\"hello, world\"");
        strictEqual(result[1], "\"test\"");
        strictEqual(result[2], "\"another, value\"");
    });

    it('should handle empty array', () => {
        const code = 'function test() { const CMYRQT = []; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result.length, 0);
    });

    it('should handle array with one element', () => {
        const code = 'function test() { const CMYRQT = ["single"]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result.length, 1);
        strictEqual(result[0], "\"single\"");
    });

    it('should handle array with nested quotes', () => {
        const code = 'function test() { const CMYRQT = ["He said \\"hello\\" and \\n", "She replied \\"hi\\""]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result[0], '\"He said \\"hello\\" and \\n\"');
        strictEqual(result[1], '\"She replied \\"hi\\"\"');
    });

    it('should handle different variable declaration styles', () => {
        const code1 = 'function test() { let CMYRQT = ["a", "b"]; }';
        const code2 = 'function test() { const CMYRQT = ["x", "y"]; }';
        const code3 = 'function test() { CMYRQT = ["m", "n"]; }';
        
        const result1 = extractArrayValues(code1, "CMYRQT");
        const result2 = extractArrayValues(code2, "CMYRQT");
        const result3 = extractArrayValues(code3, "CMYRQT");
        
        strictEqual(result1, null);
        strictEqual(result2[0], "\"x\"");
        strictEqual(result3, null);
    });

    it('should return empty map when variable not found', () => {
        const code = 'function test() { const OTHER = ["a", "b", "c"]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result, null);
    });

    it('should handle whitespace in arrays', () => {
        const code = 'function test() { const CMYRQT = [ "first" , "second" , "third" ]; }';
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result[0], "\"first\"");
        strictEqual(result[1], "\"second\"");
        strictEqual(result[2], "\"third\"");
    });

    it('should handle multiline arrays', () => {
        const code = `function test() { const CMYRQT = [
            "line1",
            "line2",
            "line3"
        ]; }`;
        const result = extractArrayValues(code, "CMYRQT");
        
        strictEqual(result[0], "\"line1\"");
        strictEqual(result[1], "\"line2\"");
        strictEqual(result[2], "\"line3\"");
    });
});



describe('Simplify decoding', () => {
    it('should handle functions without var', () => {
        const code = `function __Array(__Array) {
                    var utf8ArrayToStr = "fAKVLrIYbjcuM}OnFdQB,1<@zvlqyam:4&\\"P;w*x82/%\`.+kZt)eU0^oGRXp!CDE|N5i7gT{s=9]$~JHhS?_36#(>[W",
                      btO3Nyf, __globalObject, __Buffer, __TextDecoder, __Uint8Array, __String, Blob;
                    var_65(btO3Nyf = "" + (__Array || ""), __globalObject = btO3Nyf.length, __Buffer = [], __TextDecoder = 0, __Uint8Array = 0, __String = -1);
                    for (Blob = 0; Blob < __globalObject; Blob++) {
                      var URL = utf8ArrayToStr.indexOf(btO3Nyf[Blob]);
                      if (URL === -1) continue;
                      if (__String < 0) {
                        __String = URL
                      } else {
                        var_65(__String += URL * 91, __TextDecoder |= __String << __Uint8Array, __Uint8Array += (__String & 8191) > 88 ? 13 : 14);
                        do {
                          var_65(__Buffer.push(__TextDecoder & 255), __TextDecoder >>= 8, __Uint8Array -= 8)
                        } while (__Uint8Array > 7);
                        __String = -1
                      }
                    }
                    if (__String > -1) {
                      __Buffer.push((__TextDecoder | __String << __Uint8Array) & 255)
                    }
                    return dkJAw8(__Buffer)
                  }`;
        const result = simplifyDecoding(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function __Array(__Array) {
  const __Buffer = decodeHelper(
    "fAKVLrIYbjcuM}OnFdQB,1<@zvlqyam:4&\\"P;w*x82/%\`.+kZt)eU0^oGRXp!CDE|N5i7gT{s=9]$~JHhS?_36#(>[W",
    __Array
  );;

  return dkJAw8(__Buffer)
}`.replaceAll(/\r\n/g, '\n'));
    });
    it('should handle functions with var', () => {
        const code = `function __Buffer(param_0) {
                    var_65(
                      local_0 = "uOpGbEZtABaNWQJ/6<,FvmU8HD?!*lKz=oR]4;0S)T\\"c_97}Y@XwVg.^x{e&r2|j(sC[y1qI$#+:h%PL>fkdiM5n~\`3",
                      local_1 = "" + (param_0 || ""),
                      local_2 = local_1.length,
                      local_3 = [],
                      local_4 = 0,
                      local_5 = 0,
                      local_6 = -1
                    );
                    for (local_7 = 0; local_7 < local_2; local_7++) {
                      local_8 = local_0.indexOf(local_1[local_7]);
                      if (local_8 === -1) continue;
                      if (local_6 < 0) {
                        local_6 = local_8
                      } else {
                        var_65(local_6 += local_8 * 91, local_4 |= local_6 << local_5, local_5 += (local_6 & 8191) > 88 ? 13 : 14);
                        do {
                          var_65(local_3.push(local_4 & 255), local_4 >>= 8, local_5 -= 8)
                        } while (local_5 > 7);
                        local_6 = -1
                      }
                    }
                    if (local_6 > -1) {
                      local_3.push((local_4 | local_6 << local_5) & 255)
                    }
                    return dkJAw8(local_3);
                  }`;
        const result = simplifyDecoding(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function __Buffer(param_0) {
  const local_3 = decodeHelper(
    "uOpGbEZtABaNWQJ/6<,FvmU8HD?!*lKz=oR]4;0S)T\\"c_97}Y@XwVg.^x{e&r2|j(sC[y1qI$#+:h%PL>fkdiM5n~\`3",
    param_0
  );;

  return dkJAw8(local_3);
}`.replaceAll(/\r\n/g, '\n'));
    });
    it('should handle functions with var2', () => {
        const code = `function __Buffer(param_0) {
      var_65(
        local_0 = "u=/968;\`1[&.RbFU3Q><YhEif,buildCharMap|@ZTexGH)s^d2Wt!#~C(+vyP_{wLgnz:%S*kjXl$Io5\\"BJ0D?7M4V}qpKNmOA]c",
        local_1 = "" + (param_0 || ""),
        local_2 = local_1.length,
        local_3 = [],
        local_4 = 0,
        local_5 = 0,
        local_6 = -1
      );
      for (local_7 = 0; local_7 < local_2; local_7++) {
        local_8 = local_0.indexOf(local_1[local_7]);
        if (local_8 === -1) continue;
        if (local_6 < 0) {
          local_6 = local_8
        } else {
          var_65(local_6 += local_8 * 91, local_4 |= local_6 << local_5, local_5 += (local_6 & 8191) > 88 ? 13 : 14);
          do {
            var_65(local_3.push(local_4 & 255), local_4 >>= 8, local_5 -= 8)
          } while (local_5 > 7);
          local_6 = -1
        }
      }
      if (local_6 > -1) {
        local_3.push((local_4 | local_6 << local_5) & 255)
      }
      return dkJAw8(local_3);
    }`;
        const result = simplifyDecoding(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function __Buffer(param_0) {
  const local_3 = decodeHelper(
    "u=/968;\`1[&.RbFU3Q><YhEif,buildCharMap|@ZTexGH)s^d2Wt!#~C(+vyP_{wLgnz:%S*kjXl$Io5\\"BJ0D?7M4V}qpKNmOA]c",
    param_0
  );;

  return dkJAw8(local_3);
}`.replaceAll(/\r\n/g, '\n'));
    });
    it('should handle empty functions', () => {
        const code = `function __Buffer(param_0) {}`;
        const result = simplifyDecoding(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function __Buffer(param_0) {}`.replaceAll(/\r\n/g, '\n'));
    });
});



describe('Simplify spread parameters', () => {

    it('should handle functions expression with zero parameters', () => {
        const code = `var test = function (...__Buffer) {
  __Buffer["length"] = 0;
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `var test = function() {
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`.replaceAll(/\r\n/g, '\n'));
    });

    it('should handle functions declaration with zero parameters', () => {
        const code = `function test(...__Buffer) {
  __Buffer["length"] = 0;
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function test() {
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`.replaceAll(/\r\n/g, '\n'));
    });
    it('should handle nested functions expression with zero parameters', () => {
        const code = `var test = function (...__Buffer) {
  __Buffer["length"] = 0;
  return function(...__TextDecoder) {
    __TextDecoder["length"] = 0;
    const utf8ArrayToStr = new RegExp("\\n");
    return utf8ArrayToStr["test"](__globalObject)
  }
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `var test = function() {
  return function() {
    const utf8ArrayToStr = new RegExp("\\n");
    return utf8ArrayToStr["test"](__globalObject)
  };
}`.replaceAll(/\r\n/g, '\n'));
    });
    it('should handle functions expression with zero parameters within var_65', () => {
        const code = `var test = function (...__Buffer) {
  var_65(__Buffer["length"] = 0);
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `var test = function() {
  var_65();
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`.replaceAll(/\r\n/g, '\n'));
    });
    
    it('should handle functions expression with zero parameters and local parameters', () => {
        const code = `var test = function (...__Buffer) {
  __Buffer["length"] = 0, __Buffer[-7] = "";
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `var test = function() {
  local_0 = "";
  const utf8ArrayToStr = new RegExp("\\n");
  return utf8ArrayToStr["test"](__globalObject)
}`.replaceAll(/\r\n/g, '\n'));
    });

    it('should handle functions with one parameter', () => {
        const code = `function E3Kjdm(...__TextDecoder) {
    var_65(__TextDecoder["length"] = 1, __TextDecoder[-7] = "");
    for (__TextDecoder[-85] = 0; __TextDecoder[-85] < __TextDecoder[0].length * 32; __TextDecoder[-85] += 8) 
    __TextDecoder[-7] += String.fromCharCode(__TextDecoder[0][__TextDecoder[-85] >> 5] >>> 24 - __TextDecoder[-85] % 32 & 255);
    return __TextDecoder[-7]
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');

        strictEqual(result, `function E3Kjdm(param_0) {
    var_65(local_0 = "");
    for (local_1 = 0; local_1 < param_0.length * 32; local_1 += 8) 
    local_0 += String.fromCharCode(param_0[local_1 >> 5] >>> 24 - local_1 % 32 & 255);
    return local_0;
}`.replaceAll(/\r\n/g, '\n'));
    });

    it('should handle functions with one parameter and no var_65', () => {
        const code = `function dkJAw8(...DVg62f) {
    DVg62f["length"] = 1;
    return typeof __TextDecoder !== "undefined" && __TextDecoder ? new __TextDecoder()["decode"](new __Uint8Array(DVg62f[0])) : typeof __Buffer !== "undefined" && __Buffer ? __Buffer["from"](DVg62f[0]).toString("utf-8") : utf8ArrayToStr(DVg62f[0])
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function dkJAw8(param_0) {
    return typeof __TextDecoder !== "undefined" && __TextDecoder ? new __TextDecoder()["decode"](new __Uint8Array(param_0)) : typeof __Buffer !== "undefined" && __Buffer ? __Buffer["from"](param_0).toString("utf-8") : utf8ArrayToStr(param_0);
}`.replaceAll(/\r\n/g, '\n'));
    });

    it('should handle functions with two parameter', () => {
        const code = `function var_63(...DVg62f) {
    var_65(DVg62f["length"] = 2, DVg62f[74] = 0xdeadbeef ^ DVg62f[1], DVg62f["b"] = 0x41c6ce57 ^ DVg62f[1]);
    for (var global = 0, __globalObject; global < DVg62f[0].length; global++) {
      var_65(__globalObject = DVg62f[0].charCodeAt(global), DVg62f[74] = ZVvKFvy(DVg62f[74] ^ __globalObject, 0x9e3779b1), DVg62f["b"] = ZVvKFvy(DVg62f["b"] ^ __globalObject, 0x5f356495))
    }
    var_65(DVg62f[74] = ZVvKFvy(DVg62f[74] ^ DVg62f[74] >>> 16, 2246822507) ^ ZVvKFvy(DVg62f["b"] ^ DVg62f["b"] >>> 13, 3266489909), DVg62f["b"] = ZVvKFvy(DVg62f["b"] ^ DVg62f["b"] >>> 16, 2246822507) ^ ZVvKFvy(DVg62f[74] ^ DVg62f[74] >>> 13, 3266489909));
    return 0x100000000 * (2097151 & DVg62f["b"]) + (DVg62f[74] >>> 0)
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `function var_63(param_0, param_1) {
    var_65(local_0 = 0xdeadbeef ^ param_1, local_1 = 0x41c6ce57 ^ param_1);
    for (var global = 0, __globalObject; global < param_0.length; global++) {
      var_65(__globalObject = param_0.charCodeAt(global), local_0 = ZVvKFvy(local_0 ^ __globalObject, 0x9e3779b1), local_1 = ZVvKFvy(local_1 ^ __globalObject, 0x5f356495))
    }
    var_65(local_0 = ZVvKFvy(local_0 ^ local_0 >>> 16, 2246822507) ^ ZVvKFvy(local_1 ^ local_1 >>> 13, 3266489909), local_1 = ZVvKFvy(local_1 ^ local_1 >>> 16, 2246822507) ^ ZVvKFvy(local_0 ^ local_0 >>> 13, 3266489909));
    return 0x100000000 * (2097151 & local_1) + (local_0 >>> 0);
}`.replaceAll(/\r\n/g, '\n'));
    });

    it('should handle parameters with class', () => {
        const code = `class test{
        static var_63(...DVg62f) {
    var_65(DVg62f["length"] = 2, DVg62f[74] = 0xdeadbeef ^ DVg62f[1], DVg62f["b"] = 0x41c6ce57 ^ DVg62f[1]);
    for (var global = 0, __globalObject; global < DVg62f[0].length; global++) {
      var_65(__globalObject = DVg62f[0].charCodeAt(global), DVg62f[74] = ZVvKFvy(DVg62f[74] ^ __globalObject, 0x9e3779b1), DVg62f["b"] = ZVvKFvy(DVg62f["b"] ^ __globalObject, 0x5f356495))
    }
    var_65(DVg62f[74] = ZVvKFvy(DVg62f[74] ^ DVg62f[74] >>> 16, 2246822507) ^ ZVvKFvy(DVg62f["b"] ^ DVg62f["b"] >>> 13, 3266489909), DVg62f["b"] = ZVvKFvy(DVg62f["b"] ^ DVg62f["b"] >>> 16, 2246822507) ^ ZVvKFvy(DVg62f[74] ^ DVg62f[74] >>> 13, 3266489909));
    return 0x100000000 * (2097151 & DVg62f["b"]) + (DVg62f[74] >>> 0)
}
}`;
        const result = simplifySpreadParameters(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `class test{
        static var_63(param_0, param_1) {
    var_65(local_0 = 0xdeadbeef ^ param_1, local_1 = 0x41c6ce57 ^ param_1);
    for (var global = 0, __globalObject; global < param_0.length; global++) {
      var_65(__globalObject = param_0.charCodeAt(global), local_0 = ZVvKFvy(local_0 ^ __globalObject, 0x9e3779b1), local_1 = ZVvKFvy(local_1 ^ __globalObject, 0x5f356495))
    }
    var_65(local_0 = ZVvKFvy(local_0 ^ local_0 >>> 16, 2246822507) ^ ZVvKFvy(local_1 ^ local_1 >>> 13, 3266489909), local_1 = ZVvKFvy(local_1 ^ local_1 >>> 16, 2246822507) ^ ZVvKFvy(local_0 ^ local_0 >>> 13, 3266489909));
    return 0x100000000 * (2097151 & local_1) + (local_0 >>> 0);
}
}`.replaceAll(/\r\n/g, '\n'));
    });
});


describe('Finding constants array', () => {
    it('should handle parameters with class', () => {
        const code = `function dummy(var_1) {
  var bX, var_155, __globalObject, __TextDecoder, __Uint8Array, __Buffer, __String, __Array, utf8ArrayToStr, M7xYU0;
  const h8F1BC = [0x0, 0x1];
  }
  `;
        const result = extractArrayName(code);
        
        strictEqual(result, `h8F1BC`);
    });
});

describe('Inline decodeHelper calls', () => {
    // ------------------------------------------------------------------------
    it('Inline decodeHelper calls', () => {
        const code = `let x = (async (__Array, utf8ArrayToStr) => {
  var_163(X_9cU8(__globalObject), X_9cU8(__TextDecoder));

  function __TextDecoder(param_0) {
    const local_3 = decodeHelper(
      "D]Lf<B)R.;e1P7+~,U*vCaQHWndXEb?54{YM2ZGtiSJm\\":FO|kzu[I#lxN@Ko!Vqhp/8Ayg9jw$}\`(rsc%=&3>0_6^T",
      param_0
    );;

    return gDfejD(local_3);
  }

  function __globalObject(param_0) {
    if (typeof bX[param_0] === "undefined") {
      return bX[param_0] = __TextDecoder(var_155[param_0]);
    }
    return bX[param_0];
  }
  if (__Array) return " (standalone)";
  if (utf8ArrayToStr === (await __Uint8Array())) return __globalObject(0x103);
  return ""
})`;
        const result = inlineDecodeHelperCalls(code).replaceAll(/\r\n/g, '\n');
        
        strictEqual(result, `let x = (async (__Array, utf8ArrayToStr) => {
  var_163(X_9cU8(__globalObject), X_9cU8(__TextDecoder));

  function __globalObject(param_0) {
    if (typeof bX[param_0] === "undefined") {
      return bX[param_0] = gDfejD(decodeHelper(
        "D]Lf<B)R.;e1P7+~,U*vCaQHWndXEb?54{YM2ZGtiSJm\\":FO|kzu[I#lxN@Ko!Vqhp/8Ayg9jw$}\`(rsc%=&3>0_6^T",
        var_155[param_0]
      ));
    }
    return bX[param_0];
  }
  if (__Array) return " (standalone)";
  if (utf8ArrayToStr === (await __Uint8Array())) return __globalObject(0x103);
  return ""
})`.replaceAll(/\r\n/g, '\n'));
    });
});

describe('Simplify string concatenations', () => {
    // ------------------------------------------------------------------------
    it('Simple calls', () => {
        const code = `let x = "1" + "2"`;
        const result = inlineStringConcats(code).replaceAll(/\r\n/g, '\n');

        strictEqual(result, `let x = "12"`);
    });
    // ------------------------------------------------------------------------
    it('Calls chain', () => {
        const code = `let x = "1" + "2" + "3"`;
        const result = inlineStringConcats(code).replaceAll(/\r\n/g, '\n');

        strictEqual(result, `let x = "123"`);
    });
});