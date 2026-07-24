/**
 * 原生诊断崩溃报告尚未注册为 Tauri IPC 命令。
 *
 * 保留与桌面端消费逻辑一致的数据模型；在 native 端实现
 * diagnostics_take_previous_crash 并重新生成 IPC 绑定前，此函数稳定返回 null。
 */
export interface NativeCrashReport {
  readonly incidentId: string
  readonly occurredAt: string
  readonly message: string
  readonly backtrace: string
  readonly location: string | null
  readonly process: string
  readonly thread: string
  readonly appVersion: string
  readonly targetOs: string
  readonly targetArch: string
}

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  return null
}
