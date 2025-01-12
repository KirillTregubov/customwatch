mod backgrounds;
mod config;
mod helpers;
mod platforms;

use config::{ErrorKey, SetupError};
use helpers::Error;
use platforms::{battle_net, steam};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
fn get_launch_config(handle: AppHandle) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;
    let mut battle_net_shared: Option<config::SharedConfig> = None;
    let mut steam_shared: Option<config::SharedConfig> = None;

    if !config.battle_net.enabled && !config.steam.enabled {
        config.is_setup = false;
    }

    if config.is_setup {
        // TODO: Show user a warning if the backup file exists

        if config.battle_net.enabled {
            battle_net_shared = battle_net::update_config(&config)?;
        }

        if config.steam.enabled && !config.steam.in_setup {
            steam_shared = steam::update_config(&mut config)?;
        }

        // Merge shared config
        if let (Some(battle_net_shared), Some(steam_shared)) = (&battle_net_shared, &steam_shared) {
            if battle_net_shared.background.current == steam_shared.background.current {
                config.shared.background.current = battle_net_shared.background.current.clone();
            } else {
                config.shared.background.current = None;
            }
            config.shared.background.is_outdated =
                battle_net_shared.background.is_outdated || steam_shared.background.is_outdated;

            config.shared.additional.console_enabled = battle_net_shared.additional.console_enabled
                && steam_shared.additional.console_enabled;
        } else if let Some(shared) = battle_net_shared.as_ref().or(steam_shared.as_ref()) {
            config.shared.background.current = shared.background.current.clone();
            config.shared.background.is_outdated = shared.background.is_outdated;
            config.shared.additional.console_enabled = shared.additional.console_enabled;
        } else {
            config.shared.background.current = None;
            config.shared.background.is_outdated = false;
            config.shared.additional.console_enabled = false;
        }
    }

    //NOTE: Temporarily advertise Steam support
    if config.steam.advertised < 4
        && config.is_setup
        && (!config.steam.enabled || !config.steam.in_setup)
    {
        config.steam.advertised += 1;
    }

    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[tauri::command]
fn setup(handle: AppHandle, platforms: Vec<&str>, is_initialized: bool) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;

    if platforms.contains(&"BattleNet") {
        // Check if Battle.net is installed
        if config.battle_net.install.is_none() {
            static LAUNCHER_PATH: &str = "Battle.net\\Battle.net Launcher.exe";
            if let Some(program_files_dir) = env::var_os("programfiles(x86)") {
                let battle_net_install =
                    Path::new(program_files_dir.to_str().unwrap()).join(LAUNCHER_PATH);
                if battle_net_install.exists() {
                    config.battle_net.install =
                        Some(battle_net_install.to_string_lossy().to_string());
                }
            }
        }
        if config.battle_net.install.is_none() {
            return Err(Error::Custom(serde_json::to_string(&SetupError {
                error_key: ErrorKey::BattleNetInstall,
                message: "Failed to find your Battle.net installation".to_string(),
                platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
            })?));
        }

        // Check if Battle.net config exists
        let battle_net_config = match &config.battle_net.config {
            Some(battle_net_config) => battle_net_config.clone(),
            None => {
                let path = env::var_os("appdata").map(|path| Path::new(&path).join("Battle.net"));

                if let Some(resource_path) = path {
                    // Check if Battle.net AppData directory exists
                    if let Ok(entries) = fs::read_dir(&resource_path) {
                        // Check if Battle.net.config exists in the directory
                        if let Some(target_entry) =
                            entries.filter_map(|entry| entry.ok()).find(|entry| {
                                entry.file_name().to_string_lossy() == battle_net::CONFIG_FILE
                            })
                        {
                            let display_path = helpers::display_path_string(&target_entry.path())?;
                            config.battle_net.config = Some(display_path.clone());
                            display_path
                        } else {
                            let display_path = helpers::display_path_string(&resource_path)?;
                            return Err(Error::Custom(serde_json::to_string(&SetupError {
                                error_key: ErrorKey::BattleNetConfig,
                                message: format!(
                                    "Failed to find [[{}]] file at [[{}]]",
                                    battle_net::CONFIG_FILE,
                                    display_path
                                ),
                                platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
                            })?));
                        }
                    } else {
                        let display_path = helpers::display_path_string(&resource_path)?;
                        return Err(Error::Custom(serde_json::to_string(&SetupError {
                            error_key: ErrorKey::BattleNetConfig,
                            message: format!(
                                "Failed to read [[{}]] file at [[{}]]",
                                battle_net::CONFIG_FILE,
                                display_path
                            ),
                            platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
                        })?));
                    }
                } else {
                    return Err(Error::Custom(serde_json::to_string(&SetupError {
                        error_key: ErrorKey::BattleNetConfig,
                        message: "Failed to find the Battle.net AppData directory".to_string(),
                        platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
                    })?));
                }
            }
        };

        // Read and parse Battle.net.config file
        let file = match std::fs::File::open(&battle_net_config) {
            Ok(file) => file,
            Err(e) => {
                return Err(Error::Custom(serde_json::to_string(&SetupError {
                    error_key: ErrorKey::BattleNetConfig,
                    message: format!(
                        "Failed to open the [[{}]] file at [[{}]]: {}",
                        battle_net::CONFIG_FILE,
                        battle_net_config,
                        e
                    ),
                    platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
                })?));
            }
        };
        let mut json: serde_json::Value = match serde_json::from_reader(file) {
            Ok(json) => json,
            Err(e) => {
                return Err(Error::Custom(serde_json::to_string(&SetupError {
                    error_key: ErrorKey::BattleNetConfig,
                    message: format!(
                        "Failed to read [[{}]] file at [[{}]]: {}",
                        battle_net::CONFIG_FILE,
                        battle_net_config,
                        e
                    ),
                    platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
                })?));
            }
        };

        // Check Overwatch installation on Battle.net
        if let None = json
            .get_mut("Games")
            .and_then(|games| games.get_mut("prometheus"))
        {
            return Err(Error::Custom(serde_json::to_string(&SetupError {
                error_key: ErrorKey::NoOverwatch,
                message: "Unable to find an Overwatch installation on Battle.net".to_string(),
                platforms: None,
            })?));
        };

        let mut battle_net_was_closed = false;

        // Check and create DefaultStartupScreen if it doesn't exist
        if let Some(client_config) = json.get_mut("Client") {
            if client_config.get("DefaultStartupScreen").is_none() {
                client_config
                    .as_object_mut()
                    .unwrap()
                    .insert("DefaultStartupScreen".to_string(), serde_json::json!("1"));

                battle_net_was_closed = battle_net::close_app();
            } else {
                let startup_screen = client_config["DefaultStartupScreen"]
                    .as_str()
                    .map(|s| s.to_string());

                if startup_screen.is_none() || startup_screen.unwrap() == "0" {
                    client_config
                        .as_object_mut()
                        .unwrap()
                        .insert("DefaultStartupScreen".to_string(), serde_json::json!("1"));

                    battle_net_was_closed = battle_net::close_app();
                }
            }
        }

        // Update config
        let battle_net_shared = battle_net::update_config(&config)?;
        if let Some(battle_net_shared) = battle_net_shared {
            config.shared = battle_net_shared;
        }

        // Cleanup: Reopen Battle.net if it was closed
        if battle_net_was_closed {
            helpers::safe_json_write(battle_net_config, &json)?;
            Command::new(config.battle_net.install.clone().unwrap())
                .spawn()
                .map_err(|_| {
                    Error::Custom(format!(
                        "Failed to open Battle.net at [[{}]]",
                        config.battle_net.install.clone().unwrap()
                    ))
                })?;
        }

        // Enable Battle.net
        config.battle_net.enabled = true;
    } else {
        battle_net::reset_config(&mut config)?;

        // Disable Battle.net
        config.battle_net.enabled = false;
    }

    if platforms.contains(&"Steam") {
        // Check if Steam is installed
        if config.steam.install.is_none() {
            static LAUNCHER_PATH: &str = "Steam\\steam.exe";
            if let Some(program_files_dir) = env::var_os("programfiles(x86)") {
                let steam_install =
                    Path::new(program_files_dir.to_str().unwrap()).join(LAUNCHER_PATH);
                if steam_install.exists() {
                    config.steam.install = Some(steam_install.to_string_lossy().to_string());
                }
            }
        }
        if config.steam.install.is_none() {
            return Err(Error::Custom(serde_json::to_string(&SetupError {
                error_key: ErrorKey::SteamInstall,
                message: "Failed to find your Steam installation".to_string(),
                platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
            })?));
        }
        let steam_install = config.steam.install.clone().unwrap();

        // Check if Steam localconfig exists
        let steam_path = Path::new(&steam_install).parent().ok_or_else(|| {
            Error::Custom(
                serde_json::to_string(&SetupError {
                    error_key: ErrorKey::SteamInstall,
                    message: "Failed to read the parent directory of your Steam installation"
                        .to_string(),
                    platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
                })
                .unwrap(),
            )
        })?;

        let userdata_path = steam_path.join("userdata");
        if !userdata_path.exists() || !userdata_path.is_dir() {
            return Err(Error::Custom(serde_json::to_string(&SetupError {
                error_key: ErrorKey::SteamInstall,
                message: format!(
                    "Failed to read Steam [[userdata]] folder, located at [[{}]]",
                    userdata_path.to_string_lossy()
                ),
                platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
            })?));
        }

        config.steam.configs = Some(steam::get_configs(&config)?);
        if config.steam.configs.as_ref().unwrap().is_empty() {
            return Err(Error::Custom(serde_json::to_string(&SetupError {
                error_key: ErrorKey::SteamInstall,
                message: format!(
                    "Failed to find any accounts in your Steam [[userdata]] folder at [[{}]]",
                    userdata_path.to_string_lossy()
                ),
                platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
            })?));
        }

        // Check if Steam accounts exist
        if config.steam.configs.is_none() || config.steam.configs.as_ref().unwrap().is_empty() {
            return Err(Error::Custom(serde_json::to_string(&SetupError {
                error_key: ErrorKey::SteamAccount,
                message: "Failed to find any accounts in your Steam [[userdata]] folder"
                    .to_string(),
                platforms: Some(platforms.iter().map(|s| s.to_string()).collect()),
            })?));
        }

        // Enable Steam
        if !config.steam.enabled {
            config.steam.in_setup = true;
        }
        config.steam.enabled = true;
    } else {
        steam::reset_config(&config)?;

        // Disable Steam
        config.steam.profiles = None;
        config.steam.configs = None;
        config.steam.advertised = 0;
        config.steam.in_setup = false;
        config.steam.enabled = false;
    }

    // Check if no platforms were enabled
    if !config.battle_net.enabled && !config.steam.enabled {
        config.is_setup = false;
        if !is_initialized {
            return Err(Error::Custom(format!(
                "Failed to setup one of your requested platforms: [[{}]]",
                platforms.join("]], [[").replace("BattleNet", "Battle.net")
            )));
        }

        config.shared.background.current = None;
        config.shared.background.is_outdated = false;
        config.shared.additional.console_enabled = false;
    } else {
        config.is_setup = true;
        config.steam.advertised = 4; // Do not advertise to new users
    }

    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[tauri::command]
fn resolve_setup_error(
    handle: AppHandle,
    key: &str,
    path: &str,
    platforms: Vec<&str>,
) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;

    match key {
        "BattleNetInstall" => {
            config.battle_net.install = Some(path.to_string());
        }
        "BattleNetConfig" => {
            config.battle_net.config = Some(path.to_string());
        }
        "SteamInstall" | "SteamAccount" => {
            config.steam.install = Some(path.to_string());
        }
        _ => {
            return Err(Error::Custom(format!(
                "Encountered incorrect setup resolution key [[{}]]. Please report this issue to the developer", key
            )));
        }
    };

    config::write_config(&handle, &config)?;

    setup(handle, platforms, false)
}

#[tauri::command]
fn get_setup_path(key: &str) -> Result<String, Error> {
    match key {
        "BattleNetInstall" => {
            let path = env::var_os("programfiles(x86)")
                .map(|path| Path::new(&path).join("Battle.net"))
                .and_then(|path| helpers::display_path_string(&path).ok());

            let default_path = env::var_os("programfiles(x86)")
                .map(|path| PathBuf::from(path))
                .and_then(|path| helpers::display_path_string(&path).ok());

            Ok(serde_json::to_string(&serde_json::json!({
                "path": path,
                "defaultPath": default_path
            }))?)
        }
        "BattleNetConfig" => {
            let path = env::var_os("appdata")
                .map(|path| PathBuf::from(path).join("Battle.net"))
                .map(|path| path.to_string_lossy().to_string());

            Ok(serde_json::to_string(&serde_json::json!({
                "path": path,
                "defaultPath": path
            }))?)
        }
        "SteamInstall" => {
            let path = env::var_os("programfiles(x86)")
                .map(|path| Path::new(&path).join("Steam"))
                .and_then(|path| helpers::display_path_string(&path).ok());

            let default_path = env::var_os("programfiles(x86)")
                .map(|path| PathBuf::from(path))
                .and_then(|path| helpers::display_path_string(&path).ok());

            Ok(serde_json::to_string(&serde_json::json!({
                "path": path,
                "defaultPath": default_path
            }))?)
        }
        "SteamAccount" => {
            let path = env::var_os("programfiles(x86)")
                .map(|path| Path::new(&path).join("Steam"))
                .and_then(|path| helpers::display_path_string(&path).ok());

            Ok(serde_json::to_string(&serde_json::json!({
                "path": path,
                "defaultPath": path
            }))?)
        }
        _ => Err(Error::Custom(
            "Encountered an incorrect setup key. Please report this issue to the developer".into(),
        )),
    }
}

#[tauri::command]
fn get_steam_accounts(handle: AppHandle) -> Result<String, Error> {
    let config = config::read_config(&handle)?;
    let accounts = steam::get_profiles(&config)?;

    Ok(serde_json::to_string(&accounts)?)
}

#[tauri::command]
fn confirm_steam_setup(handle: AppHandle) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;

    let steam_shared = steam::update_config(&mut config)?;

    if let Some(steam_shared) = steam_shared {
        if config.battle_net.enabled {
            if let (Some(battle_net_background), Some(steam_background)) = (
                &config.shared.background.current,
                &steam_shared.background.current,
            ) {
                if battle_net_background != steam_background {
                    config.shared.background.current = None;
                    config.shared.background.is_outdated = false;
                }
            }
            config.shared.background.is_outdated =
                config.shared.background.is_outdated || steam_shared.background.is_outdated;

            config.shared.additional.console_enabled &= steam_shared.additional.console_enabled;
        } else {
            config.shared.background.current = steam_shared.background.current;
            config.shared.background.is_outdated = steam_shared.background.is_outdated;
            config.shared.additional.console_enabled = steam_shared.additional.console_enabled;
        }
    }

    config.steam.in_setup = false;
    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[tauri::command]
fn get_backgrounds() -> String {
    let backgrounds = backgrounds::get_backgrounds();

    serde_json::to_string(&backgrounds).unwrap()
}

#[tauri::command]
fn set_background(handle: AppHandle, id: &str) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;
    let mut battle_net_error: Option<Error> = None;
    let mut steam_error: Option<Error> = None;

    if config.battle_net.enabled {
        match battle_net::set_launch_args(
            &config,
            Some(id),
            helpers::generate_background_launch_args,
        ) {
            Ok(_) => {}
            Err(error) => {
                battle_net_error = Some(error);
            }
        }
    }

    if config.steam.enabled {
        match steam::set_launch_args(&config, Some(id), helpers::generate_background_launch_args) {
            Ok(_) => {}
            Err(error) => {
                steam_error = Some(error);
            }
        }
    }

    if steam_error.is_some() {
        if battle_net_error.is_some() {
            return Err(Error::Custom(format!(
                "Failed to apply background on Battle.net: {}\nAlso failed to apply background on Steam: {}",
                battle_net_error.unwrap(),
                steam_error.unwrap(),
            )));
        } else {
            return Err(Error::Custom(format!(
                "Failed to apply background: {}",
                steam_error.unwrap()
            )));
        }
    } else if let Some(error) = battle_net_error {
        return Err(Error::Custom(format!(
            "Failed to apply background: {}",
            error
        )));
    }

    config.shared.background.current = Some(id.to_string());
    config.shared.background.is_outdated = false;
    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[tauri::command]
fn reset_background(handle: AppHandle) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;
    let mut battle_net_error: Option<Error> = None;
    let mut steam_error: Option<Error> = None;

    if config.battle_net.enabled {
        match battle_net::set_launch_args(&config, None, helpers::generate_background_launch_args) {
            Ok(_) => {}
            Err(error) => {
                battle_net_error = Some(error);
            }
        }
    }

    if config.steam.enabled {
        match steam::set_launch_args(&config, None, helpers::generate_background_launch_args) {
            Ok(_) => {}
            Err(error) => {
                steam_error = Some(error);
            }
        }
    }

    if let Some(error) = steam_error {
        if battle_net_error.is_some() {
            return Err(Error::Custom(format!(
                "Failed to reset background on Battle.net: {}\nAlso failed to apply background on Steam: {}",
                battle_net_error.unwrap(),
                error
            )));
        } else {
            return Err(Error::Custom(format!(
                "Failed to reset background: {}",
                error
            )));
        }
    } else if let Some(error) = battle_net_error {
        return Err(Error::Custom(format!(
            "Failed to reset background: {}",
            error
        )));
    }

    config.shared.background.current = None;
    config.shared.background.is_outdated = false;
    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[tauri::command]
fn set_debug_console(handle: AppHandle, enable_console: bool) -> Result<String, Error> {
    let mut config = config::read_config(&handle)?;
    let mut battle_net_error: Option<Error> = None;
    let mut steam_error: Option<Error> = None;

    if config.battle_net.enabled {
        match battle_net::set_launch_args(
            &config,
            enable_console,
            helpers::generate_console_launch_args,
        ) {
            Ok(_) => {}
            Err(error) => {
                battle_net_error = Some(error);
            }
        }
    }

    if config.steam.enabled {
        match steam::set_launch_args(
            &config,
            enable_console,
            helpers::generate_console_launch_args,
        ) {
            Ok(_) => {}
            Err(error) => {
                steam_error = Some(error);
            }
        }
    }

    if steam_error.is_some() {
        if battle_net_error.is_some() {
            return Err(Error::Custom(format!(
                    "Failed to apply debug console on Battle.net: {}\nAlso failed to apply debug console on Steam: {}",
                    battle_net_error.unwrap(),
                    steam_error.unwrap(),
                )));
        } else {
            return Err(Error::Custom(format!(
                "Failed to apply debug console: {}",
                steam_error.unwrap()
            )));
        }
    } else if let Some(error) = battle_net_error {
        return Err(Error::Custom(format!(
            "Failed to apply debug console: {}",
            error
        )));
    }

    config.shared.additional.console_enabled = enable_console;
    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[tauri::command]
fn reset(handle: AppHandle) -> Result<String, Error> {
    let config = config::read_config(&handle);

    if let Ok(config) = config {
        battle_net::reset_config(&config)?;
        steam::reset_config(&config)?;
    }

    let config = config::get_default_config();
    config::write_config(&handle, &config)?;

    Ok(serde_json::to_string(&config)?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let window = app.get_webview_window("main").expect("no main window");
            window.unminimize().ok();
            window.set_focus().ok();
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_launch_config,
            setup,
            resolve_setup_error,
            get_setup_path,
            get_steam_accounts,
            confirm_steam_setup,
            get_backgrounds,
            set_background,
            reset_background,
            set_debug_console,
            reset
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::ScaleFactorChanged { .. } = event {
                window.set_size(tauri::LogicalSize::new(1024, 768)).unwrap();
            }
        })
        .run(tauri::generate_context!())
        .expect("Encountered an error while starting OverBuddy");
}
