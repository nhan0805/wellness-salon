declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

declare module '*.wasm?module' {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}

declare module '@prisma/d1-client/query_compiler_bg.js' {
  const compilerRuntime: unknown;
  export default compilerRuntime;
}
