let currentRoom = null;
let temperatureChart = null;
const REFRESH_INTERVAL = 3000;

function $(id) { return document.getElementById(id); }

function formatTime(value) {
    if (!value) return "--";
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (error) {
        return value;
    }
}

function setServerStatus(online) {
    const text = $("server-status-text");
    const sidebar = $("sidebar-server-status");
    const indicator = document.querySelector(".status-indicator");
    const sidebarDot = document.querySelector(".system-dot");
    const time = $("server-status-time");
    if (!text || !sidebar || !indicator || !sidebarDot || !time) return;

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
        $("room-id").textContent = room.room_id || currentRoom;
        $("room-name").textContent = room.name || `Phòng ${currentRoom}`;
    } catch (error) {
        console.error("LOAD ROOM ERROR:", error);
    }
    await Promise.all([loadSensors(), loadDevices(), loadTemperatureHistory()]);
}

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
            $("temperature-value").textContent = numericValue.toFixed(1);
            $("summary-temperature").textContent = `${numericValue.toFixed(1)} °C`;
            $("temperature-time").textContent = formatTime(time);
            updateTemperatureStatus(numericValue);
            break;

        case "humidity":
            $("humidity-value").textContent = numericValue.toFixed(1);
            $("summary-humidity").textContent = `${numericValue.toFixed(1)} %`;
            $("humidity-time").textContent = formatTime(time);
            const humidityPercent = Math.max(0, Math.min(100, numericValue));
            $("humidity-progress").style.width = `${humidityPercent}%`;
            updateHumidityStatus(numericValue);
            break;

        case "gas":
            $("gas-value").textContent = Math.round(numericValue);
            $("summary-gas").textContent = `${Math.round(numericValue)} ADC`;
            updateGasStatus(numericValue);
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
        element.className = "sensor-status danger";
    } else if (value >= 30) {
        element.textContent = "WARM";
        element.className = "sensor-status warning";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status normal";
    }
}

function updateHumidityStatus(value) {
    const element = $("humidity-status");
    if (!element) return;
    if (value < 30 || value > 80) {
        element.textContent = "WARNING";
        element.className = "sensor-status warning";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status normal";
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
        element.className = "sensor-status danger";
        addGasAlert(value);
    } else if (value >= 1000) {
        element.textContent = "WARNING";
        element.className = "sensor-status warning";
    } else {
        element.textContent = "NORMAL";
        element.className = "sensor-status normal";
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
        visual.style.background = "rgba(59,130,246,0.15)";
        status.textContent = "ACTIVE";
        status.className = "sensor-status normal";
    } else {
        value.textContent = "Sẵn sàng";
        visual.textContent = "💳";
        visual.style.background = "rgba(34,197,94,0.1)";
        status.textContent = "READY";
        status.className = "sensor-status normal";
    }
}

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
        stateElement.className = "device-state on";
        textElement.textContent = "Đang bật";
        if (card) card.classList.add("device-on");
    } else {
        stateElement.textContent = "OFF";
        stateElement.className = "device-state off";
        textElement.textContent = "Đang tắt";
        if (card) card.classList.remove("device-on");
    }
}

async function sendCommand(deviceName, command) {
    if (!currentRoom) {
        showToast("Lỗi", "Chưa chọn phòng", false);
        return;
    }
    try {
        showToast("Đang gửi lệnh", `${deviceName} → ${command}`, true);
        const response = await fetch(`/api/rooms/${currentRoom}/devices/${deviceName}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: command })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Không thể gửi lệnh");
        showToast("Đã gửi lệnh", `${deviceName} → ${command}. Chờ thiết bị phản hồi.`, true);
    } catch (error) {
        console.error("SEND COMMAND ERROR:", error);
        showToast("Gửi lệnh thất bại", error.message, false);
    }
}

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

    temperatureChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Nhiệt độ",
                data: values,
                tension: 0.35,
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: "#64748b", maxTicksLimit: 7, font: { size: 9 } },
                    grid: { color: "rgba(255,255,255,0.04)" }
                },
                y: {
                    ticks: { color: "#64748b", font: { size: 9 } },
                    grid: { color: "rgba(255,255,255,0.04)" }
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
        <div class="no-alert" style="background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.12);">
            <div class="no-alert-icon" style="background: rgba(239,68,68,0.1); color: var(--danger);">!</div>
            <div>
                <strong>Cảnh báo khí gas</strong>
                <span>Giá trị hiện tại: ${Math.round(value)} ADC</span>
            </div>
        </div>
    `;

    count.textContent = "1";
    count.style.background = "rgba(239,68,68,0.1)";
    count.style.color = "var(--danger)";
}

let toastTimer = null;

function showToast(title, message, success = true) {
    const toast = $("toast");
    const icon = $("toast-icon");
    const titleElement = $("toast-title");
    const messageElement = $("toast-message");
    if (!toast || !icon || !titleElement || !messageElement) return;

    titleElement.textContent = title;
    messageElement.textContent = message;
    icon.textContent = success ? "✓" : "!";
    icon.style.background = success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)";
    icon.style.color = success ? "var(--success)" : "var(--danger)";

    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ============================================================
// PHÂN HỆ ĐIỂM DANH & QUẢN LÝ HỌC VIÊN
// ============================================================

let currentTab = "dashboard";
let allStudents = [];

function setupTabNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", function (e) {
            const targetTab = this.getAttribute("data-tab");
            const href = this.getAttribute("href");

            if (targetTab === "attendance") {
                e.preventDefault();
                switchView("attendance");
                setActiveNav(this);
            } else if (targetTab === "dashboard") {
                switchView("dashboard");
                if (href === "#dashboard") {
                    e.preventDefault();
                    setActiveNav(this);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                    // Chuyển về dashboard rồi để trình duyệt cuộn tự nhiên theo hash
                    setActiveNav(this);
                }
            }
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

    if (tabName === "attendance") {
        if (dashboardView) dashboardView.style.display = "none";
        if (attendanceView) {
            attendanceView.style.display = "block";
            loadStudents();
            loadAttendanceData();
        }
    } else {
        if (attendanceView) attendanceView.style.display = "none";
        if (dashboardView) dashboardView.style.display = "block";
    }
}

// ------------------------------------------------------------
// QUẢN LÝ HỌC VIÊN (STUDENTS)
// ------------------------------------------------------------

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
            tbody.innerHTML = `<tr><td colspan="8" class="table-empty" style="color:var(--danger)">Lỗi tải danh sách: ${error.message}</td></tr>`;
        }
    }
}

function renderStudentsTable(students) {
    const tbody = $("students-table-body");
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Không tìm thấy học viên nào</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map((student, index) => {
        const hasCard = !!student.card_uid;
        const cardBadge = hasCard
            ? `<span class="badge-card">${escapeHtml(student.card_uid)}</span>`
            : `<span class="badge-card unassigned">Chưa gán</span>`;

        const statusBadge = hasCard
            ? `<span class="badge badge-success">● Đã cấp thẻ</span>`
            : `<span class="badge badge-warning">◌ Chờ cấp</span>`;

        const contactInfo = [student.phone, student.email].filter(Boolean).map(escapeHtml).join(" · ") || "--";

        return `
            <tr>
                <td style="color:var(--text-muted); font-weight:600;">${index + 1}</td>
                <td><strong style="color:var(--primary); font-family:ui-monospace,monospace;">${escapeHtml(student.student_code)}</strong></td>
                <td><strong style="color:var(--text); font-size:13px;">${escapeHtml(student.full_name)}</strong></td>
                <td><span style="color:var(--text-secondary);">${escapeHtml(student.class_name || "--")}</span></td>
                <td>${cardBadge}</td>
                <td>${statusBadge}</td>
                <td><small style="color:var(--text-muted);">${contactInfo}</small></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal(${student.id})" title="Chỉnh sửa hoặc gán thẻ">
                            ✏️ Sửa / Gán thẻ
                        </button>
                        <button class="btn btn-danger-outline btn-sm" onclick="deleteStudent(${student.id}, '${escapeHtml(student.full_name)}')" title="Xóa học viên">
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

    $("modal-title").textContent = "Chỉnh sửa học viên";
    $("modal-subtitle").textContent = `Cập nhật thông tin & mã thẻ RFID cho ${student.full_name}`;
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
        showToast("Đang tìm thẻ", "Đang đọc mã thẻ quẹt gần nhất...", true);
        const response = await fetch("/api/attendance/latest-scan");
        if (!response.ok) throw new Error("Không thể lấy dữ liệu quẹt thẻ");
        const res = await response.json();

        if (res.data && res.data.card_uid) {
            $("student-card-input").value = res.data.card_uid;
            showToast("Đã lấy mã thẻ!", `Mã thẻ UID: ${res.data.card_uid}`, true);
        } else {
            showToast("Chưa có thẻ quẹt", "Vui lòng quẹt thẻ lên đầu đọc trước rồi bấm lại", false);
        }
    } catch (error) {
        console.error("FETCH SCAN ERROR:", error);
        showToast("Lỗi lấy mã thẻ", error.message, false);
    }
}

// ------------------------------------------------------------
// NHẬT KÝ VÀ THỐNG KÊ ĐIỂM DANH (ATTENDANCE)
// ------------------------------------------------------------

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
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Chưa có lượt quẹt thẻ điểm danh nào trong ngày đã chọn</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        let statusBadge;
        if (log.status === "DUNG_GIO") {
            statusBadge = `<span class="badge badge-success">✓ Đúng giờ</span>`;
        } else if (log.status === "MUON") {
            statusBadge = `<span class="badge badge-warning">⏰ Đi muộn</span>`;
        } else {
            statusBadge = `<span class="badge badge-danger">${escapeHtml(log.status || "Chưa rõ")}</span>`;
        }

        const studentName = log.full_name
            ? `<strong style="color:var(--text); font-size:13px;">${escapeHtml(log.full_name)}</strong>`
            : `<span style="color:var(--text-muted); font-style:italic;">Thẻ chưa gán học viên</span>`;

        const studentCode = log.student_code
            ? `<span style="color:var(--primary); font-family:ui-monospace,monospace; font-weight:600;">${escapeHtml(log.student_code)}</span>`
            : `--`;

        const timeStr = formatFullDateTime(log.recorded_at);

        return `
            <tr>
                <td style="white-space:nowrap; font-size:11.5px; color:var(--text-secondary);">${timeStr}</td>
                <td><span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text);">${escapeHtml(log.room_id)}</span></td>
                <td>${studentName}</td>
                <td>${studentCode}</td>
                <td><span style="color:var(--text-secondary);">${escapeHtml(log.class_name || "--")}</span></td>
                <td><span class="badge-card">${escapeHtml(log.card_uid)}</span></td>
                <td><span class="badge badge-info">${escapeHtml(log.event_type || "CHECK_IN")}</span></td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join("");
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

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
// KHỞI CHẠY HỆ THỐNG
// ------------------------------------------------------------

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

async function initializeDashboard() {
    setupTabNavigation();
    await loadRooms();

    // Auto-refresh Dashboard (Sensors & Devices)
    setInterval(async () => {
        if (currentTab === "dashboard" && currentRoom) {
            await Promise.all([loadSensors(), loadDevices()]);
        } else if (currentTab === "attendance") {
            await loadAttendanceData();
        }
    }, REFRESH_INTERVAL);

    // Auto-refresh Lịch sử nhiệt độ
    setInterval(async () => {
        if (currentTab === "dashboard" && currentRoom) {
            await loadTemperatureHistory();
        }
    }, 15000);
}

document.addEventListener("DOMContentLoaded", initializeDashboard);