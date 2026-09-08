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
    const dashTag = $("nav-dashboard-tag");
    const rfidTag = $("nav-rfid-tag");
    const sidebarRoomBox = $("sidebar-current-room");
    const multiRoomBar = $("multi-room-bar");

    if (!currentRoom) {
        // --- CHƯA CHỌN PHÒNG: KHÓA DASHBOARD & RFID ---
        if (navDash) {
            navDash.classList.add("disabled");
            navDash.setAttribute("title", "Chưa chọn phòng học. Vui lòng chọn 1 phòng trong danh sách trước.");
        }
        if (navRfid) {
            navRfid.classList.add("disabled");
            navRfid.setAttribute("title", "Chưa chọn phòng học. Vui lòng chọn 1 phòng trong danh sách trước.");
        }
        if (dashTag) {
            dashTag.textContent = "🔒 Khóa";
            dashTag.className = "nav-tag locked";
        }
        if (rfidTag) {
            rfidTag.textContent = "🔒 Khóa";
            rfidTag.className = "nav-tag locked";
        }

        if (sidebarRoomBox) {
            sidebarRoomBox.innerHTML = `
                <div class="unselected-box">
                    <div style="font-size: 12px; font-weight: 700; color: var(--text-dim); display: flex; align-items: center; gap: 6px;">
                        <span style="color: var(--text-muted);">○</span> Chưa chọn phòng
                    </div>
                    <p class="unselected-hint">Chọn 1 phòng trong danh sách để mở Dashboard và Điểm danh RFID.</p>
                </div>
            `;
        }

        if (multiRoomBar) {
            multiRoomBar.style.display = "none";
        }
    } else {
        // --- ĐÃ CHỌN PHÒNG: MỞ KHÓA DASHBOARD & RFID ---
        if (navDash) {
            navDash.classList.remove("disabled");
            navDash.removeAttribute("title");
        }
        if (navRfid) {
            navRfid.classList.remove("disabled");
            navRfid.removeAttribute("title");
        }
        if (dashTag) {
            dashTag.textContent = "LIVE";
            dashTag.className = "nav-tag live";
        }
        if (rfidTag) {
            rfidTag.textContent = "RFID";
            rfidTag.className = "nav-tag rfid";
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
        await Promise.all([loadSensors(), loadDevices(), loadTemperatureHistory(), loadRoomMode()]);
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

            // Chặn tuyệt đối truy cập Dashboard & RFID nếu chưa chọn phòng cụ thể
            if (targetTab === "dashboard" || targetTab === "rfid") {
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
    // --- Guard: Dashboard và RFID đều yêu cầu phải chọn phòng trước ---
    if (tabName === "dashboard" || tabName === "rfid") {
        if (!currentRoom) {
            showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học từ danh sách trước!", false);
            tabName = "rooms"; // Bắt buộc quay về danh sách phòng
        }
    }

    currentTab = tabName;
    const roomsView = $("rooms-view");
    const dashView = $("dashboard-view");
    const rfidView = $("rfid-view");
    const multiRoomBar = $("multi-room-bar");
    const breadcrumb = $("topbar-breadcrumb");
    const pageTitle = $("topbar-page-title");

    if (roomsView) roomsView.style.display = "none";
    if (dashView) dashView.style.display = "none";
    if (rfidView) rfidView.style.display = "none";

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
        if (breadcrumb) breadcrumb.textContent = `PHÒNG: ${roomDisplayName.toUpperCase()} / ĐIỂM DANH RFID`;
        if (pageTitle) pageTitle.textContent = `Nhật Ký Quẹt Thẻ RFID - ${roomDisplayName}`;
        loadRfidLog();
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

function startAutoRefresh() {
    setInterval(async () => {
        await loadRooms();
        if (currentRoom) {
            // Luôn đồng bộ trạng thái phòng hiện tại dù online hay offline
            updateCurrentRoomStatus();

            const curObj = allRooms.find(r => r.room_id === currentRoom);
            if (curObj && curObj.is_online) {
                if (currentTab === "dashboard") {
                    await loadSensors();
                    await loadDevices();
                } else if (currentTab === "rfid") {
                    await loadRfidLog();
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