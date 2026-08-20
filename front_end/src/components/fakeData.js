// Fake values used to test the dashboard without the ESP32.
// Change these values to test NORMAL / WARNING / DANGER states.

export const fakeSystem = {
    cpu_temperature: 72,
    total_ram: 320000,
    free_ram: 60000,
    used_ram: 260000,
    minimum_free_ram: 50000,
    cpu_frequency: 240,
    cpu_cores: 2,
    active_core: 1,
    chip_model: "ESP32-D0WD-V3",
    chip_revision: 3,
    flash_size: 4194304,
    sketch_size: 1078944,
    sdk_version: "ESP-IDF",
    uptime: 3720,
    reconnects: 2,
    status: "WARNING",
    created_at: new Date().toISOString(),
};

export const fakeSensor = {
    external_temperature: 38,
    humidity: 0,
    gas_level: 450,
    gas_alarm: 1,
    status: "WARNING",
};

export const fakeNetwork = {
    ip_address: "192.168.1.189",
    wifi_status: "Connected",
    wifi_signal: -65,
    gateway: "192.168.1.1",
    subnet: "255.255.255.0",
    dns: "192.168.1.1",
    mac_address: "1C:69:20:95:89:38",
    hostname: "ESP32-Monitor",
};

export const fakeNodes = [
    {
        id: "fake-esp32-1",
        node_name: "esp32-1",
        node_type: "esp32",
        added_at: new Date().toISOString(),
    },
    {
        id: "fake-esp32-2",
        node_name: "esp32-2",
        node_type: "esp32",
        added_at: new Date().toISOString(),
    },
    {
        id: "fake-esp32-3",
        node_name: "esp32-3",
        node_type: "esp32",
        added_at: new Date().toISOString(),
    },
    {
        id: "fake-pi-1",
        node_name: "raspberry-pi-1",
        node_type: "raspberry",
        added_at: new Date().toISOString(),
    },
];
