#[cfg(not(debug_assertions))]
use std::{
    fs,
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::Command,
    sync::Mutex,
    thread,
    time::Duration,
};

#[cfg(not(debug_assertions))]
use tauri::{AppHandle, Manager};
use tauri::{RunEvent, WindowEvent};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[cfg(not(debug_assertions))]
const BUNDLED_BACKEND_PORT: u16 = 8766;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(not(debug_assertions))]
struct BackendProcessState {
    child: Mutex<Option<CommandChild>>,
}

#[cfg(not(debug_assertions))]
impl Default for BackendProcessState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

#[cfg(not(debug_assertions))]
fn backend_socket_addr() -> SocketAddr {
    format!("127.0.0.1:{BUNDLED_BACKEND_PORT}")
        .parse()
        .expect("invalid backend socket address")
}

#[cfg(not(debug_assertions))]
fn backend_is_reachable() -> bool {
    TcpStream::connect_timeout(&backend_socket_addr(), Duration::from_millis(250)).is_ok()
}

#[cfg(not(debug_assertions))]
fn backend_listening_pids() -> Vec<u32> {
    let Ok(output) = Command::new("lsof")
        .args([
            "-ti",
            &format!("TCP:{BUNDLED_BACKEND_PORT}"),
            "-sTCP:LISTEN",
        ])
        .output()
    else {
        return Vec::new();
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

#[cfg(not(debug_assertions))]
fn command_for_pid(pid: u32) -> String {
    let Ok(output) = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
    else {
        return String::new();
    };
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[cfg(not(debug_assertions))]
fn is_bundled_backend_command(command: &str) -> bool {
    command.contains("Contents/MacOS/abo-backend")
}

#[cfg(not(debug_assertions))]
fn stop_stale_bundled_backends() {
    for pid in backend_listening_pids() {
        let command = command_for_pid(pid);
        if !is_bundled_backend_command(&command) {
            continue;
        }

        println!("[backend] Stopping stale bundled backend PID {pid}: {command}");
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();

        for _ in 0..20 {
            thread::sleep(Duration::from_millis(100));
            if !backend_listening_pids()
                .into_iter()
                .any(|active_pid| active_pid == pid)
            {
                break;
            }
        }

        if backend_listening_pids()
            .into_iter()
            .any(|active_pid| active_pid == pid)
        {
            let _ = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .status();
        }
    }
}

#[cfg(not(debug_assertions))]
fn bundled_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home_dir = app
            .path()
            .home_dir()
            .map_err(|err| format!("failed to resolve home dir: {err}"))?;
        return Ok(home_dir
            .join("Library")
            .join("Application Support")
            .join("ABO App"));
    }

    #[cfg(not(target_os = "macos"))]
    {
        app.path()
            .app_data_dir()
            .map_err(|err| format!("failed to resolve app data dir: {err}"))
    }
}

#[cfg(not(debug_assertions))]
fn launch_backend(app: &AppHandle) -> Result<(), String> {
    if backend_is_reachable() {
        stop_stale_bundled_backends();
    }

    if backend_is_reachable() {
        println!("[backend] Reusing existing backend on 127.0.0.1:{BUNDLED_BACKEND_PORT}");
        return Ok(());
    }

    let mut command = app
        .shell()
        .sidecar("abo-backend")
        .map_err(|err| format!("failed to resolve backend sidecar: {err}"))?;

    command = command
        .env("ABO_BACKEND_HOST", "127.0.0.1")
        .env("ABO_BACKEND_PORT", BUNDLED_BACKEND_PORT.to_string())
        .env("ABO_RUNNING_BUNDLED_APP", "1")
        .env("ABO_DISABLE_LEGACY_MIGRATION", "1");

    let app_data_dir = bundled_app_data_dir(app)?;
    fs::create_dir_all(&app_data_dir).map_err(|err| {
        format!(
            "failed to create bundled app data dir {:?}: {err}",
            app_data_dir
        )
    })?;
    command = command.env("ABO_APP_DATA_DIR", app_data_dir);

    let (mut rx, child) = command
        .spawn()
        .map_err(|err| format!("failed to spawn backend sidecar: {err}"))?;

    if let Ok(mut guard) = app.state::<BackendProcessState>().child.lock() {
        *guard = Some(child);
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    println!("[backend][stdout] {line}");
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprintln!("[backend][stderr] {line}");
                }
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[backend] Sidecar exited with code {:?} signal {:?}",
                        payload.code, payload.signal
                    );
                    if let Ok(mut guard) = app_handle.state::<BackendProcessState>().child.lock() {
                        *guard = None;
                    }
                }
                _ => {}
            }
        }
    });

    println!(
        "[backend] Spawned backend sidecar; frontend will wait for 127.0.0.1:{BUNDLED_BACKEND_PORT}"
    );
    Ok(())
}

#[cfg(not(debug_assertions))]
fn stop_backend(app: &AppHandle) {
    let Some(child) = app
        .state::<BackendProcessState>()
        .child
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
    else {
        return;
    };

    if let Err(err) = child.kill() {
        eprintln!("[backend] Failed to stop backend sidecar: {err}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet]);

    #[cfg(not(debug_assertions))]
    let builder = builder.manage(BackendProcessState::default()).setup(|app| {
        if let Err(err) = launch_backend(&app.handle()) {
            eprintln!("[backend] {err}");
        }
        Ok(())
    });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { .. },
            ..
        } if label == "main" => {
            app_handle.exit(0);
        }
        #[cfg(not(debug_assertions))]
        RunEvent::Exit | RunEvent::ExitRequested { .. } => stop_backend(app_handle),
        _ => {}
    });
}
