import fs from "fs/promises"
import pkg from 'js-beautify';
const { js: beautify } = pkg;
import {
    inlineStringConcats, parseParameters, replaceParameters, extractArrayValues,
    extractParameters, simplifySpreadParameters, simplifyDecoding, helperFunctionCode,
    getCleanedFileName,
    getParametersFileName,
    getEnvironmentFileName,
    extractArrayName,
    inlineDecodeHelperCalls
} from "./lib/index.js";

const argv = process.argv.slice(2);
const sourceFile = argv[0] || "gsap-3.12.2.min.js";
const content = await fs.readFile(sourceFile, "utf-8");
const { cleaned, parameters, environment } = extractParameters(content);
let beautified = beautify(cleaned, {
    indent_size: 2,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    space_in_empty_paren: false,
});

const parsedParameters = parseParameters(parameters);
beautified = replaceParameters(beautified, parsedParameters, environment);
const basicArrayName = extractArrayName(beautified)//"CMYRQT";
const staticValues = extractArrayValues(beautified, basicArrayName);
if (staticValues === null) {
    throw new Error("Failed to extract static values");
} else {
    beautified = replaceParameters(beautified, staticValues, basicArrayName);
}
beautified = inlineStringConcats(beautified);
beautified = simplifySpreadParameters(beautified);
beautified = simplifyDecoding(beautified); // You can detect this in code by simply searching for 88 ? 13 : 14
beautified = inlineDecodeHelperCalls(beautified);
beautified += helperFunctionCode;

await fs.writeFile(getCleanedFileName(sourceFile), beautified);
await fs.writeFile(getParametersFileName(sourceFile), parameters);
await fs.writeFile(getEnvironmentFileName(sourceFile), environment);