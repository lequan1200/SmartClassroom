#include <WiFi.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// =====================================================
// 1. CẤU HÌNH WIFI
// =====================================================

const char* WIFI_SSID = "Dong Trung Ha Thao T2";
const char* WIFI_PASS = "Binhhien1974";

// =====================================================
// 2. CẤU HÌNH MQTT
// =====================================================

// Không dùng IP Raspberry Pi nữa
// ESP32 sẽ tự tìm mypi5.local bằng mDNS

const char* MQTT_HOSTNAME = "mypi5";
const int MQTT_PORT = 1883;

// =====================================================
// 3. CẤU HÌNH PHÒNG
// =====================================================

#define ROOM_ID "room01"

// =====================================================
// 4. CẤU HÌNH PHẦN CỨNG
// =====================================================

#define LED_PIN 2
#define DHT_PIN 4

DHT dht(DHT_PIN, DHT11);

// =====================================================
// 5. MQTT
// =====================================================

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// IP hiện tại của Raspberry Pi
IPAddress mqttServerIP;

// =====================================================
// 6. MQTT TOPIC
// =====================================================

String topicSet;
String topicStatus;
String topicTemp;
String topicHum;

// =====================================================
// 7. GỬI STATUS THIẾT BỊ
// =====================================================

void guiStatus(const char* state)
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

    json["state"] = state;

    char buffer[128];

    serializeJson(json, buffer);

    bool result = mqtt.publish(
        topicStatus.c_str(),
        buffer,
        true
    );

    Serial.print("TX STATUS: ");
    Serial.print(buffer);

    if (result)
    {
        Serial.println(" -> OK");
    }
    else
    {
        Serial.println(" -> FAILED");
    }
}

// =====================================================
// 8. GỬI DỮ LIỆU CẢM BIẾN
// =====================================================

void guiSensor(
    const char* topic,
    float value,
    const char* unit
)
{
    if (!mqtt.connected())
    {
        return;
    }

    JsonDocument json;

    json["value"] = value;
    json["unit"] = unit;

    char buffer[128];

    serializeJson(json, buffer);

    bool result = mqtt.publish(
        topic,
        buffer
    );

    Serial.print("TX SENSOR: ");
    Serial.print(topic);
    Serial.print(" -> ");
    Serial.print(buffer);

    if (result)
    {
        Serial.println(" -> OK");
    }
    else
    {
        Serial.println(" -> FAILED");
    }
}

// =====================================================
// 9. ĐỌC DHT11
// =====================================================

void docDHT11()
{
    float hum = dht.readHumidity();
    float temp = dht.readTemperature();

    // Kiểm tra lỗi cảm biến
    if (isnan(temp) || isnan(hum))
    {
        Serial.println("DHT11 ERROR");
        return;
    }

    Serial.print("DHT11: ");
    Serial.print("Temperature = ");
    Serial.print(temp);
    Serial.print(" C | Humidity = ");
    Serial.print(hum);
    Serial.println(" %");

    // Gửi nhiệt độ
    guiSensor(
        topicTemp.c_str(),
        temp,
        "C"
    );

    // Gửi độ ẩm
    guiSensor(
        topicHum.c_str(),
        hum,
        "%"
    );
}

// =====================================================
// 10. XỬ LÝ MQTT COMMAND
// =====================================================

void xuLyMQTT(
    char* topic,
    byte* payload,
    unsigned int length
)
{
    String data;

    // Chuyển payload thành String
    for (unsigned int i = 0; i < length; i++)
    {
        data += (char)payload[i];
    }

    Serial.println();
    Serial.println("========== MQTT RX ==========");

    Serial.print("Topic: ");
    Serial.println(topic);

    Serial.print("Payload: ");
    Serial.println(data);

    Serial.println("=============================");

    // =================================================
    // Parse JSON
    // =================================================

    JsonDocument json;

    DeserializationError error =
        deserializeJson(json, data);

    if (error)
    {
        Serial.print("JSON ERROR: ");
        Serial.println(error.c_str());

        guiStatus("INVALID_JSON");

        return;
    }

    // =================================================
    // Lấy command
    // =================================================

    const char* command = json["state"];

    if (command == nullptr)
    {
        Serial.println("COMMAND ERROR");

        guiStatus("INVALID_COMMAND");

        return;
    }

    // =================================================
    // COMMAND ON
    // =================================================

    if (!strcmp(command, "ON"))
    {
        digitalWrite(
            LED_PIN,
            HIGH
        );

        Serial.println("LED -> ON");

        guiStatus("ON");
    }

    // =================================================
    // COMMAND OFF
    // =================================================

    else if (!strcmp(command, "OFF"))
    {
        digitalWrite(
            LED_PIN,
            LOW
        );

        Serial.println("LED -> OFF");

        guiStatus("OFF");
    }

    // =================================================
    // COMMAND PING
    // =================================================

    else if (!strcmp(command, "PING"))
    {
        Serial.println("PING received");

        guiStatus("ONLINE");
    }

    // =================================================
    // COMMAND KHÔNG HỢP LỆ
    // =================================================

    else
    {
        Serial.print("UNKNOWN COMMAND: ");
        Serial.println(command);

        guiStatus("UNKNOWN_COMMAND");
    }
}

// =====================================================
// 11. KẾT NỐI WIFI
// =====================================================

bool ketNoiWiFi()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        return true;
    }

    Serial.println();
    Serial.println("================================");
    Serial.println("DANG KET NOI WIFI");
    Serial.println("================================");

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASS
    );

    int lanThu = 0;

    while (
        WiFi.status() != WL_CONNECTED &&
        lanThu < 30
    )
    {
        delay(500);

        Serial.print(".");

        lanThu++;
    }

    Serial.println();

    // =================================================
    // Kiểm tra kết quả
    // =================================================

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("WIFI ERROR");

        return false;
    }

    Serial.println("WIFI OK");

    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());

    Serial.print("DNS: ");
    Serial.println(WiFi.dnsIP());

    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    return true;
}

// =====================================================
// 12. KHỞI ĐỘNG mDNS
// =====================================================

bool khoiDongMDNS()
{
    Serial.println();
    Serial.println("================================");
    Serial.println("KHOI DONG mDNS");
    Serial.println("================================");

    // ESP32 có hostname riêng
    // room01.local

    if (!MDNS.begin(ROOM_ID))
    {
        Serial.println("mDNS ERROR");

        return false;
    }

    Serial.print("mDNS OK: ");
    Serial.print(ROOM_ID);
    Serial.println(".local");

    return true;
}

// =====================================================
// 13. TÌM RASPBERRY PI QUA mDNS
// =====================================================

bool timMQTTBroker()
{
    Serial.println();
    Serial.println("================================");
    Serial.println("TIM MQTT BROKER");
    Serial.println("================================");

    Serial.print("Hostname: ");
    Serial.print(MQTT_HOSTNAME);
    Serial.println(".local");

    // -------------------------------------------------
    // Query mDNS
    //
    // mypi5.local
    //      ↓
    // 192.168.1.xxx
    // -------------------------------------------------

    IPAddress ip =
        MDNS.queryHost(MQTT_HOSTNAME);

    // Không tìm thấy
    if (ip == INADDR_NONE)
    {
        Serial.println(
            "KHONG TIM THAY MQTT BROKER"
        );

        return false;
    }

    // Lưu IP tìm được
    mqttServerIP = ip;

    Serial.print(
        "TIM THAY Raspberry Pi: "
    );

    Serial.println(mqttServerIP);

    return true;
}

// =====================================================
// 14. KẾT NỐI MQTT
// =====================================================

bool ketNoiMQTT()
{
    if (mqtt.connected())
    {
        return true;
    }

    // =================================================
    // Tìm Raspberry Pi
    // =================================================

    if (!timMQTTBroker())
    {
        return false;
    }

    // =================================================
    // Cấu hình MQTT bằng IP vừa tìm được
    // =================================================

    mqtt.setServer(
        mqttServerIP,
        MQTT_PORT
    );

    Serial.println();
    Serial.print("DANG KET NOI MQTT: ");

    Serial.print(mqttServerIP);

    Serial.print(":");

    Serial.println(MQTT_PORT);

    // =================================================
    // Client ID
    // =================================================

    String clientID =
        String("ESP32_") +
        String(ROOM_ID);

    // =================================================
    // MQTT CONNECT
    // =================================================

    if (mqtt.connect(clientID.c_str()))
    {
        Serial.println("MQTT OK");

        // -------------------------------------------------
        // Subscribe command
        // -------------------------------------------------

        if (mqtt.subscribe(
            topicSet.c_str()
        ))
        {
            Serial.print("SUB OK: ");
            Serial.println(topicSet);
        }
        else
        {
            Serial.println(
                "SUBSCRIBE FAILED"
            );
        }

        // -------------------------------------------------
        // Báo thiết bị ONLINE
        // -------------------------------------------------

        guiStatus("ONLINE");

        return true;
    }

    // =================================================
    // MQTT ERROR
    // =================================================

    Serial.print("MQTT ERROR: ");

    Serial.println(
        mqtt.state()
    );

    return false;
}

// =====================================================
// 15. SETUP
// =====================================================

void setup()
{
    Serial.begin(115200);

    delay(1000);

    Serial.println();
    Serial.println();
    Serial.println(
        "========================================"
    );
    Serial.println(
        "     SMART CLASSROOM - ESP32"
    );
    Serial.println(
        "========================================"
    );

    Serial.print("ROOM_ID: ");
    Serial.println(ROOM_ID);

    // =================================================
    // GPIO
    // =================================================

    pinMode(
        LED_PIN,
        OUTPUT
    );

    digitalWrite(
        LED_PIN,
        LOW
    );

    // =================================================
    // DHT11
    // =================================================

    dht.begin();

    // =================================================
    // MQTT TOPIC
    // =================================================

    topicSet =
        "classroom/" +
        String(ROOM_ID) +
        "/device/light/set";

    topicStatus =
        "classroom/" +
        String(ROOM_ID) +
        "/device/light/status";

    topicTemp =
        "classroom/" +
        String(ROOM_ID) +
        "/sensor/temperature";

    topicHum =
        "classroom/" +
        String(ROOM_ID) +
        "/sensor/humidity";

    // =================================================
    // In topic
    // =================================================

    Serial.println();
    Serial.println("MQTT TOPICS:");

    Serial.print("SET: ");
    Serial.println(topicSet);

    Serial.print("STATUS: ");
    Serial.println(topicStatus);

    Serial.print("TEMP: ");
    Serial.println(topicTemp);

    Serial.print("HUM: ");
    Serial.println(topicHum);

    // =================================================
    // WIFI
    // =================================================

    while (!ketNoiWiFi())
    {
        Serial.println(
            "Thu lai WiFi sau 3 giay..."
        );

        delay(3000);
    }

    // =================================================
    // mDNS
    // =================================================

    while (!khoiDongMDNS())
    {
        Serial.println(
            "Thu lai mDNS sau 3 giay..."
        );

        delay(3000);
    }

    // =================================================
    // MQTT CALLBACK
    // =================================================

    mqtt.setCallback(
        xuLyMQTT
    );

    // =================================================
    // MQTT
    // =================================================

    while (!ketNoiMQTT())
    {
        Serial.println(
            "Thu lai MQTT sau 3 giay..."
        );

        delay(3000);
    }

    // =================================================
    // READY
    // =================================================

    Serial.println();
    Serial.println(
        "========================================"
    );

    Serial.println(
        "       HE THONG SAN SANG"
    );

    Serial.println(
        "========================================"
    );
}

// =====================================================
// 16. LOOP
// =====================================================

void loop()
{
    // =================================================
    // WIFI
    // =================================================

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println();
        Serial.println(
            "WIFI MAT KET NOI"
        );

        // Ngắt MQTT
        mqtt.disconnect();

        // Kết nối lại WiFi
        if (ketNoiWiFi())
        {
            Serial.println(
                "WIFI DA KET NOI LAI"
            );

            // ESP32 đã có WiFi mới
            // mDNS query sẽ tìm lại Pi
        }

        delay(1000);

        return;
    }

    // =================================================
    // MQTT
    // =================================================

    if (!mqtt.connected())
    {
        Serial.println();
        Serial.println(
            "MQTT MAT KET NOI"
        );

        // Tìm lại Pi
        ketNoiMQTT();

        delay(1000);

        return;
    }

    // =================================================
    // MQTT LOOP
    // =================================================

    mqtt.loop();

    // =================================================
    // DHT11 mỗi 5 giây
    // =================================================

    static unsigned long lastDHT = 0;

    if (
        millis() - lastDHT >= 5000
    )
    {
        lastDHT = millis();

        docDHT11();
    }
}