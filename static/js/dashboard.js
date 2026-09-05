// =====================================================
// SMART CLASSROOM DASHBOARD
// =====================================================

// -----------------------------------------------------
// GLOBAL
// -----------------------------------------------------

let currentRoom = null;
let temperatureChart = null;

const REFRESH_INTERVAL = 3000;


// -----------------------------------------------------
// DOM HELPER
// -----------------------------------------------------

function $(id) {
    return document.getElementById(id);
}


// -----------------------------------------------------
// FORMAT TIME
// -----------------------------------------------------

function formatTime(value) {

    if (!value) {
        return "--";
    }

    try {

        const date = new Date(value);

        if (isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

    } catch (error) {

        return value;
    }
}


// -----------------------------------------------------
// SERVER STATUS
// -----------------------------------------------------

function setServerStatus(online) {

    const text = $("server-status-text");
    const sidebar = $("sidebar-server-status");
    const indicator = document.querySelector(".status-indicator");
    const sidebarDot = document.querySelector(".system-dot");
    const time = $("server-status-time");

    if (online) {

        text.textContent = "Server Online";
        sidebar.textContent = "Online";

        time.textContent = "Backend đang hoạt động";

        indicator.style.background = "var(--success)";
        indicator.style.boxShadow = "0 0 12px var(--success)";

        sidebarDot.style.background = "var(--success)";
        sidebarDot.style.boxShadow = "0 0 10px var(--success)";

    } else {

        text.textContent = "Server Offline";
        sidebar.textContent = "Offline";

        time.textContent = "Không thể kết nối";

        indicator.style.background = "var(--danger)";
        indicator.style.boxShadow = "0 0 12px var(--danger)";

        sidebarDot.style.background = "var(--danger)";
        sidebarDot.style.boxShadow = "0 0 10px var(--danger)";
    }
}


// -----------------------------------------------------
// LOAD ROOMS
// -----------------------------------------------------

async function loadRooms() {

    try {

        const response = await fetch("/api/rooms");

        if (!response.ok) {
            throw new Error("Không thể lấy danh sách phòng");
        }

        const data = await response.json();

        setServerStatus(true);

        const select = $("room-select");

        select.innerHTML = "";

        let rooms = [];

        if (Array.isArray(data)) {
            rooms = data;
        } else if (Array.isArray(data.rooms)) {
            rooms = data.rooms;
        }

        if (rooms.length === 0) {

            select.innerHTML =
                `<option value="">Không có phòng</option>`;

            return;
        }

        rooms.forEach(room => {

            const option = document.createElement("option");

            option.value = room.room_id;

            option.textContent =
                room.name
                ? `${room.room_id} - ${room.name}`
                : room.room_id;

            select.appendChild(option);
        });

        if (!currentRoom) {

            currentRoom = rooms[0].room_id;

            select.value = currentRoom;

            await loadRoom();
        }

    } catch (error) {

        console.error("LOAD ROOMS ERROR:", error);

        setServerStatus(false);
    }
}


// -----------------------------------------------------
// LOAD ROOM
// -----------------------------------------------------

async function loadRoom() {

    if (!currentRoom) {
        return;
    }

    try {

        const response = await fetch(
            `/api/rooms/${currentRoom}`
        );

        if (!response.ok) {
            throw new Error("Không thể lấy thông tin phòng");
        }

        const room = await response.json();

        setServerStatus(true);

        $("room-id").textContent =
            room.room_id || currentRoom;

        $("room-name").textContent =
            room.name || `Phòng ${currentRoom}`;

    } catch (error) {

        console.error("LOAD ROOM ERROR:", error);
    }

    await Promise.all([
        loadSensors(),
        loadDevices(),
        loadTemperatureHistory()
    ]);
}


// -----------------------------------------------------
// LOAD SENSORS
// -----------------------------------------------------

async function loadSensors() {

    try {

        const response = await fetch(
            `/api/rooms/${currentRoom}/sensors`
        );

        if (!response.ok) {
            throw new Error("Không thể lấy sensor");
        }

        const data = await response.json();

        setServerStatus(true);

        let sensors = [];

        if (Array.isArray(data)) {
            sensors = data;
        } else if (Array.isArray(data.sensors)) {
            sensors = data.sensors;
        }

        sensors.forEach(sensor => {

            const name =
                sensor.sensor_name ||
                sensor.name;

            const value =
                sensor.value ??
                sensor.current_value;

            const time =
                sensor.updated_at ||
                sensor.recorded_at ||
                sensor.time;

            updateSensor(
                name,
                value,
                sensor.unit,
                time
            );
        });

    } catch (error) {

        console.error("LOAD SENSOR ERROR:", error);
    }
}


// -----------------------------------------------------
// UPDATE SENSOR
// -----------------------------------------------------

function updateSensor(
    name,
    value,
    unit,
    time
) {

    if (value === undefined || value === null) {
        return;
    }

    const numericValue = Number(value);

    switch (name) {

        case "temperature":

            $("temperature-value").textContent =
                numericValue.toFixed(1);

            $("summary-temperature").textContent =
                `${numericValue.toFixed(1)} °C`;

            $("temperature-time").textContent =
                formatTime(time);

            updateTemperatureStatus(numericValue);

            break;


        case "humidity":

            $("humidity-value").textContent =
                numericValue.toFixed(1);

            $("summary-humidity").textContent =
                `${numericValue.toFixed(1)} %`;

            $("humidity-time").textContent =
                formatTime(time);

            const humidityPercent =
                Math.max(
                    0,
                    Math.min(
                        100,
                        numericValue
                    )
                );

            $("humidity-progress").style.width =
                `${humidityPercent}%`;

            updateHumidityStatus(numericValue);

            break;


        case "gas":

            $("gas-value").textContent =
                Math.round(numericValue);

            $("summary-gas").textContent =
                `${Math.round(numericValue)} ADC`;

            updateGasStatus(numericValue);

            break;


        case "door":

            const isOpen =
                numericValue === 1 ||
                value === true ||
                value === "1" ||
                String(value).toLowerCase() === "open";

            updateDoor(
                isOpen,
                time
            );

            break;
    }
}


// -----------------------------------------------------
// TEMPERATURE STATUS
// -----------------------------------------------------

function updateTemperatureStatus(value) {

    const element = $("temperature-status");

    if (value >= 35) {

        element.textContent = "HIGH";

        element.className =
            "sensor-status danger";

    } else if (value >= 30) {

        element.textContent = "WARM";

        element.className =
            "sensor-status warning";

    } else {

        element.textContent = "NORMAL";

        element.className =
            "sensor-status normal";
    }
}


// -----------------------------------------------------
// HUMIDITY STATUS
// -----------------------------------------------------

function updateHumidityStatus(value) {

    const element = $("humidity-status");

    if (value < 30 || value > 80) {

        element.textContent = "WARNING";

        element.className =
            "sensor-status warning";

    } else {

        element.textContent = "NORMAL";

        element.className =
            "sensor-status normal";
    }
}


// -----------------------------------------------------
// GAS STATUS
// -----------------------------------------------------

function updateGasStatus(value) {

    const element = $("gas-status");

    const progress =
        Math.min(
            100,
            (value / 1500) * 100
        );

    $("gas-progress").style.width =
        `${progress}%`;

    if (value >= 1500) {

        element.textContent = "DANGER";

        element.className =
            "sensor-status danger";

        addGasAlert(value);

    } else if (value >= 1000) {

        element.textContent = "WARNING";

        element.className =
            "sensor-status warning";

    } else {

        element.textContent = "NORMAL";

        element.className =
            "sensor-status normal";
    }
}


// -----------------------------------------------------
// DOOR
// -----------------------------------------------------

function updateDoor(isOpen, time) {

    const value = $("door-value");
    const visual = $("door-visual");
    const status = $("door-status");

    $("summary-door").textContent =
        isOpen ? "Mở" : "Đóng";

    $("door-time").textContent =
        formatTime(time);

    if (isOpen) {

        value.textContent = "Đang mở";

        visual.textContent = "🔓";

        visual.style.background =
            "rgba(245,158,11,0.1)";

        status.textContent = "OPEN";

        status.className =
            "sensor-status warning";

    } else {

        value.textContent = "Đóng";

        visual.textContent = "🔒";

        visual.style.background =
            "rgba(34,197,94,0.1)";

        status.textContent = "NORMAL";

        status.className =
            "sensor-status normal";
    }
}


// -----------------------------------------------------
// LOAD DEVICES
// -----------------------------------------------------

async function loadDevices() {

    try {

        const response = await fetch(
            `/api/rooms/${currentRoom}/devices`
        );

        if (!response.ok) {
            throw new Error("Không thể lấy devices");
        }

        const data = await response.json();

        setServerStatus(true);

        let devices = [];

        if (Array.isArray(data)) {
            devices = data;
        } else if (Array.isArray(data.devices)) {
            devices = data.devices;
        }

        devices.forEach(device => {

            const name =
                device.device_name ||
                device.name;

            const state =
                device.state ||
                device.current_state ||
                device.status ||
                "OFF";

            updateDevice(
                name,
                state
            );
        });

    } catch (error) {

        console.error("LOAD DEVICE ERROR:", error);
    }
}


// -----------------------------------------------------
// UPDATE DEVICE
// -----------------------------------------------------

function updateDevice(
    deviceName,
    state
) {

    if (!deviceName) {
        return;
    }

    const normalized =
        String(state).toUpperCase();

    const stateElement =
        $(`${deviceName}-state`);

    const textElement =
        $(`${deviceName}-text`);

    const card =
        $(`device-card-${deviceName}`);

    if (!stateElement || !textElement) {
        return;
    }

    if (normalized === "ON") {

        stateElement.textContent = "ON";

        stateElement.className =
            "device-state on";

        textElement.textContent =
            "Đang bật";

        if (card) {
            card.classList.add("device-on");
        }

    } else {

        stateElement.textContent = "OFF";

        stateElement.className =
            "device-state off";

        textElement.textContent =
            "Đang tắt";

        if (card) {
            card.classList.remove("device-on");
        }
    }
}


// -----------------------------------------------------
// SEND COMMAND
// -----------------------------------------------------

async function sendCommand(
    deviceName,
    command
) {

    if (!currentRoom) {

        showToast(
            "Lỗi",
            "Chưa chọn phòng",
            false
        );

        return;
    }

    try {

        showToast(
            "Đang gửi lệnh",
            `${deviceName} → ${command}`,
            true
        );

        const response = await fetch(
            `/api/rooms/${currentRoom}/devices/${deviceName}/command`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    command: command
                })
            }
        );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                data.message ||
                "Không thể gửi lệnh"
            );
        }

        showToast(
            "Đã gửi lệnh",
            `${deviceName} → ${command}. Chờ thiết bị phản hồi.`,
            true
        );

    } catch (error) {

        console.error(
            "SEND COMMAND ERROR:",
            error
        );

        showToast(
            "Gửi lệnh thất bại",
            error.message,
            false
        );
    }
}


// -----------------------------------------------------
// TEMPERATURE HISTORY
// -----------------------------------------------------

async function loadTemperatureHistory() {

    try {

        const response = await fetch(
            `/api/rooms/${currentRoom}/sensors/temperature/history?limit=30`
        );

        if (!response.ok) {
            throw new Error(
                "Không lấy được lịch sử"
            );
        }

        const data =
            await response.json();

        let history = [];

        if (Array.isArray(data)) {
            history = data;
        } else if (Array.isArray(data.history)) {
            history = data.history;
        }

        drawTemperatureChart(history);

    } catch (error) {

        console.error(
            "HISTORY ERROR:",
            error
        );

        drawTemperatureChart([]);
    }
}


// -----------------------------------------------------
// DRAW CHART
// -----------------------------------------------------

function drawTemperatureChart(history) {

    const canvas =
        $("temperature-chart");

    const empty =
        $("chart-empty");

    if (!canvas) {
        return;
    }

    if (!history || history.length === 0) {

        empty.style.display = "flex";

        if (temperatureChart) {
            temperatureChart.destroy();
            temperatureChart = null;
        }

        return;
    }

    empty.style.display = "none";

    const labels = [];
    const values = [];

    history.forEach(item => {

        const value =
            item.value ??
            item.sensor_value;

        const time =
            item.recorded_at ||
            item.created_at ||
            item.time;

        if (
            value !== undefined &&
            value !== null
        ) {

            labels.push(
                formatTime(time)
            );

            values.push(
                Number(value)
            );
        }
    });

    if (values.length === 0) {

        empty.style.display = "flex";

        return;
    }

    if (temperatureChart) {
        temperatureChart.destroy();
    }

    temperatureChart =
        new Chart(canvas, {

            type: "line",

            data: {

                labels: labels,

                datasets: [
                    {
                        label: "Nhiệt độ",

                        data: values,

                        tension: 0.35,

                        fill: true,

                        borderWidth: 2,

                        pointRadius: 3,

                        pointHoverRadius: 5
                    }
                ]
            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {
                        display: false
                    }
                },

                scales: {

                    x: {
                        ticks: {
                            color: "#64748b",

                            maxTicksLimit: 7,

                            font: {
                                size: 9
                            }
                        },

                        grid: {
                            color:
                                "rgba(255,255,255,0.04)"
                        }
                    },

                    y: {

                        ticks: {
                            color: "#64748b",

                            font: {
                                size: 9
                            }
                        },

                        grid: {
                            color:
                                "rgba(255,255,255,0.04)"
                        }
                    }
                }
            }
        });
}


// -----------------------------------------------------
// GAS ALERT
// -----------------------------------------------------

function addGasAlert(value) {

    const list =
        $("alert-list");

    const count =
        $("alert-count");

    if (!list || !count) {
        return;
    }

    list.innerHTML = `
        <div class="no-alert"
             style="
                background: rgba(239,68,68,0.06);
                border-color: rgba(239,68,68,0.12);
             ">

            <div
                class="no-alert-icon"
                style="
                    background: rgba(239,68,68,0.1);
                    color: var(--danger);
                ">
                !
            </div>

            <div>

                <strong>
                    Cảnh báo khí gas
                </strong>

                <span>
                    Giá trị hiện tại: ${Math.round(value)} ADC
                </span>

            </div>

        </div>
    `;

    count.textContent = "1";

    count.style.background =
        "rgba(239,68,68,0.1)";

    count.style.color =
        "var(--danger)";
}


// -----------------------------------------------------
// TOAST
// -----------------------------------------------------

let toastTimer = null;

function showToast(
    title,
    message,
    success = true
) {

    const toast =
        $("toast");

    const icon =
        $("toast-icon");

    $("toast-title").textContent =
        title;

    $("toast-message").textContent =
        message;

    icon.textContent =
        success ? "✓" : "!";

    icon.style.background =
        success
            ? "rgba(34,197,94,0.1)"
            : "rgba(239,68,68,0.1)";

    icon.style.color =
        success
            ? "var(--success)"
            : "var(--danger)";

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(() => {

            toast.classList.remove("show");

        }, 3500);
}


// -----------------------------------------------------
// ROOM CHANGE
// -----------------------------------------------------

$("room-select").addEventListener(
    "change",
    async function () {

        currentRoom =
            this.value;

        await loadRoom();
    }
);


// -----------------------------------------------------
// MOBILE MENU
// -----------------------------------------------------

$("mobile-menu").addEventListener(
    "click",
    function () {

        document
            .querySelector(".sidebar")
            .classList.toggle("open");
    }
);


// -----------------------------------------------------
// INITIAL LOAD
// -----------------------------------------------------

async function initializeDashboard() {

    await loadRooms();

    setInterval(
        async () => {

            if (currentRoom) {

                await Promise.all([
                    loadSensors(),
                    loadDevices()
                ]);
            }

        },
        REFRESH_INTERVAL
    );

    setInterval(
        async () => {

            if (currentRoom) {
                await loadTemperatureHistory();
            }

        },
        15000
    );
}


// -----------------------------------------------------
// START
// -----------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);