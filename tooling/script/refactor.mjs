function quoteWindowsCommandArgument(value) {
  /*
   * 所有参数均由脚本内部生成，但仍进行转义，避免仓库路径包含
   * 空格、括号、& 等字符时改变 cmd.exe 命令语义。
   */
  const escaped = String(value)
    .replaceAll('^', '^^')
    .replaceAll('%', '%%')
    .replaceAll('"', '""')

  return `"${escaped}"`
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  let executable = command
  let executableArgs = args

  if (process.platform === 'win32') {
    executable =
      process.env.ComSpec ??
      'C:\\Windows\\System32\\cmd.exe'

    const commandLine = [command, ...args]
      .map(quoteWindowsCommandArgument)
      .join(' ')

    executableArgs = [
      '/d',
      '/s',
      '/c',
      commandLine,
    ]
  }

  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    stdio: 'inherit',

    /*
     * 不使用 Node 的 shell:true：
     * - 避免 DEP0190
     * - Windows 下由上面的 cmd.exe 显式执行
     * - Linux/macOS 直接执行 pnpm
     */
    shell: false,
    windowsHide: true,
  })

  if (result.error) {
    throw result.error
  }

  if (result.signal) {
    fail(
      `${command} 被信号 ${result.signal} 终止。`,
    )
  }

  if (result.status !== 0) {
    fail(
      `${command} 执行失败，退出码：${String(
        result.status,
      )}`,
    )
  }
}