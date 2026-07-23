#!/usr/bin/env node
/**
 * tools/patch-ipc-error-redaction.mjs
 *
 * 用途：
 * 1. 修复 Tauri IPC 将底层错误、绝对路径、系统错误文本直接返回前端的问题。
 * 2. 将 IPC message 改为稳定、脱敏、面向用户的文案。
 * 3. 保留 code / operation / recoverable 作为前端可用的机器可读字段。
 *
 * 用法：
 *   node tools/patch-ipc-error-redaction.mjs
 *   node tools/patch-ipc-error-redaction.mjs --check
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const checkOnly = process.argv.includes('--check')

const target = resolve('apps/desktop/src-tauri/src/error.rs')

const source = await readFile(target, 'utf8')

const oldSerialize = `impl Serialize for Error {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        IpcError {
            code: self.code(),
            message: self.to_string(),
            operation: self.operation(),
            recoverable: self.recoverable(),
        }
        .serialize(serializer)
    }
}`

const newSerialize = `impl Error {
    /// 返回给 WebView 的稳定、脱敏错误消息。
    ///
    /// 不得在这里使用 \`self.to_string()\`、底层 \`source\` 或文件路径：
    /// Rust/Tauri/插件错误可能包含绝对路径、用户名、权限信息或系统细节。
    fn public_message(&self) -> &'static str {
        match self {
            Self::Validation(_) => "请求参数无效",
            Self::NotFound(_) => "请求的资源不存在",
            Self::PermissionDenied(_) => "该操作未获授权",

            Self::Io(_)
            | Self::Persistence(_)
            | Self::File(_)
            | Self::Store(_)
            | Self::Fs(_) => "文件操作失败",

            Self::SerdeJson(_) => "数据格式无效",

            Self::Import(_) => "导入失败",
            Self::Export(_) => "导出失败",
            Self::Asset(_) => "资源处理失败",

            Self::Plugin(_) => "插件操作失败",
            Self::Tauri(_)
            | Self::Dialog(_)
            | Self::Opener(_)
            | Self::Updater(_)
            | Self::Clipboard(_)
            | Self::Shell(_)
            | Self::Notification(_)
            | Self::WindowState(_)
            | Self::GlobalShortcut(_)
            | Self::Log(_)
            | Self::Internal(_)
            | Self::Collaboration(_) => "应用操作失败",
        }
    }
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        IpcError {
            code: self.code(),
            message: self.public_message().to_owned(),
            operation: self.operation(),
            recoverable: self.recoverable(),
        }
        .serialize(serializer)
    }
}`

if (!source.includes(oldSerialize)) {
  throw new Error(
    [
      `无法匹配预期源码：${target}`,
      '脚本已停止，未写入任何文件。',
      '请先确认 error.rs 尚未被手动修改，或更新本脚本中的 oldSerialize。',
    ].join('\n'),
  )
}

let output = source.replace(oldSerialize, newSerialize)

const oldTest = `    #[test]
    fn serialized_error_preserves_ipc_contract() {
        let value = serde_json::to_value(Error::Validation("invalid settings".to_owned()))
            .expect("error should serialize");

        assert_eq!(value["code"], "validation");
        assert_eq!(value["operation"], "platform");
        assert_eq!(value["message"], "Validation error: invalid settings");
        assert_eq!(value["recoverable"], false);
    }`

const newTest = `    #[test]
    fn serialized_error_preserves_ipc_contract() {
        let value = serde_json::to_value(Error::Validation("invalid settings".to_owned()))
            .expect("error should serialize");

        assert_eq!(value["code"], "validation");
        assert_eq!(value["operation"], "platform");
        assert_eq!(value["message"], "请求参数无效");
        assert_eq!(value["recoverable"], false);
    }

    #[test]
    fn serialized_io_error_does_not_leak_path_or_native_error() {
        let error = Error::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "permission denied for /Users/example/private/canvas.draw",
        ));

        let value = serde_json::to_value(error).expect("error should serialize");
        let message = value["message"]
            .as_str()
            .expect("serialized error message should be a string");

        assert_eq!(message, "文件操作失败");
        assert!(!message.contains("/Users/"));
        assert!(!message.contains("canvas.draw"));
        assert!(!message.contains("permission denied"));
    }

    #[test]
    fn serialized_permission_error_does_not_leak_approved_path() {
        let error = Error::PermissionDenied(
            "path was not approved by a native file dialog: /tmp/private.draw".to_owned(),
        );

        let value = serde_json::to_value(error).expect("error should serialize");
        let message = value["message"]
            .as_str()
            .expect("serialized error message should be a string");

        assert_eq!(message, "该操作未获授权");
        assert!(!message.contains("/tmp/"));
        assert!(!message.contains("private.draw"));
    }`

if (!output.includes(oldTest)) {
  throw new Error(
    [
      `无法匹配预期测试代码：${target}`,
      '脚本已停止，未写入任何文件。',
      '请先确认 error.rs 中 serialized_error_preserves_ipc_contract 测试尚未被修改。',
    ].join('\n'),
  )
}

output = output.replace(oldTest, newTest)

if (checkOnly) {
  if (output === source) {
    console.log('OK: IPC 错误脱敏补丁已存在。')
    process.exit(0)
  }

  console.error('ERROR: IPC 错误脱敏补丁尚未应用。')
  process.exit(1)
}

await writeFile(target, output, 'utf8')

console.log(`已更新：${target}`)
console.log('下一步建议执行：')
console.log('  cargo fmt --check')
console.log('  cargo test --workspace --all-features')
console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')