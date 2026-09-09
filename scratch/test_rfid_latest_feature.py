import sys
import time
import urllib.request
import urllib.parse
import json
import paho.mqtt.client as mqtt

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:5000"
MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883

def http_get(url):
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.getcode(), json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def http_post(url, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.getcode(), json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def http_delete(url):
    req = urllib.request.Request(url, method='DELETE')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.getcode(), json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

def main():
    print("=== BAT DAU KIEM TRA CHUC NANG GAN MA RFID VUA QUET ===")

    # 1. Kiem tra endpoint /api/rfid/latest va /api/rooms/room01/rfid-latest
    print("\n--- 1. Kiem tra API /api/rfid/latest ban dau ---")
    code, res = http_get(f"{BASE_URL}/api/rfid/latest")
    print(f"Status Code: {code}")
    print(f"Response: {res}")

    # 2. Mo phong quet the RFID qua MQTT tren room01
    print("\n--- 2. Mo phong quet the RFID tren phong room01 qua MQTT ---")
    test_card = f"FC{int(time.time()*1000) % 100000:05d}"
    mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"test_pub_{int(time.time()*1000)}")
    try:
        mq.connect(MQTT_BROKER, MQTT_PORT, 10)
        mq.loop_start()
        time.sleep(0.5)
        payload = json.dumps({
            "card_uid": test_card,
            "device": "RFID_RC522",
            "time": time.strftime("%Y-%m-%d %H:%M:%S")
        })
        info = mq.publish("classroom/room01/attendance", payload, qos=1)
        info.wait_for_publish(timeout=3)
        print(f"Da publish len classroom/room01/attendance (is_published={info.is_published()}): {payload}")
        time.sleep(1.5)
        mq.loop_stop()
        mq.disconnect()
    except Exception as e:
        print(f"Loi publish MQTT: {e}")

    # 3. Kiem tra API /api/rooms/room01/rfid-latest
    print("\n--- 3. Kiem tra API lay the vua quet cho room01 ---")
    code1, data1 = http_get(f"{BASE_URL}/api/rooms/room01/rfid-latest")
    print(f"Room01 RFID Latest Status: {code1}")
    print(f"Room01 RFID Latest Data: {data1}")
    assert code1 == 200, f"API phai tra ve 200, nhung tra ve {code1}: {data1}"
    assert data1["data"]["card_uid"] == test_card, f"Expected {test_card}, got {data1['data']['card_uid']}"
    print("=> XAC NHAN: room01 da bat duoc ma the vua quet thanh cong!")

    # 4. Kiem tra tinh co lap phong: room02 khong bi nham the cua room01
    print("\n--- 4. Kiem tra tinh co lap giua cac phong ---")
    code2, data2 = http_get(f"{BASE_URL}/api/rooms/room02/rfid-latest")
    print(f"Room02 RFID Latest Status: {code2}")
    if code2 == 200:
        print(f"Room02 RFID Latest Data: {data2}")
        assert data2["data"]["card_uid"] != test_card, "The cua room01 khong duoc xuat hien tai room02"
        print("Room02 co the rieng, khong trung voi room01 => Tinh co lap chinh xac!")
    else:
        print("Room02 khong co the vua quet cua room01 => Tinh co lap chinh xac!")

    # 5. Them hoc vien moi su dung ma the vua quet tren room01
    print("\n--- 5. Them hoc vien su dung ma the vua quet ---")
    student_code = f"TEST_{int(time.time()) % 10000}"
    post_code, post_data = http_post(f"{BASE_URL}/api/rooms/room01/students", {
        "student_code": student_code,
        "full_name": "Hoc Vien The Quet",
        "card_uid": test_card,
        "phone": "0987654321",
        "email": "testcard@gmail.com"
    })
    print(f"POST Student Status: {post_code}")
    print(f"POST Student Response: {post_data}")
    assert post_code == 201, f"Them hoc vien phai tra ve 201, nhung tra ve {post_code}: {post_data}"
    student_id = post_data.get("student_id") or post_data.get("id")

    # 6. Kiem tra hoc vien da co card_uid trong danh sach hoc vien cua lop
    print("\n--- 6. Kiem tra danh sach hoc vien room01 ---")
    list_code, list_data = http_get(f"{BASE_URL}/api/rooms/room01/students")
    students = list_data["data"] if isinstance(list_data["data"], list) else list_data["data"].get("students", [])
    st_found = next((s for s in students if s["id"] == student_id), None)
    assert st_found is not None, f"Hoc vien {student_id} phai co trong danh sach"
    assert st_found["card_uid"] == test_card, f"card_uid phai la {test_card}"
    print(f"=> XAC NHAN: Hoc vien {st_found['full_name']} (Ma: {st_found['student_code']}) da duoc gan the RFID {st_found['card_uid']}")

    # 7. Don dep du lieu test
    print("\n--- 7. Don dep du lieu test ---")
    class_id = post_data.get("class_id") or 1
    del_code, del_res = http_delete(f"{BASE_URL}/api/classes/{class_id}/students/{student_id}")
    print(f"Xoa hoc vien test: {del_code} - {del_res}")

    print("\n=== TAT CA CAC KIEM TRA HOAN TAT XUAT SAC ===")

if __name__ == "__main__":
    main()
