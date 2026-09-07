/**
 * Smart Classroom - Interactive UX/UI Client Controller
 * Theme: Cyber-Academic Glassmorphism
 * Author: Antigravity IoT Engineer
 */

let currentRoom = null;
let temperatureChart = null;
const REFRESH_INTERVAL = 3000;
let currentTab = "dashboard";
let allStudents = [];
let toastTimer = null;
let currentControlMode = "MANUAL";

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTime(value) {
    if (!value) return "--:--:--";
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
        return value;
    }
}

function formatFullDateTime(value) {
    if (!value) return "--";
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return date.toLocaleString("vi-VN", {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            day: "2-digit", month: "2-digit", year: "numeric"
        });
    } catch {
        return value;
    }
}

// ============================================================
// REALTIME LIVE CLOCK
// ============================================================
function updateLiveClock() {
    const clockEl = $("topbar-clock");
    if (!clockEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const dateStr = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    clockEl.textContent = `${timeStr} · ${dateStr}`;
}

// ============================================================
// SERVER CONNECTION STATUS
// ============================================================
function setServerStatus(online) {
    const text = $("server-status-text");
    const sidebar = $("sidebar-server-status");
    const topbarDot = $("topbar-status-dot") || document.querySelector(".status-indicator-dot");
    const sidebarDot = $("sidebar-system-dot") || document.querySelector(".system-dot");
    const time = $("server-status-time");

    if (online) {
        if (text) text.textContent = "Server Online";
        if (sidebar) sidebar.textContent = "RPi5 Online";
        if (time) time.textContent = "RPi 5 · MQTT · MariaDB";
        if (topbarDot) {
            topbarDot.className = "status-indicator-dot online";
        }
        if (sidebarDot) {
            sidebarDot.className = "system-dot online";
        }
    } else {
        if (text) text.textContent = "Server Offline";
        if (sidebar) sidebar.textContent = "Offline";
        if (time) time.textContent = "Mất kết nối máy chủ";
        if (topbarDot) {
            topbarDot.className = "status-indicator-dot";
            topbarDot.style.background = "var(--danger)";
            topbarDot.style.boxShadow = "0 0 10px var(--danger)";
        }
        if (sidebarDot) {
            sidebarDot.className = "system-dot";
            sidebarDot.style.background = "var(--danger)";
            sidebarDot.style.boxShadow = "0 0 10px var(--danger)";
        }
    }
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(title, message, success = true) {
    const toast = $("toast");
    const icon = $("toast-icon");
    const titleElement = $("toast-title");
    const messageElement = $("toast-message");
    if (!toast || !icon || !titleElement || !messageElement) return;

    titleElement.textContent = title;
    messageElement.textContent = message;
    icon.textContent = success ? "✓" : "!";
    icon.style.background = success ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)";
    icon.style.color = success ? "var(--success)" : "var(--danger)";
    icon.style.borderColor = success ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)";

    toast.classList.add("active");
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("active");
        toast.classList.remove("show");
    }, 3600);
}

// ============================================================
// ROOM MANAGEMENT
// ============================================================
async function loadRooms() {
    try {
        const response = await fetch("/api/rooms");
        if (!response.ok) throw new Error("Không thể lấy danh sách phòng");
        const data = await response.json();
        setServerStatus(true);

        const select = $("room-select");
        if (!select) return;
        select.innerHTML = "";

        let rooms = [];
        if (Array.isArray(data)) rooms = data;
        else if (Array.isArray(data.data)) rooms = data.data;
        else if (Array.isArray(data.rooms)) rooms = data.rooms;

        if (rooms.length === 0) {
            select.innerHTML = `<option value="">Không có phòng</option>`;
            return;
        }

        rooms.forEach(room => {
            const option = document.createElement("option");
            option.value = room.room_id;
            option.textContent = room.name ? `${room.room_id} - ${room.name}` : room.room_id;
            select.appendChild(option);
        });

        // Đồng bộ danh sách phòng vào filter TKB (thay hardcode HTML)
        const schedRoomFilter = $("schedule-room-filter");
        if (schedRoomFilter) {
            schedRoomFilter.innerHTML = `<option value="">Tất cả phòng</option>`;
            rooms.forEach(room => {
                const opt = document.createElement("option");
                opt.value = room.room_id;
                opt.textContent = room.name ? `${room.name} (${room.room_id})` : room.room_id;
                schedRoomFilter.appendChild(opt);
            });
        }

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

async function loadRoom() {
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/rooms/${currentRoom}`);
        if (!response.ok) throw new Error("Không thể lấy thông tin phòng");
        const result = await response.json();
        const room = result.data || result;
        setServerStatus(true);
        if ($("room-id")) $("room-id").textContent = room.room_id || currentRoom;
        if ($("room-name")) $("room-name").textContent = room.name || `Phòng ${currentRoom}`;
    } catch (error) {
        console.error("LOAD ROOM ERROR:", error);
    }
    await Promise.all([loadSensors(), loadDevices(), loadTemperatureHistory(), loadRoomMode()]);
}

// ============================================================
// SENSORS & TELEMETRY
// ============================================================
async function loadSensors() {
    try {
        const response = await fetch(`/api/rooms/${currentRoom}/sensors`);
        if (!response.ok) throw new Error("Không thể lấy sensor");
        const data = await response.json();
        setServerStatus(true);

        let sensors = [];
        if (Array.isArray(data)) sensors = data;
        else if (Array.isArray(data.data)) sensors = data.data;
        else if (Array.isArray(data.sensors)) sensors = data.sensors;

        sensors.forEach(sensor => {
            const name = sensor.sensor_name || sensor.name;
            const value = sensor.value ?? sensor.current_value;
            const time = sensor.updated_at || sensor.recorded_at || sensor.time;
            updateSensor(name, value, sensor.unit, time);
        });
    } catch (error) {
        console.error("LOAD SENSOR ERROR:", error);
    }
}

function updateSensor(name, value, unit, time) {
    if (value === undefined || value === null) return;
    const numericValue = Number(value);

    switch (name) {
        case "temperature":
            if ($("temperature-value")) $("temperature-value").textContent = numericValue.toFixed(1);
            if ($("summary-temperature")) $("summary-temperature").textContent = `${numericValue.toFixed(1)} °C`;
            if ($("temperature-time")) $("temperature-time").textContent = formatTime(time);
            updateTemperatureStatus(numericValue);
            break;

        case "humidity":
            if ($("humidity-value")) $("humidity-value").textContent = numericValue.toFixed(1);
            if ($("summary-humidity")) $("summary-humidity").textContent = `${numericValue.toFixed(1)} %`;
            if ($("humidity-time")) $("humidity-time").textContent = formatTime(time);
            const humidityPercent = Math.max(0, Math.min(100, numericValue));
            if ($("humidity-progress")) $("humidity-progress").style.width = `${humidityPercent}%`;
            updateHumidityStatus(numericValue);
            break;

        case "gas":
            const gasRound = Math.round(numericValue);
            if ($("gas-value")) $("gas-value").textContent = gasRound;
            if ($("summary-gas")) $("summary-gas").textContent = `${gasRound} ADC`;
            updateGasStatus(numericValue);
            break;

        case "light":
        case "ldr":
            const lightVal = Math.round(numericValue);
            if ($("light-value")) $("light-value").textContent = lightVal;
            if ($("light-time")) $("light-time").textContent = formatTime(time);
            if ($("light-progress")) {
                const lightPercent = Math.max(0, Math.min(100, (lightVal / 1000) * 100));
                $("light-progress").style.width = `${lightPercent}%`;
            }
            updateLightStatus(lightVal);
            break;

        case "door":
        case "rfid":
        case "RFID":
            const isOpen = numericValue === 1 || value === true || value === "1" || String(value).toLowerCase() === "open";
            updateDoor(isOpen, time);
            break;
    }
}

function updateTemperatureStatus(value) {
    const element = $("temperature-status");
    if (!element) return;
    if (value >= 35) {
        element.textContent = "HIGH";
        element.className = "sensor-status-tag danger";
    } else if (value >= 30) {
        element.textContent = "WARM";
        element.className = "sensor-status-tag warning";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status-tag normal";
    }
}

function updateHumidityStatus(value) {
    const element = $("humidity-status");
    if (!element) return;
    if (value < 30 || value > 80) {
        element.textContent = "WARNING";
        element.className = "sensor-status-tag warning";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status-tag normal";
    }
}

function updateGasStatus(value) {
    const element = $("gas-status");
    if (!element) return;

    const progress = Math.min(100, (value / 1500) * 100);
    const progressElement = $("gas-progress");
    if (progressElement) progressElement.style.width = `${progress}%`;

    if (value >= 1500) {
        element.textContent = "DANGER";
        element.className = "sensor-status-tag danger";
        addGasAlert(value);
    } else if (value >= 1000) {
        element.textContent = "WARNING";
        element.className = "sensor-status-tag warning";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status-tag normal";
    }
}

function updateLightStatus(value) {
    const element = $("light-status");
    if (!element) return;
    if (value < 250) {
        element.textContent = "DARK (BẬT ĐÈN)";
        element.className = "sensor-status-tag warning";
    } else if (value > 600) {
        element.textContent = "BRIGHT (SÁNG)";
        element.className = "sensor-status-tag normal";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status-tag normal";
    }
}

function updateDoor(isOpen, time) {
    const value = $("door-value");
    const visual = $("door-visual");
    const status = $("door-status");
    const summary = $("summary-door");
    const timeElement = $("door-time");
    if (!value || !visual || !status) return;

    if (summary) summary.textContent = isOpen ? "Đã quẹt thẻ" : "Sẵn sàng";
    if (timeElement) timeElement.textContent = formatTime(time);

    if (isOpen) {
        value.textContent = "Đã quẹt thẻ";
        visual.textContent = "🪪";
        visual.style.background = "rgba(56, 189, 248, 0.15)";
        status.textContent = "ACTIVE";
        status.className = "sensor-status-tag normal";
    } else {
        value.textContent = "Sẵn sàng";
        visual.textContent = "💳";
        visual.style.background = "rgba(16, 185, 129, 0.1)";
        status.textContent = "READY";
        status.className = "sensor-status-tag normal";
    }
}

// ============================================================
// DEVICE CONTROLS
// ============================================================
async function loadDevices() {
    try {
        const response = await fetch(`/api/rooms/${currentRoom}/devices`);
        if (!response.ok) throw new Error("Không thể lấy devices");
        const data = await response.json();
        setServerStatus(true);

        let devices = [];
        if (Array.isArray(data)) devices = data;
        else if (Array.isArray(data.data)) devices = data.data;
        else if (Array.isArray(data.devices)) devices = data.devices;

        devices.forEach(device => {
            const name = device.device_name || device.name;
            const state = device.state ?? device.current_state ?? device.status ?? "OFF";
            updateDevice(name, state);
        });
    } catch (error) {
        console.error("LOAD DEVICE ERROR:", error);
    }
}

function updateDevice(deviceName, state) {
    if (!deviceName) return;
    const normalized = String(state).toUpperCase();
    const stateElement = $(`${deviceName}-state`);
    const textElement = $(`${deviceName}-text`);
    const card = $(`device-card-${deviceName}`);
    if (!stateElement || !textElement) return;

    if (normalized === "ON") {
        stateElement.textContent = "ON";
        stateElement.className = "device-status-badge on";
        textElement.textContent = "Đang bật";
        textElement.style.color = "var(--success)";
        if (card) card.classList.add("device-on");
    } else {
        stateElement.textContent = "OFF";
        stateElement.className = "device-status-badge";
        textElement.textContent = "Đang tắt";
        textElement.style.color = "var(--text-dim)";
        if (card) card.classList.remove("device-on");
    }
}

async function sendCommand(deviceName, command) {
    if (!currentRoom) {
        showToast("Lỗi", "Chưa chọn phòng học", false);
        return;
    }
    try {
        showToast("Đang gửi lệnh", `${deviceName.toUpperCase()} → ${command}`, true);
        const response = await fetch(`/api/rooms/${currentRoom}/devices/${deviceName}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: command })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Không thể gửi lệnh");
        showToast("Đã gửi lệnh", `${deviceName.toUpperCase()} → ${command}. Chờ phản hồi...`, true);
        setTimeout(async () => {
            await Promise.all([loadDevices(), loadRoomMode()]);
        }, 800);
    } catch (error) {
        console.error("SEND COMMAND ERROR:", error);
        showToast("Lỗi gửi lệnh", error.message, false);
    }
}

// ============================================================
// CHẾ ĐỘ ĐIỀU KHIỂN (MANUAL / AUTO)
// ============================================================
async function loadRoomMode() {
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/rooms/${currentRoom}/mode`);
        if (!response.ok) return;
        const data = await response.json();
        const mode = data.mode || "MANUAL";
        currentControlMode = mode.toUpperCase();
        updateModeUI(currentControlMode);
    } catch (error) {
        console.error("LOAD ROOM MODE ERROR:", error);
    }
}

function updateModeUI(mode) {
    const normalized = String(mode).toUpperCase();
    const btnManual = $("btn-mode-manual");
    const btnAuto = $("btn-mode-auto");
    const infoBanner = $("auto-mode-info");
    const chipMode = $("chip-control-mode");

    if (normalized === "AUTO") {
        if (btnAuto) btnAuto.classList.add("active");
        if (btnManual) btnManual.classList.remove("active");
        if (infoBanner) infoBanner.style.display = "flex";
        if (chipMode) {
            chipMode.textContent = "CHẾ ĐỘ: TỰ ĐỘNG (AUTO)";
            chipMode.className = "meta-chip active-chip";
        }
    } else {
        if (btnManual) btnManual.classList.add("active");
        if (btnAuto) btnAuto.classList.remove("active");
        if (infoBanner) infoBanner.style.display = "none";
        if (chipMode) {
            chipMode.textContent = "CHẾ ĐỘ: THỦ CÔNG (MANUAL)";
            chipMode.className = "meta-chip";
        }
    }
}

async function setRoomMode(mode) {
    if (!currentRoom) {
        showToast("Lỗi", "Chưa chọn phòng học", false);
        return;
    }
    const modeUpper = String(mode).toUpperCase();
    try {
        showToast("Chuyển chế độ", `Gửi lệnh chuyển sang ${modeUpper}...`, true);
        const response = await fetch(`/api/rooms/${currentRoom}/mode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: modeUpper })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Không thể chuyển chế độ");
        currentControlMode = modeUpper;
        updateModeUI(modeUpper);
        showToast("Thành công", data.message || `Đã chuyển sang ${modeUpper}`, true);
        setTimeout(loadDevices, 1000);
    } catch (error) {
        console.error("SET MODE ERROR:", error);
        showToast("Chuyển chế độ thất bại", error.message, false);
    }
}

// ============================================================
// TEMPERATURE HISTORY CHART
// ============================================================
async function loadTemperatureHistory() {
    try {
        const response = await fetch(`/api/rooms/${currentRoom}/sensors/temperature/history?limit=30`);
        if (!response.ok) throw new Error("Không lấy được lịch sử");
        const data = await response.json();

        let history = [];
        if (Array.isArray(data)) history = data;
        else if (Array.isArray(data.data)) history = data.data;
        else if (Array.isArray(data.history)) history = data.history;

        drawTemperatureChart(history);
    } catch (error) {
        console.error("HISTORY ERROR:", error);
        drawTemperatureChart([]);
    }
}

function drawTemperatureChart(history) {
    const canvas = $("temperature-chart");
    const empty = $("chart-empty");
    if (!canvas) return;

    if (!history || history.length === 0) {
        if (empty) empty.style.display = "flex";
        if (temperatureChart) {
            temperatureChart.destroy();
            temperatureChart = null;
        }
        return;
    }

    if (empty) empty.style.display = "none";

    const labels = [];
    const values = [];

    history.forEach(item => {
        const value = item.value ?? item.sensor_value;
        const time = item.recorded_at || item.created_at || item.time;
        if (value !== undefined && value !== null) {
            labels.push(formatTime(time));
            values.push(Number(value));
        }
    });

    if (values.length === 0) {
        if (empty) empty.style.display = "flex";
        return;
    }

    if (temperatureChart) temperatureChart.destroy();

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, "rgba(56, 189, 248, 0.35)");
    gradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");

    temperatureChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Nhiệt độ (°C)",
                data: values,
                tension: 0.38,
                fill: true,
                backgroundColor: gradient,
                borderColor: "#38bdf8",
                borderWidth: 2.5,
                pointBackgroundColor: "#38bdf8",
                pointBorderColor: "#070a12",
                pointBorderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(12, 17, 30, 0.92)",
                    titleColor: "#f1f5f9",
                    bodyColor: "#38bdf8",
                    borderColor: "rgba(56, 189, 248, 0.3)",
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return `${context.parsed.y} °C`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#64748b", maxTicksLimit: 7, font: { size: 10, family: "Inter" } },
                    grid: { color: "rgba(255, 255, 255, 0.04)" }
                },
                y: {
                    ticks: { color: "#64748b", font: { size: 10, family: "Inter" } },
                    grid: { color: "rgba(255, 255, 255, 0.04)" }
                }
            }
        }
    });
}

function addGasAlert(value) {
    const list = $("alert-list");
    const count = $("alert-count");
    if (!list || !count) return;

    list.innerHTML = `
        <div class="alert-item danger">
            <div class="alert-icon-box danger">!</div>
            <div>
                <strong>Cảnh báo nồng độ khí gas nguy hiểm!</strong>
                <span>Giá trị đo đạt: ${Math.round(value)} ADC (vượt ngưỡng an toàn 1500)</span>
            </div>
        </div>
    `;

    count.textContent = "1";
    count.style.background = "rgba(244,63,94,0.18)";
    count.style.color = "var(--danger)";
}

// ============================================================
// TAB NAVIGATION (DASHBOARD & ĐIỂM DANH)
// ============================================================
function setupTabNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", function (e) {
            e.preventDefault();
            const targetTab = this.getAttribute("data-tab");
            switchView(targetTab);
            setActiveNav(this);
        });
    });

    const dateFilter = $("attendance-date-filter");
    if (dateFilter) {
        const today = new Date().toISOString().split("T")[0];
        dateFilter.value = today;
        dateFilter.addEventListener("change", () => {
            loadAttendanceData();
        });
    }
}

function setActiveNav(activeElement) {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
        item.classList.remove("active");
    });
    if (activeElement) {
        activeElement.classList.add("active");
    }
}

function switchView(tabName) {
    currentTab = tabName;
    const dashboardView = $("dashboard-view");
    const attendanceView = $("attendance-view");
    const studentsView = $("students-view");
    const scheduleView = $("schedule-view");
    const breadcrumb = $("topbar-breadcrumb");
    const pageTitle = $("topbar-page-title");

    // Ẩn toàn bộ các view
    if (dashboardView) dashboardView.style.display = "none";
    if (attendanceView) attendanceView.style.display = "none";
    if (studentsView) studentsView.style.display = "none";
    if (scheduleView) scheduleView.style.display = "none";

    if (tabName === "attendance") {
        if (attendanceView) {
            attendanceView.style.display = "block";
            loadStudents();
            loadAttendanceData();
        }
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / ĐIỂM DANH";
        if (pageTitle) pageTitle.textContent = "Phân Hệ Điểm Danh Thẻ RFID";
    } else if (tabName === "students") {
        if (studentsView) {
            studentsView.style.display = "block";
            loadStudents();
        }
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / SINH VIÊN";
        if (pageTitle) pageTitle.textContent = "Cơ Sở Dữ Liệu Sinh Viên & Thẻ RFID";
    } else if (tabName === "schedule") {
        if (scheduleView) {
            scheduleView.style.display = "block";
            // Sync filter phòng TKB với phòng đang chọn ở sidebar
            const schedRoomFilter = $("schedule-room-filter");
            if (schedRoomFilter && currentRoom) schedRoomFilter.value = currentRoom;
            loadScheduleView();
        }
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / THỜI KHÓA BIỂU";
        if (pageTitle) pageTitle.textContent = "Thời Khóa Biểu & Lịch Giảng Dạy";
    } else {
        if (dashboardView) dashboardView.style.display = "block";
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / TỔNG QUAN";
        if (pageTitle) pageTitle.textContent = "Dashboard Phòng Học Thông Minh";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// STUDENT DIRECTORY MANAGEMENT
// ============================================================
async function loadStudents() {
    try {
        const response = await fetch("/api/students");
        if (!response.ok) throw new Error("Không thể tải danh sách học viên");
        const res = await response.json();
        allStudents = res.data || [];
        renderStudentsTable(allStudents);
    } catch (error) {
        console.error("LOAD STUDENTS ERROR:", error);
        const tbody = $("students-table-body");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell" style="color:var(--danger)">Lỗi tải danh sách: ${error.message}</td></tr>`;
        }
    }
}

function renderStudentsTable(students) {
    const tbody1 = $("students-table-body");
    const tbody2 = $("students-view-table-body");
    if (!tbody1 && !tbody2) return;

    // Cập nhật KPIs cho view Danh sách sinh viên
    const totalCount = allStudents.length;
    const assignedCount = allStudents.filter(s => !!s.card_uid).length;
    const unassignedCount = totalCount - assignedCount;

    if ($("students-kpi-total")) $("students-kpi-total").textContent = totalCount;
    if ($("students-kpi-assigned")) $("students-kpi-assigned").textContent = assignedCount;
    if ($("students-kpi-unassigned")) $("students-kpi-unassigned").textContent = unassignedCount;
    if ($("students-count-badge")) $("students-count-badge").textContent = `${totalCount} sinh viên`;

    if (!students || students.length === 0) {
        const emptyRow = `<tr><td colspan="8" class="table-empty-cell">Không tìm thấy học viên nào trong cơ sở dữ liệu</td></tr>`;
        if (tbody1) tbody1.innerHTML = emptyRow;
        if (tbody2) tbody2.innerHTML = `<tr><td colspan="7" class="table-empty-cell">Không tìm thấy học viên nào phù hợp</td></tr>`;
        return;
    }

    const htmlContent1 = students.map((student, index) => {
        const hasCard = !!student.card_uid;
        const cardPill = hasCard
            ? `<span class="card-uid-pill">🪪 ${escapeHtml(student.card_uid)}</span>`
            : `<span class="status-badge unassigned">Chưa gán thẻ</span>`;

        const statusBadge = hasCard
            ? `<span class="status-badge ontime">● Đã cấp thẻ</span>`
            : `<span class="status-badge late">◌ Chờ cấp thẻ</span>`;

        const contactInfo = [student.phone, student.email].filter(Boolean).map(escapeHtml).join(" · ") || "--";
        const initials = student.full_name ? student.full_name.split(" ").slice(-2).map(w => w[0]).join("").toUpperCase() : "HV";

        return `
            <tr>
                <td style="color:var(--text-muted); font-weight:700;">${index + 1}</td>
                <td><strong style="color:var(--primary); font-family: 'JetBrains Mono', monospace, Consolas;">${escapeHtml(student.student_code)}</strong></td>
                <td>
                    <div class="student-avatar-cell">
                        <div class="student-avatar-circle">${escapeHtml(initials)}</div>
                        <div class="student-name-meta">
                            <strong>${escapeHtml(student.full_name)}</strong>
                            <small>${escapeHtml(student.class_name || "Chưa phân lớp")}</small>
                        </div>
                    </div>
                </td>
                <td><span style="color:var(--text-dim); font-weight:600;">${escapeHtml(student.class_name || "--")}</span></td>
                <td>${cardPill}</td>
                <td>${statusBadge}</td>
                <td><small style="color:var(--text-muted);">${contactInfo}</small></td>
                <td>
                    <div class="action-btn-group" style="justify-content: center;">
                        <button class="btn btn-secondary btn-xs" onclick="openEditStudentModal(${student.id})" title="Chỉnh sửa hoặc gán thẻ">
                            ✏️ Gán thẻ
                        </button>
                        <button class="btn btn-danger-outline btn-xs" onclick="deleteStudent(${student.id}, '${escapeHtml(student.full_name)}')" title="Xóa học viên">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    if (tbody1) tbody1.innerHTML = htmlContent1;

    // Render cho tab Danh sách sinh viên (students-view)
    if (tbody2) {
        tbody2.innerHTML = students.map((student, index) => {
            const hasCard = !!student.card_uid;
            const cardPill = hasCard
                ? `<span class="card-uid-pill" style="font-size:12px;">🪪 ${escapeHtml(student.card_uid)}</span>`
                : `<span class="status-badge unassigned">Chưa gán thẻ</span>`;

            const statusBadge = hasCard
                ? `<span class="status-badge ontime">● Đã cấp thẻ</span>`
                : `<span class="status-badge late">◌ Chờ cấp thẻ</span>`;

            const updatedAtStr = student.updated_at ? formatFullDateTime(student.updated_at) : (student.created_at ? formatFullDateTime(student.created_at) : "--");
            const initials = student.full_name ? student.full_name.split(" ").slice(-2).map(w => w[0]).join("").toUpperCase() : "SV";

            return `
                <tr>
                    <td style="color:var(--text-muted); font-weight:700; text-align:center;">${index + 1}</td>
                    <td><strong style="color:var(--primary); font-family: 'JetBrains Mono', monospace; font-size:13px;">${escapeHtml(student.student_code)}</strong></td>
                    <td>
                        <div class="student-avatar-cell">
                            <div class="student-avatar-circle" style="background: linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.2)); color: var(--info);">${escapeHtml(initials)}</div>
                            <div class="student-name-meta">
                                <strong>${escapeHtml(student.full_name)}</strong>
                                <small>${escapeHtml(student.class_name || student.email || "Sinh viên chính quy")}</small>
                            </div>
                        </div>
                    </td>
                    <td>${cardPill}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size:12px; color:var(--text-dim); font-weight:500;">${updatedAtStr}</td>
                    <td style="text-align: center;">
                        <div class="action-btn-group" style="justify-content: center; gap: 8px;">
                            <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal(${student.id})" title="Chỉnh sửa hoặc gán thẻ RFID">
                                <span>✏️</span> Sửa / Gán thẻ
                            </button>
                            <button class="btn btn-danger-outline btn-sm" onclick="deleteStudent(${student.id}, '${escapeHtml(student.full_name)}')" title="Xóa sinh viên">
                                <span>🗑️</span> Xóa
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }
}

function handleStudentSearch(query) {
    query = (query || "").trim().toLowerCase();
    if (!query) {
        renderStudentsTable(allStudents);
        return;
    }

    const filtered = allStudents.filter(s => {
        return (
            (s.student_code && s.student_code.toLowerCase().includes(query)) ||
            (s.full_name && s.full_name.toLowerCase().includes(query)) ||
            (s.class_name && s.class_name.toLowerCase().includes(query)) ||
            (s.card_uid && s.card_uid.toLowerCase().includes(query)) ||
            (s.phone && s.phone.includes(query)) ||
            (s.email && s.email.toLowerCase().includes(query))
        );
    });

    renderStudentsTable(filtered);
}

function filterStudents() {
    const input = $("student-search-input");
    handleStudentSearch(input ? input.value : "");
}

async function loadStudentsView() {
    await loadStudents();
}

function openAddStudentModal() {
    $("student-form").reset();
    $("student-id-input").value = "";
    $("modal-title").textContent = "Thêm học viên mới";
    $("modal-subtitle").textContent = "Điền thông tin và gán mã thẻ RFID";
    $("student-modal").style.display = "flex";
    $("student-code-input").focus();
}

function openEditStudentModal(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) {
        showToast("Lỗi", "Không tìm thấy học viên", false);
        return;
    }

    $("student-id-input").value = student.id;
    $("student-code-input").value = student.student_code || "";
    $("student-name-input").value = student.full_name || "";
    $("student-class-input").value = student.class_name || "";
    $("student-phone-input").value = student.phone || "";
    $("student-email-input").value = student.email || "";
    $("student-card-input").value = student.card_uid || "";

    $("modal-title").textContent = "Chỉnh sửa học viên & Gán thẻ";
    $("modal-subtitle").textContent = `Cập nhật thông tin cho ${student.full_name}`;
    $("student-modal").style.display = "flex";
}

function closeStudentModal() {
    $("student-modal").style.display = "none";
}

async function handleSaveStudent(event) {
    event.preventDefault();
    const id = $("student-id-input").value;
    const payload = {
        student_code: $("student-code-input").value.trim(),
        full_name: $("student-name-input").value.trim(),
        class_name: $("student-class-input").value.trim(),
        phone: $("student-phone-input").value.trim(),
        email: $("student-email-input").value.trim(),
        card_uid: $("student-card-input").value.trim()
    };

    if (!payload.student_code || !payload.full_name) {
        showToast("Thiếu thông tin", "Vui lòng nhập Mã học viên và Họ tên", false);
        return;
    }

    try {
        const url = id ? `/api/students/${id}` : "/api/students";
        const method = id ? "PUT" : "POST";

        const response = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Lưu học viên thất bại");
        }

        showToast("Thành công", data.message || "Đã lưu học viên thành công", true);
        closeStudentModal();
        await loadStudents();
        await loadAttendanceData();
    } catch (error) {
        console.error("SAVE STUDENT ERROR:", error);
        showToast("Lỗi lưu học viên", error.message, false);
    }
}

async function deleteStudent(id, name) {
    if (!confirm(`Bạn có chắc chắn muốn xóa học viên "${name}"? Thao tác này không thể hoàn tác.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/students/${id}`, {
            method: "DELETE"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Không thể xóa học viên");

        showToast("Đã xóa", `Đã xóa học viên ${name}`, true);
        await loadStudents();
        await loadAttendanceData();
    } catch (error) {
        console.error("DELETE STUDENT ERROR:", error);
        showToast("Lỗi xóa học viên", error.message, false);
    }
}

async function fetchLatestCardUid() {
    try {
        showToast("Đang tìm thẻ", "Đang đọc mã thẻ RFID vừa quẹt gần nhất...", true);
        const response = await fetch("/api/attendance/latest-scan");
        if (!response.ok) throw new Error("Không thể lấy dữ liệu quẹt thẻ");
        const res = await response.json();

        if (res.data && res.data.card_uid) {
            $("student-card-input").value = res.data.card_uid;
            showToast("Đã lấy mã thẻ!", `Mã UID: ${res.data.card_uid}`, true);
        } else {
            showToast("Chưa có thẻ quẹt", "Hãy quẹt thẻ lên đầu đọc RC522 rồi bấm lại", false);
        }
    } catch (error) {
        console.error("FETCH SCAN ERROR:", error);
        showToast("Lỗi lấy mã thẻ", error.message, false);
    }
}

// ============================================================
// ATTENDANCE LOGS & STATS
// ============================================================
async function loadAttendanceData() {
    const dateInput = $("attendance-date-filter");
    const dateFilter = dateInput ? dateInput.value : "";

    try {
        const queryParams = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";
        // Sửa lỗi URL: khi không có date filter, cần dùng '?' thay vì '&'
        const logsQuery = dateFilter
            ? `?date=${encodeURIComponent(dateFilter)}&limit=50`
            : `?limit=50`;

        const [statsRes, logsRes] = await Promise.all([
            fetch(`/api/attendance/stats${queryParams}`),
            fetch(`/api/attendance${logsQuery}`)
        ]);

        if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.success && statsData.data) {
                renderAttendanceStats(statsData.data);
            }
        }

        if (logsRes.ok) {
            const logsData = await logsRes.json();
            if (logsData.success && logsData.data) {
                renderAttendanceLogs(logsData.data);
            }
        }

        // Tải sổ điểm danh theo ca học
        await loadAttendanceSessions();
    } catch (error) {
        console.error("LOAD ATTENDANCE DATA ERROR:", error);
    }
}

function renderAttendanceStats(stats) {
    if ($("stat-total-students")) $("stat-total-students").textContent = stats.total_students ?? 0;
    if ($("stat-present-students")) $("stat-present-students").textContent = stats.present_students ?? 0;
    if ($("stat-late-students")) $("stat-late-students").textContent = stats.late_count ?? stats.late_students ?? 0;
    if ($("stat-absent-students")) $("stat-absent-students").textContent = stats.absent_count ?? stats.absent_students ?? 0;
}

function renderAttendanceLogs(logs) {
    const tbody = $("attendance-log-body");
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell">Chưa có lượt quẹt thẻ điểm danh nào trong ngày đã chọn</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        let statusBadge;
        if (log.status === "DUNG_GIO" || log.status === "PRESENT") {
            statusBadge = `<span class="status-badge ontime">✓ Đúng giờ</span>`;
        } else if (log.status === "MUON" || log.status === "DI_MUON" || log.status === "LATE") {
            statusBadge = `<span class="status-badge late">⏰ Đi muộn</span>`;
        } else {
            statusBadge = `<span class="status-badge unassigned">${escapeHtml(log.status || "Chưa rõ")}</span>`;
        }

        const studentName = log.full_name
            ? `<strong style="color:var(--text-pure); font-size:13px;">${escapeHtml(log.full_name)}</strong>`
            : `<span style="color:var(--text-muted); font-style:italic;">Thẻ chưa đăng ký học viên</span>`;

        const studentCode = log.student_code
            ? `<span style="color:var(--primary); font-family:'JetBrains Mono', monospace; font-weight:700;">${escapeHtml(log.student_code)}</span>`
            : `--`;

        const eventBadge = (log.event_type === "CHECK_OUT")
            ? `<span class="event-type-badge out">CHECK OUT</span>`
            : `<span class="event-type-badge in">CHECK IN</span>`;

        const timeStr = formatFullDateTime(log.recorded_at);

        return `
            <tr>
                <td style="white-space:nowrap; font-size:12px; color:var(--text-dim); font-weight:600;">${timeStr}</td>
                <td><span class="meta-chip">${escapeHtml(log.room_id)}</span></td>
                <td>${studentName}</td>
                <td>${studentCode}</td>
                <td><span style="color:var(--text-muted);">${escapeHtml(log.class_name || "--")}</span></td>
                <td><span class="card-uid-pill">🪪 ${escapeHtml(log.card_uid)}</span></td>
                <td>${eventBadge}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join("");
}

// ============================================================
// ACADEMIC SESSIONS & ROLL CALL SHEET
// ============================================================
let currentAttendanceSessions = [];
let selectedSessionId = null;

function toggleAllDates(isAll) {
    const dateInput = $("attendance-date-filter");
    if (dateInput) {
        dateInput.disabled = isAll;
    }
    // loadAttendanceData() đã gọi cả loadAttendanceSessions() bên trong
    loadAttendanceData();
}

async function loadAttendanceSessions() {
    const dateInput = $("attendance-date-filter");
    const allDatesCheckbox = $("attendance-all-dates");
    const isAllDates = allDatesCheckbox ? allDatesCheckbox.checked : false;
    const dateFilter = (dateInput && !isAllDates) ? dateInput.value : "";
    const sessionSelect = $("session-select");
    if (!sessionSelect) return;

    try {
        let url = `/api/attendance/sessions?`;
        if (currentRoom) url += `room_id=${encodeURIComponent(currentRoom)}&`;
        if (dateFilter) url += `date=${encodeURIComponent(dateFilter)}&`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Không thể tải danh sách ca học");
        const json = await res.json();

        currentAttendanceSessions = json.data || [];

        if (currentAttendanceSessions.length === 0) {
            sessionSelect.innerHTML = `<option value="">-- Không có ca học nào --</option>`;
            selectedSessionId = null;
            const dateMsg = dateFilter ? `trong ngày ${dateFilter}` : `tại phòng này`;
            renderEmptyRollCallSheet(`Không có ca học nào ${dateMsg}. Bạn có thể tick "Tất cả ngày" hoặc bấm nút "📚 Mở ca học mới".`);
            updateSessionBanner(null);
            return;
        }

        sessionSelect.innerHTML = currentAttendanceSessions.map(s => {
            const statusIcon = s.status === "ACTIVE" ? "🟢" : (s.status === "CLOSED" ? "🔒" : "⏳");
            const datePrefix = isAllDates ? `[${s.session_date}] ` : "";
            return `<option value="${s.id}">
                ${statusIcon} ${datePrefix}${escapeHtml(s.class_code)}: ${escapeHtml(s.subject_name)} (${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)})
            </option>`;
        }).join("");

        // Tự động chọn session đầu tiên nếu chưa chọn hoặc session cũ không còn trong danh sách
        if (!selectedSessionId || !currentAttendanceSessions.some(s => s.id === selectedSessionId)) {
            selectedSessionId = currentAttendanceSessions[0].id;
        }

        sessionSelect.value = selectedSessionId;
        await loadSessionRollCallSheet(selectedSessionId);

    } catch (err) {
        console.error("LOAD ATTENDANCE SESSIONS ERROR:", err);
    }
}

async function handleSessionChange() {
    const sessionSelect = $("session-select");
    if (!sessionSelect) return;
    selectedSessionId = parseInt(sessionSelect.value, 10) || null;
    if (selectedSessionId) {
        await loadSessionRollCallSheet(selectedSessionId);
    }
}

async function loadSessionRollCallSheet(sessionId) {
    if (!sessionId) return;
    const session = currentAttendanceSessions.find(s => s.id === sessionId);
    updateSessionBanner(session);

    const tbody = $("rollcall-table-body");
    if (!tbody) return;

    try {
        const res = await fetch(`/api/attendance/sessions/${sessionId}/records`);
        if (!res.ok) throw new Error("Không thể tải sổ điểm danh");
        const json = await res.json();
        const records = json.data || [];

        renderRollCallSheet(records, session);
    } catch (err) {
        console.error("LOAD ROLLCALL SHEET ERROR:", err);
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty-cell">Lỗi tải dữ liệu sổ điểm danh: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function updateSessionBanner(session) {
    const banner = $("session-info-banner");
    const statusBadge = $("session-status-badge");
    const closeBtn = $("btn-close-session");
    if (!banner) return;

    if (!session) {
        banner.style.display = "none";
        if (statusBadge) statusBadge.style.display = "none";
        if (closeBtn) closeBtn.style.display = "none";
        return;
    }

    banner.style.display = "flex";
    if ($("sess-subject")) $("sess-subject").textContent = session.subject_name;
    if ($("sess-class")) $("sess-class").textContent = `${session.class_code} (${session.room_name})`;
    if ($("sess-teacher")) $("sess-teacher").textContent = session.teacher_name;
    if ($("sess-time")) $("sess-time").textContent = `${session.start_time.slice(0,5)} - ${session.end_time.slice(0,5)} (${session.session_date})`;

    if ($("sess-total")) $("sess-total").textContent = session.total_enrolled;
    if ($("sess-present")) $("sess-present").textContent = session.present_count;
    if ($("sess-late")) $("sess-late").textContent = session.late_count;
    if ($("sess-excused")) $("sess-excused").textContent = session.excused_count;
    if ($("sess-absent")) $("sess-absent").textContent = session.unexcused_count;

    if (statusBadge) {
        statusBadge.style.display = "inline-flex";
        if (session.status === "ACTIVE") {
            statusBadge.className = "status-badge active";
            statusBadge.textContent = "● Đang diễn ra";
            if (closeBtn) closeBtn.style.display = "inline-flex";
        } else if (session.status === "CLOSED") {
            statusBadge.className = "status-badge closed";
            statusBadge.textContent = "🔒 Đã chốt sổ";
            if (closeBtn) closeBtn.style.display = "none";
        } else {
            statusBadge.className = "status-badge ontime";
            statusBadge.textContent = "⏳ Sắp diễn ra";
            if (closeBtn) closeBtn.style.display = "inline-flex";
        }
    }
}

function renderEmptyRollCallSheet(message) {
    const tbody = $("rollcall-table-body");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty-cell">${escapeHtml(message)}</td></tr>`;
    }
}

function renderRollCallSheet(records, session) {
    const tbody = $("rollcall-table-body");
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty-cell">Lớp học phần này chưa có sinh viên nào đăng ký</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map((r, idx) => {
        let badgeHtml;
        if (r.status === "PRESENT") {
            badgeHtml = `<span class="status-badge ontime">✓ Đúng giờ</span>`;
        } else if (r.status === "LATE") {
            badgeHtml = `<span class="status-badge late">⏰ Đi muộn</span>`;
        } else if (r.status === "ABSENT_EXCUSED") {
            badgeHtml = `<span class="status-badge excused">📝 Nghỉ có phép</span>`;
        } else {
            badgeHtml = `<span class="status-badge absent">✕ Vắng không phép</span>`;
        }

        const methodStr = r.method === "RFID"
            ? `<span style="color:var(--primary); font-weight:600;">🪪 Quẹt thẻ RFID</span>`
            : (r.method === "MANUAL_TEACHER"
                ? `<span style="color:var(--warning); font-weight:600;">✍️ Giáo viên sửa</span>`
                : `<span style="color:var(--text-muted); font-style:italic;">Chưa điểm danh</span>`);

        const timeStr = r.checkin_time ? formatFullDateTime(r.checkin_time) : `<span style="color:var(--text-muted);">--:--</span>`;
        const noteStr = r.note ? `<span style="color:var(--text-pure); font-size:12px;">${escapeHtml(r.note)}</span>` : `<span style="color:var(--text-dim); font-size:11px;">--</span>`;

        const encodedName = encodeURIComponent(r.full_name || "");
        const encodedNote = encodeURIComponent(r.note || "");

        return `
            <tr>
                <td style="text-align:center; color:var(--text-dim); font-weight:600;">${idx + 1}</td>
                <td><span style="color:var(--primary); font-family:'JetBrains Mono', monospace; font-weight:700;">${escapeHtml(r.student_code)}</span></td>
                <td><strong style="color:var(--text-pure); font-size:13px;">${escapeHtml(r.full_name)}</strong></td>
                <td><span class="card-uid-pill">${r.card_uid ? `🪪 ${escapeHtml(r.card_uid)}` : `<span style="color:var(--text-muted);">Chưa có thẻ</span>`}</span></td>
                <td>${badgeHtml}</td>
                <td style="font-size:12px; color:var(--text-dim); font-weight:600;">${timeStr}</td>
                <td>${methodStr}</td>
                <td>${noteStr}</td>
                <td style="text-align:center;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditRecordModal(${r.record_id || 'null'}, decodeURIComponent('${encodedName}'), '${r.status}', decodeURIComponent('${encodedNote}'), ${r.student_id})" title="Sửa điểm danh">
                        <span>✍️</span> Sửa
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

// EDIT RECORD MODAL (MANUAL OVERRIDE)
let editRecordStudentId = null;
let editRecordSessionId = null;

function openEditRecordModal(recordId, studentName, currentStatus, currentNote, studentId) {
    $("edit-record-id").value = recordId || "";
    editRecordStudentId = studentId || null;
    editRecordSessionId = selectedSessionId || null;

    $("edit-record-student-name").textContent = `Sinh viên: ${studentName}`;
    $("edit-record-status").value = currentStatus || "PRESENT";
    $("edit-record-note").value = currentNote || "";

    $("edit-record-modal").style.display = "flex";
}

function closeEditRecordModal() {
    $("edit-record-modal").style.display = "none";
}

async function handleSaveEditRecord(e) {
    e.preventDefault();
    const recordId = $("edit-record-id").value;
    const status = $("edit-record-status").value;
    const note = $("edit-record-note").value.trim();

    try {
        let url = "";
        let method = "PUT";

        if (recordId) {
            url = `/api/attendance/records/${recordId}`;
        } else if (editRecordSessionId && editRecordStudentId) {
            url = `/api/attendance/sessions/${editRecordSessionId}/students/${editRecordStudentId}/record`;
        } else {
            throw new Error("Không xác định được buổi học hoặc sinh viên để cập nhật");
        }

        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, note })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Không thể cập nhật điểm danh");

        showToast("Thành công", data.message || "Đã cập nhật điểm danh", true);
        closeEditRecordModal();

        // Tải lại dữ liệu session và danh sách điểm danh
        await loadAttendanceSessions();
        await loadAttendanceData();
    } catch (err) {
        console.error("SAVE RECORD ERROR:", err);
        showToast("Lỗi cập nhật", err.message, false);
    }
}

async function closeCurrentSession() {
    if (!selectedSessionId) return;
    if (!confirm("Bạn có chắc chắn muốn chốt sổ buổi điểm danh này? Sau khi chốt, toàn bộ sinh viên chưa có mặt sẽ chính thức được tính là Vắng không phép.")) {
        return;
    }

    try {
        const res = await fetch(`/api/attendance/sessions/${selectedSessionId}/close`, {
            method: "POST"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Không thể chốt sổ");

        showToast("Đã chốt sổ", "Buổi điểm danh đã được khóa thành công", true);
        await loadAttendanceSessions();
        await loadAttendanceData();
    } catch (err) {
        console.error("CLOSE SESSION ERROR:", err);
        showToast("Lỗi chốt sổ", err.message, false);
    }
}

function exportCurrentSession() {
    if (!selectedSessionId) {
        showToast("Chưa chọn ca học", "Vui lòng chọn ca học để xuất file", false);
        return;
    }
    showToast("Đang xuất file", "Đang tải file CSV báo cáo điểm danh...", true);
    window.location.href = `/api/attendance/sessions/${selectedSessionId}/export`;
}

// ============================================================
// INITIALIZATION
// ============================================================
const roomSelect = $("room-select");
if (roomSelect) {
    roomSelect.addEventListener("change", async function () {
        currentRoom = this.value;
        await loadRoom();
        if (currentTab === "attendance") {
            await loadAttendanceData();
        } else if (currentTab === "schedule") {
            const schedRoomFilter = $("schedule-room-filter");
            if (schedRoomFilter) schedRoomFilter.value = currentRoom;
            await loadScheduleView();
        }
    });
}

const mobileMenu = $("mobile-menu");
if (mobileMenu) {
    mobileMenu.addEventListener("click", function () {
        const sidebar = document.querySelector(".sidebar");
        if (sidebar) sidebar.classList.toggle("open");
    });
}

// ============================================================
// CREATE SESSION MODAL
// ============================================================
async function openCreateSessionModal() {
    const classSelect = $("new-session-class");
    const dateInput = $("new-session-date");
    const startInput = $("new-session-start");
    const endInput = $("new-session-end");

    // Điền mặc định ngày hôm nay
    const todayStr = new Date().toISOString().split("T")[0];
    if (dateInput) dateInput.value = todayStr;

    // Giờ bắt đầu và kết thúc mặc định
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    if (startInput) startInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // Kết thúc sau 3 tiếng
    const endHour = Math.min(now.getHours() + 3, 23);
    if (endInput) endInput.value = `${pad(endHour)}:${pad(now.getMinutes())}`;

    // Tải danh sách lớp học phần
    try {
        const res = await fetch("/api/course-classes");
        const json = await res.json();
        const classes = json.data || [];
        if (classSelect) {
            if (classes.length === 0) {
                classSelect.innerHTML = `<option value="">-- Chưa có lớp học phần nào --</option>`;
            } else {
                classSelect.innerHTML = classes.map(c => `
                    <option value="${c.id}">${escapeHtml(c.class_code)}: ${escapeHtml(c.subject_name)} (${escapeHtml(c.teacher_name || 'Chưa phân công')})</option>
                `).join("");
            }
        }
    } catch (err) {
        console.error("LOAD COURSE CLASSES ERROR:", err);
    }

    const modal = $("create-session-modal");
    if (modal) modal.style.display = "flex";
}

function closeCreateSessionModal() {
    const modal = $("create-session-modal");
    if (modal) modal.style.display = "none";
}

async function handleCreateSession(e) {
    e.preventDefault();
    const classId = $("new-session-class").value;
    const sessionDate = $("new-session-date").value;
    const startTime = $("new-session-start").value;
    const endTime = $("new-session-end").value;

    if (!classId) {
        showToast("Lỗi", "Vui lòng chọn lớp học phần", false);
        return;
    }

    try {
        const res = await fetch("/api/attendance/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                room_id: currentRoom,
                class_id: parseInt(classId, 10),
                session_date: sessionDate,
                start_time: startTime + ":00",
                end_time: endTime + ":00"
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Không thể tạo buổi học");

        showToast("Thành công", "Đã mở ca học mới thành công", true);
        closeCreateSessionModal();

        // Tự động chọn ca học vừa tạo
        if (data.session_id) {
            selectedSessionId = data.session_id;
        }

        // Tải lại danh sách ca học
        await loadAttendanceSessions();
        await loadAttendanceData();

    } catch (err) {
        console.error("CREATE SESSION ERROR:", err);
        showToast("Lỗi mở ca học", err.message, false);
    }
}

// ============================================================
// TIMETABLE & SCHEDULE MANAGEMENT
// ============================================================
let courseClassesCache = [];
let currentSchedules = []; // Cache lịch học để dùng cho Edit modal

async function loadScheduleView() {
    const container = $("schedule-grid-container");
    const roomFilter = $("schedule-room-filter");
    const classFilter = $("schedule-class-filter");
    if (!container) return;

    const selectedRoom = roomFilter ? roomFilter.value : "";
    const selectedClass = classFilter ? classFilter.value : "";

    // Nạp danh sách lớp học phần vào filter nếu chưa có
    if (classFilter && classFilter.children.length <= 1) {
        try {
            const res = await fetch("/api/course-classes");
            const json = await res.json();
            courseClassesCache = json.data || [];
            classFilter.innerHTML = `<option value="">Tất cả lớp học phần</option>` + courseClassesCache.map(c => `
                <option value="${c.id}">${escapeHtml(c.class_code)}: ${escapeHtml(c.subject_name)}</option>
            `).join("");
        } catch (err) {
            console.error("LOAD CLASS FILTER ERROR:", err);
        }
    }

    try {
        let url = `/api/schedules?`;
        if (selectedRoom) url += `room_id=${encodeURIComponent(selectedRoom)}&`;
        if (selectedClass) url += `class_id=${encodeURIComponent(selectedClass)}&`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Không thể tải thời khóa biểu");
        const json = await res.json();
        const schedules = json.data || [];

        // Lấy danh sách session hôm nay để gắn badge trạng thái (ACTIVE / CLOSED / ...)
        try {
            const todayStr = new Date().toISOString().split("T")[0];
            let sessUrl = `/api/attendance/sessions?date=${todayStr}`;
            if (selectedRoom) sessUrl += `&room_id=${encodeURIComponent(selectedRoom)}`;
            const sessRes = await fetch(sessUrl);
            if (sessRes.ok) {
                const sessJson = await sessRes.json();
                const todaySessions = sessJson.data || [];
                // Ghép session hôm nay vào schedule tương ứng
                schedules.forEach(s => {
                    const match = todaySessions.find(sess =>
                        sess.class_id === s.class_id &&
                        (sess.room_id === s.room_id || sess.room_code === s.room_code)
                    );
                    if (match) s.todaySession = match;
                });
            }
        } catch (sessErr) {
            console.warn("Không thể lấy session hôm nay:", sessErr);
        }

        renderScheduleGrid(schedules);

    } catch (err) {
        console.error("LOAD SCHEDULE VIEW ERROR:", err);
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--danger);">Lỗi tải thời khóa biểu: ${escapeHtml(err.message)}</div>`;
    }
}

function renderScheduleGrid(schedules) {
    const container = $("schedule-grid-container");
    if (!container) return;

    // Cập nhật cache để dùng cho Edit/Delete modal
    currentSchedules = schedules;

    const DAYS = [
        { day: 0, title: "Thứ Hai", short: "T2" },
        { day: 1, title: "Thứ Ba", short: "T3" },
        { day: 2, title: "Thứ Tư", short: "T4" },
        { day: 3, title: "Thứ Năm", short: "T5" },
        { day: 4, title: "Thứ Sáu", short: "T6" },
        { day: 5, title: "Thứ Bảy", short: "T7" },
        { day: 6, title: "Chủ Nhật", short: "CN" }
    ];

    // Tính thứ hiện tại theo chuẩn Python weekday (0=Thứ 2, ..., 6=Chủ Nhật)
    const todayWeekday = (new Date().getDay() + 6) % 7;

    container.innerHTML = DAYS.map(d => {
        const isToday = (d.day === todayWeekday);
        const daySchedules = schedules.filter(s => s.day_of_week === d.day);

        const cardsHtml = daySchedules.length === 0
            ? `<div class="schedule-empty-day">Không có ca học</div>`
            : daySchedules.map(s => {
                const startHour = parseInt(s.start_time.split(":")[0], 10);
                let shiftClass = "shift-morning";
                let shiftIcon = "☀️";
                let shiftLabel = "Sáng";
                if (startHour >= 18) {
                    shiftClass = "shift-evening";
                    shiftIcon = "🌙";
                    shiftLabel = "Tối";
                } else if (startHour >= 12) {
                    shiftClass = "shift-afternoon";
                    shiftIcon = "⛅";
                    shiftLabel = "Chiều";
                }

                const startTimeStr = s.start_time.slice(0, 5);
                const endTimeStr = s.end_time.slice(0, 5);
                const graceMins = s.late_grace_period_mins ?? 15;

                // Badge trạng thái buổi học hôm nay
                let sessionBadge = "";
                const todayWeekdayForCard = (new Date().getDay() + 6) % 7;
                if (d.day === todayWeekdayForCard) {
                    if (s.todaySession) {
                        if (s.todaySession.status === "ACTIVE") {
                            sessionBadge = `<span style="display:inline-block; background:#10b981; color:#fff; border-radius:6px; font-size:10px; padding:2px 7px; font-weight:700; letter-spacing:0.5px; animation: pulse-glow 2s infinite;">🟢 ĐANG DIỄN RA</span>`;
                        } else if (s.todaySession.status === "CLOSED") {
                            sessionBadge = `<span style="display:inline-block; background:rgba(100,100,100,0.35); color:var(--text-muted); border-radius:6px; font-size:10px; padding:2px 7px; font-weight:600;">⏹️ ĐÃ ĐÓNG</span>`;
                        }
                    } else {
                        sessionBadge = `<span style="display:inline-block; background:rgba(250,204,21,0.2); color:#fbbf24; border-radius:6px; font-size:10px; padding:2px 7px; font-weight:600;">🗓️ HÔM NAY</span>`;
                    }
                }

                return `
                    <div class="schedule-item-card ${shiftClass}">
                        <div class="schedule-item-time">
                            <span>${shiftIcon} ${startTimeStr} - ${endTimeStr}</span>
                            <span class="mini-pill" style="font-size: 10px; padding: 1px 6px;">${shiftLabel}</span>
                        </div>
                        ${sessionBadge ? `<div style="margin:4px 0;">${sessionBadge}</div>` : ""}
                        <div class="schedule-item-subject">${escapeHtml(s.subject_name)}</div>
                        <div class="schedule-item-class">${escapeHtml(s.class_code)}</div>
                        <div class="schedule-item-meta">
                            <span>👨‍🏫 ${escapeHtml(s.teacher_name || 'Chưa phân công')}</span>
                            <span>📍 ${escapeHtml(s.room_name)} (${escapeHtml(s.room_code)})</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin:4px 0;">
                            ⏰ Cho phép muộn: <strong>${graceMins} phút</strong>
                        </div>
                        <div style="display:flex; gap:6px; margin-top:6px;">
                            <button class="btn btn-secondary btn-xs" style="flex:1; justify-content:center;"
                                onclick="goToAttendance('${escapeHtml(s.room_code)}')">
                                🪪 Điểm danh
                            </button>
                            <button class="btn btn-accent btn-xs" style="padding:4px 10px;"
                                onclick="openEditScheduleModal(${s.id})" title="Sửa lịch học">
                                ✏️
                            </button>
                            <button class="btn btn-secondary btn-xs" style="padding:4px 10px; border-color:var(--danger); color:var(--danger);"
                                onclick="deleteSchedule(${s.id})" title="Xóa lịch học">
                                🗑️
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

        return `
            <div class="schedule-day-column ${isToday ? 'is-today' : ''}">
                <div class="schedule-day-header">
                    <span class="schedule-day-title">${d.title} ${isToday ? '●' : ''}</span>
                    <span class="schedule-day-count">${daySchedules.length} ca</span>
                </div>
                <div class="schedule-card-list">
                    ${cardsHtml}
                </div>
            </div>
        `;
    }).join("");
}


function goToAttendance(roomCode) {
    if (roomCode) {
        currentRoom = roomCode;
        const select = $("room-select");
        if (select) select.value = roomCode;
    }
    const attendanceNav = document.querySelector(".sidebar-nav .nav-item[data-tab='attendance']");
    switchView("attendance");
    setActiveNav(attendanceNav);
}

// ============================================================
// SCHEDULE CRUD FUNCTIONS (THÊM / SỬA / XÓA LỊCH HỌC)
// ============================================================
async function openCreateScheduleModal() {
    $("schedule-id-input").value = "";
    $("schedule-modal-title").textContent = "Thêm lịch học mới";
    $("schedule-modal-subtitle").textContent = "Tạo lịch học định kỳ hàng tuần cho lớp học phần";

    // Reset form
    const form = $("schedule-form");
    if (form) form.reset();
    $("schedule-grace-input").value = "15";

    // Auto-điền phòng hiện tại
    if (currentRoom) {
        const roomInput = $("schedule-room-input");
        if (roomInput) roomInput.value = currentRoom;
    }

    await _loadScheduleModalData();
    $("schedule-modal").style.display = "flex";
}

async function openEditScheduleModal(scheduleId) {
    const s = currentSchedules.find(x => x.id === scheduleId);
    if (!s) {
        showToast("Lỗi", "Không tìm thấy thông tin lịch học", false);
        return;
    }
    $("schedule-id-input").value = s.id;
    $("schedule-modal-title").textContent = "Sửa lịch học";
    $("schedule-modal-subtitle").textContent = `Đang sửa: ${escapeHtml(s.class_code)} — ${escapeHtml(s.subject_name)}`;

    await _loadScheduleModalData();

    // Điền giá trị hiện tại vào form
    const classInput = $("schedule-class-input");
    const roomInput = $("schedule-room-input");
    if (classInput) classInput.value = s.class_id;
    if (roomInput) roomInput.value = s.room_code || s.room_id;
    $("schedule-day-input").value = s.day_of_week;
    $("schedule-start-input").value = (s.start_time || "").slice(0, 5);
    $("schedule-end-input").value = (s.end_time || "").slice(0, 5);
    $("schedule-grace-input").value = s.late_grace_period_mins ?? 15;

    $("schedule-modal").style.display = "flex";
}

async function _loadScheduleModalData() {
    // Load lớp học phần
    try {
        const res = await fetch("/api/course-classes");
        const json = await res.json();
        const classes = json.data || [];
        const classInput = $("schedule-class-input");
        if (classInput) {
            classInput.innerHTML = `<option value="">-- Chọn lớp học phần --</option>` +
                classes.map(c => `<option value="${c.id}">${escapeHtml(c.class_code)}: ${escapeHtml(c.subject_name)}</option>`).join("");
        }
    } catch (e) { console.error("Load classes error:", e); }

    // Load phòng học
    try {
        const res = await fetch("/api/rooms");
        const json = await res.json();
        const rooms = Array.isArray(json) ? json : (json.data || json.rooms || []);
        const roomInput = $("schedule-room-input");
        if (roomInput) {
            roomInput.innerHTML = `<option value="">-- Chọn phòng --</option>` +
                rooms.map(r => `<option value="${escapeHtml(r.room_id)}">${escapeHtml(r.name || r.room_id)} (${escapeHtml(r.room_id)})</option>`).join("");
        }
    } catch (e) { console.error("Load rooms error:", e); }
}

function closeScheduleModal() {
    const modal = $("schedule-modal");
    if (modal) modal.style.display = "none";
}

async function handleSaveSchedule(e) {
    e.preventDefault();
    const scheduleId = $("schedule-id-input").value;
    const payload = {
        class_id: parseInt($("schedule-class-input").value, 10),
        room_id: $("schedule-room-input").value,
        day_of_week: parseInt($("schedule-day-input").value, 10),
        start_time: $("schedule-start-input").value + ":00",
        end_time: $("schedule-end-input").value + ":00",
        late_grace_period_mins: parseInt($("schedule-grace-input").value, 10) || 15
    };

    if (!payload.class_id || !payload.room_id) {
        showToast("Thiếu thông tin", "Vui lòng chọn lớp học phần và phòng học", false);
        return;
    }

    try {
        const url = scheduleId ? `/api/schedules/${scheduleId}` : "/api/schedules";
        const method = scheduleId ? "PUT" : "POST";
        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Lưu lịch học thất bại");

        showToast("Thành công", data.message || "Đã lưu lịch học", true);
        closeScheduleModal();
        await loadScheduleView();
    } catch (err) {
        console.error("SAVE SCHEDULE ERROR:", err);
        showToast("Lỗi lưu lịch học", err.message, false);
    }
}

async function deleteSchedule(scheduleId) {
    const s = currentSchedules.find(x => x.id === scheduleId);
    const label = s ? `"${s.class_code} — ${s.subject_name}"` : `ID ${scheduleId}`;
    if (!confirm(`Xóa lịch học ${label}?\nLưu ý: Các buổi học (attendance_sessions) đã tạo từ lịch này sẽ không bị xóa.`)) return;

    try {
        const res = await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Xóa thất bại");
        showToast("Đã xóa", data.message, true);
        await loadScheduleView();
    } catch (err) {
        console.error("DELETE SCHEDULE ERROR:", err);
        showToast("Lỗi xóa", err.message, false);
    }
}

// Close modal when clicking outside
window.addEventListener("click", function (event) {
    const studentModal = $("student-modal");
    if (studentModal && event.target === studentModal) {
        closeStudentModal();
    }
    const editModal = $("edit-record-modal");
    if (editModal && event.target === editModal) {
        closeEditRecordModal();
    }
    const createModal = $("create-session-modal");
    if (createModal && event.target === createModal) {
        closeCreateSessionModal();
    }
    const scheduleModal = $("schedule-modal");
    if (scheduleModal && event.target === scheduleModal) {
        closeScheduleModal();
    }
});

async function initializeDashboard() {
    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    setupTabNavigation();
    await loadRooms();

    // Auto-refresh Dashboard (Sensors, Devices & Control Mode)
    setInterval(async () => {
        if (currentTab === "dashboard" && currentRoom) {
            await Promise.all([loadSensors(), loadDevices(), loadRoomMode()]);
        } else if (currentTab === "attendance") {
            await loadAttendanceData();
        } else if (currentTab === "schedule") {
            // Auto-refresh TKB để cập nhật badge trạng thái buổi học
            await loadScheduleView();
        }
    }, REFRESH_INTERVAL);

    // Auto-refresh Temperature History Chart
    setInterval(async () => {
        if (currentTab === "dashboard" && currentRoom) {
            await loadTemperatureHistory();
        }
    }, 15000);
}

document.addEventListener("DOMContentLoaded", initializeDashboard);