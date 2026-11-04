// OpenClaw 2026.9.9 exports this runtime-only subpath without declarations.
// These narrow signatures mirror the inspected secret-file-runtime.js contract;
// native runtime tests must still verify the implementation. No mock SDK facade.
declare module 'openclaw/plugin-sdk/secret-file-runtime' {
  export function readSecretFileSync(filePath: string, label: string, options: {rejectSymlink: true}): string;
  export function writePrivateSecretFileAtomic(options: {
    rootDir: string;
    filePath: string;
    content: string;
    durable: 'file';
  }): Promise<void>;
}
