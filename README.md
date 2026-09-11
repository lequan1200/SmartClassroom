# SmartClassroom

Hệ thống phòng học thông minh sử dụng **Raspberry Pi + Flask + MariaDB + MQTT + ESP32**.

## 1. MQTT - Mosquitto

Hệ thống sử dụng **Mosquitto MQTT Broker** để giao tiếp giữa Raspberry Pi/Server và các thiết bị ESP32.

### 1.1. MQTT Broker

Mặc định MQTT Broker sử dụng:

```text
Host: 127.0.0.1
Port: 1883
Protocol: MQTT
```

> Khi ESP32 kết nối tới Raspberry Pi hoặc một máy tính khác, thay `127.0.0.1` bằng IP của máy chạy Mosquitto Broker.

---

## 2. Publish và Subscribe

### 2.1. Publish

`mosquitto_pub` được sử dụng để gửi dữ liệu hoặc lệnh lên MQTT Broker.

Ví dụ điều khiển đèn:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 
-t "classroom/room01/device/light1/set" 
-m '{"command":"ON"}'
```

Ví dụ gửi dữ liệu nhiệt độ:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 
-t "classroom/room01/sensor/temperature" 
-m '{"room_id":"room01","value":32.5,"unit":"C","time":"2026-09-06 00:00:00"}'
```

### 2.2. Subscribe

`mosquitto_sub` được sử dụng để nhận dữ liệu từ MQTT Broker.

Theo dõi toàn bộ dữ liệu của phòng:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 
-t "classroom/room01/#" -v
```

Theo dõi trạng thái tất cả thiết bị:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 
-t "classroom/room01/device/+/status" -v
```

Theo dõi dữ liệu cảm biến:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 
-t "classroom/room01/sensor/#" -v
```

---

# 3. MQTT Topic

Cấu trúc topic chung:

```text
classroom/{room_id}/...
```

Trong đó:

```text
room_id = room01 | room02 | ...
```

## 3.1. Cảm biến

Cấu trúc:

```text
classroom/{room_id}/sensor/{sensor_name}
```

Danh sách cảm biến chuẩn trên hệ thống và trong Database:

```text
temperature   - Cảm biến nhiệt độ (DHT11, °C)
humidity      - Cảm biến độ ẩm (DHT11, %)
gas           - Cảm biến khí gas / khói (MQ-2, ppm / ADC)
light         - Cảm biến cường độ ánh sáng (BH1750, lux)
RFID          - Trạng thái thẻ quẹt tại đầu đọc (RC522, 1 = có thẻ, 0 = không có thẻ)
```

Ví dụ các topic:

```text
classroom/room01/sensor/temperature
classroom/room01/sensor/humidity
classroom/room01/sensor/gas
classroom/room01/sensor/light
classroom/room01/sensor/RFID
```

### Cấu trúc Payload JSON cảm biến

**1. Nhiệt độ (`temperature`):**
```json
{
  "room_id": "room01",
  "value": 32.5,
  "unit": "C",
  "time": "2026-09-06 14:15:00"
}
```

**2. Độ ẩm (`humidity`):**
```json
{
  "room_id": "room01",
  "value": 65.2,
  "unit": "%",
  "time": "2026-09-06 14:15:00"
}
```

**3. Khí gas (`gas`):**
```json
{
  "room_id": "room01",
  "value": 450,
  "unit": "ppm",
  "time": "2026-09-06 14:15:00"
}
```

**4. Ánh sáng (`light`):**
```json
{
  "room_id": "room01",
  "value": 380.5,
  "unit": "lux",
  "time": "2026-09-06 14:15:00"
}
```

**5. Trạng thái đầu đọc thẻ RFID (`RFID`):**
```json
{
  "room_id": "room01",
  "value": 1,
  "unit": "card",
  "time": "2026-09-06 14:15:00"
}
```

---

# 4. Điều khiển thiết bị

Cấu trúc topic gửi lệnh điều khiển (Server / Web Dashboard → ESP32):

```text
classroom/{room_id}/device/{device_name}/set
```

Danh sách tên thiết bị:

```text
light1   - Đèn 1 (Relay IN1)
light2   - Đèn 2 (Relay IN3 / chân mở rộng)
fan      - Quạt làm mát (Relay IN2)
ac       - Máy điều hòa nhiệt độ (Relay IN4)
light    - [Alias] Điều khiển đồng thời cả 2 đèn (light1 & light2)
all      - [Alias] Điều khiển đồng thời tất cả các thiết bị trong phòng
```

Ví dụ topic:

```text
classroom/room01/device/light1/set
classroom/room01/device/light2/set
classroom/room01/device/fan/set
classroom/room01/device/ac/set
classroom/room01/device/light/set
classroom/room01/device/all/set
```

### Payload điều khiển

Bật thiết bị:

```json
{
  "command": "ON"
}
```

Tắt thiết bị:

```json
{
  "command": "OFF"
}
```

Ví dụ lệnh terminal:

```bash
# Bật đèn 1:
mosquitto_pub -h 127.0.0.1 -p 1883 -t "classroom/room01/device/light1/set" -m '{"command":"ON"}'

# Tắt đèn 1:
mosquitto_pub -h 127.0.0.1 -p 1883 -t "classroom/room01/device/light1/set" -m '{"command":"OFF"}'
```

## 4.1. Chế độ điều khiển Thủ công (MANUAL) và Tự động (AUTO)

Hệ thống sử dụng mô hình **Tự động hóa Tập trung trên Raspberry Pi 5 (`automation_engine.py`)**:
- **ESP32**: Đóng vai trò là **Thin I/O Node / Smart Gateway**: chỉ đo cảm biến (DHT11, BH1750, MQ-2/135, Cửa, RFID) gửi về MQTT; nhận lệnh điều khiển rơ-le / còi buzzer và chấp hành.
- **Raspberry Pi 5**: Đóng vai trò là **Bộ não Tự động hóa**: thu thập dữ liệu thời gian thực, quản lý trạng thái từng phòng riêng biệt, tính toán điều kiện Hysteresis và phát lệnh MQTT điều khiển ngược lại cho ESP32.

Hệ thống hỗ trợ 2 cơ chế điều khiển linh hoạt:
1. **Chế độ phòng (Room-level Mode)**: Cho phép chuyển toàn bộ phòng sang Thủ công hoặc Tự động chỉ bằng 1 nút bấm trên Dashboard hoặc 1 lệnh MQTT / API.
2. **Chế độ thiết bị con (Device-level Mode)**: Cho phép cấu hình Auto độc lập cho từng thiết bị (`light1`, `light2`, `fan`).

### Bảng cơ chế Tự động (AUTO Logic trên Pi 5)

| Thiết bị | Cảm biến kích hoạt | Ngưỡng Tự Động BẬT (ON) | Ngưỡng Tự Động TẮT (OFF) | Ghi chú Logic |
| :--- | :--- | :--- | :--- | :--- |
| **Đèn 1 (`light1`)** | Ánh sáng BH1750 | `lux < 50.0` | `lux > 80.0` | Đèn chính, hoạt động độc lập theo độ sáng |
| **Đèn 2 (`light2`)** | Ánh sáng BH1750 | `lux < 15.0` *(và Đèn 1 đang ON)* | `lux > 25.0` *(hoặc khi Đèn 1 đã OFF)* | Đèn phụ trợ, chỉ bật thêm khi quá tối và tự tắt khi Đèn 1 tắt |
| **Quạt (`fan`)** | Nhiệt độ DHT11 | `temp >= 31.0 °C` | `temp <= 28.5 °C` | Hysteresis 2.5°C chống bật/tắt nhấp nháy |

> **Cơ chế Can thiệp thủ công (Manual Override):** Khi hệ thống đang ở chế độ `AUTO`, nếu người dùng bấm bật/tắt thiết bị thủ công trên Web hoặc gửi lệnh `device/{name}/set`, Pi 5 sẽ **tự động chuyển thiết bị đó (và trạng thái phòng) sang chế độ `MANUAL`**. Điều này đảm bảo cảm biến sẽ không tự ý đè lại thao tác vừa bấm của người dùng! Khi người dùng bấm lại nút `AUTO`, Pi 5 sẽ lập tức đánh giá lại cảm biến và kích hoạt lại điều khiển tự động.

### Topic chuyển chế độ phòng:
```text
classroom/{room_id}/mode/set
```
Payload:
```json
{"mode": "AUTO"}
```
hoặc
```json
{"mode": "MANUAL"}
```

### Topic trạng thái chế độ:
```text
classroom/{room_id}/mode/status
```
Payload:
```json
{
  "room_id": "room01",
  "mode": "AUTO",
  "light1_mode": "AUTO",
  "light2_mode": "AUTO",
  "fan_mode": "AUTO",
  "time": "2026-09-06 15:00:00"
}
```

### Topic chuyển chế độ từng thiết bị:
```text
classroom/{room_id}/device/light1_mode/set  -> {"command": "AUTO" | "MANUAL"}
classroom/{room_id}/device/light2_mode/set  -> {"command": "AUTO" | "MANUAL"}
classroom/{room_id}/device/fan_mode/set     -> {"command": "AUTO" | "MANUAL"}
```

---

# 5. Trạng thái thiết bị

Cấu trúc:

```text
classroom/{room_id}/device/{device_name}/status
```

Ví dụ:

```text
classroom/room01/device/light1/status
```

Payload:

```json
{
  "room_id": "room01",
  "device": "light1",
  "state": "ON",
  "time": "2026-09-06 00:00:00"
}
```

Các trạng thái có thể sử dụng:

```text
ON
OFF
```

---

# 6. Điểm danh RFID

Cấu trúc topic:

```text
classroom/{room_id}/attendance
```

Ví dụ:

```text
classroom/room01/attendance
```

## 6.1. Check-in

Payload:

```json
{
  "room_id": "room01",
  "card_uid": "A1B2C3D4",
  "event_type": "CHECK_IN",
  "timestamp": "2026-09-06 07:05:00",
  "status": "DI_MUON"
}
```

## 6.2. Check-out

Payload:

```json
{
  "room_id": "room01",
  "card_uid": "A1B2C3D4",
  "event_type": "CHECK_OUT",
  "timestamp": "2026-09-06 10:00:00"
}
```

Các `event_type`:

```text
CHECK_IN
CHECK_OUT
```

Ví dụ trạng thái điểm danh:

```text
DI_DUNG_GIO
DI_MUON
```

---

# 7. Cảnh báo

Cấu trúc topic:

```text
classroom/{room_id}/alert
```

Ví dụ:

```text
classroom/room01/alert
```

## 7.1. Phát hiện rò rỉ khí gas

```json
{
  "alert": "GAS_LEAK",
  "level": "DANGER"
}
```

## 7.2. Gas trở lại bình thường

```json
{
  "alert": "GAS_NORMAL",
  "level": "NORMAL"
}
```

Các mức cảnh báo:

```text
NORMAL
WARNING
DANGER
```

---

# 8. Tổng hợp MQTT Topic

| Chức năng           | Topic                                             | Hướng          | Ý nghĩa / Ghi chú |
| ------------------- | ------------------------------------------------- | -------------- | ----------------- |
| Nhiệt độ            | `classroom/{room_id}/sensor/temperature`          | ESP32 → Server | Dữ liệu nhiệt độ DHT11 (°C) |
| Độ ẩm               | `classroom/{room_id}/sensor/humidity`             | ESP32 → Server | Dữ liệu độ ẩm DHT11 (%) |
| Gas                 | `classroom/{room_id}/sensor/gas`                  | ESP32 → Server | Nồng độ khí gas MQ-2 (ppm/ADC) |
| Ánh sáng            | `classroom/{room_id}/sensor/light`                | ESP32 → Server | Cường độ ánh sáng BH1750 (lux) |
| Thẻ RFID (Sensor)   | `classroom/{room_id}/sensor/RFID`                 | ESP32 → Server | Trạng thái quẹt thẻ (1/0) |
| Điều khiển thiết bị | `classroom/{room_id}/device/{device_name}/set`    | Server → ESP32 | Gửi lệnh bật/tắt thiết bị |
| Trạng thái thiết bị | `classroom/{room_id}/device/{device_name}/status` | ESP32 → Server | Phản hồi trạng thái thiết bị |
| Điểm danh RFID      | `classroom/{room_id}/attendance`                  | ESP32 → Server | Gói tin điểm danh học viên |
| Cảnh báo            | `classroom/{room_id}/alert`                       | ESP32 → Server | Cảnh báo khẩn cấp (Gas leak...) |

---

# 8.1. Ma trận Đồng bộ Hóa Toàn Hệ Thống (Topic ⟷ JSON ⟷ Database)

Bảng đối chiếu chuẩn hóa sự đồng bộ giữa các tầng: **ESP32 Firmware**, **MQTT Broker**, **Backend Python**, và **MariaDB Database**:

| Thành phần | Topic MQTT | Format Payload JSON | Bảng Database liên quan | Trường dữ liệu cập nhật |
|---|---|---|---|---|
| **Nhiệt độ** | `classroom/{room_id}/sensor/temperature` | `{"room_id":"...","value":32.5,"unit":"C","time":"..."}` | `sensors`, `sensor_current`, `sensor_data` | `sensors.sensor_name='temperature'`, `value=32.5` |
| **Độ ẩm** | `classroom/{room_id}/sensor/humidity` | `{"room_id":"...","value":65.0,"unit":"%","time":"..."}` | `sensors`, `sensor_current`, `sensor_data` | `sensors.sensor_name='humidity'`, `value=65.0` |
| **Khí gas** | `classroom/{room_id}/sensor/gas` | `{"room_id":"...","value":450,"unit":"ppm","time":"..."}` | `sensors`, `sensor_current`, `sensor_data` | `sensors.sensor_name='gas'`, `value=450` |
| **Ánh sáng** | `classroom/{room_id}/sensor/light` | `{"room_id":"...","value":380.5,"unit":"lux","time":"..."}` | `sensors`, `sensor_current`, `sensor_data` | `sensors.sensor_name='light'`, `value=380.5` |
| **Đầu đọc RFID** | `classroom/{room_id}/sensor/RFID` | `{"room_id":"...","value":1,"unit":"card","time":"..."}` | `sensors`, `sensor_current`, `sensor_data` | `sensors.sensor_name='RFID'`, `value=1` (khi chạm), `0` (khi nhấc) |
| **Điều khiển Đèn 1** | `classroom/{room_id}/device/light1/set` | `{"command":"ON"}` / `{"command":"OFF"}` | -- (Gửi tới ESP32) | -- |
| **Trạng thái Đèn 1** | `classroom/{room_id}/device/light1/status` | `{"room_id":"...","device":"light1","state":"ON"}` | `devices`, `device_current`, `device_logs` | `devices.device_name='light1'`, `state='ON'` |
| **Điều khiển Đèn 2** | `classroom/{room_id}/device/light2/set` | `{"command":"ON"}` / `{"command":"OFF"}` | -- (Gửi tới ESP32) | -- |
| **Trạng thái Đèn 2** | `classroom/{room_id}/device/light2/status` | `{"room_id":"...","device":"light2","state":"ON"}` | `devices`, `device_current`, `device_logs` | `devices.device_name='light2'`, `state='ON'` |
| **Điều khiển Quạt** | `classroom/{room_id}/device/fan/set` | `{"command":"ON"}` / `{"command":"OFF"}` | -- (Gửi tới ESP32) | -- |
| **Trạng thái Quạt** | `classroom/{room_id}/device/fan/status` | `{"room_id":"...","device":"fan","state":"ON"}` | `devices`, `device_current`, `device_logs` | `devices.device_name='fan'`, `state='ON'` |
| **Điều khiển Điều hòa** | `classroom/{room_id}/device/ac/set` | `{"command":"ON"}` / `{"command":"OFF"}` | -- (Gửi tới ESP32) | -- |
| **Trạng thái Điều hòa** | `classroom/{room_id}/device/ac/status` | `{"room_id":"...","device":"ac","state":"ON"}` | `devices`, `device_current`, `device_logs` | `devices.device_name='ac'`, `state='ON'` |
| **Điểm danh quẹt thẻ** | `classroom/{room_id}/attendance` | `{"room_id":"...","card_uid":"A1B2C3D4","event_type":"CHECK_IN","timestamp":"...","status":"DUNG_GIO"}` | `students`, `attendance_logs` | Tra cứu `students.card_uid` → Ghi vào `attendance_logs` (`room_id`, `student_id`, `card_uid`, `event_type`, `status`) |
| **Cảnh báo khẩn cấp** | `classroom/{room_id}/alert` | `{"room_id":"...","alert":"GAS_LEAK","level":"DANGER","time":"..."}` | MQTT Client logs / UI Banner | Cảnh báo gas vượt ngưỡng |

---

# 8.2. Cấu trúc Cơ sở Dữ liệu MariaDB (`Database.sql`)

Cơ sở dữ liệu: `smartclassroom` (Charset: `utf8mb4_unicode_ci`)

```text
                               ┌─────────────┐
                               │    rooms    │
                               └──────┬──────┘
                                      │ 1
                 ┌────────────────────┼────────────────────┐
                 │ n                  │ n                  │ n
          ┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────────┐
          │   sensors   │      │   devices   │      │ attendance_logs │
          └──────┬──────┘      └──────┬──────┘      └────────▲────────┘
                 │ 1                  │ 1                    │ n
          ┌──────┴──────┐      ┌──────┴──────┐               │
        n │             │ 1  n │             │ 1             │
   ┌──────▼──────┐ ┌────▼──────▼┐ ┌──▼───────▼──┐     ┌──────┴──────┐
   │ sensor_data │ │sensor_curr │ │device_logs  │     │  students   │
   └─────────────┘ └────────────┘ └─────────────┘     └─────────────┘
```

### Chi tiết các bảng:

1. **`rooms`** (Danh mục phòng học):
   * `id` (INT, PK, AUTO_INCREMENT)
   * `room_id` (VARCHAR(50), UNIQUE) — Mã định danh phòng (VD: `room01`)
   * `name` (VARCHAR(100)) — Tên hiển thị (VD: `Phòng học 01`)
   * `created_at` (TIMESTAMP)

2. **`sensors`** (Danh mục cảm biến thuộc phòng):
   * `id` (INT, PK, AUTO_INCREMENT)
   * `room_id` (INT, FK → `rooms.id`)
   * `sensor_name` (VARCHAR(50)) — Tên cảm biến (`temperature`, `humidity`, `gas`, `light`, `RFID`)
   * `sensor_type` (VARCHAR(50)) — Loại phần cứng (`DHT11`, `GAS`, `BH1750`, `RC522`)
   * `unit` (VARCHAR(20)) — Đơn vị (`C`, `%`, `ppm`, `lux`, `card`)
   * `created_at` (TIMESTAMP)
   * UNIQUE (`room_id`, `sensor_name`)

3. **`sensor_current`** (Giá trị đo tức thời mới nhất):
   * `sensor_id` (INT, PK, FK → `sensors.id`)
   * `value` (DOUBLE) — Giá trị hiện tại
   * `updated_at` (DATETIME)

4. **`sensor_data`** (Lịch sử biến thiên cảm biến):
   * `id` (BIGINT, PK, AUTO_INCREMENT)
   * `sensor_id` (INT, FK → `sensors.id`)
   * `value` (DOUBLE)
   * `recorded_at` (DATETIME, INDEX)

5. **`devices`** (Danh mục thiết bị điều khiển):
   * `id` (INT, PK, AUTO_INCREMENT)
   * `room_id` (INT, FK → `rooms.id`)
   * `device_name` (VARCHAR(50)) — Tên thiết bị (`light1`, `light2`, `fan`, `ac`, `light`)
   * `device_type` (VARCHAR(50)) — Phân loại (`LED`, `FAN`, `AC`)
   * `created_at` (TIMESTAMP)
   * UNIQUE (`room_id`, `device_name`)

6. **`device_current`** (Trạng thái hiện tại của thiết bị):
   * `device_id` (INT, PK, FK → `devices.id`)
   * `state` (VARCHAR(20)) — `ON` hoặc `OFF`
   * `updated_at` (DATETIME)

7. **`device_logs`** (Nhật ký thao tác bật/tắt thiết bị):
   * `id` (BIGINT, PK, AUTO_INCREMENT)
   * `device_id` (INT, FK → `devices.id`)
   * `action` (VARCHAR(50)) — Hành động (`ON`, `OFF`)
   * `recorded_at` (DATETIME, INDEX)

8. **`students`** (Hồ sơ học viên & Thẻ RFID):
   * `id` (INT, PK, AUTO_INCREMENT)
   * `student_code` (VARCHAR(50), UNIQUE) — Mã học viên (VD: `HV001`)
   * `full_name` (VARCHAR(100)) — Họ và tên (VD: `Nguyễn Văn An`)
   * `card_uid` (VARCHAR(50), UNIQUE, INDEX) — Mã thẻ RFID UID duy nhất (VD: `A1B2C3D4`)
   * `class_name` (VARCHAR(50)) — Lớp học / Khóa đào tạo (VD: `IoT-01`)
   * `email` (VARCHAR(100)), `phone` (VARCHAR(20))
   * `created_at` (TIMESTAMP)

9. **`attendance_logs`** (Nhật ký quẹt thẻ điểm danh):
   * `id` (BIGINT, PK, AUTO_INCREMENT)
   * `room_id` (INT, FK → `rooms.id`) — Phòng học diễn ra điểm danh
   * `student_id` (INT, NULLABLE, FK → `students.id`) — Học viên (NULL nếu thẻ lạ chưa gán)
   * `card_uid` (VARCHAR(50), INDEX) — UID thẻ quẹt thực tế
   * `event_type` (VARCHAR(20)) — `CHECK_IN` hoặc `CHECK_OUT`
   * `status` (VARCHAR(50)) — `DUNG_GIO`, `DI_MUON`, `KHONG_HOP_LE`
   * `recorded_at` (DATETIME, INDEX)

---

# 8.3. Phân Hệ Điểm Danh Học Viên (Attendance Subsystem)

### Luồng Hoạt Động (End-to-End Workflow):
1. **Quẹt thẻ**: Học viên quẹt thẻ RFID lên đầu đọc RC522 gắn với ESP32 tại cửa phòng học.
2. **Xử lý tại ESP32**:
   * ESP32 đọc mã UID thẻ (VD: `A1B2C3D4`).
   * Kiểm tra thời gian: nếu trước 7:00 sáng ghi nhận `DUNG_GIO`, sau 7:00 ghi nhận `DI_MUON`.
   * Phát âm thanh qua còi Buzzer: 1 tiếng beep cho `CHECK_IN`, 2 tiếng beep cho `CHECK_OUT`.
   * Gửi gói tin điểm danh lên MQTT topic `classroom/room01/attendance`.
3. **Backend xử lý**:
   * `mqtt_client.py` nhận gói tin từ MQTT broker.
   * Tự động tra cứu `card_uid` trong bảng `students` để tìm học viên sở hữu thẻ.
   * Lưu bản ghi vào bảng `attendance_logs`.
4. **Hiển thị & Quản lý trên Web**:
   * Bảng nhật ký điểm danh tự động hiển thị học viên vừa quẹt thẻ (Live Auto-refresh).
   * 4 Thẻ thống kê thời gian thực: Tổng số học viên, Đã có mặt, Đi muộn, Chưa điểm danh.
   * Chức năng **"⚡ Lấy UID vừa quẹt"**: Khi cấp thẻ mới, chỉ cần quẹt thẻ lên đầu đọc và bấm nút trên modal để tự động điền mã UID vào hồ sơ học viên.

---

# 9. Flask REST API

Server Flask cung cấp REST API để Dashboard/Web Application giao tiếp với hệ thống.

Base URL:

```text
/api
```

---

## 9.1. Kiểm tra Server

### GET

```text
/api/test
```

Dùng để kiểm tra Flask Server có hoạt động hay không.

Ví dụ:

```bash
curl http://127.0.0.1:5000/api/test
```

---

# 10. Quản lý phòng

## 10.1. Lấy danh sách tất cả phòng

```http
GET /api/rooms
```

Ví dụ:

```text
GET http://127.0.0.1:5000/api/rooms
```

## 10.2. Lấy thông tin một phòng

```http
GET /api/rooms/{room_id}
```

Ví dụ:

```text
GET /api/rooms/room01
```

---

# 11. API cảm biến

## 11.1. Lấy danh sách sensor của phòng

```http
GET /api/rooms/{room_id}/sensors
```

Ví dụ:

```text
GET /api/rooms/room01/sensors
```

## 11.2. Lấy thông tin một sensor

```http
GET /api/rooms/{room_id}/sensors/{sensor_name}
```

Ví dụ:

```text
GET /api/rooms/room01/sensors/temperature
```

## 11.3. Lấy lịch sử sensor

```http
GET /api/rooms/{room_id}/sensors/{sensor_name}/history
```

Ví dụ:

```text
GET /api/rooms/room01/sensors/temperature/history
```

### Giới hạn số lượng bản ghi

Sử dụng tham số `limit`:

```text
GET /api/rooms/room01/sensors/temperature/history?limit=30
```

Ví dụ:

```text
/api/rooms/room01/sensors/temperature/history?limit=30
```

API trả về tối đa 30 bản ghi lịch sử nhiệt độ.

---

# 12. API thiết bị

## 12.1. Lấy danh sách thiết bị

```http
GET /api/rooms/{room_id}/devices
```

Ví dụ:

```text
GET /api/rooms/room01/devices
```

## 12.2. Lấy thông tin một thiết bị

```http
GET /api/rooms/{room_id}/devices/{device_name}
```

Ví dụ:

```text
GET /api/rooms/room01/devices/light1
```

---

# 13. API điều khiển thiết bị

Sử dụng API:

```http
POST /api/rooms/{room_id}/devices/{device_name}/command
```

Ví dụ:

```text
POST /api/rooms/room01/devices/light1/command
```

Request body:

```json
{
  "command": "ON"
}
```

Tắt đèn:

```json
{
  "command": "OFF"
}
```

Luồng xử lý:

```text
Web Dashboard
      │
      │ HTTP POST
      ▼
Flask API
      │
      │ MQTT Publish
      ▼
Mosquitto Broker
      │
      │ MQTT
      ▼
ESP32
      │
      ▼
Light / Fan / AC
```

---

## 13.1. API chế độ điều khiển (MANUAL / AUTO)

### Lấy chế độ hiện tại của phòng:

```http
GET /api/rooms/{room_id}/mode
```

Ví dụ:

```text
GET http://127.0.0.1:5000/api/rooms/room01/mode
```

Response:

```json
{
  "success": true,
  "room_id": "room01",
  "mode": "AUTO"
}
```

### Chuyển đổi chế độ phòng:

```http
POST /api/rooms/{room_id}/mode
```

Headers:
```text
Content-Type: application/json
```

Request body:
```json
{
  "mode": "AUTO"
}
```
hoặc
```json
{
  "mode": "MANUAL"
}
```

Response:
```json
{
  "success": true,
  "room_id": "room01",
  "mode": "AUTO",
  "message": "Đã chuyển sang chế độ AUTO"
}
```

---

# 14. API Học viên & Gán thẻ RFID (`/api/students`)

## 14.1. Lấy danh sách tất cả học viên

```http
GET /api/students
```

Response mẫu:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "student_code": "HV001",
      "full_name": "Nguyễn Văn An",
      "card_uid": "A1B2C3D4",
      "class_name": "IoT-01",
      "email": "an.nguyen@smartclass.edu.vn",
      "phone": "0901234567",
      "created_at": "2026-09-06 14:00:00"
    }
  ]
}
```

## 14.2. Thêm học viên mới

```http
POST /api/students
Content-Type: application/json
```

Request body:

```json
{
  "student_code": "HV005",
  "full_name": "Hoàng Văn Nam",
  "class_name": "IoT-02",
  "card_uid": "E5F60102",
  "email": "nam.hoang@smartclass.edu.vn",
  "phone": "0909876543"
}
```

Response (201 Created):

```json
{
  "success": true,
  "message": "Them hoc vien thanh cong",
  "student_id": 5
}
```

## 14.3. Chỉnh sửa thông tin học viên & gán thẻ

```http
PUT /api/students/{student_id}
Content-Type: application/json
```

Request body:

```json
{
  "student_code": "HV005",
  "full_name": "Hoàng Văn Nam (Đã cập nhật)",
  "class_name": "IoT-02",
  "card_uid": "E5F60102_NEW",
  "email": "nam.new@smartclass.edu.vn",
  "phone": "0909876543"
}
```

## 14.4. Xóa học viên

```http
DELETE /api/students/{student_id}
```

## 14.5. Gán nhanh mã thẻ RFID cho học viên

```http
POST /api/students/{student_id}/assign-card
Content-Type: application/json
```

Request body:

```json
{
  "card_uid": "A1B2C3D4"
}
```

---

# 15. API Điểm danh (`/api/attendance`)

## 15.1. Lấy nhật ký quẹt thẻ điểm danh

```http
GET /api/attendance?date={YYYY-MM-DD}&room_id={room_id}&limit={limit}
```

* `date` (tùy chọn): Lọc theo ngày (mặc định lấy tất cả hoặc ngày được chỉ định).
* `room_id` (tùy chọn): Lọc theo mã phòng (VD: `room01`).
* `limit` (tùy chọn): Giới hạn số lượng bản ghi (mặc định: 50, tối đa: 500).

Response mẫu:

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "room_id": "room01",
      "room_name": "Phòng học 01",
      "student_id": 1,
      "student_code": "HV001",
      "full_name": "Nguyễn Văn An",
      "class_name": "IoT-01",
      "card_uid": "A1B2C3D4",
      "event_type": "CHECK_IN",
      "status": "DUNG_GIO",
      "recorded_at": "2026-09-06T06:55:12"
    }
  ]
}
```

## 15.2. Lấy thống kê điểm danh trong ngày

```http
GET /api/attendance/stats?date={YYYY-MM-DD}&room_id={room_id}
```

Response mẫu:

```json
{
  "success": true,
  "data": {
    "total_students": 30,
    "present_students": 25,
    "late_count": 2,
    "on_time_count": 23,
    "absent_count": 5,
    "unknown_cards": 0
  }
}
```

## 15.3. Lấy thẻ RFID vừa quẹt gần nhất (Quick-scan)

```http
GET /api/attendance/latest-scan
```

Dùng để hỗ trợ giao diện người dùng: Khi quản trị viên đang mở Modal thêm/sửa học viên và bấm **"⚡ Lấy UID vừa quẹt"**, API sẽ trả về bản ghi quẹt thẻ mới nhất để tự động điền mã UID vào form mà không cần nhập tay.

Response mẫu:

```json
{
  "success": true,
  "data": {
    "card_uid": "A1B2C3D4",
    "recorded_at": "2026-09-06T14:15:00",
    "room_id": "room01"
  }
}
```

---

# 16. Kiến trúc tổng thể

```text
                    ┌─────────────────────────────────────────┐
                    │    Web Dashboard & Attendance Portal    │
                    └────────────────────┬────────────────────┘
                                         │
                                        HTTP
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │            Flask API Server             │
                    └──────────┬───────────────────┬──────────┘
                               │                   │
                           MQTT│                   │SQL
                               │                   │
                               ▼                   ▼
                     ┌──────────────────┐    ┌───────────┐
                     │ Mosquitto Broker │    │  MariaDB  │
                     └─────────┬────────┘    │ Database  │
                               │             └───────────┘
                              MQTT
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
       ┌─────────┐        ┌─────────┐        ┌─────────┐
       │  ESP32  │        │  ESP32  │        │  ESP32  │
       │ Room 01 │        │ Room 02 │        │  ...    │
       └────┬────┘        └────┬────┘        └─────────┘
            │                  │
        Sensors            Sensors
        (DHT11, Gas,       (DHT11, Gas,
        Light, RFID)       Light, RFID)
        Devices            Devices
        (Lights, Fan, AC)  (Lights, Fan, AC)
```

---

# 17. MQTT Wildcard

Có thể sử dụng MQTT wildcard để theo dõi nhiều topic.

### Theo dõi toàn bộ dữ liệu của Room01

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/#" -v
```

### Theo dõi tất cả phòng

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/+/#" -v
```

### Theo dõi nhiệt độ của tất cả phòng

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/+/sensor/temperature" -v
```

### Theo dõi trạng thái tất cả thiết bị

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/+/device/+/status" -v
```

### Theo dõi dữ liệu điểm danh từ tất cả phòng

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/+/attendance" -v
```

---

# 18. Công nghệ sử dụng

| Thành phần      | Công nghệ                           |
| --------------- | ----------------------------------- |
| Microcontroller | ESP32 (30-pin, WiFi, SPI, I2C)      |
| Server Host     | Raspberry Pi 5 / PC Windows/Linux   |
| Backend Service | Python 3 + Flask REST API           |
| Database        | MariaDB 11+                         |
| Message Broker  | Eclipse Mosquitto MQTT v2.0+        |
| Frontend Web    | Vanilla HTML5 / Modern CSS3 / JS    |
| Sensors         | Temperature, Humidity, Light, RFID |
| Peripherals     | Relay 4 kênh, Buzzer, RC522, BH1750 |
| Protocols       | MQTT (QoS 1), HTTP/REST, NTP, mDNS  |

---

# 19. Cấu trúc API tổng quát

```text
/api
│
├── /test
│
├── /rooms
│   ├── GET /                          # Danh sách phòng học
│   ├── GET /{room_id}                 # Chi tiết một phòng học
│   │
│   ├── /{room_id}/sensors
│   │   ├── GET /                      # Toàn bộ cảm biến hiện tại của phòng
│   │   ├── GET /{sensor_name}         # Dữ liệu tức thời của 1 cảm biến
│   │   └── GET /{sensor_name}/history # Lịch sử đo đạc (?limit=30)
│   │
│   └── /{room_id}/devices
│       ├── GET /                      # Trạng thái các thiết bị trong phòng
│       ├── GET /{device_name}         # Trạng thái 1 thiết bị
│       └── POST /{device_name}/command # Gửi lệnh điều khiển (ON/OFF)
│
├── /students
│   ├── GET /                          # Danh sách học viên & mã thẻ RFID
│   ├── POST /                         # Thêm học viên mới
│   ├── PUT /{student_id}              # Sửa học viên & cập nhật thẻ RFID
│   ├── DELETE /{student_id}           # Xóa học viên
│   └── POST /{student_id}/assign-card # Gán nhanh thẻ RFID
│
└── /attendance
    ├── GET /                          # Danh sách nhật ký điểm danh (?date=, ?room_id=, ?limit=)
    ├── GET /stats                     # Thống kê điểm danh trong ngày
    └── GET /latest-scan               # Lấy thẻ RFID vừa quẹt gần nhất (hỗ trợ UI gán nhanh)
```

---

# 20. Ghi chú và Nguyên tắc Vận hành

* **Đồng bộ hóa**: Mọi topic, tên cảm biến, tên thiết bị và các trường trong CSDL đều được định danh thống nhất theo chuẩn (ví dụ: `temperature`, `humidity`, `gas`, `light`, `RFID`; `light1`, `light2`, `fan`, `ac`).
* **Hỗ trợ Alias linh hoạt**: 
  - Gửi lệnh tới `light` sẽ tự động điều khiển cả `light1` và `light2`.
  - Gửi lệnh tới `all` sẽ điều khiển toàn bộ thiết bị trong phòng.
  - Hệ thống tự động nhận diện tương thích ngược giữa `RFID` và `door`.
* **Phân hệ Điểm danh độc lập**: Thẻ RFID quẹt tại ESP32 được xử lý lưu trữ vào bảng `attendance_logs` và liên kết trực tiếp với bảng `students`. Quản trị viên có thể thêm, sửa, xóa học viên và gán thẻ tự động ngay trên Web Dashboard.
* **Thời gian thực**: Mọi thay đổi về cảm biến, thiết bị và điểm danh đều được cập nhật tức thời qua MQTT và tự động làm mới trên Web Dashboard.

