import { parse as recastParse, print, visit } from 'recast';
import { parse as babelParse } from '@babel/parser';

/**
 * Unescape a JS string literal, e.g. turn "\\n" into actual newline
 * @param {String} str String to unescape
 * @returns {String} Unescaped string
 * @remarks eval is generally unsafe, but here we control the input
 */
export function unescapeJSString(str) {
    return eval("\"" + str + "\"");
}

export function escapeJSString(str) {
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
    console.log(code.slice(e.pos-100, e.pos) + "^" + code.slice(e.pos,e.pos + 200));
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
export function extractParameters(str) {
    const data = findInsideGreedy(str, "\",\"", "\")(");
    let cleaned = unescapeJSString(data);
    const end = str.lastIndexOf("\")(");
    let parameters = str.slice(end + 3, str.length - 2);
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

export function parseParameters(parameters) {
    const ast = tryParseToAst("let a = " + parameters);
    let getProperties = ast.program.body[0].declarations[0].init.properties.filter(p => p.kind === "get")
    return new Map(getProperties.map(p => [p.key.value, print(p.body.body[0].argument).toString()]));
}

const debug = false;

export function replaceParameters(code, parameters, environment) {
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
export function extractArrayValues(code, variableName) {
    const ast = tryParseToAst(code);
    let functionDeclaration = ast.program.body;
    if (functionDeclaration.type !== "VariableDeclaration") {
        functionDeclaration = functionDeclaration[0].body.body;
    }

    const constVariables = functionDeclaration.filter(n => n.kind === "const" && n.declarations[0].id.name === variableName);
    if (constVariables.length === 0) return null;
    return constVariables[0].declarations[0].init.elements.map(e => e.type === "StringLiteral" ? "\"" + escapeJSString(e.value) + "\"" : e.value);
}

export function inlineStringConcats(code) {
    code = astToCode(visit(tryParseToAst(code), {
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
    return code;
}

function isLengthAssignment(expression, restName) {
    return expression.type === "AssignmentExpression"
        && expression.left.type === "MemberExpression"
        && expression.left.object.type === "Identifier"
        // reference to the rest parameter ["length"]
        && expression.left.object.name === restName
        && expression.left.property.value === "length"
        && expression.right.type === "NumericLiteral"
        // Should be removed to support all cases.
        //&& expression.right.value === 0
}

function createLocalsReplacementVisitor(restName, localsCount) {
    const localsMap = new Map();
    return {
        visitMemberExpression(path) {
            this.traverse(path);
            if (path.node.object.type === "Identifier" && path.node.object.name === restName) {
                if (path.node.property.type === "NumericLiteral"
                    && Number.isInteger(path.node.property.value)
                    && path.node.property.value >= 0 && path.node.property.value < localsCount) {
                    // Valid reference to rest parameter                    
                    path.replace({
                        type: "Identifier",
                        name: `param_${path.node.property.value}`
                    });
                } else if (path.node.property.value === "length") {
                    // Ignore length property
                } else if (path.node.property.type === "NumericLiteral") {
                    let existingMapping = localsMap.get(path.node.property.value)
                    if (!existingMapping) {
                        existingMapping = `local_${localsMap.size}`;
                        localsMap.set(path.node.property.value, existingMapping);
                    }

                    path.replace({
                        type: "Identifier",
                        name: existingMapping
                    });
                } else if (path.node.property.type === "UnaryExpression" && path.node.property.operator === "-" && path.node.property.argument.type === "NumericLiteral") {
                    let existingMapping = localsMap.get(-path.node.property.argument.value)
                    if (!existingMapping) {
                        existingMapping = `local_${localsMap.size}`;
                        localsMap.set(-path.node.property.argument.value, existingMapping);
                    }

                    path.replace({
                        type: "Identifier",
                        name: existingMapping
                    });
                } else if (path.node.property.type === "StringLiteral") {
                    let existingMapping = localsMap.get(path.node.property.value)
                    if (!existingMapping) {
                        existingMapping = `local_${localsMap.size}`;
                        localsMap.set(path.node.property.value, existingMapping);
                    }

                    path.replace({
                        type: "Identifier",
                        name: existingMapping
                    });
                }
            }
        }
    };
}

export function simplifySpreadParameters(code) {
    const visitFunctionDeclaration = function (path) {
        this.traverse(path);
        const targetNode = path.node
        if (targetNode.params.length === 1 && targetNode.params[0].type === "RestElement"
            && targetNode.body.body.length > 0) {
            if (targetNode.body.body[0].type === "ExpressionStatement" &&
                isLengthAssignment(targetNode.body.body[0].expression, targetNode.params[0].argument.name)) {
                // Remove the rest element and the length check
                const localsCount = targetNode.body.body[0].expression.right.value;
                targetNode.body.body = targetNode.body.body.slice(1);
                targetNode.body = visit(targetNode.body, createLocalsReplacementVisitor(targetNode.params[0].argument.name, localsCount));
                targetNode.params = []
                for (let i = 0; i < localsCount; i++) {
                    targetNode.params.push({
                        type: "Identifier",
                        name: `param_${i}`,
                        argument: {
                            name: `param_${i}`
                        }
                    });
                }
            }

            if (targetNode.body.body[0].type === "ExpressionStatement"
                && targetNode.body.body[0].expression.type === "SequenceExpression"
                && isLengthAssignment(targetNode.body.body[0].expression.expressions[0], targetNode.params[0].argument.name)) {
                // Remove the rest element and the length check
                const localsCount = targetNode.body.body[0].expression.expressions[0].right.value;
                targetNode.body.body[0].expression.expressions = targetNode.body.body[0].expression.expressions.slice(1);
                targetNode.body.body[0].expression.expressions = visit(targetNode.body.body[0].expression.expressions, createLocalsReplacementVisitor(targetNode.params[0].argument.name, localsCount));
                targetNode.params = []
                for (let i = 0; i < localsCount; i++) {
                    targetNode.params.push({
                        type: "Identifier",
                        name: `param_${i}`,
                        argument: {
                            name: `param_${i}`
                        }
                    });
                }
            }

            // Handle case where the length assignment is inside a call expression, e.g. var_65(args["length"] = 0);
            if (targetNode.body.body[0].type === "ExpressionStatement" 
                && targetNode.body.body[0].expression.type === "CallExpression"
                && targetNode.body.body[0].expression.callee.type === "Identifier"
                && targetNode.body.body[0].expression.arguments.length > 0
                && isLengthAssignment(targetNode.body.body[0].expression.arguments[0], targetNode.params[0].argument.name)) {
                const localsCount = targetNode.body.body[0].expression.arguments[0].right.value;
                targetNode.body = visit(targetNode.body, createLocalsReplacementVisitor(targetNode.params[0].argument.name, localsCount));
                targetNode.params = []
                for (let i = 0; i < localsCount; i++) {
                    targetNode.params.push({
                        type: "Identifier",
                        name: `param_${i}`,
                        argument: {
                            name: `param_${i}`
                        }
                    });
                }
                targetNode.body.body[0].expression.arguments = targetNode.body.body[0].expression.arguments.slice(1);
            }
        }
    }

    code = astToCode(visit(tryParseToAst(code), {
        visitFunctionExpression: visitFunctionDeclaration,
        visitFunctionDeclaration: visitFunctionDeclaration
    }));
    return code;
}