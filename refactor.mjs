#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const path = 'apps/desktop/src-tauri/src/commands/document.rs'

let source = await readFile(path, 'utf8')

source = source.replace(
  '    write_document(path, request.content).await\n}',
  '    Ok(write_document(path, request.content).await?)\n}',
)

source = source.replace(
  '    documents.remove(request.document_id)\n}',
  '    Ok(documents.remove(request.document_id)?)\n}',
)

await writeFile(path, source, 'utf8')

console.log('已修复 document_save 与 document_close 的 IpcError 返回转换。')