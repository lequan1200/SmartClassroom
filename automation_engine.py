"""
automation_engine.py - SmartClassroom Central Automation Engine for Raspberry Pi 5
Quản lý toàn bộ logic tự động hóa cho các phòng học:
- Phân biệt và quản lý trạng thái độc lập theo từng room_id.
- Đánh giá cảm biến thời gian thực (ánh sáng BH1750, nhiệt độ DHT11, độ ẩm DHT11).
- Tự động điều khiển Đèn 1, Đèn 2 với ngưỡng Hysteresis chống chập chờn.
- Tự động điều khiển Quạt theo nhiệt độ với ngưỡng Hysteresis.
- Quản lý chế độ AUTO / MANUAL và cơ chế can thiệp thủ công (Manual Override).
- Hỗ trợ cấu hình ngưỡng tùy chỉnh theo từng phòng (Per-Room Thresholds).
"""

import json
import os
import threading
from typing import Callable, Dict, Optional

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "automation_config.json")

# Ngưỡng mặc định cho từng loại thiết bị / cảm biến
DEFAULT_THRESHOLDS = {
    "lux_light1_on": 50.0,       # lux < 50.0 -> Bật Đèn 1
    "lux_light1_off": 80.0,      # lux > 80.0 -> Tắt Đèn 1
    "lux_light2_on": 15.0,       # lux < 15.0 (và Đèn 1 đang ON) -> Bật thêm Đèn 2
    "lux_light2_off": 25.0,      # lux > 25.0 (hoặc Đèn 1 OFF) -> Tắt Đèn 2
    "temp_fan_on": 31.0,         # temp >= 31.0 -> Bật Quạt
    "temp_fan_off": 28.5,        # temp <= 28.5 -> Tắt Quạt
}


class RoomAutomationState:
    """Lưu trữ trạng thái tự động hóa độc lập của một phòng học."""

    def __init__(self, room_id: str, thresholds: Optional[Dict[str, float]] = None):
        self.room_id = room_id
        self.thresholds = dict(DEFAULT_THRESHOLDS)
        if thresholds:
            self.thresholds.update(thresholds)

        # Chế độ chung của phòng: 'AUTO' hoặc 'MANUAL'
        self.mode = "MANUAL"

        # Chế độ riêng cho từng thiết bị
        self.device_modes = {
            "light1": "MANUAL",
            "light2": "MANUAL",
            "fan": "MANUAL",
            "ac": "MANUAL"
        }

        # Trạng thái thiết bị hiện tại ('ON' hoặc 'OFF')
        self.device_states = {
            "light1": "OFF",
            "light2": "OFF",
            "fan": "OFF",
            "ac": "OFF"
        }

        # Dữ liệu cảm biến mới nhất
        self.sensors = {
            "light": None,
            "temperature": None,
            "humidity": None
        }


class AutomationEngine:
    """Bộ não tự động hóa trung tâm chạy trên Raspberry Pi 5."""

    def __init__(self,
                 command_callback: Optional[Callable[[str, str, str, str], None]] = None,
                 alert_callback: Optional[Callable[[str, str, str, str], None]] = None,
                 buzzer_callback: Optional[Callable[[str, int, bool], None]] = None):
        """
        :param command_callback: func(room_id, device_name, command, reason)
        :param alert_callback: func(room_id, alert_type, level, message)
        :param buzzer_callback: func(room_id, beeps, alarm)
        """
        self.command_callback = command_callback
        self.alert_callback = alert_callback
        self.buzzer_callback = buzzer_callback

        self._lock = threading.RLock()
        self.rooms: Dict[str, RoomAutomationState] = {}
        self.load_config()

    # ============================================================
    # CẤU HÌNH NGƯỠNG (PER-ROOM CONFIGURATION)
    # ============================================================

    def load_config(self):
        """Đọc file cấu hình ngưỡng riêng của từng phòng nếu có."""
        if not os.path.exists(CONFIG_FILE):
            return
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for room_id, cfg in data.items():
                        room = self._get_or_create_room(room_id)
                        if isinstance(cfg, dict):
                            room.thresholds.update(cfg)
            print(f"[AUTOMATION] Da tai cau hinh nguong tu {CONFIG_FILE}")
        except Exception as e:
            print(f"[AUTOMATION] Loi doc file cau hinh: {e}")

    def save_config(self):
        """Lưu cấu hình ngưỡng hiện tại của các phòng ra file JSON."""
        try:
            data = {}
            with self._lock:
                for room_id, room in self.rooms.items():
                    data[room_id] = room.thresholds
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"[AUTOMATION] Da luu cau hinh nguong toi {CONFIG_FILE}")
            return True
        except Exception as e:
            print(f"[AUTOMATION] Loi luu file cau hinh: {e}")
            return False

    def set_room_thresholds(self, room_id: str, new_thresholds: Dict[str, float]) -> bool:
        """Cập nhật ngưỡng tùy chỉnh cho một phòng cụ thể."""
        with self._lock:
            room = self._get_or_create_room(room_id)
            for k, v in new_thresholds.items():
                if k in DEFAULT_THRESHOLDS:
                    try:
                        room.thresholds[k] = float(v)
                    except (ValueError, TypeError):
                        pass
        self.save_config()
        # Đánh giá lại ngay lập tức với ngưỡng mới
        self.reevaluate_room(room_id)
        return True

    def get_room_thresholds(self, room_id: str) -> Dict[str, float]:
        """Lấy ngưỡng cấu hình của một phòng."""
        with self._lock:
            room = self._get_or_create_room(room_id)
            return dict(room.thresholds)

    def _get_or_create_room(self, room_id: str) -> RoomAutomationState:
        if room_id not in self.rooms:
            self.rooms[room_id] = RoomAutomationState(room_id)
        return self.rooms[room_id]

    # ============================================================
    # ĐỒNG BỘ TRẠNG THÁI THIẾT BỊ VÀ CHẾ ĐỘ
    # ============================================================

    def sync_device_state(self, room_id: str, device_name: str, state: str):
        """Cập nhật trạng thái vật lý thực tế của thiết bị (từ MQTT status hoặc DB)."""
        with self._lock:
            room = self._get_or_create_room(room_id)
            dev_key = device_name.lower()
            if dev_key in room.device_states:
                room.device_states[dev_key] = state.upper()

    def get_room_mode(self, room_id: str) -> str:
        with self._lock:
            room = self._get_or_create_room(room_id)
            return room.mode

    def set_room_mode(self, room_id: str, mode: str):
        """Chuyển chế độ chung của phòng ('AUTO' hoặc 'MANUAL')."""
        mode_upper = mode.upper()
        if mode_upper not in ["AUTO", "MANUAL"]:
            return False

        with self._lock:
            room = self._get_or_create_room(room_id)
            room.mode = mode_upper
            # Đồng bộ chế độ cho tất cả thiết bị thuộc diện tự động
            for dev in ["light1", "light2", "fan"]:
                room.device_modes[dev] = mode_upper

        print(f"[AUTOMATION] Phong {room_id} -> Chuyen che do sang {mode_upper}")

        # Nếu vừa chuyển sang AUTO, lập tức đánh giá lại theo cảm biến hiện thời
        if mode_upper == "AUTO":
            self.reevaluate_room(room_id)
        return True

    def notify_manual_override(self, room_id: str, device_name: str, command: str):
        """
        Cơ chế Can thiệp Thủ công (Manual Override):
        Khi người dùng bấm nút bật/tắt thiết bị trên Dashboard / API,
        hệ thống tự động chuyển thiết bị đó sang MANUAL để cảm biến không tự ý đè lại.
        """
        dev_key = device_name.lower()
        with self._lock:
            room = self._get_or_create_room(room_id)

            if dev_key in ["light", "all"]:
                # Chuyển cả phòng sang MANUAL
                room.mode = "MANUAL"
                room.device_modes["light1"] = "MANUAL"
                room.device_modes["light2"] = "MANUAL"
                if dev_key == "all":
                    room.device_modes["fan"] = "MANUAL"
            elif dev_key in room.device_modes:
                room.device_modes[dev_key] = "MANUAL"
                room.mode = "MANUAL"

            # Cập nhật trạng thái dự kiến
            if dev_key in room.device_states:
                room.device_states[dev_key] = command.upper()

        print(f"[AUTOMATION] Phong {room_id} -> Thao tac thu cong {dev_key}={command} => Chuyen sang MANUAL")

    # ============================================================
    # XỬ LÝ DỮ LIỆU CẢM BIẾN & ĐÁNH GIÁ TỰ ĐỘNG
    # ============================================================

    def process_sensor_data(self, room_id: str, sensor_name: str, value: float):
        """
        Được gọi mỗi khi mqtt_client nhận được dữ liệu cảm biến mới từ ESP32.
        Phân loại cảm biến và kích hoạt logic điều khiển tương ứng.
        """
        s_name = str(sensor_name).lower()

        with self._lock:
            room = self._get_or_create_room(room_id)

            if s_name in ["light", "lux"]:
                room.sensors["light"] = float(value)
                self._evaluate_lights(room)

            elif s_name in ["temperature", "temp"]:
                room.sensors["temperature"] = float(value)
                self._evaluate_fan(room)

            elif s_name in ["humidity", "hum"]:
                room.sensors["humidity"] = float(value)

            elif s_name in ["air_quality", "aq", "airquality"]:
                room.sensors["air_quality"] = float(value)

    def reevaluate_room(self, room_id: str):
        """Đánh giá lại toàn bộ các thiết bị của phòng dựa trên giá trị cảm biến hiện có."""
        with self._lock:
            room = self._get_or_create_room(room_id)
            if room.sensors["light"] is not None:
                self._evaluate_lights(room)
            if room.sensors["temperature"] is not None:
                self._evaluate_fan(room)

    # ------------------------------------------------------------
    # LOGIC 1: TỰ ĐỘNG HÓA ĐÈN (BH1750 Lux -> Light 1 & Light 2)
    # ------------------------------------------------------------
    def _evaluate_lights(self, room: RoomAutomationState):
        lux = room.sensors.get("light")
        if lux is None:
            return

        cfg = room.thresholds
        light1_mode = room.device_modes["light1"]
        light2_mode = room.device_modes["light2"]

        cur_l1 = room.device_states["light1"]
        cur_l2 = room.device_states["light2"]

        # 1. Đèn 1 (Đèn chính - hoạt động theo lux)
        if light1_mode == "AUTO":
            if cur_l1 != "ON" and lux < cfg["lux_light1_on"]:
                self._send_command(room.room_id, "light1", "ON", f"Lux={lux:.1f} < {cfg['lux_light1_on']}")
                room.device_states["light1"] = "ON"
            elif cur_l1 == "ON" and lux > cfg["lux_light1_off"]:
                self._send_command(room.room_id, "light1", "OFF", f"Lux={lux:.1f} > {cfg['lux_light1_off']}")
                room.device_states["light1"] = "OFF"

        # Cập nhật lại trạng thái Đèn 1 sau khi đánh giá
        cur_l1 = room.device_states["light1"]

        # 2. Đèn 2 (Đèn phụ trợ - chỉ bật khi Đèn 1 đang bật và vẫn quá tối)
        if light2_mode == "AUTO":
            if cur_l2 != "ON" and cur_l1 == "ON" and lux < cfg["lux_light2_on"]:
                self._send_command(room.room_id, "light2", "ON", f"Lux={lux:.1f} < {cfg['lux_light2_on']} (Light 1 ON)")
                room.device_states["light2"] = "ON"
            elif cur_l2 == "ON":
                # Tắt Đèn 2 nếu đủ sáng hoặc Đèn 1 đã tắt
                if lux > cfg["lux_light2_off"] or cur_l1 != "ON":
                    reason = f"Lux={lux:.1f} > {cfg['lux_light2_off']}" if cur_l1 == "ON" else "Light 1 da TAT"
                    self._send_command(room.room_id, "light2", "OFF", reason)
                    room.device_states["light2"] = "OFF"

    # ------------------------------------------------------------
    # LOGIC 2: TỰ ĐỘNG HÓA QUẠT (DHT11 Nhiệt độ -> Quạt)
    # ------------------------------------------------------------
    def _evaluate_fan(self, room: RoomAutomationState):
        temp = room.sensors.get("temperature")
        if temp is None or temp <= 0:
            return

        cfg = room.thresholds
        fan_mode = room.device_modes["fan"]
        cur_fan = room.device_states["fan"]

        if fan_mode == "AUTO":
            if cur_fan != "ON" and temp >= cfg["temp_fan_on"]:
                self._send_command(room.room_id, "fan", "ON", f"Nhiet do={temp:.1f}°C >= {cfg['temp_fan_on']}°C")
                room.device_states["fan"] = "ON"
            elif cur_fan == "ON" and temp <= cfg["temp_fan_off"]:
                self._send_command(room.room_id, "fan", "OFF", f"Nhiet do={temp:.1f}°C <= {cfg['temp_fan_off']}°C")
                room.device_states["fan"] = "OFF"

    # ------------------------------------------------------------
    # HÀM PHÁT LỆNH THỰC THI (DISPATCH)
    # ------------------------------------------------------------
    def _send_command(self, room_id: str, device_name: str, command: str, reason: str):
        print(f"[AUTO DECISION] Phong: {room_id} | Thiet bi: {device_name} -> {command} | Ly do: {reason}")
        if self.command_callback:
            try:
                self.command_callback(room_id, device_name, command, reason)
            except Exception as e:
                print(f"[AUTO ERROR] Loi goi command_callback: {e}")


# Khởi tạo thể hiện Singleton mặc định
engine = AutomationEngine()
