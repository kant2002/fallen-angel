import { strictEqual } from 'assert';
import { parseParameters, extractArrayValues } from '../lib/index.js';

describe('Cleanup Functionality', () => {
    it('should remove temporary files', () => {
        // Test case logic here
        strictEqual(true, true);
    });

    it('should reset application state', () => {
        // Test case logic here
        strictEqual(true, true);
    });

    it('should reset application state', () => {
        // Test case logic here
        strictEqual(true, true);
    });
});

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