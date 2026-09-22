// esbuild loads CSS imports as strings in the vanilla extension bundle.
declare module '*.css' {
  const css: string;
  export default css;
}
