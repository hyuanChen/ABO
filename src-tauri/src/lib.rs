#[cfg(not(debug_assertions))]
use std::{
    fs,
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

#[cfg(not(debug_assertions))]
use tauri::{AppHandle, Manager};
use tauri::{RunEvent, WindowEvent};

#[cfg(not(debug_assertions))]
const BUNDLED_BACKEND_PORT: u16 = 8766;
#[cfg(not(debug_assertions))]
const BUNDLED_BACKEND_DIRNAME: &str = "abo-backend";
#[cfg(not(debug_assertions))]
const BUNDLED_BACKEND_EXECUTABLE: &str = "abo-backend";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(not(debug_assertions))]
struct BackendProcessState {
    child: Mutex<Option<Child>>,
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
    command.contains("ABO.app/Contents/") && command.contains("/abo-backend")
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
fn bundled_backend_executable(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|err| format!("failed to resolve resource dir: {err}"))?;

    #[cfg(target_os = "windows")]
    let executable_name = format!("{BUNDLED_BACKEND_EXECUTABLE}.exe");
    #[cfg(not(target_os = "windows"))]
    let executable_name = BUNDLED_BACKEND_EXECUTABLE.to_string();

    let direct_path = resource_dir
        .join(BUNDLED_BACKEND_DIRNAME)
        .join(&executable_name);
    if direct_path.exists() {
        return Ok(direct_path);
    }

    let nested_path = resource_dir
        .join("resources")
        .join(BUNDLED_BACKEND_DIRNAME)
        .join(&executable_name);
    if nested_path.exists() {
        return Ok(nested_path);
    }

    Err(format!(
        "bundled backend executable not found at {:?} or {:?}",
        direct_path, nested_path
    ))
}

#[cfg(not(debug_assertions))]
fn pipe_backend_output(prefix: &'static str, reader: impl std::io::Read + Send + 'static) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(line) => println!("{prefix} {line}"),
                Err(err) => {
                    eprintln!("[backend] Failed reading sidecar output: {err}");
                    break;
                }
            }
        }
    });
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

    let app_data_dir = bundled_app_data_dir(app)?;
    fs::create_dir_all(&app_data_dir).map_err(|err| {
        format!(
            "failed to create bundled app data dir {:?}: {err}",
            app_data_dir
        )
    })?;

    let backend_executable = bundled_backend_executable(app)?;
    let mut child = Command::new(&backend_executable)
        .current_dir(&app_data_dir)
        .env("ABO_BACKEND_HOST", "127.0.0.1")
        .env("ABO_BACKEND_PORT", BUNDLED_BACKEND_PORT.to_string())
        .env("ABO_RUNNING_BUNDLED_APP", "1")
        .env("ABO_DISABLE_LEGACY_MIGRATION", "1")
        .env("ABO_APP_DATA_DIR", &app_data_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| {
            format!(
                "failed to spawn bundled backend {:?}: {err}",
                backend_executable
            )
        })?;

    if let Some(stdout) = child.stdout.take() {
        pipe_backend_output("[backend][stdout]", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        pipe_backend_output("[backend][stderr]", stderr);
    }

    if let Ok(mut guard) = app.state::<BackendProcessState>().child.lock() {
        *guard = Some(child);
    }

    println!(
        "[backend] Spawned backend sidecar; frontend will wait for 127.0.0.1:{BUNDLED_BACKEND_PORT}"
    );
    Ok(())
}

#[cfg(not(debug_assertions))]
fn stop_backend(app: &AppHandle) {
    let Some(mut child) = app
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
