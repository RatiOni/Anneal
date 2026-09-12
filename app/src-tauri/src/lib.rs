// Registration per https://v2.tauri.app/plugin/sql/ (see docs/allowed-apis.md s.3).
// The scaffold's `greet` demo command was removed rather than left as dead code.
//
// ponytail: no migration runner. The schema is created with
// CREATE TABLE IF NOT EXISTS from the frontend, which is correct until there is
// a real migration to run. Add tauri-plugin-sql migrations when a column
// actually has to change shape on an existing user's disk.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
