import fs from "fs/promises"
import pkg from 'js-beautify';
const { js: beautify } = pkg;
import { parse as recastParse, print, visit } from 'recast';
import { parse as babelParse } from '@babel/parser';
import {
  Type,
  builtInTypes,
  builders as b,
  finalize,
} from "ast-types";

/**
 * Unescape a JS string literal, e.g. turn "\\n" into actual newline
 * @param {String} str String to unescape
 * @returns {String} Unescaped string
 * @remarks eval is generally unsafe, but here we control the input
 */
function unescapeJSString(str) {
    return eval("\"" + str + "\"");
}

function escapeJSString(str) {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

function tryParseToAst(code) {
  // Use @babel/parser via recast to get a stable AST for pretty printing
  try {
    const ast = recastParse(code, {
      parser: {
        parse(source) {
          return babelParse(source, {
            sourceType: "unambiguous",
            strictMode: false,
            plugins: [
              "classProperties",
              "optionalChaining",
              "nullishCoalescingOperator",
              "objectRestSpread",
              "dynamicImport",
            ],
          });
        }
      }
    });
    return ast;
  } catch (e) {
    console.dir(e);
    console.log(code.slice(e.pos-100, e.pos));
    console.log("^")
    console.log(code.slice(e.pos,e.pos + 200));
    console.log("Failed to parse to AST:", e);
    throw new Error("Failed to parse to AST", e);
    return null;
  }
}

function astToCode(ast) {
  return print(ast).code;
}

/**
 * @param {String} str 
 * @param {String} prefix
 * @param {String} suffix
 */
function findInsideGreedy(str, prefix, suffix) {
    const start = str.indexOf(prefix);
    const end = str.lastIndexOf(suffix);
    return start !== -1 && end !== -1 ? str.slice(start + prefix.length, end) : null;
}

/**
 * @param {String} str 
 * @param {String} prefix
 * @param {String} suffix
 */
function findInside(str, prefix, suffix) {
    const start = str.indexOf(prefix);
    const end = str.indexOf(suffix, start + prefix.length);
    return start !== -1 && end !== -1 ? str.slice(start + prefix.length, end) : null;
}

/**
 * 
 * @param {String} str 
 * @returns {Object} {cleaned, parameters, environment}
 */
function extractParameters(str) {
    const data = findInsideGreedy(str, "\",\"", "\")(");
    let cleaned = unescapeJSString(data);
    const end = str.lastIndexOf("\")(");
    let parameters = content.slice(end + 3, content.length - 2);
    const environment = findInside(str, "Function(\"", "\",\"");
    cleaned = `function dummy(${environment}) {
        ${cleaned}
    }
    dummy(${parameters})
    `
    return {
        cleaned,
        parameters,
        environment
    }
}

function parseParameters(parameters) {
    const ast = tryParseToAst("let a = " + parameters);
    let getProperties = ast.program.body[0].declarations[0].init.properties.filter(p => p.kind === "get")
    return new Map(getProperties.map(p => [p.key.value, print(p.body.body[0].argument).toString()]));
}

const debug = false;

function replaceParameters(code, parameters, environment) {
    parameters.forEach((value, key) => {
        if (typeof key === "number") {
            const replacement = debug ? `/* ${environment}[0x${key}] */ ${value}` : `${value}`;
            code = code.replace(new RegExp(`${environment}\\[0x${key.toString(16)}\\]`, 'g'), replacement);
        } else {
            const replacement = debug ? `/* ${environment}[${key}] */ ${value}` : `${value}`;
            code = code.replace(new RegExp(`\\b${environment}[${key}]\\b`, 'g'), replacement);
        }
    });
    return code;
}
function extractArrayValues(code, variableName) {
    const ast = tryParseToAst(code);
    const constVariables = ast.program.body[0].body.body.filter(n => n.kind === "const" && n.declarations[0].id.name === variableName);
    return constVariables[0].declarations[0].init.elements.map(e => e.type === "StringLiteral" ? "\"" + escapeJSString(e.value) + "\"" : e.value);
}

const content = await fs.readFile("gsap-3.12.2.min.js", "utf-8");
const { cleaned, parameters, environment } = extractParameters(content);
let beautified = beautify(cleaned, {
    indent_size: 2,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    space_in_empty_paren: false,
});


const parsedParameters = parseParameters(parameters);
beautified = replaceParameters(beautified, parsedParameters, environment);
const staticValues = extractArrayValues(beautified, "CMYRQT");
beautified = replaceParameters(beautified, staticValues, "CMYRQT");
beautified = astToCode(visit(tryParseToAst(beautified), {
    visitBinaryExpression(path) {
        // Replace "a" + "b" with "ab"
        if (path.node.operator === "+") {
            if (path.node.left.type === "StringLiteral" && path.node.right.type === "StringLiteral") {
                //path.replace(b.stringLiteral(path.node.left.value + path.node.right.value));
                path.replace({
                    type: "StringLiteral",
                    value: path.node.left.value + path.node.right.value
                })
                return false;
                //console.log(path);
                //return path;
            }
        }
        this.traverse(path);
    }
}));
//console.dir(extractArrayValues(beautified, "CMYRQT"), { depth: 2 });

await fs.writeFile("gsap-3.12.2.min.cleaned.js", beautified);
await fs.writeFile("gsap-3.12.2.min.parameters.js", parameters);
await fs.writeFile("gsap-3.12.2.min.environment.js", environment);