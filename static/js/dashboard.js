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
    const breadcrumb = $("topbar-breadcrumb");
    const pageTitle = $("topbar-page-title");

    if (tabName === "attendance") {
        if (dashboardView) dashboardView.style.display = "none";
        if (attendanceView) {
            attendanceView.style.display = "block";
            loadStudents();
            loadAttendanceData();
        }
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / ĐIỂM DANH";
        if (pageTitle) pageTitle.textContent = "Phân Hệ Điểm Danh Thẻ RFID";
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
        if (attendanceView) attendanceView.style.display = "none";
        if (dashboardView) dashboardView.style.display = "block";
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / TỔNG QUAN";
        if (pageTitle) pageTitle.textContent = "Dashboard Phòng Học Thông Minh";
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    const tbody = $("students-table-body");
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell">Không tìm thấy học viên nào trong cơ sở dữ liệu</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map((student, index) => {
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
}

function filterStudents() {
    const input = $("student-search-input");
    if (!input) return;
    const query = input.value.trim().toLowerCase();

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

        const [statsRes, logsRes] = await Promise.all([
            fetch(`/api/attendance/stats${queryParams}`),
            fetch(`/api/attendance${queryParams}&limit=50`)
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
        if (log.status === "DUNG_GIO") {
            statusBadge = `<span class="status-badge ontime">✓ Đúng giờ</span>`;
        } else if (log.status === "MUON") {
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
// INITIALIZATION
// ============================================================
const roomSelect = $("room-select");
if (roomSelect) {
    roomSelect.addEventListener("change", async function () {
        currentRoom = this.value;
        await loadRoom();
    });
}

const mobileMenu = $("mobile-menu");
if (mobileMenu) {
    mobileMenu.addEventListener("click", function () {
        const sidebar = document.querySelector(".sidebar");
        if (sidebar) sidebar.classList.toggle("open");
    });
}

// Close modal when clicking outside
window.addEventListener("click", function (event) {
    const modal = $("student-modal");
    if (modal && event.target === modal) {
        closeStudentModal();
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