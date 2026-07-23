#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const path = 'apps/desktop/src-tauri/src/commands/document.rs'

let source = await readFile(path, 'utf8')

source = source.replace(
  `    let selected = app
        .dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .blocking_pick_file();`,
  `    let selected = select_open_document(&app).await?;`,
)

source = source.replace(
  `    let selected = app
        .dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .set_file_name(&suggested_name)
        .blocking_save_file();`,
  `    let selected = select_save_document(&app, suggested_name).await?;`,
)

source = source.replace(
  `async fn read_document(path: PathBuf) -> Result<String> {`,
  `async fn select_open_document(app: &AppHandle) -> Result<Option<FilePath>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .pick_file(move |selected| {
            let _ = sender.send(selected);
        });

    receiver
        .await
        .map_err(|_| Error::Internal("document open dialog callback was dropped".into()))
}

async fn select_save_document(
    app: &AppHandle,
    suggested_name: String,
) -> Result<Option<FilePath>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .set_file_name(suggested_name)
        .save_file(move |selected| {
            let _ = sender.send(selected);
        });

    receiver
        .await
        .map_err(|_| Error::Internal("document save dialog callback was dropped".into()))
}

async fn read_document(path: PathBuf) -> Result<String> {`,
)

await writeFile(path, source, 'utf8')

console.log('已将 document 文件选择器改为非阻塞 callback + Tokio oneshot。')