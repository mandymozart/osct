// Monaco's TypeScript language service, its standard library and its worker – the browser's type check, loaded in Node
// by the tests that hold the Node check to it (node-check.ts)
declare module "monaco-editor/languages/features/typescript/lib/typescriptServices.js" {
  export const typescript: typeof import("typescript");
}
declare module "monaco-editor/languages/features/typescript/lib/lib.js" {
  export const libFileMap: Record<string, string>;
}
declare module "monaco-editor/languages/features/typescript/tsWorker.js" {
  interface MirrorModel {
    uri: { path: string; toString(skipEncoding?: boolean): string };
    version: number;
    getValue(): string;
  }
  interface WorkerDiagnostic {
    category: number;
    start?: number;
    messageText: string | { messageText: string; next?: unknown[] };
  }
  export class TypeScriptWorker {
    constructor(
      ctx: { getMirrorModels(): MirrorModel[] },
      createData: { compilerOptions: object; extraLibs: Record<string, { content: string; version: number }>; inlayHintsOptions?: object },
    );
    getSyntacticDiagnostics(fileName: string): Promise<WorkerDiagnostic[]>;
    getSemanticDiagnostics(fileName: string): Promise<WorkerDiagnostic[]>;
  }
}
