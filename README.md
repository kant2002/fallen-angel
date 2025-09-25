Decryptor for one strand of Angel Drainer
=========================================

How to run.

Place `gsap-3.12.2.min.js` in the root folder and run `npm start`. This will produce `gsap-3.12.2.min.cleaned.js` where I remove bunch of obfuscation techniques.

```
npm start gsap-3.12.2.min.js
npm start axios-2.13.17.js
```

Angel drainer wrapped itself in the single function to which passed envrinment representing globalThis mostly.
Firstly in the funciton declared following variables
```
var DVg62f, global, __globalObject, __TextDecoder, __Uint8Array, __Buffer, __String, __Array, utf8ArrayToStr, ZVvKFvy;
```

The `DVg62f` - Object
The `global` - Array with encrypted data. Maybe global interesting variables. Let's see.
The `ZVvKFvy` - Math.imul or Math.imul polyfill

The following variable literally what it is
- `__globalObject` - Global environment object. `globalThis`
- `__TextDecoder` - globalThis.TextDecoder
`__Uint8Array` - globalThis.Uint8Array
`__Buffer` - globalThis.Buffer
`__String` - globalThis.String
`__Array` - globalThis.Array
`utf8ArrayToStr` - Probably decoding of utf8 to string.