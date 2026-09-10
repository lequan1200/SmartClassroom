import sys
import os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath("."))
from database import (
    ket_noi,
    tim_sensor_id,
    lay_sensor,
    lay_sensor_hien_tai,
    lay_sensor_history,
    tim_device_id,
    lay_device_hien_tai,
    lay_danh_sach_phong,
    lay_phong,
    lay_hoc_vien_theo_phong,
    lay_danh_sach_lop,
    lay_thoi_khoa_bieu
)

def run_tests():
    print("Testing DB connection...")
    conn = ket_noi()
    assert conn is not None, "Connection failed!"
    conn.close()
    print("✓ DB connection OK")

    # 1. Test tim_sensor_id for air_quality and alias
    s1 = tim_sensor_id("room01", "air_quality")
    print(f"tim_sensor_id('room01', 'air_quality') -> {s1}")
    assert s1 == 3, f"Expected 3, got {s1}"

    s2 = tim_sensor_id("room02", "air_quality")
    print(f"tim_sensor_id('room02', 'air_quality') -> {s2}")
    assert s2 == 8, f"Expected 8, got {s2}"

    # Test alias backward compatibility
    s1_alias = tim_sensor_id("room01", "gas")
    print(f"tim_sensor_id('room01', 'gas') [alias fallback] -> {s1_alias}")
    assert s1_alias == 3, f"Expected 3, got {s1_alias}"

    # 2. Test lay_sensor_hien_tai
    sensors_r1 = lay_sensor_hien_tai("room01")
    print(f"\nSensors for room01 ({len(sensors_r1)} sensors):")
    aq_sensor_r1 = None
    for s in sensors_r1:
        print(f"  {s['sensor_name']} ({s['unit']}): {s['value']} @ {s['updated_at']}")
        if s["sensor_name"] == "air_quality":
            aq_sensor_r1 = s
    assert aq_sensor_r1 is not None, "air_quality sensor missing from room01"
    assert aq_sensor_r1["unit"] == "raw", f"Expected unit 'raw', got {aq_sensor_r1['unit']}"

    # 3. Test lay_sensor
    sensor_aq = lay_sensor("room01", "air_quality")
    print(f"\nlay_sensor('room01', 'air_quality') -> {sensor_aq}")
    assert sensor_aq is not None
    assert sensor_aq["sensor_type"] == "MQ135"

    # 4. Test lay_danh_sach_phong
    rooms = lay_danh_sach_phong()
    print(f"\nRooms ({len(rooms)}):")
    for r in rooms:
        print(f"  [{r['room_id']}] {r['name']} | Mode: {r['control_mode']} | Class: {r['class_code']} - {r['class_name']} | Students: {r['student_count']}")

    # 5. Test students by room
    students_r2 = lay_hoc_vien_theo_phong("room02")
    print(f"\nStudents in room02 ({len(students_r2)}):")
    for st in students_r2:
        print(f"  [{st['student_code']}] {st['full_name']} | RFID: {st['card_uid']}")

    # 6. Test schedules
    schedules = lay_thoi_khoa_bieu()
    print(f"\nSchedules ({len(schedules) if schedules else 0}):")
    if schedules:
        for sch in schedules:
            print(f"  Schedule #{sch['id']} | Subject: {sch['subject_name']} | Room: {sch['room_id']} | Time: {sch['start_time']}-{sch['end_time']}")

    print("\n==================================================")
    print("  ALL DATABASE VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
