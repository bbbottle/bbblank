/**
 * TypeScript Worker 客户端：首次使用时创建 Worker。
 * TypeScript 以静态资源（?url）提供，由 Worker 经 importScripts 加载，不经打包器解析 9 MB 的 typescript.js；
 * 语言服务的类型文件包（virtual:playground-types-url）在首次请求诊断、补全或悬停信息时由 Worker 读取。
 */
import tsUrl from "typescript-browser/lib/typescript.js?url";
import typesUrl from "virtual:playground-types-url";

export interface Diagnostic {
  readonly from: number;
  readonly to: number;
  readonly message: string;
}

export interface LsDiagnostic extends Diagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly code: number;
}

export interface CompiledFile {
  readonly path: string;
  /** 模块路径已替换为 __BBPG_<n>__ 占位符 */
  readonly js: string;
  /** 占位符 n 对应的原始模块路径 */
  readonly imports: ReadonlyArray<string>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export interface CompletionEntry {
  readonly name: string;
  readonly kind: string;
  readonly sortText: string;
  readonly insertText?: string;
  readonly source?: string;
}

export interface SymbolInfo {
  readonly signature: string;
  readonly documentation: string;
}

export interface QuickInfo extends SymbolInfo {
  readonly from: number;
  readonly to: number;
}

/** 类型文件包（见 apps/blog/build/playground-types.ts） */
export interface TypePack {
  readonly paths: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly files: Readonly<Record<string, string>>;
}

type Files = Readonly<Record<string, string>>;

export type WorkerRequest = { readonly id: number; readonly tsUrl: string; readonly typesUrl: string } & (
  | { readonly method: "compile"; readonly files: ReadonlyArray<{ readonly path: string; readonly code: string }> }
  | { readonly method: "diagnostics"; readonly files: Files; readonly path: string }
  | { readonly method: "completions"; readonly files: Files; readonly path: string; readonly pos: number }
  | {
      readonly method: "completionDetails";
      readonly path: string;
      readonly pos: number;
      readonly name: string;
      readonly source?: string;
    }
  | { readonly method: "quickInfo"; readonly files: Files; readonly path: string; readonly pos: number }
);

export type WorkerResponse =
  | { readonly id: number; readonly result: unknown }
  | { readonly id: number; readonly error: string };

type Payload<M extends WorkerRequest["method"]> = Omit<Extract<WorkerRequest, { method: M }>, "id" | "tsUrl" | "typesUrl" | "method">;

export const createCompiler = () => {
  let worker: Worker | undefined;
  let seq = 0;
  const pending = new Map<number, (r: WorkerResponse) => void>();

  const ensure = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./compiler.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    // 脚本加载或顶层执行失败时不会有回复：拒绝全部等待中的请求，下次使用时重建 Worker
    worker.onerror = (e) => {
      e.preventDefault();
      for (const [id, done] of pending) done({ id, error: `TypeScript Worker 出错：${e.message || "脚本加载失败"}` });
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
    return worker;
  };

  const call = <M extends WorkerRequest["method"], R>(method: M, payload: Payload<M>) =>
    new Promise<R>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (r) => ("error" in r ? reject(new Error(r.error)) : resolve(r.result as R)));
      // method 与 payload 的对应关系由 Payload<M> 约束；泛型展开后 TypeScript 无法逐一收窄联合类型
      const req = {
        id,
        method,
        tsUrl: new URL(tsUrl, location.href).href,
        typesUrl: new URL(typesUrl, location.href).href,
        ...payload,
      } as unknown as WorkerRequest;
      ensure().postMessage(req);
    });

  return {
    compile: (files: Payload<"compile">["files"]) =>
      call<"compile", { version: string; files: ReadonlyArray<CompiledFile> }>("compile", { files }),
    diagnostics: (files: Files, path: string) => call<"diagnostics", ReadonlyArray<LsDiagnostic>>("diagnostics", { files, path }),
    completions: (files: Files, path: string, pos: number) =>
      call<"completions", ReadonlyArray<CompletionEntry>>("completions", { files, path, pos }),
    completionDetails: (path: string, pos: number, name: string, source?: string) =>
      call<"completionDetails", SymbolInfo | null>("completionDetails", { path, pos, name, ...(source ? { source } : {}) }),
    quickInfo: (files: Files, path: string, pos: number) => call<"quickInfo", QuickInfo | null>("quickInfo", { files, path, pos }),
    dispose: () => {
      worker?.terminate();
      worker = undefined;
      for (const [id, done] of pending) done({ id, error: "TypeScript Worker 已关闭" });
      pending.clear();
    },
  };
};

export type Compiler = ReturnType<typeof createCompiler>;
