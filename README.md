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
mosquitto_pub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/device/light1/set" \
-m '{"command":"ON"}'
```

Ví dụ gửi dữ liệu nhiệt độ:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/sensor/temperature" \
-m '{"room_id":"room01","value":32.5,"unit":"C","time":"2026-09-06 00:00:00"}'
```

### 2.2. Subscribe

`mosquitto_sub` được sử dụng để nhận dữ liệu từ MQTT Broker.

Theo dõi toàn bộ dữ liệu của phòng:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/#" -v
```

Theo dõi trạng thái tất cả thiết bị:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/device/+/status" -v
```

Theo dõi dữ liệu cảm biến:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
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

Các sensor dự kiến:

```text
temperature
humidity
gas
door
```

Ví dụ:

```text
classroom/room01/sensor/temperature
classroom/room01/sensor/humidity
classroom/room01/sensor/gas
classroom/room01/sensor/door
```

### Payload nhiệt độ

```json
{
  "room_id": "room01",
  "value": 32.5,
  "unit": "C",
  "time": "2026-09-06 00:00:00"
}
```

---

# 4. Điều khiển thiết bị

Cấu trúc topic:

```text
classroom/{room_id}/device/{device_name}/set
```

Các thiết bị:

```text
light1
light2
fan
ac
```

Ví dụ:

```text
classroom/room01/device/light1/set
classroom/room01/device/light2/set
classroom/room01/device/fan/set
classroom/room01/device/ac/set
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

Ví dụ bật đèn:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/device/light1/set" \
-m '{"command":"ON"}'
```

Ví dụ tắt đèn:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 \
-t "classroom/room01/device/light1/set" \
-m '{"command":"OFF"}'
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

| Chức năng           | Topic                                             | Hướng          |
| ------------------- | ------------------------------------------------- | -------------- |
| Nhiệt độ            | `classroom/{room_id}/sensor/temperature`          | ESP32 → Server |
| Độ ẩm               | `classroom/{room_id}/sensor/humidity`             | ESP32 → Server |
| Gas                 | `classroom/{room_id}/sensor/gas`                  | ESP32 → Server |
| Cửa                 | `classroom/{room_id}/sensor/door`                 | ESP32 → Server |
| Điều khiển thiết bị | `classroom/{room_id}/device/{device_name}/set`    | Server → ESP32 |
| Trạng thái thiết bị | `classroom/{room_id}/device/{device_name}/status` | ESP32 → Server |
| Điểm danh RFID      | `classroom/{room_id}/attendance`                  | ESP32 → Server |
| Cảnh báo            | `classroom/{room_id}/alert`                       | ESP32 → Server |

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

# 14. Kiến trúc tổng thể

```text
                    ┌─────────────────────┐
                    │    Web Dashboard    │
                    └──────────┬──────────┘
                               │
                              HTTP
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Flask API       │
                    │      Server         │
                    └──────┬───────┬──────┘
                           │       │
                       MQTT│       │SQL
                           │       │
                           ▼       ▼
                 ┌────────────┐  ┌──────────┐
                 │ Mosquitto  │  │ MariaDB  │
                 │   Broker   │  │ Database │
                 └─────┬──────┘  └──────────┘
                       │
                    MQTT
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      ┌───────┐    ┌───────┐    ┌───────┐
      │ ESP32 │    │ ESP32 │    │ ESP32 │
      │Room01 │    │Room02 │    │ ...   │
      └───┬───┘    └───┬───┘    └───────┘
          │             │
       Sensors       Sensors
       Devices       Devices
       RFID          RFID
```

---

# 15. MQTT Wildcard

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

---

# 16. Công nghệ sử dụng

| Thành phần      | Công nghệ                           |
| --------------- | ----------------------------------- |
| Microcontroller | ESP32                               |
| Server          | Raspberry Pi / PC                   |
| Backend         | Flask                               |
| Database        | MariaDB                             |
| Message Broker  | Mosquitto MQTT                      |
| Frontend        | HTML / CSS / JavaScript             |
| Communication   | MQTT / HTTP REST API                |
| Attendance      | RFID                                |
| Sensors         | Temperature / Humidity / Gas / Door |
| Devices         | Light / Fan / AC                    |

---

# 17. Cấu trúc API tổng quát

```text
/api
│
├── /test
│
├── /rooms
│   │
│   ├── GET /
│   ├── GET /{room_id}
│   │
│   ├── /{room_id}/sensors
│   │   ├── GET /
│   │   ├── GET /{sensor_name}
│   │   └── GET /{sensor_name}/history
│   │
│   ├── /{room_id}/devices
│   │   ├── GET /
│   │   ├── GET /{device_name}
│   │   └── POST /{device_name}/command
│
└── ...
```

---

# 18. Ghi chú

* `room_id` dùng để xác định phòng học.
* `sensor_name` dùng để xác định loại cảm biến.
* `device_name` dùng để xác định thiết bị cần điều khiển.
* MQTT Broker chịu trách nhiệm trung gian truyền thông giữa Flask Server và ESP32.
* Flask API được sử dụng cho Web Dashboard.
* Dữ liệu cảm biến và lịch sử hoạt động được lưu vào MariaDB.
* ESP32 chịu trách nhiệm đọc cảm biến, điều khiển thiết bị và gửi dữ liệu lên MQTT Broker.
