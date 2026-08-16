import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

describe("PTSBuilderLite dev server", () => {
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
  });

  it("serves the browser entry point", async () => {
    server = await createServer({
      configFile: resolve(__dirname, "../vite.config.ts"),
      server: { middlewareMode: true }
    });

    const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
    const transformed = await server.transformIndexHtml("/", html);

    expect(transformed).toContain('src="/src/main.tsx"');
  });
});
