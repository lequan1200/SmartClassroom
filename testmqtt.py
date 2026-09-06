import paho.mqtt.client as mqtt


def on_connect(client, userdata, flags, reason_code, properties):
    print("CONNECTED")
    print("reason_code =", reason_code)
    print("value =", reason_code.value)
    print("name =", reason_code.getName())

    if reason_code == 0:
        result = client.subscribe("classroom/#", qos=1)
        print("SUBSCRIBE:", result)


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
    print()
    print("========== DISCONNECT ==========")
    print("reason_code =", reason_code)
    print("value =", reason_code.value)
    print("name =", reason_code.getName())
    print("flags =", disconnect_flags)
    print("================================")


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="test-python-client-001"
)

client.on_connect = on_connect
client.on_disconnect = on_disconnect

print("CONNECTING...")

client.connect(
    "127.0.0.1",
    1883,
    60
)

print("LOOP START")

client.loop_forever()