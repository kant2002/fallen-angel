import fs from "fs/promises"
import pkg from 'js-beautify';
const { js: beautify } = pkg;
import { inlineStringConcats, parseParameters, replaceParameters, extractArrayValues, 
    extractParameters, simplifySpreadParameters, simplifyDecoding, helperFunctionCode } from "./lib/index.js";

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
beautified = inlineStringConcats(beautified);
beautified = simplifySpreadParameters(beautified);
beautified = simplifyDecoding(beautified); // You can detect this in code by simply searching for 88 ? 13 : 14
beautified += helperFunctionCode;

await fs.writeFile("gsap-3.12.2.min.cleaned.js", beautified);
await fs.writeFile("gsap-3.12.2.min.parameters.js", parameters);
await fs.writeFile("gsap-3.12.2.min.environment.js", environment);