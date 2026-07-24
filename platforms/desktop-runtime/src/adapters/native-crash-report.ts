/**
 * 原生诊断崩溃报告尚未注册为 Tauri IPC 命令。
 *
 * 待 native 端实现 diagnostics_take_previous_crash 并重新生成
 * desktop-ipc/src/generated/ipc-bindings.ts 后，再以生成类型替换此占位类型。
 */
export interface NativeCrashReport {
  readonly message: string
  readonly timestamp: string
  readonly stack?: string
}

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  return null
}
