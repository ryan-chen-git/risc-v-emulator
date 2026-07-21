// node loader: JSON imports without attributes (Vite parity) + a gsap stub
// (buildStages under test never calls gsap; the import just has to resolve)
import { readFile } from "fs/promises";
export async function resolve(specifier, context, next) {
  if (specifier === "gsap") return { url: "stub:gsap", shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === "stub:gsap")
    return { format: "module", shortCircuit: true,
      source: "export const gsap = { timeline: () => ({}), ticker: { lagSmoothing() {} } };" };
  if (url.endsWith(".json")) {
    const data = await readFile(new URL(url), "utf8");
    return { format: "module", source: `export default ${data}`, shortCircuit: true };
  }
  return next(url, context);
}
