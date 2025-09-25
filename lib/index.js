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
    if (parameters === null) throw new Error("Parameters is null");
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
            const firstStatement = targetNode.body.body[0];
            if (firstStatement.type === "ExpressionStatement" &&
                isLengthAssignment(firstStatement.expression, targetNode.params[0].argument.name)) {
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

            if (firstStatement.type === "ExpressionStatement"
                && firstStatement.expression.type === "SequenceExpression"
                && isLengthAssignment(firstStatement.expression.expressions[0], targetNode.params[0].argument.name)) {
                // Remove the rest element and the length check
                const localsCount = firstStatement.expression.expressions[0].right.value;
                firstStatement.expression.expressions = firstStatement.expression.expressions.slice(1);
                firstStatement.expression.expressions = visit(firstStatement.expression.expressions, createLocalsReplacementVisitor(targetNode.params[0].argument.name, localsCount));
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
            if (firstStatement.type === "ExpressionStatement"
                && firstStatement.expression.type === "CallExpression"
                && firstStatement.expression.callee.type === "Identifier"
                && firstStatement.expression.arguments.length > 0
                && isLengthAssignment(firstStatement.expression.arguments[0], targetNode.params[0].argument.name)) {
                const localsCount = firstStatement.expression.arguments[0].right.value;
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
                firstStatement.expression.arguments = firstStatement.expression.arguments.slice(1);
            }
        }
    }

    code = astToCode(visit(tryParseToAst(code), {
        visitFunctionExpression: visitFunctionDeclaration,
        visitFunctionDeclaration: visitFunctionDeclaration,
        visitClassMethod: visitFunctionDeclaration,
    }));
    return code;
}

function isCodeStringAssignment(expression) {
    return expression.type === "AssignmentExpression"
        && expression.left.type === "Identifier"
        // reference to the rest parameter ["length"]
        && expression.right.type === "StringLiteral"
        // Should be removed to support all cases.
        && (expression.right.value.length === 91 || expression.right.value.length === 98 || expression.right.value.length === 101)
}

function isCodeStringInit(expression) {
    return expression.type === "VariableDeclarator"
        && expression.id.type === "Identifier"
        && expression.init
        // reference to the rest parameter ["length"]
        && expression.init.type === "StringLiteral"
        // Should be removed to support all cases.
        && (expression.init.value.length === 91 || expression.init.value.length === 98 || expression.init.value.length === 101)
}

export function simplifyDecoding(code) {
    const visitFunctionDeclaration = function (path) {
        this.traverse(path);
        const targetNode = path.node
        if (targetNode.body.body.length === 0) return;

        if (targetNode.body.body[0].type === "VariableDeclaration"
            && isCodeStringInit(targetNode.body.body[0].declarations[0])) {
            // Remove the rest element and the length check
            const codeValue = targetNode.body.body[0].declarations[0].init.value;
            const codeValueExpression = {
                type: "StringLiteral",
                value: codeValue
            }
            targetNode.body.body = targetNode.body.body.slice(-1);
            const localName = targetNode.body.body[0].argument.arguments[0].name
            targetNode.body.body.unshift({
                type: "ExpressionStatement",
                expression: {
                    type: "VariableDeclaration",
                    declarations: [{
                        type: "VariableDeclarator",
                        id: {
                            type: "Identifier",
                            name: localName
                        },
                        init: {
                            type: "CallExpression",
                            callee: {
                                type: "Identifier",
                                name: "decodeHelper"
                            },
                            arguments: [codeValueExpression, {
                                type: "Identifier",
                                name: targetNode.params[0].name
                            }]
                        }
                    }],
                    kind: "const"
                }
            });
        }
        // Handle case where the length assignment is inside a call expression, e.g. var_65(args["length"] = 0);
        if (targetNode.body.body[0].type === "ExpressionStatement" 
            && targetNode.body.body[0].expression.type === "CallExpression"
            && targetNode.body.body[0].expression.callee.type === "Identifier"
            && targetNode.body.body[0].expression.arguments.length > 0
            && isCodeStringAssignment(targetNode.body.body[0].expression.arguments[0])) {
            const codeValue = targetNode.body.body[0].expression.arguments[0].right.value;
            targetNode.body.body = targetNode.body.body.slice(-1);
            const codeValueExpression = {
                type: "StringLiteral",
                value: codeValue
            }
            targetNode.body.body.unshift({
                type: "ExpressionStatement",
                expression: {
                    type: "VariableDeclaration",
                    declarations: [{
                        type: "VariableDeclarator",
                        id: {
                            type: "Identifier",
                            name: "local_3"
                        },
                        init: {
                            type: "CallExpression",
                            callee: {
                                type: "Identifier",
                                name: "decodeHelper"
                            },
                            arguments: [codeValueExpression, {
                                type: "Identifier",
                                name: "param_0"
                            }]
                        }
                    }],
                    kind: "const"
                }
            });
        }
    }
    code = astToCode(visit(tryParseToAst(code), {
        visitFunctionExpression: visitFunctionDeclaration,
        visitFunctionDeclaration: visitFunctionDeclaration,
        visitClassMethod: visitFunctionDeclaration,
        visitDeclareFunction: function(path) {
            this.traverse(path);
            console.dir(path.node,{ depth: 1});
        }
    }));
    return code;
}

export const helperFunctionCode = `
function decodeHelper(param_code, seed) {
    var_65(
        local_0 = param_code,
        local_1 = "" + (seed || ""),
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
    return local_3;
}`

export function getEnvironmentFileName(sourceFile) {
    const dotIndex = sourceFile.lastIndexOf(".");
    if (dotIndex === -1) return sourceFile + ".environment.js";
    if (sourceFile.slice(dotIndex) === ".js") 
        return sourceFile.slice(0, dotIndex) + ".environment.js";
    return sourceFile + ".environment.js";
}

export function getParametersFileName(sourceFile) {
    const dotIndex = sourceFile.lastIndexOf(".");
    if (dotIndex === -1) return sourceFile + ".parameters.js";
    if (sourceFile.slice(dotIndex) === ".js") 
        return sourceFile.slice(0, dotIndex) + ".parameters.js";
    return sourceFile + ".parameters.js";
}

export function getCleanedFileName(sourceFile) {
    const dotIndex = sourceFile.lastIndexOf(".");
    if (dotIndex === -1) return sourceFile + ".cleaned.js";
    if (sourceFile.slice(dotIndex) === ".js") 
        return sourceFile.slice(0, dotIndex) + ".cleaned.js";
    return sourceFile + ".cleaned.js";
}

export function extractArrayName(code) {
    const ast = tryParseToAst(code);
    let functionDeclaration = ast.program.body[0].body.body;
    const varVariables = functionDeclaration[1];
    return varVariables.declarations[0].id.name;
}