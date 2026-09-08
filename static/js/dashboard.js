/**
 * Smart Classroom - Dashboard Controller
 * Covers: Dashboard (sensors, devices, chart) + RFID Log tab
 */

let currentRoom = null;
let temperatureChart = null;
const REFRESH_INTERVAL = 3000;
let currentTab = "rooms";
let toastTimer = null;
let currentControlMode = "MANUAL";

function $(id) { return document.getElementById(id); }

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
    } catch { return value; }
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
    } catch { return value; }
}

// ============================================================
// LIVE CLOCK
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
// SERVER STATUS
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
        if (topbarDot) topbarDot.className = "status-indicator-dot online";
        if (sidebarDot) sidebarDot.className = "system-dot online";
    } else {
        if (text) text.textContent = "Server Offline";
        if (sidebar) sidebar.textContent = "Offline";
        if (time) time.textContent = "Mất kết nối máy chủ";
        if (topbarDot) { topbarDot.className = "status-indicator-dot"; topbarDot.style.background = "var(--danger)"; }
        if (sidebarDot) { sidebarDot.className = "system-dot"; sidebarDot.style.background = "var(--danger)"; }
    }
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(title, message, success = true) {
    const toast = $("toast");
    const icon = $("toast-icon");
    const titleEl = $("toast-title");
    const msgEl = $("toast-message");
    if (!toast || !icon || !titleEl || !msgEl) return;

    titleEl.textContent = title;
    msgEl.textContent = message;
    icon.textContent = success ? "✓" : "!";
    icon.style.background = success ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)";
    icon.style.color = success ? "var(--success)" : "var(--danger)";
    icon.style.borderColor = success ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)";

    toast.classList.add("active", "show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("active", "show"), 3600);
}

// ============================================================
// MULTI-ROOM MANAGEMENT & STATUS CONTROLLER
// ============================================================
let allRooms = [];

/**
 * Đồng bộ trạng thái giao diện và phân quyền truy cập theo phòng đang chọn.
 * Khi chưa chọn phòng: Khóa Dashboard và RFID, chỉ cho phép chọn phòng từ Danh sách phòng.
 * Khi đã chọn phòng: Mở khóa Dashboard và RFID, cập nhật tên phòng hiện tại và nút Đổi phòng.
 */
function updateRoomAccessState() {
    const navDash = $("nav-dashboard");
    const navRfid = $("nav-rfid");
    const navSchedule = $("nav-schedule");
    const dashTag = $("nav-dashboard-tag");
    const rfidTag = $("nav-rfid-tag");
    const scheduleTag = $("nav-schedule-tag");
    const sidebarRoomBox = $("sidebar-current-room");
    const multiRoomBar = $("multi-room-bar");

    if (!currentRoom) {
        // --- CHƯA CHỌN PHÒNG: KHÓA DASHBOARD, RFID & THỜI KHÓA BIỂU ---
        if (navDash) {
            navDash.classList.add("disabled");
            navDash.setAttribute("title", "Chưa chọn phòng học. Vui lòng chọn 1 phòng trong danh sách trước.");
        }
        if (navRfid) {
            navRfid.classList.add("disabled");
            navRfid.setAttribute("title", "Chưa chọn phòng học. Vui lòng chọn 1 phòng trong danh sách trước.");
        }
        if (navSchedule) {
            navSchedule.classList.add("disabled");
            navSchedule.setAttribute("title", "Chưa chọn phòng học. Vui lòng chọn 1 phòng trong danh sách trước.");
        }
        if (dashTag) {
            dashTag.textContent = "🔒 Khóa";
            dashTag.className = "nav-tag locked";
        }
        if (rfidTag) {
            rfidTag.textContent = "🔒 Khóa";
            rfidTag.className = "nav-tag locked";
        }
        if (scheduleTag) {
            scheduleTag.textContent = "🔒 Khóa";
            scheduleTag.className = "nav-tag locked";
        }

        if (sidebarRoomBox) {
            sidebarRoomBox.innerHTML = `
                <div class="unselected-box">
                    <div style="font-size: 12px; font-weight: 700; color: var(--text-dim); display: flex; align-items: center; gap: 6px;">
                        <span style="color: var(--text-muted);">○</span> Chưa chọn phòng
                    </div>
                    <p class="unselected-hint">Chọn 1 phòng trong danh sách để mở Dashboard, Điểm danh và Thời khóa biểu.</p>
                </div>
            `;
        }

        if (multiRoomBar) {
            multiRoomBar.style.display = "none";
        }
    } else {
        // --- ĐÃ CHỌN PHÒNG: MỞ KHÓA DASHBOARD, RFID & THỜI KHÓA BIỂU ---
        if (navDash) {
            navDash.classList.remove("disabled");
            navDash.removeAttribute("title");
        }
        if (navRfid) {
            navRfid.classList.remove("disabled");
            navRfid.removeAttribute("title");
        }
        if (navSchedule) {
            navSchedule.classList.remove("disabled");
            navSchedule.removeAttribute("title");
        }
        if (dashTag) {
            dashTag.textContent = "LIVE";
            dashTag.className = "nav-tag live";
        }
        if (rfidTag) {
            rfidTag.textContent = "RFID";
            rfidTag.className = "nav-tag rfid";
        }
        if (scheduleTag) {
            scheduleTag.textContent = "TKB";
            scheduleTag.className = "nav-tag live";
        }

        const r = allRooms.find(x => x.room_id === currentRoom);
        const displayName = r && r.name ? r.name : `Phòng ${currentRoom}`;
        const isOnline = r ? Boolean(r.is_online) : false;

        if (sidebarRoomBox) {
            sidebarRoomBox.innerHTML = `
                <div class="selected-box">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <strong style="font-size: 13px; color: var(--text-pure); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px;">${escapeHtml(displayName)}</strong>
                        <span class="status-indicator-dot ${isOnline ? 'online' : ''}" style="width: 8px; height: 8px; flex-shrink: 0; background: ${isOnline ? 'var(--success)' : '#94a3b8'};"></span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                        <span>Mã: <strong style="color: var(--primary);">${escapeHtml(currentRoom)}</strong></span>
                        <span style="font-weight: 700; color: ${isOnline ? 'var(--success)' : '#64748b'};">${isOnline ? '● Online' : '○ Offline'}</span>
                    </div>
                    <button type="button" class="btn-change-room" onclick="exitRoomToPortal()" title="Quay lại danh sách các phòng để chọn phòng khác">
                        <span>←</span> Đổi phòng khác
                    </button>
                </div>
            `;
        }

        const barChip = $("multi-room-current-name");
        if (barChip) barChip.textContent = `${displayName} (${currentRoom})`;

        const rfidTagEl = $("rfid-active-room-tag");
        if (rfidTagEl) rfidTagEl.textContent = `${displayName} (${currentRoom})`;

        const schedTagEl = $("schedule-active-room-tag");
        if (schedTagEl) schedTagEl.textContent = `${displayName} (${currentRoom})`;
    }
}

/** Tương thích ngược */
function updateRoomUIHighlights(activeRoomId) {
    updateRoomAccessState();
}

/**
 * Hiển thị danh sách phòng học dạng thẻ trực quan.
 * Đây là nơi DUY NHẤT để người dùng chọn hoặc đổi sang phòng học khác.
 */
function renderRoomsPortal(rooms) {
    const grid = $("rooms-portal-grid");
    if (!grid) return;

    const totalEl = $("portal-total-chip");
    const onlineEl = $("portal-online-chip");
    const offlineEl = $("portal-offline-chip");
    const badgeEl = $("rooms-online-count-badge");

    const onlineCount = rooms.filter(r => r.is_online).length;
    const offlineCount = rooms.length - onlineCount;

    if (totalEl) totalEl.innerHTML = `TỔNG SỐ: <strong>${rooms.length}</strong> PHÒNG`;
    if (onlineEl) onlineEl.innerHTML = `● ONLINE: <strong>${onlineCount}</strong> PHÒNG`;
    if (offlineEl) offlineEl.innerHTML = `○ OFFLINE: <strong>${offlineCount}</strong> PHÒNG`;
    if (badgeEl) badgeEl.textContent = `${onlineCount} Online`;

    if (rooms.length === 0) {
        grid.innerHTML = `<div class="table-empty-cell" style="padding: 40px; text-align: center; color: var(--text-muted);">Không có phòng học nào trong cơ sở dữ liệu.</div>`;
        return;
    }

    grid.innerHTML = rooms.map(room => {
        const isOnline = Boolean(room.is_online);
        const displayName = room.name || room.room_id;
        const roomId = room.room_id;
        const mode = room.control_mode === "AUTO" ? "TỰ ĐỘNG (AUTO)" : "THỦ CÔNG (MANUAL)";

        if (isOnline) {
            return `
                <div class="room-portal-card online" onclick="selectRoomAndOpenDashboard('${escapeHtml(roomId)}')">
                    <div class="portal-card-header">
                        <div class="portal-card-title-group">
                            <div class="portal-room-icon">🏫</div>
                            <div>
                                <h3 class="portal-room-name">${escapeHtml(displayName)}</h3>
                                <span class="portal-room-id-tag">Mã: ${escapeHtml(roomId)}</span>
                            </div>
                        </div>
                        <span class="portal-status-badge online">
                            <span class="pulse-dot"></span> ONLINE
                        </span>
                    </div>
                    <div class="portal-card-body">
                        <div class="portal-info-row">
                            <span>Chế độ:</span>
                            <strong>${escapeHtml(mode)}</strong>
                        </div>
                        <div class="portal-info-row">
                            <span>Kết nối thiết bị:</span>
                            <strong style="color: var(--success);">● Sẵn sàng hoạt động</strong>
                        </div>
                        <div class="portal-info-row">
                            <span>Giao thức:</span>
                            <strong>MQTT LWT (Kết nối)</strong>
                        </div>
                    </div>
                    <button type="button" class="btn-portal-access online" onclick="event.stopPropagation(); selectRoomAndOpenDashboard('${escapeHtml(roomId)}')">
                        <span>Vào phòng học này</span>
                        <span>→</span>
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="room-portal-card offline" onclick="handleOfflineRoomClick('${escapeHtml(displayName)}', '${escapeHtml(roomId)}')">
                    <div class="portal-card-header">
                        <div class="portal-card-title-group">
                            <div class="portal-room-icon">🏫</div>
                            <div>
                                <h3 class="portal-room-name">${escapeHtml(displayName)}</h3>
                                <span class="portal-room-id-tag">Mã: ${escapeHtml(roomId)}</span>
                            </div>
                        </div>
                        <span class="portal-status-badge offline">
                            <span class="offline-dot"></span> OFFLINE
                        </span>
                    </div>
                    <div class="portal-card-body">
                        <div class="portal-info-row">
                            <span>Chế độ:</span>
                            <strong>--</strong>
                        </div>
                        <div class="portal-info-row">
                            <span>Kết nối thiết bị:</span>
                            <strong style="color: #64748b;">○ Mất kết nối MQTT</strong>
                        </div>
                        <div class="portal-info-row">
                            <span>Trạng thái:</span>
                            <strong style="color: #94a3b8;">Không thể truy cập</strong>
                        </div>
                    </div>
                    <button type="button" class="btn-portal-access offline" disabled onclick="event.stopPropagation(); handleOfflineRoomClick('${escapeHtml(displayName)}', '${escapeHtml(roomId)}')">
                        <span>🚫 Không thể truy cập (Offline)</span>
                    </button>
                </div>
            `;
        }
    }).join("");
}

function handleOfflineRoomClick(roomName, roomId) {
    showToast("Phòng Offline", `Phòng ${roomName || roomId} (${roomId}) hiện đang Offline (Mất kết nối MQTT/ESP32). Không thể truy cập!`, false);
}

/**
 * Chọn một phòng học cụ thể và mở Dashboard giám sát.
 * Chỉ hoạt động khi phòng ở trạng thái ONLINE.
 */
function selectRoomAndOpenDashboard(roomId) {
    const room = allRooms.find(r => r.room_id === roomId);
    if (!room) return;
    if (!room.is_online) {
        handleOfflineRoomClick(room.name || roomId, roomId);
        return;
    }
    currentRoom = roomId;
    lastScheduleHash = "";
    updateRoomAccessState();
    switchView("dashboard");
    showToast("Đã chọn phòng", `Đang quản lý ${room.name || roomId} (${roomId})`, true);
}

/**
 * Rời khỏi phòng hiện tại để quay lại danh sách chọn phòng.
 * Khóa quyền truy cập Dashboard và Điểm danh cho đến khi chọn phòng mới.
 */
function exitRoomToPortal() {
    currentRoom = null;
    lastScheduleHash = "";
    updateRoomAccessState();
    switchView("rooms");
    showToast("Danh sách phòng", "Vui lòng chọn một phòng học để tiếp tục", true);
}

window.selectRoomAndOpenDashboard = selectRoomAndOpenDashboard;
window.exitRoomToPortal = exitRoomToPortal;
window.handleOfflineRoomClick = handleOfflineRoomClick;

async function loadRooms() {
    try {
        const response = await fetch("/api/rooms");
        if (!response.ok) throw new Error("Không thể lấy danh sách phòng");
        const data = await response.json();
        setServerStatus(true);

        let rooms = [];
        if (Array.isArray(data)) rooms = data;
        else if (Array.isArray(data.data)) rooms = data.data;
        else if (Array.isArray(data.rooms)) rooms = data.rooms;

        allRooms = rooms;
        renderRoomsPortal(rooms);
        updateRoomAccessState();
    } catch (error) {
        console.error("LOAD ROOMS ERROR:", error);
        setServerStatus(false);
    }
}




async function loadRoom() {
    if (!currentRoom) return;
    const curObj = allRooms.find(r => r.room_id === currentRoom);
    const isOnline = curObj ? Boolean(curObj.is_online) : false;

    const banner = $("room-offline-banner");
    const statusBadge = $("room-status-badge");

    if (banner) {
        banner.style.display = isOnline ? "none" : "flex";
    }
    if (statusBadge) {
        if (isOnline) {
            statusBadge.textContent = "● ONLINE";
            statusBadge.className = "meta-chip active-chip";
            statusBadge.style = "";
        } else {
            statusBadge.textContent = "○ OFFLINE";
            statusBadge.className = "meta-chip";
            statusBadge.style.background = "#f1f5f9";
            statusBadge.style.color = "#64748b";
            statusBadge.style.borderColor = "#cbd5e1";
        }
    }

    try {
        const response = await fetch(`/api/rooms/${currentRoom}`);
        if (!response.ok) throw new Error("Không thể lấy thông tin phòng");
        const result = await response.json();
        const room = result.data || result;
        setServerStatus(true);
        if ($("room-id")) $("room-id").textContent = room.room_id || currentRoom;
        if ($("room-name")) $("room-name").textContent = room.name || `Phòng ${currentRoom}`;
        updateRoomUIHighlights(currentRoom);
    } catch (error) {
        console.error("LOAD ROOM ERROR:", error);
    }

    if (isOnline) {
        await Promise.all([
            loadSensors(),
            loadDevices(),
            loadTemperatureHistory(),
            loadRoomMode(),
            loadActiveSession(currentRoom)
        ]);
    }
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
            const humPercent = Math.max(0, Math.min(100, numericValue));
            if ($("humidity-progress")) $("humidity-progress").style.width = `${humPercent}%`;
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
    const el = $("temperature-status");
    if (!el) return;
    if (value >= 35) { el.textContent = "HIGH"; el.className = "sensor-status-tag danger"; }
    else if (value >= 30) { el.textContent = "WARM"; el.className = "sensor-status-tag warning"; }
    else { el.textContent = "NORMAL"; el.className = "sensor-status-tag normal"; }
}

function updateHumidityStatus(value) {
    const el = $("humidity-status");
    if (!el) return;
    if (value < 30 || value > 80) { el.textContent = "WARNING"; el.className = "sensor-status-tag warning"; }
    else { el.textContent = "NORMAL"; el.className = "sensor-status-tag normal"; }
}

function updateGasStatus(value) {
    const el = $("gas-status");
    if (!el) return;
    const progress = Math.min(100, (value / 1500) * 100);
    const progressEl = $("gas-progress");
    if (progressEl) progressEl.style.width = `${progress}%`;
    if (value >= 1500) { el.textContent = "DANGER"; el.className = "sensor-status-tag danger"; addGasAlert(value); }
    else if (value >= 1000) { el.textContent = "WARNING"; el.className = "sensor-status-tag warning"; }
    else { el.textContent = "NORMAL"; el.className = "sensor-status-tag normal"; }
}

function updateLightStatus(value) {
    const el = $("light-status");
    if (!el) return;
    if (value < 250) { el.textContent = "DARK (BẬT ĐÈN)"; el.className = "sensor-status-tag warning"; }
    else if (value > 600) { el.textContent = "BRIGHT (SÁNG)"; el.className = "sensor-status-tag normal"; }
    else { el.textContent = "NORMAL"; el.className = "sensor-status-tag normal"; }
}

function updateDoor(isOpen, time) {
    const value = $("door-value");
    const visual = $("door-visual");
    const status = $("door-status");
    const summary = $("summary-door");
    const timeEl = $("door-time");
    if (!value || !visual || !status) return;

    if (summary) summary.textContent = isOpen ? "Đã quẹt thẻ" : "Sẵn sàng";
    if (timeEl) timeEl.textContent = formatTime(time);

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
    const stateEl = $(`${deviceName}-state`);
    const textEl = $(`${deviceName}-text`);
    const card = $(`device-card-${deviceName}`);
    if (!stateEl || !textEl) return;

    if (normalized === "ON") {
        stateEl.textContent = "ON"; stateEl.className = "device-status-badge on";
        textEl.textContent = "Đang bật"; textEl.style.color = "var(--success)";
        if (card) card.classList.add("device-on");
    } else {
        stateEl.textContent = "OFF"; stateEl.className = "device-status-badge";
        textEl.textContent = "Đang tắt"; textEl.style.color = "var(--text-dim)";
        if (card) card.classList.remove("device-on");
    }
}

async function sendCommand(deviceName, command) {
    if (!currentRoom) { showToast("Lỗi", "Chưa chọn phòng học", false); return; }
    const curObj = allRooms.find(r => r.room_id === currentRoom);
    if (curObj && !curObj.is_online) {
        showToast("Phòng Offline", `Phòng ${currentRoom} hiện đang Offline, không thể điều khiển thiết bị!`, false);
        return;
    }
    try {
        showToast("Đang gửi lệnh", `${deviceName.toUpperCase()} → ${command}`, true);
        const response = await fetch(`/api/rooms/${currentRoom}/devices/${deviceName}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Không thể gửi lệnh");
        showToast("Đã gửi lệnh", `${deviceName.toUpperCase()} → ${command}. Chờ phản hồi...`, true);
        setTimeout(async () => await Promise.all([loadDevices(), loadRoomMode()]), 800);
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
        currentControlMode = (data.mode || "MANUAL").toUpperCase();
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
        if (chipMode) { chipMode.textContent = "CHẾ ĐỘ: TỰ ĐỘNG (AUTO)"; chipMode.className = "meta-chip active-chip"; }
    } else {
        if (btnManual) btnManual.classList.add("active");
        if (btnAuto) btnAuto.classList.remove("active");
        if (infoBanner) infoBanner.style.display = "none";
        if (chipMode) { chipMode.textContent = "CHẾ ĐỘ: THỦ CÔNG (MANUAL)"; chipMode.className = "meta-chip"; }
    }
}

async function setRoomMode(mode) {
    if (!currentRoom) { showToast("Lỗi", "Chưa chọn phòng học", false); return; }
    const curObj = allRooms.find(r => r.room_id === currentRoom);
    if (curObj && !curObj.is_online) {
        showToast("Phòng Offline", `Phòng ${currentRoom} hiện đang Offline, không thể thay đổi chế độ!`, false);
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
        if (temperatureChart) { temperatureChart.destroy(); temperatureChart = null; }
        return;
    }

    if (empty) empty.style.display = "none";

    const labels = [], values = [];
    history.forEach(item => {
        const value = item.value ?? item.sensor_value;
        const time = item.recorded_at || item.created_at || item.time;
        if (value !== undefined && value !== null) {
            labels.push(formatTime(time));
            values.push(Number(value));
        }
    });

    if (values.length === 0) { if (empty) empty.style.display = "flex"; return; }
    if (temperatureChart) temperatureChart.destroy();

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, "rgba(37, 99, 235, 0.18)");
    gradient.addColorStop(1, "rgba(37, 99, 235, 0.0)");

    temperatureChart = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Nhiệt độ (°C)",
                data: values,
                tension: 0.38,
                fill: true,
                backgroundColor: gradient,
                borderColor: "#2563eb",
                borderWidth: 2.5,
                pointBackgroundColor: "#2563eb",
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                pointRadius: 3.5,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0f172a",
                    titleColor: "#ffffff",
                    bodyColor: "#60a5fa",
                    borderColor: "rgba(37, 99, 235, 0.3)",
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: { label: ctx => `${ctx.parsed.y} °C` }
                }
            },
            scales: {
                x: { ticks: { color: "#64748b", maxTicksLimit: 7, font: { size: 10, family: "Inter" } }, grid: { color: "rgba(0,0,0,0.04)" } },
                y: { ticks: { color: "#64748b", font: { size: 10, family: "Inter" } }, grid: { color: "rgba(0,0,0,0.04)" } }
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
// TAB NAVIGATION
// ============================================================
function setupTabNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", function(e) {
            e.preventDefault();
            const targetTab = this.getAttribute("data-tab");

            // Chặn tuyệt đối truy cập Dashboard, Điểm danh & Thời khóa biểu nếu chưa chọn phòng cụ thể
            if (targetTab === "dashboard" || targetTab === "rfid" || targetTab === "schedule") {
                if (!currentRoom) {
                    showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học cụ thể trong Danh Sách Phòng trước!", false);
                    return;
                }
            }

            // Nếu người dùng chủ động bấm vào "Danh sách phòng" từ sidebar:
            // Trả về màn hình danh sách và cho phép chọn lại phòng
            if (targetTab === "rooms") {
                exitRoomToPortal();
                toggleMobileMenu(false);
                return;
            }

            switchView(targetTab);
            setActiveNav(this);
            toggleMobileMenu(false);
        });
    });

    // Init date filter to today
    const dateFilter = $("rfid-date-filter");
    if (dateFilter) {
        dateFilter.value = new Date().toISOString().split("T")[0];
    }
}

function setActiveNav(activeElement) {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => item.classList.remove("active"));
    if (activeElement) activeElement.classList.add("active");
}

function switchView(tabName) {
    // --- Guard: Dashboard, RFID & Schedule đều yêu cầu phải chọn phòng trước ---
    if (tabName === "dashboard" || tabName === "rfid" || tabName === "schedule") {
        if (!currentRoom) {
            showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học từ danh sách trước!", false);
            tabName = "rooms"; // Bắt buộc quay về danh sách phòng
        }
    }

    currentTab = tabName;
    const roomsView = $("rooms-view");
    const dashView = $("dashboard-view");
    const rfidView = $("rfid-view");
    const scheduleView = $("schedule-view");
    const multiRoomBar = $("multi-room-bar");
    const breadcrumb = $("topbar-breadcrumb");
    const pageTitle = $("topbar-page-title");

    if (roomsView) roomsView.style.display = "none";
    if (dashView) dashView.style.display = "none";
    if (rfidView) rfidView.style.display = "none";
    if (scheduleView) scheduleView.style.display = "none";

    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
        item.classList.toggle("active", item.getAttribute("data-tab") === tabName);
    });

    const r = allRooms.find(x => x.room_id === currentRoom);
    const roomDisplayName = r && r.name ? r.name : (currentRoom || "");

    if (tabName === "rooms") {
        if (roomsView) roomsView.style.display = "block";
        if (multiRoomBar) multiRoomBar.style.display = "none";
        if (breadcrumb) breadcrumb.textContent = "HỆ THỐNG / CHỌN PHÒNG HỌC";
        if (pageTitle) pageTitle.textContent = "Danh Sách Phòng Học";
        renderRoomsPortal(allRooms);
    } else if (tabName === "rfid") {
        if (rfidView) rfidView.style.display = "block";
        if (multiRoomBar) multiRoomBar.style.display = "flex";
        if (breadcrumb) breadcrumb.textContent = `PHÒNG: ${roomDisplayName.toUpperCase()} / ĐIỂM DANH`;
        if (pageTitle) pageTitle.textContent = `Điểm Danh & Nhật Ký Thẻ - ${roomDisplayName}`;
        loadActiveSession(currentRoom);
        if (activeAttendanceSubTab === "raw") {
            loadRfidLog();
        }
    } else if (tabName === "schedule") {
        if (scheduleView) scheduleView.style.display = "block";
        if (multiRoomBar) multiRoomBar.style.display = "flex";
        if (breadcrumb) breadcrumb.textContent = `PHÒNG: ${roomDisplayName.toUpperCase()} / THỜI KHÓA BIỂU`;
        if (pageTitle) pageTitle.textContent = `Thời Khóa Biểu - ${roomDisplayName}`;
        loadRoomSchedule(currentRoom, false);
    } else {
        if (dashView) dashView.style.display = "block";
        if (multiRoomBar) multiRoomBar.style.display = "flex";
        if (breadcrumb) breadcrumb.textContent = `PHÒNG: ${roomDisplayName.toUpperCase()} / DASHBOARD`;
        if (pageTitle) pageTitle.textContent = `Dashboard - ${roomDisplayName}`;
        loadRoom();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// RFID SCAN LOG
// ============================================================
async function loadRfidLog() {
    const dateFilter = $("rfid-date-filter");
    const tbody = $("rfid-log-body");
    if (!tbody) return;

    let url = "/api/rfid-log?limit=100";
    if (currentRoom) url += `&room_id=${encodeURIComponent(currentRoom)}`;
    if (dateFilter && dateFilter.value) url += `&date=${encodeURIComponent(dateFilter.value)}`;

    tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell">Đang tải nhật ký...</td></tr>`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Không thể tải nhật ký RFID");
        const res = await response.json();
        const logs = res.data || [];

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell">Không có dữ liệu quét thẻ.</td></tr>`;
            return;
        }

        const statusMap = {
            DUNG_GIO: { label: "Đúng giờ", cls: "ontime" },
            DI_MUON:  { label: "Đi muộn",  cls: "late" },
            CHUA_DANG_KY: { label: "Thẻ chưa đăng ký", cls: "absent" },
            NORMAL: { label: "Bình thường", cls: "ontime" }
        };

        tbody.innerHTML = logs.map(log => {
            const s = statusMap[log.status] || { label: log.status, cls: "" };
            return `
                <tr>
                    <td><strong>${formatFullDateTime(log.recorded_at)}</strong></td>
                    <td><span class="room-pill-id">${escapeHtml(log.room_id || "--")}</span></td>
                    <td>${escapeHtml(log.full_name || "--")}</td>
                    <td><span class="card-uid-pill" style="font-size:12px; padding: 2px 7px;">${escapeHtml(log.student_code || "--")}</span></td>
                    <td>${escapeHtml(log.class_name || "--")}</td>
                    <td><span class="card-uid-pill">🪪 ${escapeHtml(log.card_uid || "--")}</span></td>
                    <td>${escapeHtml(log.event_type || "--")}</td>
                    <td><span class="status-badge ${s.cls}">${escapeHtml(s.label)}</span></td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        console.error("RFID LOG ERROR:", error);
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell" style="color:var(--danger)">Lỗi tải nhật ký: ${error.message}</td></tr>`;
    }
}

function toggleRfidAllDates(showAll) {
    const dateFilter = $("rfid-date-filter");
    if (!dateFilter) return;
    if (showAll) {
        dateFilter.value = "";
        dateFilter.disabled = true;
    } else {
        dateFilter.disabled = false;
        dateFilter.value = new Date().toISOString().split("T")[0];
    }
    loadRfidLog();
}

// ============================================================
// OFFICIAL ATTENDANCE & ACTIVE CLASS SESSIONS
// ============================================================
let currentActiveSession = null;
let activeAttendanceSubTab = "session";

function formatLateThreshold(startTimeStr, lateMinutes) {
    if (!startTimeStr) return "--:--";
    try {
        const parts = startTimeStr.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const totalM = h * 60 + m + (parseInt(lateMinutes, 10) || 15);
        const endH = Math.floor(totalM / 60) % 24;
        const endM = totalM % 60;
        return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    } catch {
        return "--:--";
    }
}

function extractTimeOnly(val) {
    if (!val) return "--:--";
    const str = String(val).trim();
    if (str.includes("T")) {
        return str.split("T")[1].substring(0, 5);
    }
    if (str.includes(" ")) {
        return str.split(" ")[1].substring(0, 5);
    }
    return str.substring(0, 5);
}

function switchAttendanceSubTab(tab) {
    activeAttendanceSubTab = tab;
    const btnSession = $("subtab-session-btn");
    const btnRaw = $("subtab-raw-btn");
    const panelSession = $("subpanel-session-attendance");
    const panelRaw = $("subpanel-raw-rfid");

    if (tab === "session") {
        if (btnSession) btnSession.classList.add("active");
        if (btnRaw) btnRaw.classList.remove("active");
        if (panelSession) panelSession.style.display = "block";
        if (panelRaw) panelRaw.style.display = "none";
        refreshSessionAttendance();
    } else {
        if (btnSession) btnSession.classList.remove("active");
        if (btnRaw) btnRaw.classList.add("active");
        if (panelSession) panelSession.style.display = "none";
        if (panelRaw) panelRaw.style.display = "block";
        loadRfidLog();
    }
}
window.switchAttendanceSubTab = switchAttendanceSubTab;

async function loadActiveSession(roomId) {
    if (!roomId) return;
    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/active-session`);
        if (!response.ok) throw new Error("Không thể kiểm tra buổi học hiện tại");
        const res = await response.json();
        const session = res.data;

        const dashBanner = $("dash-active-session");
        const rfidBadge = $("rfid-session-status-badge");
        const rfidSubject = $("rfid-session-subject");
        const rfidClass = $("rfid-session-class");
        const rfidTeacher = $("rfid-session-teacher");
        const rfidTimeChip = $("rfid-session-time-chip");
        const rfidLateTime = $("rfid-session-late-time");
        const sessionTableTitle = $("session-table-title");

        if (!session) {
            currentActiveSession = null;
            if (dashBanner) dashBanner.style.display = "none";
            if (rfidBadge) {
                rfidBadge.className = "session-status-badge inactive";
                rfidBadge.innerHTML = "○ KHÔNG CÓ BUỔI HỌC";
            }
            if (rfidSubject) rfidSubject.textContent = "Hiện không có buổi học nào đang diễn ra trong phòng này";
            if (rfidClass) rfidClass.textContent = "--";
            if (rfidTeacher) rfidTeacher.textContent = "--";
            if (rfidTimeChip) rfidTimeChip.textContent = "--:-- - --:--";
            if (rfidLateTime) rfidLateTime.textContent = "--:--";
            if (sessionTableTitle) sessionTableTitle.textContent = "Danh Sách Học Viên & Trạng Thái Điểm Danh";

            const statTotal = $("stat-total-students");
            const statPresent = $("stat-present-students");
            const statLate = $("stat-late-students");
            const statAbsent = $("stat-absent-students");
            const subtabCount = $("subtab-session-count");

            if (statTotal) statTotal.textContent = "0";
            if (statPresent) statPresent.textContent = "0";
            if (statLate) statLate.textContent = "0";
            if (statAbsent) statAbsent.textContent = "0";
            if (subtabCount) subtabCount.textContent = "0";

            const tbody = $("session-attendance-body");
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="table-empty-cell" style="padding: 30px;">
                            Hiện tại phòng học này không có buổi học nào đang diễn ra theo thời khóa biểu.<br>
                            <small style="color: var(--text-muted); font-size: 11px; margin-top: 4px; display: inline-block;">
                                Hệ thống sẽ tự động kích hoạt phiên điểm danh khi tới khung giờ học. Bạn có thể sang mục <strong>Thời khóa biểu</strong> để xem hoặc thêm lịch.
                            </small>
                        </td>
                    </tr>
                `;
            }
            return;
        }

        currentActiveSession = session;
        const startStr = extractTimeOnly(session.starts_at || session.start_time);
        const endStr = extractTimeOnly(session.ends_at || session.end_time);
        const lateStr = session.late_after_at
            ? extractTimeOnly(session.late_after_at)
            : formatLateThreshold(session.starts_at || session.start_time, session.late_threshold_minutes || session.late_after_minutes || 15);
        const classDisplay = session.class_code || session.class_id || '--';
        const teacherDisplay = session.teacher_name || "Chưa phân công";
        const subjectDisplay = session.subject_name || "Đang diễn ra";

        // Update Dashboard banner
        if (dashBanner) {
            dashBanner.style.display = "flex";
            const sSub = $("dash-session-subject");
            const sCls = $("dash-session-class");
            const sTime = $("dash-session-time");
            if (sSub) sSub.textContent = `Môn học: ${subjectDisplay}`;
            if (sCls) sCls.textContent = `Lớp: ${classDisplay}`;
            if (sTime) {
                sTime.textContent = `🕒 Ca học: ${startStr} - ${endStr} · Hạn đúng giờ: ${lateStr}`;
            }
        }

        // Update RFID view session card
        if (rfidBadge) {
            rfidBadge.className = "session-status-badge";
            rfidBadge.innerHTML = `<span class="pulse-dot"></span> ĐANG DIỄN RA`;
        }
        if (rfidSubject) rfidSubject.textContent = `${subjectDisplay} (${classDisplay})`;
        if (rfidClass) rfidClass.textContent = classDisplay;
        if (rfidTeacher) rfidTeacher.textContent = teacherDisplay;
        if (rfidTimeChip) {
            rfidTimeChip.textContent = `${startStr} - ${endStr}`;
        }
        if (rfidLateTime) {
            rfidLateTime.textContent = lateStr;
        }
        if (sessionTableTitle) {
            sessionTableTitle.textContent = `Điểm Danh Lớp ${classDisplay} - Môn ${subjectDisplay}`;
        }

        const sid = session.session_id || session.id;
        await loadSessionAttendance(sid);
    } catch (error) {
        console.error("LOAD ACTIVE SESSION ERROR:", error);
    }
}

async function loadSessionAttendance(sessionId) {
    if (!sessionId) return;
    const tbody = $("session-attendance-body");
    try {
        const response = await fetch(`/api/sessions/${sessionId}/attendance`);
        if (!response.ok) throw new Error("Không thể tải danh sách điểm danh");
        const res = await response.json();
        const summary = res.summary || {};
        const records = res.records || [];

        const statTotal = $("stat-total-students");
        const statPresent = $("stat-present-students");
        const statLate = $("stat-late-students");
        const statAbsent = $("stat-absent-students");
        const subtabCount = $("subtab-session-count");

        if (statTotal) statTotal.textContent = summary.total_students ?? records.length;
        if (statPresent) statPresent.textContent = summary.present_count ?? 0;
        if (statLate) statLate.textContent = summary.late_count ?? 0;
        if (statAbsent) statAbsent.textContent = summary.absent_count ?? 0;

        const checkedIn = (summary.present_count || 0) + (summary.late_count || 0);
        if (subtabCount) subtabCount.textContent = `${checkedIn}/${summary.total_students || records.length}`;

        if (!tbody) return;
        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell">Lớp học này chưa có danh sách học viên trong cơ sở dữ liệu.</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map((r, idx) => {
            let statusBadge = "";
            if (r.status === "PRESENT") {
                statusBadge = `<span class="status-badge ontime">✓ Đúng giờ</span>`;
            } else if (r.status === "LATE") {
                statusBadge = `<span class="status-badge late">⚠️ Đi muộn</span>`;
            } else {
                statusBadge = `<span class="status-badge absent">○ Chưa có mặt</span>`;
            }

            const checkInText = r.check_in_time ? `<strong>${formatFullDateTime(r.check_in_time)}</strong>` : `<span style="color:var(--text-muted); font-size:12px;">Chưa quẹt thẻ</span>`;

            let methodBadge = "--";
            if (r.source === "RFID") {
                methodBadge = `<span class="mini-pill total">🪪 Quẹt thẻ RFID</span>`;
            } else if (r.source === "MANUAL") {
                methodBadge = `<span class="mini-pill excused">✍️ Thủ công</span>`;
            } else if (r.source === "AUTO") {
                methodBadge = `<span class="mini-pill present">⚙️ Tự động</span>`;
            }

            return `
                <tr>
                    <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
                    <td><span class="card-uid-pill" style="font-size: 11px; padding: 2px 7px;">${escapeHtml(r.student_code || '--')}</span></td>
                    <td>
                        <div class="student-name-meta">
                            <strong>${escapeHtml(r.full_name || '--')}</strong>
                            <small>Mã thẻ: ${escapeHtml(r.card_uid || 'Chưa gắn thẻ')}</small>
                        </div>
                    </td>
                    <td><strong>${escapeHtml(r.class_id || '--')}</strong></td>
                    <td>${statusBadge}</td>
                    <td>${checkInText}</td>
                    <td>${methodBadge}</td>
                </tr>
            `;
        }).join("");

    } catch (error) {
        console.error("LOAD SESSION ATTENDANCE ERROR:", error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell" style="color:var(--danger)">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
        }
    }
}

function refreshSessionAttendance() {
    if (currentActiveSession) {
        loadSessionAttendance(currentActiveSession.session_id);
    } else if (currentRoom) {
        loadActiveSession(currentRoom);
    }
}
window.refreshSessionAttendance = refreshSessionAttendance;

// ============================================================
// TIMETABLE (THỜI KHÓA BIỂU)
// ============================================================
const DAY_NAMES = [
    { id: 1, name: "Thứ Hai" },
    { id: 2, name: "Thứ Ba" },
    { id: 3, name: "Thứ Tư" },
    { id: 4, name: "Thứ Năm" },
    { id: 5, name: "Thứ Sáu" },
    { id: 6, name: "Thứ Bảy" },
    { id: 7, name: "Chủ Nhật" }
];

function getShiftClass(startTimeStr) {
    if (!startTimeStr) return "shift-morning";
    const h = parseInt(startTimeStr.split(":")[0], 10);
    if (h < 12) return "shift-morning";
    if (h < 18) return "shift-afternoon";
    return "shift-evening";
}

let lastScheduleHash = "";

async function loadRoomSchedule(roomId, isBackground = false) {
    if (!roomId) return;
    const grid = $("timetable-week-grid");
    const totalChip = $("schedule-total-classes-chip");
    if (!grid) return;

    // Chỉ hiển thị placeholder "Đang tải..." khi lưới chưa có nội dung và không phải là làm mới ngầm
    const hasExistingContent = grid.children.length > 0 && !grid.querySelector(".table-empty-cell");
    if (!isBackground && !hasExistingContent) {
        grid.innerHTML = `<div class="table-empty-cell" style="grid-column: 1 / -1; padding: 40px; text-align: center;">Đang tải thời khóa biểu phòng...</div>`;
    }

    try {
        const response = await fetch(`/api/schedules?room_id=${encodeURIComponent(roomId)}`);
        if (!response.ok) {
            let errText = "Không thể tải thời khóa biểu";
            try {
                const errData = await response.json();
                if (errData && (errData.message || errData.error)) {
                    errText = errData.message || errData.error;
                }
            } catch (_) {}
            throw new Error(errText);
        }
        const res = await response.json();
        const schedules = res.data || [];

        // So sánh dữ liệu kèm mốc phút hiện tại (để cập nhật nhãn Đang học/Sắp tới/Đã học đúng lúc)
        const currentMinute = Math.floor(Date.now() / 60000);
        const dataHash = `${roomId}_${JSON.stringify(schedules)}_${currentMinute}`;
        if (isBackground && hasExistingContent && dataHash === lastScheduleHash) {
            return; // Dữ liệu và trạng thái ca học không thay đổi -> không vẽ lại DOM để tránh giật lag
        }
        lastScheduleHash = dataHash;

        if (totalChip) totalChip.textContent = `${schedules.length} BUỔI / TUẦN`;

        const jsDay = new Date().getDay(); // 0 is Sunday, 1 is Monday...
        const todayDayOfWeek = jsDay === 0 ? 7 : jsDay;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        // Helper chuẩn hoá chuỗi giờ HH:MM
        const formatHM = (str) => {
            if (!str) return "--:--";
            const parts = String(str).split(":");
            if (parts.length >= 2) {
                return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
            }
            return str;
        };

        grid.innerHTML = DAY_NAMES.map(day => {
            // Lọc theo cả weekday và day_of_week
            const daySchedules = schedules.filter(s => {
                const dayVal = s.weekday !== undefined ? s.weekday : s.day_of_week;
                return Number(dayVal) === day.id;
            });
            const isToday = day.id === todayDayOfWeek;

            const cardsHtml = daySchedules.length === 0
                ? `<div class="schedule-empty-day">Không có lịch học</div>`
                : daySchedules.map(s => {
                    const shiftCls = getShiftClass(s.start_time);
                    const startStr = formatHM(s.start_time);
                    const endStr = formatHM(s.end_time);

                    let statusBadge = "";
                    if (isToday && s.start_time && s.end_time) {
                        const sParts = String(s.start_time).split(":");
                        const eParts = String(s.end_time).split(":");
                        const sMin = parseInt(sParts[0], 10) * 60 + parseInt(sParts[1], 10);
                        const eMin = parseInt(eParts[0], 10) * 60 + parseInt(eParts[1], 10);

                        if (nowMinutes >= sMin && nowMinutes <= eMin) {
                            statusBadge = `<span class="mini-pill present" style="font-size: 10px;">● Đang học</span>`;
                        } else if (nowMinutes < sMin) {
                            statusBadge = `<span class="mini-pill total" style="font-size: 10px;">Sắp tới</span>`;
                        } else {
                            statusBadge = `<span class="mini-pill absent" style="font-size: 10px;">Đã học</span>`;
                        }
                    }

                    const schedId = s.id !== undefined ? s.id : s.schedule_id;
                    const classDisplay = s.class_code || s.class_id || "--";
                    const lateMins = s.late_after_minutes !== undefined ? s.late_after_minutes : (s.late_threshold_minutes || 15);

                    return `
                        <div class="schedule-item-card ${shiftCls}">
                            <div class="schedule-item-time">
                                <span>🕒 ${startStr} - ${endStr}</span>
                                ${statusBadge}
                            </div>
                            <div class="schedule-item-subject">${escapeHtml(s.subject_name || '--')}</div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
                                <span class="schedule-item-class">${escapeHtml(classDisplay)}</span>
                                <button type="button" onclick="event.stopPropagation(); deleteSchedule(${schedId})"
                                        style="color: var(--text-muted); font-size: 13px; padding: 2px 4px; border-radius: 4px; line-height: 1; background: transparent; border: none; cursor: pointer;"
                                        title="Xóa lịch học này" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-muted)'">
                                    🗑️
                                </button>
                            </div>
                            <div class="schedule-item-meta">
                                <span>👨‍🏫 ${escapeHtml(s.teacher_name || 'Chưa phân công')}</span>
                                <span>⏱️ Trễ &gt; ${lateMins}p tính muộn</span>
                            </div>
                        </div>
                    `;
                }).join("");

            return `
                <div class="schedule-day-column ${isToday ? 'is-today' : ''}">
                    <div class="schedule-day-header">
                        <span class="schedule-day-title">${day.name} ${isToday ? '(Hôm nay)' : ''}</span>
                        <span class="schedule-day-count">${daySchedules.length}</span>
                    </div>
                    <div class="schedule-card-list">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("LOAD ROOM SCHEDULE ERROR:", error);
        if (!isBackground && !hasExistingContent) {
            grid.innerHTML = `<div class="table-empty-cell" style="grid-column: 1 / -1; padding: 40px; color: var(--danger); text-align: center;">Lỗi tải lịch học: ${error.message}</div>`;
        }
    }
}

function openAddScheduleModal() {
    if (!currentRoom) {
        showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học trước khi thêm lịch!", false);
        return;
    }
    const roomInput = $("sched-room-id");
    const hint = $("modal-schedule-room-hint");
    const r = allRooms.find(x => x.room_id === currentRoom);
    const roomName = r && r.name ? r.name : currentRoom;

    if (roomInput) roomInput.value = currentRoom;
    if (hint) hint.textContent = `Phòng học: ${roomName} (${currentRoom})`;

    const modal = $("modal-add-schedule");
    if (modal) modal.style.display = "flex";
}

function closeAddScheduleModal() {
    const modal = $("modal-add-schedule");
    if (modal) modal.style.display = "none";
}

async function submitNewSchedule(e) {
    e.preventDefault();
    const roomId = $("sched-room-id")?.value || currentRoom;
    const classId = $("sched-class-id")?.value?.trim();
    const subject = $("sched-subject")?.value?.trim();
    const dayOfWeek = parseInt($("sched-day-of-week")?.value, 10);
    const teacher = $("sched-teacher")?.value?.trim() || "";
    const startTime = $("sched-start-time")?.value;
    const endTime = $("sched-end-time")?.value;
    const lateThreshold = parseInt($("sched-late-threshold")?.value, 10) || 15;

    if (!roomId || !classId || !subject || !startTime || !endTime) {
        showToast("Thiếu thông tin", "Vui lòng nhập đầy đủ các trường bắt buộc (*)", false);
        return;
    }

    if (startTime >= endTime) {
        showToast("Giờ không hợp lệ", "Giờ bắt đầu phải trước giờ kết thúc!", false);
        return;
    }

    const payload = {
        room_id: roomId,
        class_id: classId,
        subject_name: subject,
        day_of_week: dayOfWeek,
        weekday: dayOfWeek,
        teacher_name: teacher,
        start_time: startTime + ":00",
        end_time: endTime + ":00",
        late_threshold_minutes: lateThreshold,
        late_after_minutes: lateThreshold
    };

    try {
        const btn = $("btn-save-schedule");
        if (btn) btn.disabled = true;

        const response = await fetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const res = await response.json();

        if (!response.ok) {
            throw new Error(res.message || res.error || "Không thể tạo lịch học");
        }

        showToast("Thành công", `Đã thêm lịch môn ${subject} (${classId})`, true);
        closeAddScheduleModal();
        $("form-add-schedule")?.reset();
        lastScheduleHash = "";
        await loadRoomSchedule(roomId, false);
        await loadActiveSession(roomId);
    } catch (error) {
        console.error("SUBMIT SCHEDULE ERROR:", error);
        showToast("Lỗi", error.message, false);
    } finally {
        const btn = $("btn-save-schedule");
        if (btn) btn.disabled = false;
    }
}

async function deleteSchedule(scheduleId) {
    if (!scheduleId) {
        showToast("Lỗi", "Không tìm thấy mã lịch học cần xóa", false);
        return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa lịch học này?")) return;
    try {
        const response = await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
        const res = await response.json();
        if (!response.ok) throw new Error(res.message || res.error || "Không thể xóa lịch học");

        showToast("Đã xóa", "Lịch học đã được xóa thành công", true);
        lastScheduleHash = "";
        await loadRoomSchedule(currentRoom, false);
        await loadActiveSession(currentRoom);
    } catch (error) {
        console.error("DELETE SCHEDULE ERROR:", error);
        showToast("Lỗi", error.message, false);
    }
}

window.openAddScheduleModal = openAddScheduleModal;
window.closeAddScheduleModal = closeAddScheduleModal;
window.submitNewSchedule = submitNewSchedule;
window.deleteSchedule = deleteSchedule;
window.loadRoomSchedule = loadRoomSchedule;
window.loadActiveSession = loadActiveSession;

// ============================================================
// MOBILE MENU
// ============================================================
function toggleMobileMenu(open) {
    const sidebar = document.querySelector(".sidebar");
    const backdrop = $("sidebar-backdrop");
    if (open === undefined) {
        open = sidebar && !sidebar.classList.contains("open");
    }
    if (sidebar) sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.style.display = open ? "block" : "none";
}

const mobileBtn = $("mobile-menu");
if (mobileBtn) {
    mobileBtn.addEventListener("click", () => toggleMobileMenu());
}

// ============================================================
// AUTO-REFRESH
// ============================================================

/**
 * Đồng bộ trạng thái phòng hiện tại lên UI dashboard mỗi chu kỳ làm mới.
 * Cập nhật badge, banner offline, và khoá/mở khoá nút điều khiển.
 */
function updateCurrentRoomStatus() {
    if (!currentRoom) return;

    const curObj = allRooms.find(r => r.room_id === currentRoom);
    const isOnline = curObj ? Boolean(curObj.is_online) : false;

    // --- Badge trạng thái phòng ---
    const statusBadge = $("room-status-badge");
    if (statusBadge) {
        if (isOnline) {
            statusBadge.textContent = "● ONLINE";
            statusBadge.className = "meta-chip active-chip";
            statusBadge.removeAttribute("style");
        } else {
            statusBadge.textContent = "○ OFFLINE";
            statusBadge.className = "meta-chip";
            statusBadge.style.background = "#f1f5f9";
            statusBadge.style.color = "#64748b";
            statusBadge.style.borderColor = "#cbd5e1";
        }
    }

    // --- Biểu ngữ cảnh báo Offline ---
    const banner = $("room-offline-banner");
    if (banner) banner.style.display = isOnline ? "none" : "flex";

    // --- Khoá/mở khoá nút điều khiển thiết bị & chế độ ---
    document.querySelectorAll(".device-control-btn, .mode-btn, [data-device-btn]").forEach(btn => {
        btn.disabled = !isOnline;
        btn.title = isOnline ? "" : "Phòng đang Offline - không thể điều khiển";
    });
}

let refreshTick = 0;

function startAutoRefresh() {
    setInterval(async () => {
        refreshTick++;
        await loadRooms();
        if (currentRoom) {
            // Luôn đồng bộ trạng thái phòng hiện tại dù online hay offline
            updateCurrentRoomStatus();

            const curObj = allRooms.find(r => r.room_id === currentRoom);
            if (curObj && curObj.is_online) {
                if (currentTab === "dashboard") {
                    await loadSensors();
                    await loadDevices();
                    await loadActiveSession(currentRoom);
                } else if (currentTab === "rfid") {
                    if (activeAttendanceSubTab === "session") {
                        refreshSessionAttendance();
                    } else {
                        await loadRfidLog();
                    }
                } else if (currentTab === "schedule") {
                    // Kiểm tra làm mới ngầm mỗi ~12s (4 chu kỳ x 3s) và chỉ khi modal không mở
                    const modal = $("modal-add-schedule");
                    const isModalOpen = modal && modal.style.display !== "none";
                    if (!isModalOpen && refreshTick % 4 === 0) {
                        await loadRoomSchedule(currentRoom, true);
                    }
                }
            }
        }
    }, REFRESH_INTERVAL);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    setupTabNavigation();
    updateRoomAccessState(); // Khóa Dashboard & RFID ngay lập tức khi chưa chọn phòng
    await loadRooms();
    switchView("rooms");
    startAutoRefresh();
});