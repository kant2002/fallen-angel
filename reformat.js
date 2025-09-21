#!/usr/bin/env node
// format-obf.js
// Usage: node format-obf.js input.js > output.js
// or: node format-obf.js input.js -w  (to overwrite)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import pkg from 'js-beautify';
const { js: beautify } = pkg;
import { format } from 'prettier';
import { parse as _parse, print } from 'recast';
import { parse as __parse } from '@babel/parser';

function readFile(filePath) {
  return readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  writeFileSync(filePath, content, 'utf8');
}

function tryParseToAst(code) {
  // Use @babel/parser via recast to get a stable AST for pretty printing
  try {
    const ast = _parse(code, {
      parser: {
        parse(source) {
          return __parse(source, {
            sourceType: "unambiguous",
            plugins: [
              "jsx",
              "flow",
              "typescript",
              "classProperties",
              "optionalChaining",
              "nullishCoalescingOperator",
              "objectRestSpread",
              "dynamicImport",
            ],
          });
        },
      },
    });
    return ast;
  } catch (e) {
    return null;
  }
}

function astToCode(ast) {
  return print(ast).code;
}

function pipeline(code) {
  // 1) Quick beautify to reflow long lines and recover blocks
  const beautified = beautify(code, {
    indent_size: 2,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    space_in_empty_paren: false,
  });
  return beautified;

  // 2) Try AST parse + regenerate (recast) for consistent formatting/syntactic correctness
  const ast = tryParseToAst(beautified);
  const astPrinted = ast ? astToCode(ast) : beautified;

  // 3) Run prettier for final style polish
  // Use parser babel (works for modern JS/TS)
  let final;
  try {
    final = format(astPrinted, { parser: "babel", singleQuote: true, trailingComma: "all" });
  } catch (e) {
    // if prettier fails, fallback to astPrinted
    final = astPrinted;
  }

  return final;
}

/* -------------- CLI -------------- */
(async () => {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('Usage: node reformat.js <input.js> [-w]');
    process.exit(2);
  }
  const inPath = argv[0];
  const overwrite = argv.includes('-w');
  const outPath = argv[1];
  const parametersPath = argv[2];

  if (!existsSync(inPath)) {
    console.error('File not found:', inPath);
    process.exit(2);
  }

  const code = readFile(inPath);
  // Basic safety: refuse if file likely contains huge eval-of-remote (tell user)
  // (We won't execute any code.)
  const formatted = pipeline(code);
  const formatterParameters = pipeline(readFile(parametersPath));
  if (outPath) {
    writeFile(outPath, formatted);
    writeFile(parametersPath, formatterParameters);
  } else if (overwrite) {
    writeFile(inPath, formatted);
    console.log('Overwritten', inPath);
  } else {
    process.stdout.write(formatted);
  }
})();
