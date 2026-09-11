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
    const navClassStudents = $("nav-class-students");
    const dashTag = $("nav-dashboard-tag");
    const rfidTag = $("nav-rfid-tag");
    const scheduleTag = $("nav-schedule-tag");
    const classStudentsTag = $("nav-class-students-tag") || $("nav-class-students-badge");
    const sidebarRoomBox = $("sidebar-current-room");
    const multiRoomBar = $("multi-room-bar");

    if (!currentRoom) {
        // --- CHƯA CHỌN PHÒNG: KHÓA DASHBOARD, RFID, THỜI KHÓA BIỂU & HỌC VIÊN ---
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
        if (navClassStudents) {
            navClassStudents.classList.add("disabled");
            navClassStudents.setAttribute("title", "Chưa chọn phòng học. Vui lòng chọn 1 phòng trong danh sách trước.");
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
        if (classStudentsTag) {
            classStudentsTag.textContent = "🔒 Khóa";
            classStudentsTag.className = "nav-tag locked";
            classStudentsTag.removeAttribute("style");
        }

        if (sidebarRoomBox) {
            sidebarRoomBox.innerHTML = `
                <div class="unselected-box">
                    <div style="font-size: 12px; font-weight: 700; color: var(--text-dim); display: flex; align-items: center; gap: 6px;">
                        <span style="color: var(--text-muted);">○</span> Chưa chọn phòng
                    </div>
                    <p class="unselected-hint">Chọn 1 phòng trong danh sách để mở Dashboard, Điểm danh, Thời khóa biểu và Học viên.</p>
                </div>
            `;
        }

        if (multiRoomBar) {
            multiRoomBar.style.display = "none";
        }
    } else {
        // --- ĐÃ CHỌN PHÒNG: MỞ KHÓA TOÀN BỘ PHÂN HỆ ---
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
        if (navClassStudents) {
            navClassStudents.classList.remove("disabled");
            navClassStudents.removeAttribute("title");
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
        const clsCode = r && r.class_code ? r.class_code : "";
        const clsName = r && r.class_name ? r.class_name : "";

        if (classStudentsTag) {
            classStudentsTag.textContent = clsCode || "Học viên";
            classStudentsTag.className = "nav-tag";
            classStudentsTag.style.cssText = "background: rgba(37,99,235,0.15); color: var(--primary); font-weight:700;";
        }

        if (sidebarRoomBox) {
            sidebarRoomBox.innerHTML = `
                <div class="selected-box">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <strong style="font-size: 13px; color: var(--text-pure); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px;">${escapeHtml(displayName)}</strong>
                        <span class="status-indicator-dot ${isOnline ? 'online' : ''}" style="width: 8px; height: 8px; flex-shrink: 0; background: ${isOnline ? 'var(--success)' : '#94a3b8'};"></span>
                    </div>
                    ${clsCode ? `
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px; line-height: 1.3;">
                        Lớp: <strong style="color: var(--primary);">${escapeHtml(clsCode)}</strong> - ${escapeHtml(clsName)}
                    </div>
                    ` : ''}
                    <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                        <span>Mã: <strong style="color: var(--text-dim);">${escapeHtml(currentRoom)}</strong></span>
                        <span style="font-weight: 700; color: ${isOnline ? 'var(--success)' : '#64748b'};">${isOnline ? '● Online' : '○ Offline'}</span>
                    </div>
                    <button type="button" class="btn-change-room" onclick="exitRoomToPortal()" title="Quay lại danh sách các phòng để chọn phòng khác">
                        <span>←</span> Đổi phòng khác
                    </button>
                </div>
            `;
        }

        const barChip = $("multi-room-current-name");
        if (barChip) barChip.textContent = `${displayName} (${currentRoom}) · Lớp: ${clsCode || '--'}`;

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
        const clsCode = room.class_code || "--";
        const clsName = room.class_name || "Chưa gán lớp";
        const studentCount = room.student_count || 0;

        return `
            <div class="room-portal-card ${isOnline ? 'online' : 'offline'}" onclick="selectRoomAndOpenDashboard('${escapeHtml(roomId)}')">
                <div class="portal-card-header">
                    <div class="portal-card-title-group">
                        <div class="portal-room-icon">🏫</div>
                        <div>
                            <h3 class="portal-room-name">${escapeHtml(displayName)}</h3>
                            <span class="portal-room-id-tag">Mã: ${escapeHtml(roomId)}</span>
                        </div>
                    </div>
                    <span class="portal-status-badge ${isOnline ? 'online' : 'offline'}">
                        <span class="${isOnline ? 'pulse-dot' : 'offline-dot'}"></span> ${isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>
                <div class="portal-card-body">
                    <div class="portal-info-row">
                        <span>🏛️ Lớp học:</span>
                        <strong style="color: var(--primary);">[${escapeHtml(clsCode)}] ${escapeHtml(clsName)}</strong>
                    </div>
                    <div class="portal-info-row">
                        <span>👨‍🎓 Sĩ số lớp:</span>
                        <strong>${studentCount} Học viên</strong>
                    </div>
                    <div class="portal-info-row">
                        <span>Chế độ phòng:</span>
                        <strong>${escapeHtml(mode)}</strong>
                    </div>
                    <div class="portal-info-row">
                        <span>Kết nối thiết bị:</span>
                        <strong style="color: ${isOnline ? 'var(--success)' : '#64748b'};">${isOnline ? '● Sẵn sàng hoạt động' : '○ Mất kết nối MQTT'}</strong>
                    </div>
                </div>
                <button type="button" class="btn-portal-access ${isOnline ? 'online' : 'offline'}" onclick="event.stopPropagation(); selectRoomAndOpenDashboard('${escapeHtml(roomId)}')">
                    <span>Vào phòng & Quản lý lớp</span>
                    <span>→</span>
                </button>
            </div>
        `;
    }).join("");
}

function handleOfflineRoomClick(roomName, roomId) {
    showToast("Phòng Offline", `Phòng ${roomName || roomId} (${roomId}) hiện đang Offline thiết bị. Bạn vẫn có thể xem và quản lý học viên / thời khóa biểu.`, true);
}

/**
 * Chọn một phòng học cụ thể và mở Dashboard giám sát.
 */
function selectRoomAndOpenDashboard(roomId) {
    const room = allRooms.find(r => r.room_id === roomId);
    if (!room) return;
    currentRoom = roomId;
    lastScheduleHash = "";
    updateRoomAccessState();
    switchView("dashboard");
    if (room.is_online) {
        showToast("Đã chọn phòng", `Đang quản lý ${room.name || roomId} (${roomId}) - Lớp [${room.class_code || '--'}]`, true);
    } else {
        showToast("Đã chọn phòng (Offline)", `Đang quản lý ${room.name || roomId} (${roomId}) - Thiết bị hiện Offline, bạn vẫn có thể quản lý học viên và thời khóa biểu.`, true);
    }
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
            statusBadge.style.cssText = "";
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

        case "light":
        case "ldr":
            const lightVal = Math.round(numericValue);
            if ($("light-value")) $("light-value").textContent = lightVal;
            if ($("summary-light")) $("summary-light").textContent = `${lightVal} lux`;
            if ($("light-time")) $("light-time").textContent = formatTime(time);
            if ($("light-progress")) {
                const lightPercent = Math.max(0, Math.min(100, (lightVal / 1000) * 100));
                $("light-progress").style.width = `${lightPercent}%`;
            }
            updateLightStatus(lightVal);
            break;

        case "rfid":
        case "RFID":
            const isCardPresent = numericValue === 1 || value === true || value === "1";
            updateRfidReader(isCardPresent, time);
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

function updateLightStatus(value) {
    const el = $("light-status");
    if (!el) return;
    if (value < 250) { el.textContent = "DARK (BẬT ĐÈN)"; el.className = "sensor-status-tag warning"; }
    else if (value > 600) { el.textContent = "BRIGHT (SÁNG)"; el.className = "sensor-status-tag normal"; }
    else { el.textContent = "NORMAL"; el.className = "sensor-status-tag normal"; }
}

function updateRfidReader(isCardPresent, time) {
    const value = $("rfid-value");
    const visual = $("rfid-visual");
    const status = $("rfid-status");
    const summary = $("summary-rfid");
    const timeEl = $("rfid-time");
    if (!value || !visual || !status) return;

    if (summary) summary.textContent = isCardPresent ? "Đã quẹt thẻ" : "Sẵn sàng";
    if (timeEl) timeEl.textContent = formatTime(time);

    if (isCardPresent) {
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
    const toggleBtn = $(`toggle-${deviceName}`);
    if (!stateEl || !textEl) return;

    if (normalized === "ON") {
        stateEl.textContent = "ON"; stateEl.className = "device-status-badge on";
        textEl.textContent = "Đang bật"; textEl.style.color = "var(--success)";
        if (card) card.classList.add("device-on");
        if (toggleBtn) {
            toggleBtn.classList.add("is-on");
            toggleBtn.classList.remove("is-off");
            toggleBtn.setAttribute("aria-checked", "true");
        }
    } else {
        stateEl.textContent = "OFF"; stateEl.className = "device-status-badge";
        textEl.textContent = "Đang tắt"; textEl.style.color = "var(--text-dim)";
        if (card) card.classList.remove("device-on");
        if (toggleBtn) {
            toggleBtn.classList.remove("is-on");
            toggleBtn.classList.add("is-off");
            toggleBtn.setAttribute("aria-checked", "false");
        }
    }
}

function toggleDevice(deviceName) {
    const toggleBtn = $(`toggle-${deviceName}`);
    const isCurrentlyOn = toggleBtn ? toggleBtn.classList.contains("is-on") : false;
    const nextCommand = isCurrentlyOn ? "OFF" : "ON";

    // Phản hồi giao diện tức thời (Optimistic UI)
    if (toggleBtn) {
        if (nextCommand === "ON") {
            toggleBtn.classList.add("is-on");
            toggleBtn.classList.remove("is-off");
            toggleBtn.setAttribute("aria-checked", "true");
        } else {
            toggleBtn.classList.remove("is-on");
            toggleBtn.classList.add("is-off");
            toggleBtn.setAttribute("aria-checked", "false");
        }
    }

    sendCommand(deviceName, nextCommand);
}
window.toggleDevice = toggleDevice;

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
        await loadRoomThresholdsBanner(currentRoom);
    } catch (error) {
        console.error("LOAD ROOM MODE ERROR:", error);
    }
}

async function loadRoomThresholdsBanner(roomId) {
    if (!roomId) return;
    try {
        const res = await fetch(`/api/rooms/${roomId}/automation/thresholds`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.thresholds) {
            const t = data.thresholds;
            const infoText = $("auto-mode-info-text");
            if (infoText) {
                infoText.innerHTML = `💡 <strong>Đèn 1:</strong> Bật khi &lt; ${t.lux_light1_on ?? 50} lux, tắt khi &gt; ${t.lux_light1_off ?? 80} lux. &nbsp;|&nbsp; 🌀 <strong>Quạt:</strong> Bật khi &ge; ${t.temp_fan_on ?? 31}°C, tắt khi &le; ${t.temp_fan_off ?? 28.5}°C.`;
            }
        }
    } catch (e) {
        // bỏ qua lỗi banner phụ
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



// ============================================================
// TAB NAVIGATION
// ============================================================
function setupTabNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", function(e) {
            e.preventDefault();
            const targetTab = this.getAttribute("data-tab");

            // Chặn tuyệt đối truy cập Dashboard, Điểm danh, Thời khóa biểu & Học viên nếu chưa chọn phòng cụ thể
            if (targetTab === "dashboard" || targetTab === "rfid" || targetTab === "schedule" || targetTab === "class-students") {
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
    // --- Guard: Dashboard, RFID, Schedule & Học viên đều yêu cầu phải chọn phòng trước ---
    if (tabName === "dashboard" || tabName === "rfid" || tabName === "schedule" || tabName === "class-students") {
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
    const classStudentsView = $("class-students-view");
    const multiRoomBar = $("multi-room-bar");
    const breadcrumb = $("topbar-breadcrumb");
    const pageTitle = $("topbar-page-title");

    if (roomsView) roomsView.style.display = "none";
    if (dashView) dashView.style.display = "none";
    if (rfidView) rfidView.style.display = "none";
    if (scheduleView) scheduleView.style.display = "none";
    if (classStudentsView) classStudentsView.style.display = "none";

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
    } else if (tabName === "class-students") {
        if (classStudentsView) classStudentsView.style.display = "block";
        if (multiRoomBar) multiRoomBar.style.display = "flex";
        if (breadcrumb) breadcrumb.textContent = `PHÒNG: ${roomDisplayName.toUpperCase()} / HỌC VIÊN`;
        if (pageTitle) pageTitle.textContent = `Danh Sách Học Viên - ${roomDisplayName}`;
        loadClassStudentsForCurrentRoom();
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
        const subjectDisplay = session.subject_name || "Đang diễn ra";

        // Update Dashboard banner
        if (dashBanner) {
            dashBanner.style.display = "flex";
            const sSub = $("dash-session-subject");
            const sTime = $("dash-session-time");
            if (sSub) sSub.textContent = `Môn học: ${subjectDisplay}`;
            if (sTime) {
                sTime.textContent = `🕒 Ca học: ${startStr} - ${endStr} · Hạn đúng giờ: ${lateStr}`;
            }
        }

        // Update RFID view session card
        if (rfidBadge) {
            rfidBadge.className = "session-status-badge";
            rfidBadge.innerHTML = `<span class="pulse-dot"></span> ĐANG DIỄN RA`;
        }
        if (rfidSubject) rfidSubject.textContent = subjectDisplay;
        if (rfidTimeChip) {
            rfidTimeChip.textContent = `${startStr} - ${endStr}`;
        }
        if (rfidLateTime) {
            rfidLateTime.textContent = lateStr;
        }
        if (sessionTableTitle) {
            sessionTableTitle.textContent = `Điểm Danh Môn ${subjectDisplay}`;
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
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty-cell">Chưa có danh sách học viên trong cơ sở dữ liệu.</td></tr>`;
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
                    <td>${statusBadge}</td>
                    <td>${checkInText}</td>
                    <td>${methodBadge}</td>
                </tr>
            `;
        }).join("");

    } catch (error) {
        console.error("LOAD SESSION ATTENDANCE ERROR:", error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty-cell" style="color:var(--danger)">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
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
                    const lateMins = s.late_after_minutes !== undefined ? s.late_after_minutes : (s.late_threshold_minutes || 15);

                    return `
                        <div class="schedule-item-card ${shiftCls}">
                            <div class="schedule-item-time">
                                <span>🕒 ${startStr} - ${endStr}</span>
                                ${statusBadge}
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
                                <div class="schedule-item-subject" style="margin-bottom: 0;">${escapeHtml(s.subject_name || '--')}</div>
                                <button type="button" onclick="event.stopPropagation(); deleteSchedule(${schedId})"
                                        style="color: var(--text-muted); font-size: 13px; padding: 2px 4px; border-radius: 4px; line-height: 1; background: transparent; border: none; cursor: pointer;"
                                        title="Xóa lịch học này" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-muted)'">
                                    🗑️
                                </button>
                            </div>
                            <div class="schedule-item-meta" style="margin-top: 6px;">
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
    const subject = $("sched-subject")?.value?.trim();
    const dayOfWeek = parseInt($("sched-day-of-week")?.value, 10);
    const startTime = $("sched-start-time")?.value;
    const endTime = $("sched-end-time")?.value;
    const lateThreshold = parseInt($("sched-late-threshold")?.value, 10) || 15;

    if (!roomId || !subject || !startTime || !endTime) {
        showToast("Thiếu thông tin", "Vui lòng nhập đầy đủ các trường bắt buộc (*)", false);
        return;
    }

    if (startTime >= endTime) {
        showToast("Giờ không hợp lệ", "Giờ bắt đầu phải trước giờ kết thúc!", false);
        return;
    }

    const payload = {
        room_id: roomId,
        subject_name: subject,
        day_of_week: dayOfWeek,
        weekday: dayOfWeek,
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

        showToast("Thành công", `Đã thêm lịch môn ${subject}`, true);
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
    document.querySelectorAll(".device-control-btn, .mode-btn, [data-device-btn], .device-pill-toggle").forEach(btn => {
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
// QUẢN LÝ HỌC SINH THEO TỪNG LỚP (STRICT CLASS ISOLATION)
// ============================================================
let currentClassId = null;
let allClassesList = [];
let currentClassStudents = [];

async function loadClassStudentsForCurrentRoom() {
    if (!currentRoom) return;
    const r = allRooms.find(x => x.room_id === currentRoom);
    const roomName = r && r.name ? r.name : `Phòng ${currentRoom}`;

    const tbody = $("class-students-table-body");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell">Đang tải danh sách học viên...</td></tr>`;
    }

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/students`);
        if (!response.ok) throw new Error("Không thể tải danh sách học viên của phòng này");
        const res = await response.json();
        const students = res.data || [];

        currentClassStudents = students;

        const codeTag = $("class-active-code-tag");
        const titleEl = $("class-table-title");

        if (codeTag) codeTag.textContent = `${roomName} (${currentRoom})`;
        if (titleEl) titleEl.textContent = `Danh Sách Học Viên - ${roomName} (${currentRoom})`;

        // Cập nhật thống kê
        const total = students.length;
        const rfidCount = students.filter(s => s.card_uid && s.card_uid.trim()).length;
        const noRfidCount = total - rfidCount;

        if ($("class-stat-total")) $("class-stat-total").textContent = total;
        if ($("class-stat-rfid")) $("class-stat-rfid").textContent = rfidCount;
        if ($("class-stat-norfid")) $("class-stat-norfid").textContent = noRfidCount;

        // Cập nhật badge trên sidebar
        const badge = $("nav-class-students-tag") || $("nav-class-students-badge");
        if (badge && currentRoom) {
            badge.textContent = `${total} HV`;
        }

        renderClassStudentsTable(students);
    } catch (err) {
        console.error("LOAD ROOM STUDENTS ERROR:", err);
        showToast("Lỗi", err.message || "Không thể tải danh sách học viên", false);
        renderEmptyClassStudentsTable("Không thể tải danh sách học viên của phòng này");
    }
}

async function syncCurrentRoomStudentsMqtt() {
    if (!currentRoom) {
        showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học trước!", false);
        return;
    }
    const btn = $("btn-sync-room-students-mqtt");
    if (btn) btn.disabled = true;
    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/students/sync-mqtt`, {
            method: "POST"
        });
        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Đồng bộ MQTT thất bại");
        }
        showToast("Thành công", res.message || "Đã đồng bộ danh sách học viên qua MQTT", true);
    } catch (e) {
        console.error("SYNC MQTT ERROR:", e);
        showToast("Lỗi đồng bộ", e.message, false);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function loadClassesForManager() {
    if (currentRoom) {
        await loadClassStudentsForCurrentRoom();
    }
}

async function loadClassStudents(classId) {
    if (currentRoom) {
        await loadClassStudentsForCurrentRoom();
    }
}

function renderEmptyClassStudentsTable(message) {
    const tbody = $("class-students-table-body");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell">${escapeHtml(message)}</td></tr>`;
    }
    if ($("class-stat-total")) $("class-stat-total").textContent = "0";
    if ($("class-stat-rfid")) $("class-stat-rfid").textContent = "0";
    if ($("class-stat-norfid")) $("class-stat-norfid").textContent = "0";
}

function renderClassStudentsTable(students) {
    const tbody = $("class-students-table-body");
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty-cell" style="padding: 40px; text-align: center;">
                    <div style="font-size: 28px; margin-bottom: 8px;">👨‍🎓</div>
                    <strong style="color: var(--text-dim); display: block;">Phòng này hiện chưa có học viên nào.</strong>
                    <span style="font-size: 13px; color: var(--text-muted);">Bấm nút "+ Thêm học viên" ở trên để đưa học viên vào phòng này.</span>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = students.map((st, index) => {
        const hasCard = Boolean(st.card_uid && st.card_uid.trim());
        const cardDisplay = hasCard
            ? `<span class="badge-rfid-code">🏷️ ${escapeHtml(st.card_uid)}</span>`
            : `<button type="button" class="badge-rfid-empty" onclick="openAssignRfidModal(${st.id}, '${escapeHtml(st.full_name)}')" title="Nhấn để gán mã thẻ RFID">
                   <span>+ Gán thẻ</span>
               </button>`;

        const initial = (st.full_name || "?").trim().charAt(0).toUpperCase();

        return `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${index + 1}</td>
                <td>
                    <strong style="font-family: monospace; font-size: 13px; color: var(--primary);">${escapeHtml(st.student_code)}</strong>
                </td>
                <td>
                    <div class="student-name-wrap">
                        <div class="student-avatar-circle">${escapeHtml(initial)}</div>
                        <div>
                            <strong style="color: var(--text-pure); font-size: 13px;">${escapeHtml(st.full_name)}</strong>
                        </div>
                    </div>
                </td>
                <td>${cardDisplay}</td>
                <td style="color: var(--text-dim);">${escapeHtml(st.phone || "---")}</td>
                <td style="color: var(--text-dim);">${escapeHtml(st.email || "---")}</td>
                <td style="text-align: right;">
                    <div class="table-actions-group">
                        <button type="button" class="btn-icon-action" onclick="openEditStudentModal(${st.id})" title="Chỉnh sửa thông tin học viên">
                            ✏️ Sửa
                        </button>
                        <button type="button" class="btn-icon-action transfer" onclick="openTransferStudentModal(${st.id}, '${escapeHtml(st.full_name)}', '${escapeHtml(st.student_code)}')" title="Chuyển học viên sang phòng khác">
                            🔄 Chuyển phòng
                        </button>
                        <button type="button" class="btn-icon-action delete" onclick="deleteClassStudent(${st.id}, '${escapeHtml(st.full_name)}')" title="Xóa học viên khỏi phòng">
                            🗑 Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function filterClassStudentsTable() {
    const searchInput = $("class-student-search");
    if (!searchInput) return;
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        renderClassStudentsTable(currentClassStudents);
        return;
    }

    const filtered = currentClassStudents.filter(s => {
        const code = (s.student_code || "").toLowerCase();
        const name = (s.full_name || "").toLowerCase();
        const card = (s.card_uid || "").toLowerCase();
        const phone = (s.phone || "").toLowerCase();
        const email = (s.email || "").toLowerCase();
        return code.includes(query) || name.includes(query) || card.includes(query) || phone.includes(query) || email.includes(query);
    });

    renderClassStudentsTable(filtered);
}

// --- MODAL THÊM HỌC VIÊN VÀO LỚP ---
let rfidModalPollTimer = null;
let latestScannedCardCache = null;

async function fetchLatestScannedCard(targetInputId, notify = true) {
    const input = $(targetInputId);
    const url = currentRoom 
        ? `/api/rooms/${encodeURIComponent(currentRoom)}/rfid-latest`
        : `/api/rfid/latest`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok && data.success && data.data && data.data.card_uid) {
            const card = data.data;
            latestScannedCardCache = card;
            if (input) {
                input.value = card.card_uid;
                input.style.transition = "all 0.3s ease";
                input.style.borderColor = "var(--success)";
                input.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.25)";
                setTimeout(() => {
                    input.style.borderColor = "";
                    input.style.boxShadow = "";
                }, 1500);
            }

            // Cập nhật hint box nếu có
            const hintBox = $("rfid-latest-hint-box");
            if (hintBox) {
                const uidText = $("rfid-latest-uid-text");
                const timeText = $("rfid-latest-time-text");
                if (uidText) uidText.textContent = card.card_uid;
                if (timeText) {
                    timeText.textContent = card.seconds_ago !== null && card.seconds_ago !== undefined
                        ? (card.seconds_ago <= 3 ? "vừa quẹt" : `${card.seconds_ago}s trước`)
                        : (card.scanned_at || "vừa quẹt");
                }
                hintBox.style.display = "flex";
            }

            if (notify) {
                const timeStr = card.seconds_ago !== null && card.seconds_ago !== undefined
                    ? `${card.seconds_ago}s trước`
                    : (card.scanned_at || "");
                showToast("Đã lấy mã thẻ RFID", `Mã thẻ: ${card.card_uid} (${timeStr})`, true);
            }
            return card;
        } else {
            if (notify) {
                showToast("Chưa có thẻ mới", "Chưa phát hiện lượt quẹt thẻ nào gần đây. Hãy quẹt thẻ lên đầu đọc RFID của phòng!", false);
            }
            return null;
        }
    } catch (e) {
        console.error("FETCH LATEST RFID ERROR:", e);
        if (notify) {
            showToast("Lỗi lấy mã thẻ", "Không thể kết nối máy chủ để lấy mã thẻ.", false);
        }
        return null;
    }
}

function applyLatestScannedCard(targetInputId) {
    if (!latestScannedCardCache || !latestScannedCardCache.card_uid) {
        fetchLatestScannedCard(targetInputId, true);
        return;
    }
    const input = $(targetInputId);
    if (input) {
        input.value = latestScannedCardCache.card_uid;
        input.style.transition = "all 0.3s ease";
        input.style.borderColor = "var(--success)";
        input.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.25)";
        setTimeout(() => {
            input.style.borderColor = "";
            input.style.boxShadow = "";
        }, 1500);
        showToast("Đã điền thẻ", `Đã gán mã thẻ ${latestScannedCardCache.card_uid}`, true);
    }
}

async function checkRecentScanForModal(targetInputId) {
    const input = $(targetInputId);
    const url = currentRoom 
        ? `/api/rooms/${encodeURIComponent(currentRoom)}/rfid-latest`
        : `/api/rfid/latest`;

    try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.data || !data.data.card_uid) return;

        const card = data.data;
        const isFresh = card.seconds_ago !== null && card.seconds_ago !== undefined && card.seconds_ago <= 45;

        // Cập nhật hint box nếu có
        const hintBox = $("rfid-latest-hint-box");
        if (hintBox) {
            const uidText = $("rfid-latest-uid-text");
            const timeText = $("rfid-latest-time-text");
            if (uidText) uidText.textContent = card.card_uid;
            if (timeText) {
                timeText.textContent = card.seconds_ago !== null && card.seconds_ago !== undefined
                    ? (card.seconds_ago <= 3 ? "vừa quẹt" : `${card.seconds_ago}s trước`)
                    : (card.scanned_at || "vừa quẹt");
            }
            hintBox.style.display = "flex";
        }

        // Tự động điền nếu input còn rỗng VÀ lượt quẹt mới xảy ra gần đây (< 45s)
        if (input && !input.value.trim() && isFresh) {
            if (!latestScannedCardCache || latestScannedCardCache.card_uid !== card.card_uid || latestScannedCardCache.scanned_at !== card.scanned_at) {
                input.value = card.card_uid;
                input.style.transition = "all 0.3s ease";
                input.style.borderColor = "var(--success)";
                input.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.25)";
                setTimeout(() => {
                    input.style.borderColor = "";
                    input.style.boxShadow = "";
                }, 1500);
                showToast("⚡ Nhận diện thẻ RFID", `Đã tự động gán mã thẻ vừa quẹt: ${card.card_uid}`, true);
            }
        }
        latestScannedCardCache = card;
    } catch (e) {
        // im lặng khi poll ngầm
    }
}

function openAddStudentModal() {
    if (!currentRoom) {
        showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học trước khi thêm học viên!", false);
        return;
    }
    const r = allRooms.find(x => x.room_id === currentRoom);
    const roomName = r && r.name ? r.name : `Phòng ${currentRoom}`;
    const hint = $("modal-add-student-class-hint");
    if (hint) hint.textContent = `Phòng: ${roomName} (${currentRoom})`;

    const form = $("form-add-student");
    if (form) form.reset();

    latestScannedCardCache = null;

    const hintBox = $("rfid-latest-hint-box");
    if (hintBox) hintBox.style.display = "none";

    const modal = $("modal-add-student");
    if (modal) modal.style.display = "flex";

    // Khởi động lắng nghe quẹt thẻ thời gian thực
    checkRecentScanForModal("student-card-input");
    if (rfidModalPollTimer) clearInterval(rfidModalPollTimer);
    rfidModalPollTimer = setInterval(() => {
        checkRecentScanForModal("student-card-input");
    }, 1500);
}

function closeAddStudentModal() {
    if (rfidModalPollTimer) {
        clearInterval(rfidModalPollTimer);
        rfidModalPollTimer = null;
    }
    const modal = $("modal-add-student");
    if (modal) modal.style.display = "none";
}

async function submitNewStudent(event) {
    event.preventDefault();
    if (!currentRoom) {
        showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học trước!", false);
        return;
    }

    const code = $("student-code-input").value.trim();
    const name = $("student-name-input").value.trim();
    const card = $("student-card-input").value.trim();
    const phone = $("student-phone-input").value.trim();
    const email = $("student-email-input").value.trim();

    if (!code || !name) {
        showToast("Thiếu thông tin", "Vui lòng điền mã học viên và họ tên", false);
        return;
    }

    const btn = $("btn-save-student");
    if (btn) btn.disabled = true;

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/students`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                student_code: code,
                full_name: name,
                card_uid: card || null,
                phone: phone || null,
                email: email || null
            })
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể thêm học viên");
        }

        showToast("Thành công", res.message || "Đã thêm học viên vào phòng", true);
        closeAddStudentModal();
        await loadClassStudentsForCurrentRoom();
        await loadRooms(); // Cập nhật sĩ số trên portal
    } catch (e) {
        console.error("ADD STUDENT ERROR:", e);
        showToast("Lỗi thêm học viên", e.message, false);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// --- MODAL SỬA HỌC VIÊN ---
function openEditStudentModal(studentId) {
    const student = currentClassStudents.find(s => s.id === studentId);
    if (!student) return;

    const r = allRooms.find(c => c.room_id === currentRoom);
    const roomName = r && r.name ? r.name : `Phòng ${currentRoom}`;
    const hint = $("modal-edit-student-class-hint");
    if (hint) hint.textContent = `Phòng: ${roomName} (${currentRoom})`;

    $("edit-student-id").value = student.id;
    $("edit-student-code-input").value = student.student_code || "";
    $("edit-student-name-input").value = student.full_name || "";
    $("edit-student-card-input").value = student.card_uid || "";
    $("edit-student-phone-input").value = student.phone || "";
    $("edit-student-email-input").value = student.email || "";

    const modal = $("modal-edit-student");
    if (modal) modal.style.display = "flex";
}

function closeEditStudentModal() {
    const modal = $("modal-edit-student");
    if (modal) modal.style.display = "none";
}

async function submitEditStudent(event) {
    event.preventDefault();
    const studentId = $("edit-student-id").value;
    if (!studentId || !currentRoom) return;

    const code = $("edit-student-code-input").value.trim();
    const name = $("edit-student-name-input").value.trim();
    const card = $("edit-student-card-input").value.trim();
    const phone = $("edit-student-phone-input").value.trim();
    const email = $("edit-student-email-input").value.trim();

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/students/${studentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                student_code: code,
                full_name: name,
                card_uid: card,
                phone: phone,
                email: email
            })
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể cập nhật học viên");
        }

        showToast("Cập nhật thành công", "Đã lưu thông tin học viên", true);
        closeEditStudentModal();
        await loadClassStudentsForCurrentRoom();
    } catch (e) {
        console.error("EDIT STUDENT ERROR:", e);
        showToast("Lỗi sửa học viên", e.message, false);
    }
}

// --- XÓA HỌC VIÊN KHỎI PHÒNG ---
async function deleteClassStudent(studentId, studentName) {
    if (!confirm(`Bạn có chắc muốn xóa học viên "${studentName}" khỏi phòng này không?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/students/${studentId}`, {
            method: "DELETE"
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể xóa học viên");
        }

        showToast("Đã xóa", `Học viên "${studentName}" đã được xóa khỏi phòng`, true);
        await loadClassStudentsForCurrentRoom();
        await loadRooms();
    } catch (e) {
        console.error("DELETE STUDENT ERROR:", e);
        showToast("Lỗi xóa học viên", e.message, false);
    }
}

// --- CHUYỂN PHÒNG CHO HỌC VIÊN ---
function openTransferStudentModal(studentId, studentName, studentCode) {
    const student = currentClassStudents.find(s => s.id === studentId);
    if (!student) return;

    const r = allRooms.find(c => c.room_id === currentRoom);
    const roomName = r && r.name ? r.name : `Phòng ${currentRoom}`;

    $("transfer-student-id").value = studentId;
    $("modal-transfer-student-info").textContent = `Học viên: [${studentCode}] ${studentName}`;
    $("transfer-current-class-name").value = `${roomName} (${currentRoom})`;

    // Re-fill target dropdown with other rooms
    const targetSelect = $("transfer-target-class-select");
    if (targetSelect) {
        targetSelect.innerHTML = `<option value="">-- Chọn phòng đích --</option>` +
            allRooms.filter(x => x.room_id !== currentRoom).map(x => `
                <option value="${escapeHtml(x.room_id)}">${escapeHtml(x.name || x.room_id)} (${escapeHtml(x.room_id)})</option>
            `).join("");
    }

    const modal = $("modal-transfer-student");
    if (modal) modal.style.display = "flex";
}

function closeTransferStudentModal() {
    const modal = $("modal-transfer-student");
    if (modal) modal.style.display = "none";
}

async function submitTransferStudent(event) {
    event.preventDefault();
    const studentId = $("transfer-student-id").value;
    const targetRoomId = $("transfer-target-class-select").value;

    if (!studentId || !targetRoomId) {
        showToast("Chưa chọn phòng", "Vui lòng chọn phòng đích cần chuyển tới", false);
        return;
    }

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/students/${studentId}/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_room_id: targetRoomId })
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể chuyển phòng");
        }

        showToast("Chuyển phòng thành công", res.message || "Học viên đã được chuyển sang phòng mới", true);
        closeTransferStudentModal();
        await loadClassStudentsForCurrentRoom();
        await loadRooms();
    } catch (e) {
        console.error("TRANSFER ERROR:", e);
        showToast("Lỗi chuyển phòng", e.message, false);
    }
}

// --- MODAL TẠO & SỬA LỚP HỌC ---
let isEditingClass = false;

function openAddClassModal() {
    isEditingClass = false;
    $("modal-class-form-title").textContent = "Tạo Lớp Học Mới";
    $("btn-save-class-form").textContent = "💾 Tạo lớp học";
    $("class-form-id").value = "";
    $("class-form-code").value = "";
    $("class-form-name").value = "";
    $("class-form-year").value = "";
    $("class-form-desc").value = "";

    const modal = $("modal-class-form");
    if (modal) modal.style.display = "flex";
}

function openEditClassModal() {
    if (!currentClassId) return;
    const curCls = allClassesList.find(c => c.id === currentClassId);
    if (!curCls) return;

    isEditingClass = true;
    $("modal-class-form-title").textContent = "Chỉnh Sửa Thông Tin Lớp Học";
    $("btn-save-class-form").textContent = "💾 Lưu thay đổi";
    $("class-form-id").value = curCls.id;
    $("class-form-code").value = curCls.class_code || "";
    $("class-form-name").value = curCls.class_name || "";
    $("class-form-year").value = curCls.academic_year || "";
    $("class-form-desc").value = curCls.description || "";

    const modal = $("modal-class-form");
    if (modal) modal.style.display = "flex";
}

function closeClassFormModal() {
    const modal = $("modal-class-form");
    if (modal) modal.style.display = "none";
}

async function submitClassForm(event) {
    event.preventDefault();
    const code = $("class-form-code").value.trim();
    const name = $("class-form-name").value.trim();
    const year = $("class-form-year").value.trim();
    const desc = $("class-form-desc").value.trim();

    if (!code || !name) {
        showToast("Thiếu thông tin", "Vui lòng nhập mã lớp và tên lớp", false);
        return;
    }

    try {
        let url = "/api/classes";
        let method = "POST";

        if (isEditingClass && currentClassId) {
            url = `/api/classes/${currentClassId}`;
            method = "PUT";
        }

        const response = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                class_code: code,
                class_name: name,
                academic_year: year || null,
                description: desc || null
            })
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể lưu lớp học");
        }

        showToast("Thành công", isEditingClass ? "Đã cập nhật thông tin lớp" : "Đã tạo lớp học mới", true);
        closeClassFormModal();

        if (!isEditingClass && res.id) {
            currentClassId = res.id;
        }
        await loadClassesForManager();
    } catch (e) {
        console.error("SAVE CLASS ERROR:", e);
        showToast("Lỗi", e.message, false);
    }
}

async function deleteCurrentClass() {
    if (!currentClassId) return;
    const curCls = allClassesList.find(c => c.id === currentClassId);
    const clsName = curCls ? `[${curCls.class_code}] ${curCls.class_name}` : "lớp này";

    if (!confirm(`Bạn có chắc chắn muốn xóa ${clsName} không?\nCác học sinh trong lớp sẽ chuyển thành chưa phân lớp.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/classes/${currentClassId}`, { method: "DELETE" });
        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể xóa lớp");
        }

        showToast("Đã xóa lớp", "Lớp học đã được xóa", true);
        currentClassId = null;
        await loadClassesForManager();
    } catch (e) {
        console.error("DELETE CLASS ERROR:", e);
        showToast("Lỗi xóa lớp", e.message, false);
    }
}

// --- GÁN MÃ THẺ RFID NHANH ---
function openAssignRfidModal(studentId, studentName) {
    $("assign-rfid-student-id").value = studentId;
    $("modal-assign-rfid-student-name").textContent = `Học viên: ${studentName}`;
    $("assign-rfid-input").value = "";

    const modal = $("modal-assign-rfid");
    if (modal) modal.style.display = "flex";

    // Khởi động lắng nghe quẹt thẻ thời gian thực
    checkRecentScanForModal("assign-rfid-input");
    if (rfidModalPollTimer) clearInterval(rfidModalPollTimer);
    rfidModalPollTimer = setInterval(() => {
        checkRecentScanForModal("assign-rfid-input");
    }, 1500);
}

function closeAssignRfidModal() {
    if (rfidModalPollTimer) {
        clearInterval(rfidModalPollTimer);
        rfidModalPollTimer = null;
    }
    const modal = $("modal-assign-rfid");
    if (modal) modal.style.display = "none";
}

async function submitAssignRfid(event) {
    event.preventDefault();
    const studentId = $("assign-rfid-student-id").value;
    const cardUid = $("assign-rfid-input").value.trim();

    if (!studentId || !cardUid) {
        showToast("Thiếu mã thẻ", "Vui lòng nhập mã thẻ RFID", false);
        return;
    }

    try {
        const response = await fetch(`/api/students/${studentId}/assign-card`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ card_uid: cardUid })
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || "Không thể gán mã thẻ");
        }

        showToast("Gán thẻ thành công", "Mã thẻ RFID đã được liên kết với học viên", true);
        closeAssignRfidModal();
        await loadClassStudentsForCurrentRoom();
    } catch (e) {
        console.error("ASSIGN RFID ERROR:", e);
        showToast("Lỗi gán thẻ", e.message, false);
    }
}

// --- ĐỒNG BỘ MQTT XUỐNG PHÒNG ---
async function syncClassMqtt() {
    if (currentRoom) {
        await syncCurrentRoomStudentsMqtt();
    }
}

// Gán các hàm ra window để truy cập từ HTML onclick
window.loadClassesForManager = loadClassesForManager;
window.loadClassStudentsForCurrentRoom = loadClassStudentsForCurrentRoom;
window.syncCurrentRoomStudentsMqtt = syncCurrentRoomStudentsMqtt;
window.loadClassStudents = loadClassStudents;
window.filterClassStudentsTable = filterClassStudentsTable;
window.openAddStudentModal = openAddStudentModal;
window.closeAddStudentModal = closeAddStudentModal;
window.submitNewStudent = submitNewStudent;
window.openEditStudentModal = openEditStudentModal;
window.closeEditStudentModal = closeEditStudentModal;
window.submitEditStudent = submitEditStudent;
window.deleteClassStudent = deleteClassStudent;
window.openTransferStudentModal = openTransferStudentModal;
window.closeTransferStudentModal = closeTransferStudentModal;
window.submitTransferStudent = submitTransferStudent;
window.openAddClassModal = openAddClassModal;
window.openEditClassModal = openEditClassModal;
window.closeClassFormModal = closeClassFormModal;
window.submitClassForm = submitClassForm;
window.deleteCurrentClass = deleteCurrentClass;
window.openAssignRfidModal = openAssignRfidModal;
window.closeAssignRfidModal = closeAssignRfidModal;
window.submitAssignRfid = submitAssignRfid;
window.syncClassMqtt = syncClassMqtt;
window.fetchLatestScannedCard = fetchLatestScannedCard;
window.applyLatestScannedCard = applyLatestScannedCard;

// ============================================================
// AUTOMATION THRESHOLDS MODAL & LOGIC
// ============================================================
async function openThresholdModal() {
    if (!currentRoom) {
        showToast("Chưa chọn phòng", "Vui lòng chọn một phòng học trước khi cài đặt ngưỡng!", false);
        return;
    }

    const hint = $("modal-thresh-room-hint");
    if (hint) {
        const rObj = allRooms.find(r => r.room_id === currentRoom);
        hint.textContent = `Phòng học: ${rObj ? rObj.name : currentRoom} (${currentRoom})`;
    }

    // Tải cấu hình ngưỡng hiện tại của phòng từ API
    try {
        const res = await fetch(`/api/rooms/${currentRoom}/automation/thresholds`);
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.thresholds) {
                const t = data.thresholds;
                if ($("thresh-lux-light1-on") && t.lux_light1_on !== undefined) $("thresh-lux-light1-on").value = t.lux_light1_on;
                if ($("thresh-lux-light1-off") && t.lux_light1_off !== undefined) $("thresh-lux-light1-off").value = t.lux_light1_off;
                if ($("thresh-lux-light2-on") && t.lux_light2_on !== undefined) $("thresh-lux-light2-on").value = t.lux_light2_on;
                if ($("thresh-lux-light2-off") && t.lux_light2_off !== undefined) $("thresh-lux-light2-off").value = t.lux_light2_off;
                if ($("thresh-temp-fan-on") && t.temp_fan_on !== undefined) $("thresh-temp-fan-on").value = t.temp_fan_on;
                if ($("thresh-temp-fan-off") && t.temp_fan_off !== undefined) $("thresh-temp-fan-off").value = t.temp_fan_off;
            }
        }
    } catch (err) {
        console.error("Lỗi đọc ngưỡng tự động hóa:", err);
    }

    const modal = $("modal-threshold-settings");
    if (modal) modal.style.display = "flex";
}

function closeThresholdModal() {
    const modal = $("modal-threshold-settings");
    if (modal) modal.style.display = "none";
}

function resetDefaultThresholds() {
    if ($("thresh-lux-light1-on")) $("thresh-lux-light1-on").value = 50;
    if ($("thresh-lux-light1-off")) $("thresh-lux-light1-off").value = 80;
    if ($("thresh-lux-light2-on")) $("thresh-lux-light2-on").value = 15;
    if ($("thresh-lux-light2-off")) $("thresh-lux-light2-off").value = 25;
    if ($("thresh-temp-fan-on")) $("thresh-temp-fan-on").value = 31.0;
    if ($("thresh-temp-fan-off")) $("thresh-temp-fan-off").value = 28.5;
    showToast("Mặc định", "Đã khôi phục các giá trị ngưỡng chuẩn.", true);
}

async function submitThresholdSettings(e) {
    e.preventDefault();
    if (!currentRoom) {
        showToast("Lỗi", "Chưa chọn phòng học", false);
        return;
    }

    const luxL1On = parseFloat($("thresh-lux-light1-on")?.value);
    const luxL1Off = parseFloat($("thresh-lux-light1-off")?.value);
    const luxL2On = parseFloat($("thresh-lux-light2-on")?.value);
    const luxL2Off = parseFloat($("thresh-lux-light2-off")?.value);
    const tempFanOn = parseFloat($("thresh-temp-fan-on")?.value);
    const tempFanOff = parseFloat($("thresh-temp-fan-off")?.value);

    // Kiểm tra tính hợp lệ của dải trễ Hysteresis
    if (luxL1On >= luxL1Off) {
        showToast("Lỗi dải trễ Đèn 1", "Ngưỡng BẬT đèn 1 phải nhỏ hơn ngưỡng TẮT để chống chập chờn!", false);
        return;
    }
    if (luxL2On >= luxL2Off) {
        showToast("Lỗi dải trễ Đèn 2", "Ngưỡng BẬT đèn 2 phải nhỏ hơn ngưỡng TẮT!", false);
        return;
    }
    if (tempFanOn <= tempFanOff) {
        showToast("Lỗi dải trễ Quạt", "Nhiệt độ BẬT quạt phải cao hơn nhiệt độ TẮT quạt!", false);
        return;
    }

    const payload = {
        lux_light1_on: luxL1On,
        lux_light1_off: luxL1Off,
        lux_light2_on: luxL2On,
        lux_light2_off: luxL2Off,
        temp_fan_on: tempFanOn,
        temp_fan_off: tempFanOff
    };

    try {
        const btn = $("btn-save-thresholds");
        if (btn) btn.disabled = true;

        const res = await fetch(`/api/rooms/${currentRoom}/automation/thresholds`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Không thể cập nhật ngưỡng");

        showToast("Thành công", `Đã lưu ngưỡng tự động hóa cho phòng ${currentRoom}!`, true);
        closeThresholdModal();

        // Cập nhật text trong auto-mode-info banner
        const infoText = $("auto-mode-info-text");
        if (infoText) {
            infoText.innerHTML = `💡 <strong>Đèn 1:</strong> Bật khi &lt; ${luxL1On} lux, tắt khi &gt; ${luxL1Off} lux. &nbsp;|&nbsp; 🌀 <strong>Quạt:</strong> Bật khi &ge; ${tempFanOn}°C, tắt khi &le; ${tempFanOff}°C.`;
        }
    } catch (err) {
        console.error("SAVE THRESHOLDS ERROR:", err);
        showToast("Lỗi lưu ngưỡng", err.message, false);
    } finally {
        const btn = $("btn-save-thresholds");
        if (btn) btn.disabled = false;
    }
}

window.openThresholdModal = openThresholdModal;
window.closeThresholdModal = closeThresholdModal;
window.resetDefaultThresholds = resetDefaultThresholds;
window.submitThresholdSettings = submitThresholdSettings;
window.loadRoomThresholdsBanner = loadRoomThresholdsBanner;


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