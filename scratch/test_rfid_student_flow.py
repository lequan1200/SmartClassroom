import sys
import json
import time
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def test_rfid_flow():
    print("=== KIEM TRA TOAN DIEN CHUC NANG LAY MA RFID KHI THEM HOC VIEN ===")

    # 1. Import modules
    print("\n1. Kiem tra import cac module backend...")
    import database as db
    from app import app
    import mqtt_client as mq
    print(f"   -> Import thanh cong: app, database (DB_HOST={db.DB_HOST}), mqtt_client.")

    client = app.test_client()

    # 2. Test cap nhat the vua quet trong bo nho (MQTT mem cache)
    print("\n2. Kiem tra luu va truy van the RFID vua quet (Memory cache)...")
    test_uid_mem = "TEST_UID_MEM_999"
    mq.cap_nhat_the_vua_quet("room01", test_uid_mem)
    mem_res = mq.lay_the_rfid_vua_quet("room01")
    assert mem_res is not None, "Memory cache khong tim thay the"
    assert mem_res["card_uid"] == test_uid_mem, f"Expected {test_uid_mem}, got {mem_res['card_uid']}"
    print(f"   -> Thanh cong: Memory cache luu duoc the {mem_res['card_uid']} tai phong {mem_res['room_id']}")

    # 3. Test API /api/rooms/room01/rfid-latest va /api/rfid/latest
    print("\n3. Kiem tra API /api/rooms/room01/rfid-latest...")
    resp = client.get("/api/rooms/room01/rfid-latest")
    assert resp.status_code == 200, f"API phai tra ve 200, nhung tra ve {resp.status_code}"
    res_json = json.loads(resp.data.decode("utf-8"))
    assert res_json["success"] is True, "res_json['success'] phai la True"
    assert res_json["data"]["card_uid"] == test_uid_mem, "card_uid khong khop"
    print(f"   -> Thanh cong: API tra ve card_uid = {res_json['data']['card_uid']} tu source = {res_json['data']['source']}")

    # 4. Test fallback xuong MariaDB (attendance_logs) khi mem cache chua co
    print("\n4. Kiem tra fallback doc the tu Database (attendance_logs)...")
    test_uid_db = "TEST_UID_DB_888"
    mq.the_rfid_vua_quet.clear() # Xoa bo nho dem
    assert mq.lay_the_rfid_vua_quet("room01") is None, "Memory cache phai trong"
    
    # Ghi 1 log quet the vao DB
    log_id = db.luu_attendance_log(room_id="room01", card_uid=test_uid_db, event_type="CHECK_IN", status="CHUA_DANG_KY")
    assert log_id, "Khong the ghi log attendance vao DB"
    
    # Goi API rfid-latest xem co fallback vao DB khong
    resp_db = client.get("/api/rooms/room01/rfid-latest")
    assert resp_db.status_code == 200, f"Fallback DB phai tra ve 200, nhung tra ve {resp_db.status_code}"
    res_db_json = json.loads(resp_db.data.decode("utf-8"))
    assert res_db_json["data"]["card_uid"] == test_uid_db, "Fallback DB khong lay dung card_uid"
    assert res_db_json["data"]["source"] == "db_log", "Source phai la db_log"
    print(f"   -> Thanh cong: Khi mat cache RAM, he thong tu dong fallback doc tu DB attendance_logs: card_uid = {res_db_json['data']['card_uid']}")

    # 5. Test them hoc vien vao lop cua room01 su dung card_uid nay
    print("\n5. Kiem tra them hoc vien su dung ma RFID vua lay...")
    new_student_code = f"ST_TEST_{int(time.time())}"
    add_resp = client.post("/api/rooms/room01/students", json={
        "student_code": new_student_code,
        "full_name": "Nguyen Van Test RFID",
        "card_uid": test_uid_db,
        "phone": "0912345678",
        "email": "test_rfid@school.edu.vn"
    })
    assert add_resp.status_code == 201, f"Them hoc vien phai tra ve 201, nhung tra ve {add_resp.status_code}: {add_resp.data}"
    add_data = json.loads(add_resp.data.decode("utf-8"))
    new_student_id = add_data["id"]
    class_id = add_data["class_id"]
    print(f"   -> Thanh cong: Da them hoc vien ID {new_student_id} vao lop ID {class_id} voi ma thẻ {test_uid_db}")

    # 6. Kiem tra truy van danh sach hoc vien
    print("\n6. Kiem tra hoc vien vua tao trong danh sach hoc vien cua lop...")
    list_resp = client.get("/api/rooms/room01/students")
    assert list_resp.status_code == 200, f"Get students phai tra ve 200"
    list_data = json.loads(list_resp.data.decode("utf-8"))
    students = list_data["students"]
    created_student = next((s for s in students if s["id"] == new_student_id), None)
    assert created_student is not None, "Khong tim thay hoc vien vua tao"
    assert created_student["card_uid"] == test_uid_db, f"card_uid khong dung: {created_student['card_uid']}"
    print(f"   -> Thanh cong: Hoc vien {created_student['full_name']} [{created_student['student_code']}] da co the {created_student['card_uid']}")

    # 7. Kiem tra chan trung the RFID
    print("\n7. Kiem tra co che chong trung the RFID...")
    dup_resp = client.post("/api/rooms/room01/students", json={
        "student_code": f"ST_DUP_{int(time.time())}",
        "full_name": "Hoc Vien Trung The",
        "card_uid": test_uid_db
    })
    assert dup_resp.status_code == 400, "He thong phai tu choi trung ma the RFID (status 400)"
    dup_data = json.loads(dup_resp.data.decode("utf-8"))
    print(f"   -> Thanh cong: He thong da ngan chan trung the: {dup_data.get('message')}")

    # 8. Don dep du lieu test
    print("\n8. Don dep du lieu test...")
    del_resp = client.delete(f"/api/classes/{class_id}/students/{new_student_id}")
    assert del_resp.status_code == 200, "Xoa hoc vien test that bai"
    
    # Xoa log test khoi attendance_logs
    conn = db.ket_noi()
    if conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM attendance_logs WHERE card_uid IN (?, ?)", (test_uid_mem, test_uid_db))
        conn.commit()
        cur.close()
        conn.close()
    print("   -> Da don dep xong du lieu test.")

    print("\n=== KET LUAN: TAT CA CAC BUOC KIEM TRA DEU HOAT DONG CHINH XAC 100%! ===")

if __name__ == "__main__":
    test_rfid_flow()
