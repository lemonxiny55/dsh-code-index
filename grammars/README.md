# ArkTS grammar asset

`tree-sitter-arkts.wasm` and `ARKTS-LICENSE` are copied unchanged from the
published **harmony-contrib/tree-sitter-arkts 0.3.0** npm archive, not compiled
from an unpinned branch. MIT notices for richerfu and Max Brunsfeld are retained.

- Source: https://github.com/harmony-contrib/tree-sitter-arkts
- npm: https://registry.npmjs.org/tree-sitter-arkts/-/tree-sitter-arkts-0.3.0.tgz
- Registry `gitHead`: `9a97c1e6ac93bc07732c15050a0e560bc63c8d78`
- Archive SHA1: `a02e2d883821af6036e1f9efc80f3f1e65227652`
- Archive integrity: `sha512-3mY013x1rWm8LLeuPp+kFLrl4vbQCfTEferO3GUwUhKHbQHzIT2ppjGARI3vNXIsuvQy/J8xJt2cIOlpfphlXQ==`
- WASM SHA256: `a5fbf24b2eeab43cf60e9fcdbde99e9089f7ceae43134d24e1d5cc166d285446`
- Size: 2,430,659 bytes; grammar ABI: 14.

Upstream publication regenerates with Tree-sitter CLI 0.24.4 / ABI 14 and builds
WASM with `tree-sitter build --wasm`. The upstream pipeline permits WASM build
failure; this specific archive was checked to contain the binary above. The
plugin vendors only this binary and license, and never imports upstream Node
bindings or runs `node-gyp-build`. No native compilation or network fetch occurs
when installing/loading the plugin. The package `files` list includes this directory.

To recover the exact asset, download the pinned archive, verify its integrity,
extract `package/tree-sitter-arkts.wasm` and `package/LICENSE`, then verify the
binary hash. `tests/arkts.spec.ts` checks the hash and actual runtime parsing;
`release:smoke` checks installed archive contents and `.ets` extraction.
