import urllib.request
import urllib.parse
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:5000"

def request(method, path, body=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            return resp.status, json.loads(resp_body) if resp_body.strip().startswith(("{", "[")) else resp_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body

def run_tests():
    print("==================================================")
    print("  TEST: ROOM & CLASS STRICT ISOLATION SYSTEM")
    print("==================================================")

    # 1. Check HTML for locked nav-class-students initially
    print("\n[TEST 1] Check HTML for locked 'Học viên' tab when unselected...")
    req = urllib.request.Request(f"{BASE_URL}/", method="GET")
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8")
    
    assert 'id="nav-class-students"' in html, "nav-class-students ID not found in HTML"
    assert 'class="nav-item disabled" data-tab="class-students" id="nav-class-students"' in html, "nav-class-students not disabled initially"
    assert 'id="nav-class-students-tag">🔒 Khóa</span>' in html, "nav-class-students-tag not locked initially"
    assert 'id="class-scope-name-display"' in html, "class-scope-name-display not found"
    print("  --> PASS: 'Học viên' tab is strictly disabled with '🔒 Khóa' in HTML!")

    # 2. Check /api/rooms mapping
    print("\n[TEST 2] Check /api/rooms mapping (room01 -> CNTT01, room02 -> CNTT02)...")
    status, res = request("GET", "/api/rooms")
    assert status == 200, f"Failed GET /api/rooms: {status}"
    rooms = res.get("data", [])
    assert len(rooms) >= 2, "Expected at least 2 rooms"
    
    r1 = next((r for r in rooms if r["room_id"] == "room01"), None)
    r2 = next((r for r in rooms if r["room_id"] == "room02"), None)
    assert r1 is not None, "room01 not found"
    assert r2 is not None, "room02 not found"
    assert r1.get("class_code") == "CNTT01", f"room01 class_code expected CNTT01, got {r1.get('class_code')}"
    assert r2.get("class_code") == "CNTT02", f"room02 class_code expected CNTT02, got {r2.get('class_code')}"
    print(f"  --> PASS: room01 tied to [{r1['class_code']}] {r1['class_name']}")
    print(f"  --> PASS: room02 tied to [{r2['class_code']}] {r2['class_name']}")

    # 3. Check /api/rooms/<room_id>/students endpoints
    print("\n[TEST 3] Check /api/rooms/<room_id>/students class metadata...")
    status, res1 = request("GET", "/api/rooms/room01/students")
    assert status == 200 and res1.get("class", {}).get("class_code") == "CNTT01"
    status, res2 = request("GET", "/api/rooms/room02/students")
    assert status == 200 and res2.get("class", {}).get("class_code") == "CNTT02"
    print("  --> PASS: room01 students API returns CNTT01 metadata, room02 returns CNTT02 metadata!")

    # 4. Test Student Strict Isolation
    print("\n[TEST 4] Test Student Isolation between room01 and room02...")
    # Add student to room01
    code1 = "DEMO_R01_01"
    status, add1 = request("POST", "/api/rooms/room01/students", {
        "student_code": code1,
        "full_name": "Học Viên Room01 Only",
        "card_uid": "CARD_R01_99"
    })
    assert status == 201, f"Failed adding student to room01: {status} {add1}"
    student1_id = add1.get("id")

    # Add student to room02
    code2 = "DEMO_R02_02"
    status, add2 = request("POST", "/api/rooms/room02/students", {
        "student_code": code2,
        "full_name": "Học Viên Room02 Only",
        "card_uid": "CARD_R02_99"
    })
    assert status == 201, f"Failed adding student to room02: {status} {add2}"
    student2_id = add2.get("id")

    # Query room01 students
    status, list1 = request("GET", "/api/rooms/room01/students")
    r1_codes = [s["student_code"] for s in list1.get("data", [])]
    assert code1 in r1_codes, f"{code1} should be in room01 students"
    assert code2 not in r1_codes, f"VIOLATION: {code2} found in room01 students!"

    # Query room02 students
    status, list2 = request("GET", "/api/rooms/room02/students")
    r2_codes = [s["student_code"] for s in list2.get("data", [])]
    assert code2 in r2_codes, f"{code2} should be in room02 students"
    assert code1 not in r2_codes, f"VIOLATION: {code1} found in room02 students!"

    print(f"  --> PASS: Student {code1} is strictly in room01, NOT in room02.")
    print(f"  --> PASS: Student {code2} is strictly in room02, NOT in room01.")

    # 5. Test Timetable (TKB) Strict Isolation
    print("\n[TEST 5] Test Timetable (TKB) Strict Isolation...")
    # Create schedule in room01
    status, sched1 = request("POST", "/api/schedules", {
        "subject_name": "Lap Trinh IoT Room01",
        "room_id": "room01",
        "weekday": 2,
        "start_time": "08:00:00",
        "end_time": "10:30:00"
    })
    assert status == 201, f"Failed creating schedule for room01: {status} {sched1}"
    sched1_id = sched1.get("id")

    # Create schedule in room02
    status, sched2 = request("POST", "/api/schedules", {
        "subject_name": "He Dieu Hanh Room02",
        "room_id": "room02",
        "weekday": 3,
        "start_time": "13:30:00",
        "end_time": "16:00:00"
    })
    assert status == 201, f"Failed creating schedule for room02: {status} {sched2}"
    sched2_id = sched2.get("id")

    # Query schedules for room01
    status, s_list1 = request("GET", "/api/schedules?room_id=room01")
    s1_subjects = [s["subject_name"] for s in s_list1.get("data", [])]
    assert "Lap Trinh IoT Room01" in s1_subjects, "room01 schedule missing"
    assert "He Dieu Hanh Room02" not in s1_subjects, "VIOLATION: room02 schedule found in room01!"

    # Query schedules for room02
    status, s_list2 = request("GET", "/api/schedules?room_id=room02")
    s2_subjects = [s["subject_name"] for s in s_list2.get("data", [])]
    assert "He Dieu Hanh Room02" in s2_subjects, "room02 schedule missing"
    assert "Lap Trinh IoT Room01" not in s2_subjects, "VIOLATION: room01 schedule found in room02!"

    print("  --> PASS: Timetable for room01 contains ONLY room01 schedules.")
    print("  --> PASS: Timetable for room02 contains ONLY room02 schedules.")

    # 6. Test MQTT Sync Endpoint
    print("\n[TEST 6] Test MQTT sync endpoint for room...")
    status, sync_res = request("POST", "/api/rooms/room01/students/sync-mqtt")
    assert status == 200, f"MQTT sync failed: {status} {sync_res}"
    print(f"  --> PASS: MQTT sync executed: {sync_res.get('message')}")

    # 7. Cleanup test data
    print("\n[CLEANUP] Cleaning up test data...")
    if student1_id:
        request("DELETE", f"/api/classes/1/students/{student1_id}")
    if student2_id:
        request("DELETE", f"/api/classes/2/students/{student2_id}")
    if sched1_id:
        request("DELETE", f"/api/schedules/{sched1_id}")
    if sched2_id:
        request("DELETE", f"/api/schedules/{sched2_id}")
    print("  --> PASS: Cleaned up test students and test schedules.")

    print("\n==================================================")
    print("  ALL 6 STRICT ISOLATION TESTS PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
