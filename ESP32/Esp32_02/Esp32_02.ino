#include <WiFi.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Wire.h>
#include <MFRC522.h>
#include <DHT.h>
#include <BH1750.h>
#include <time.h>

// =====================================================
// 1. WIFI & MQTT CONFIGURATION
// =====================================================
const char* WIFI_SSID = "P100";
const char* WIFI_PASS = "123123123";

const char* MQTT_HOSTNAME = "mypi5";
const int MQTT_PORT = 1883;

#define ROOM_ID "room02"

// =====================================================
// 2. GPIO PIN DEFINITIONS (Phần cứng Board 02)
// =====================================================

// DHT11
#define DHTPIN        5  // Chân dữ liệu DHT11
#define DHTTYPE       DHT11

// MQ-135 (Cảm biến chất lượng không khí)
#define AQ_PIN        34   // Chân Analog đọc MQ-135

// RFID RC522 - SPI (SCK=18, MISO=19, MOSI=23)
#define RFID_SS_PIN   17
#define RFID_RST_PIN  12   // Chân RST trên Board 02 là GPIO 12

// BH1750 - I2C
#define BH1750_SDA    26
#define BH1750_SCL    27

// Buzzer
#define BUZZER_PIN    13

// Relay - Active HIGH trên Board 02 (HIGH = BẬT, LOW = TẮT)
#define RELAY_LIGHT1  25   // Đèn 1 (chính)
#define RELAY_LIGHT2  22   // Đèn 2 (phụ - GPIO 22 trên Board 02)
#define RELAY_FAN     21   // Quạt
#define RELAY_AC      32   // Điều hòa

#define RELAY_ON      HIGH
#define RELAY_OFF     LOW

// =====================================================
// 3. OBJECTS & STATE VARIABLES
// =====================================================

DHT dht(DHTPIN, DHTTYPE);
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
BH1750 lightMeter;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
IPAddress mqttServerIP;

// NTP Time
const char* NTP_SERVER = "pool.ntp.org";
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

// Chu kỳ đọc cảm biến (2 giây)
const unsigned long SENSOR_INTERVAL = 2000;
unsigned long lastSensorRead = 0;

// Cấu hình ngưỡng MQ-135 (Chất lượng không khí)
const int AQ_GOOD_MAX = 800;      // < 800: TỐT (GOOD)
const int AQ_MODERATE_MAX = 1500; // 800 - 1500: TRUNG BÌNH (MODERATE)
const int AQ_POOR_MAX = 2500;     // 1500 - 2500: KÉM (POOR)
                                  // > 2500: NGUY HẠI (HAZARDOUS)
const int AQ_CALIBRATION_OFFSET = 1100;
String previousAQLevel = "";

// Reconnect intervals
unsigned long lastWiFiAttempt = 0;
unsigned long lastMQTTAttempt = 0;
const unsigned long WIFI_RETRY_INTERVAL = 5000;
const unsigned long MQTT_RETRY_INTERVAL = 5000;

// Trạng thái thực tế của relay
bool light1IsOn = false;
bool light2IsOn = false;
bool fanIsOn    = false;
bool acIsOn     = false;

// Còi phản hồi (Buzzer non-blocking)
bool buzzerActive = false;
int buzzerRemaining = 0;
unsigned long buzzerTimer = 0;
const unsigned long BUZZER_ON_TIME = 100;
const unsigned long BUZZER_GAP_TIME = 80;
bool buzzerState = false;

// Còi hú báo động từ xa (điều khiển bởi Raspberry Pi 5)
bool remoteAlarmActive = false;
unsigned long lastAlarmToggle = 0;
const unsigned long ALARM_TOGGLE_INTERVAL = 100;
bool alarmToggleState = false;

// RFID
const unsigned long RFID_COOLDOWN = 1500;
String currentRFID = "";
unsigned long lastRFIDScan = 0;
bool rfidCardLocked = false;

// =====================================================
// 4. MQTT TOPICS
// =====================================================
String topicSensorPrefix;        // classroom/room02/sensor/
String topicDevicePrefix;        // classroom/room02/device/
String topicSetWildcard;         // classroom/room02/device/+/set
String topicBuzzerSet;           // classroom/room02/buzzer/set
String topicAttendance;          // classroom/room02/attendance
String topicAttendanceFeedback;  // classroom/room02/attendance/feedback
String topicAlert;               // classroom/room02/alert
String topicStatus;              // classroom/room02/status (LWT)

// =====================================================
// 5. HELPER FUNCTIONS
// =====================================================

String getCurrentTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "N/A";
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buffer);
}

const char* phanLoaiChatLuongKhongKhi(int rawVal) {
  if (rawVal < AQ_GOOD_MAX) return "GOOD";
  if (rawVal < AQ_MODERATE_MAX) return "MODERATE";
  if (rawVal < AQ_POOR_MAX) return "POOR";
  return "HAZARDOUS";
}

void startBuzzer(int times) {
  if (times <= 0) return;
  buzzerRemaining = times;
  buzzerActive = true;
  buzzerState = true;
  buzzerTimer = millis();
  tone(BUZZER_PIN, 2000);
}

void updateBuzzer() {
  if (!buzzerActive) return;

  unsigned long now = millis();
  if (buzzerState) {
    if (now - buzzerTimer >= BUZZER_ON_TIME) {
      noTone(BUZZER_PIN);
      buzzerState = false;
      buzzerTimer = now;
      buzzerRemaining--;
      if (buzzerRemaining <= 0) buzzerActive = false;
    }
  } else {
    if (now - buzzerTimer >= BUZZER_GAP_TIME && buzzerRemaining > 0) {
      tone(BUZZER_PIN, 2000);
      buzzerState = true;
      buzzerTimer = now;
    }
  }
}

void xuLyAlarm() {
  bool shouldSound = remoteAlarmActive;
  if (!shouldSound) {
    if (alarmToggleState) {
      noTone(BUZZER_PIN);
      alarmToggleState = false;
    }
    return;
  }

  unsigned long now = millis();
  if (now - lastAlarmToggle >= ALARM_TOGGLE_INTERVAL) {
    lastAlarmToggle = now;
    alarmToggleState = !alarmToggleState;
    if (alarmToggleState) {
      tone(BUZZER_PIN, 2000);
    } else {
      noTone(BUZZER_PIN);
    }
  }
}

// =====================================================
// 6. PUBLISH TO MQTT
// =====================================================

void publishSensor(const char* sensorName, float value, const char* unit) {
  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["value"] = value;
  doc["unit"] = unit;
  doc["time"] = getCurrentTime();

  char buf[192];
  serializeJson(doc, buf);

  String topic = topicSensorPrefix + sensorName;
  if (mqtt.connected()) {
    mqtt.publish(topic.c_str(), buf);
  }
  Serial.printf("[SENSOR] %s -> %s\n", topic.c_str(), buf);
}

void publishAirQuality(int rawValue, const char* level) {
  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["value"] = rawValue;
  doc["level"] = level;
  doc["unit"] = "raw";
  doc["time"] = getCurrentTime();

  char buf[192];
  serializeJson(doc, buf);

  String topic = topicSensorPrefix + "air_quality";
  if (mqtt.connected()) {
    mqtt.publish(topic.c_str(), buf);
  }
  Serial.printf("[AQ] %s -> %s\n", topic.c_str(), buf);
}

void publishDeviceStatus(const String& devName, const char* state) {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["device"] = devName;
  doc["command"] = state;
  doc["state"] = state;
  doc["time"] = getCurrentTime();

  char buffer[192];
  serializeJson(doc, buffer);

  String statusTopic = topicDevicePrefix + devName + "/status";
  mqtt.publish(statusTopic.c_str(), buffer, true);
  Serial.printf("[STATUS] %s -> %s\n", devName.c_str(), state);
}

// =====================================================
// 7. HARDWARE ACTUATION (RELAY CONTROLS)
// =====================================================

void applyLight1(bool turnOn) {
  light1IsOn = turnOn;
  digitalWrite(RELAY_LIGHT1, turnOn ? RELAY_ON : RELAY_OFF);
  publishDeviceStatus("light1", turnOn ? "ON" : "OFF");
}

void applyLight2(bool turnOn) {
  light2IsOn = turnOn;
  digitalWrite(RELAY_LIGHT2, turnOn ? RELAY_ON : RELAY_OFF);
  publishDeviceStatus("light2", turnOn ? "ON" : "OFF");
}

void applyFan(bool turnOn) {
  fanIsOn = turnOn;
  digitalWrite(RELAY_FAN, turnOn ? RELAY_ON : RELAY_OFF);
  publishDeviceStatus("fan", turnOn ? "ON" : "OFF");
}

void applyAc(bool turnOn) {
  acIsOn = turnOn;
  digitalWrite(RELAY_AC, turnOn ? RELAY_ON : RELAY_OFF);
  publishDeviceStatus("ac", turnOn ? "ON" : "OFF");
}

// =====================================================
// 8. XỬ LÝ LỆNH MQTT TỪ RASPBERRY PI 5
// =====================================================

void xuLyMQTT(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String data = "";
  for (unsigned int i = 0; i < length; i++) data += (char)payload[i];

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, data);
  if (error) {
    Serial.println("[MQTT] JSON khong hop le!");
    return;
  }

  // 1. Phản hồi điểm danh từ Server: classroom/{room_id}/attendance/feedback
  if (topicStr.endsWith("/attendance/feedback")) {
    int beeps = doc["beeps"] | 1;
    const char* status = doc["status"] | "INFO";
    const char* studentName = doc["student_name"] | "";
    const char* msg = doc["message"] | "";
    Serial.printf("[ATTENDANCE FEEDBACK] %s | %s (%s) | Beeps: %d\n", status, studentName, msg, beeps);
    startBuzzer(beeps);
    return;
  }

  // 2. Lệnh còi buzzer / báo động từ Pi 5: classroom/{room_id}/buzzer/set
  if (topicStr.endsWith("/buzzer/set")) {
    if (doc.containsKey("beeps")) {
      int b = doc["beeps"];
      if (b > 0) startBuzzer(b);
    }
    if (doc.containsKey("alarm")) {
      remoteAlarmActive = doc["alarm"].as<bool>();
      Serial.printf("[BUZZER CMD] Siren Alarm -> %s\n", remoteAlarmActive ? "ON" : "OFF");
    }
    return;
  }

  // 3. Lệnh điều khiển thiết bị: classroom/{room_id}/device/{device_name}/set
  int startIdx = topicStr.indexOf("device/") + 7;
  int endIdx = topicStr.indexOf("/set");
  if (startIdx < 7 || endIdx < 0 || endIdx <= startIdx) {
    Serial.println("[MQTT] Topic khong hop le!");
    return;
  }

  String device = topicStr.substring(startIdx, endIdx);
  const char* command = doc["command"];
  if (!command) {
    Serial.println("[MQTT] Thieu command!");
    return;
  }

  bool turnOn = (strcmp(command, "ON") == 0);
  Serial.printf("[CMD RX] Device: %s -> %s\n", device.c_str(), command);

  if (device == "light1") {
    applyLight1(turnOn);
  } else if (device == "light2") {
    applyLight2(turnOn);
  } else if (device == "light") {
    applyLight1(turnOn);
    applyLight2(turnOn);
  } else if (device == "fan") {
    applyFan(turnOn);
  } else if (device == "ac") {
    applyAc(turnOn);
  } else if (device == "all") {
    applyLight1(turnOn);
    applyLight2(turnOn);
    applyFan(turnOn);
    applyAc(turnOn);
  } else {
    Serial.printf("[MQTT] Thiet bi khong ho tro: %s\n", device.c_str());
  }
}

// =====================================================
// 9. KẾT NỐI WIFI & MQTT
// =====================================================

void ketNoiWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastWiFiAttempt < WIFI_RETRY_INTERVAL) return;
  lastWiFiAttempt = now;

  Serial.printf("\n[WIFI] Dang ket noi toi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

bool timMQTTBroker() {
  IPAddress ip = MDNS.queryHost(MQTT_HOSTNAME);
  if (ip == INADDR_NONE) {
    Serial.println("[MQTT] Khong tim thay Raspberry Pi qua mDNS (mypi5)");
    return false;
  }
  mqttServerIP = ip;
  Serial.print("[MQTT] Raspberry Pi IP: ");
  Serial.println(mqttServerIP);
  return true;
}

void ketNoiMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) return;

  unsigned long now = millis();
  if (now - lastMQTTAttempt < MQTT_RETRY_INTERVAL) return;
  lastMQTTAttempt = now;

  Serial.println("[MQTT] Dang tim broker...");
  if (!timMQTTBroker()) return;

  mqtt.setServer(mqttServerIP, MQTT_PORT);
  mqtt.setCallback(xuLyMQTT);

  String clientID = String("ESP32_") + ROOM_ID;
  String willTopic = topicStatus;
  String willMsg   = "OFFLINE";

  Serial.println("[MQTT] Dang ket noi...");

  if (mqtt.connect(clientID.c_str(),
                   NULL, NULL,
                   willTopic.c_str(), 1, true, willMsg.c_str())) {
    Serial.println("[MQTT] KET NOI THANH CONG!");

    // Báo hiệu phòng ONLINE
    mqtt.publish(topicStatus.c_str(), "ONLINE", true);

    // Subscribe các topic nhận lệnh từ Pi 5
    mqtt.subscribe(topicSetWildcard.c_str());
    mqtt.subscribe(topicBuzzerSet.c_str());
    mqtt.subscribe(topicAttendanceFeedback.c_str());

    // Gửi trạng thái hiện tại để Server đồng bộ ngay
    publishDeviceStatus("light1", light1IsOn ? "ON" : "OFF");
    publishDeviceStatus("light2", light2IsOn ? "ON" : "OFF");
    publishDeviceStatus("fan", fanIsOn ? "ON" : "OFF");
    publishDeviceStatus("ac", acIsOn ? "ON" : "OFF");
  } else {
    Serial.printf("[MQTT] Loi ket noi. State = %d\n", mqtt.state());
  }
}

// =====================================================
// 10. ĐỌC CẢM BIẾN (THIN SENSOR NODE CÓ MQ-135)
// =====================================================

void docCamBien() {
  unsigned long now = millis();
  if (now - lastSensorRead < SENSOR_INTERVAL) return;
  lastSensorRead = now;

  // 1. DHT11
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[DHT11] Loi doc cam bien!");
    temp = 0;
    hum = 0;
  }

  // 2. BH1750 Ánh sáng
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    Serial.println("[BH1750] Loi doc cam bien!");
    lux = 0;
  }

  // 3. MQ-135 Chất lượng không khí
  int aqRawSensor = analogRead(AQ_PIN);
  int aqRaw = aqRawSensor - AQ_CALIBRATION_OFFSET;
  if (aqRaw < 0) aqRaw = 0;
  const char* aqLevel = phanLoaiChatLuongKhongKhi(aqRaw);

  // 4. Gửi dữ liệu đo về Raspberry Pi 5 qua MQTT
  publishSensor("temperature", temp, "C");
  publishSensor("humidity", hum, "%");
  publishSensor("light", lux, "lux");
  publishAirQuality(aqRaw, aqLevel);
  publishSensor("RFID", rfidCardLocked ? 1 : 0, "card");

  // Log giám sát
  Serial.printf("[DATA Room02] T=%.1fC | H=%.1f%% | Lux=%.1f | AQ=%d (%s)\n",
                temp, hum, lux, aqRaw, aqLevel);

  // 5. Cảnh báo khi mức chất lượng không khí thay đổi
  String currentLevel = String(aqLevel);
  if (currentLevel != previousAQLevel) {
    previousAQLevel = currentLevel;

    JsonDocument alertDoc;
    alertDoc["room_id"] = ROOM_ID;
    alertDoc["alert"] = "AIR_QUALITY";
    alertDoc["level"] = aqLevel;
    alertDoc["time"] = getCurrentTime();

    char alertBuf[160];
    serializeJson(alertDoc, alertBuf);

    if (mqtt.connected()) {
      mqtt.publish(topicAlert.c_str(), alertBuf, true);
    }
    Serial.printf("[AIR QUALITY] Muc thay doi -> %s\n", aqLevel);
  }
}

// =====================================================
// 11. XỬ LÝ QUẸT THẺ RFID
// =====================================================

void xuLyRFID() {
  if (rfidCardLocked) {
    if (!rfid.PICC_IsNewCardPresent()) {
      rfidCardLocked = false;
      currentRFID = "";
      publishSensor("RFID", 0, "card");
      Serial.println("[RFID] The da duoc nhac ra.");
    }
    return;
  }

  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String cardUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) cardUID += "0";
    cardUID += String(rfid.uid.uidByte[i], HEX);
  }
  cardUID.toUpperCase();

  unsigned long now = millis();
  if (cardUID == currentRFID && now - lastRFIDScan < RFID_COOLDOWN) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  currentRFID = cardUID;
  lastRFIDScan = now;
  rfidCardLocked = true;

  // Bíp 1 tiếng phản hồi vật lý tại chỗ
  startBuzzer(1);

  String scanTime = getCurrentTime();

  // Gửi bản tin điểm danh về Pi 5
  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["card_uid"] = cardUID;
  doc["timestamp"] = scanTime;

  char buffer[220];
  serializeJson(doc, buffer);

  if (mqtt.connected()) {
    mqtt.publish(topicAttendance.c_str(), buffer);
    Serial.printf("[RFID] Gui MQTT diem danh: %s\n", buffer);
  } else {
    Serial.println("[RFID] MQTT offline - khong the gui!");
  }

  publishSensor("RFID", 1, "card");

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

// =====================================================
// 12. SETUP & LOOP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n====================================");
  Serial.println(" ESP32_02 SMART CLASSROOM (THIN GATEWAY + MQ-135)");
  Serial.println("====================================");

  // GPIO
  pinMode(AQ_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RELAY_LIGHT1, OUTPUT);
  pinMode(RELAY_LIGHT2, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_AC, OUTPUT);

  digitalWrite(RELAY_LIGHT1, RELAY_OFF);
  digitalWrite(RELAY_LIGHT2, RELAY_OFF);
  digitalWrite(RELAY_FAN, RELAY_OFF);
  digitalWrite(RELAY_AC, RELAY_OFF);
  digitalWrite(BUZZER_PIN, LOW);

  // Sensors
  dht.begin();
  Wire.begin(BH1750_SDA, BH1750_SCL);
  if (lightMeter.begin()) {
    Serial.println("[BH1750] OK.");
  } else {
    Serial.println("[BH1750] Failed!");
  }

  SPI.begin();
  rfid.PCD_Init();
  delay(50);

  // MQTT Topics
  topicSensorPrefix       = "classroom/" + String(ROOM_ID) + "/sensor/";
  topicDevicePrefix       = "classroom/" + String(ROOM_ID) + "/device/";
  topicSetWildcard        = topicDevicePrefix + "+/set";
  topicBuzzerSet          = "classroom/" + String(ROOM_ID) + "/buzzer/set";
  topicAttendance         = "classroom/" + String(ROOM_ID) + "/attendance";
  topicAttendanceFeedback = "classroom/" + String(ROOM_ID) + "/attendance/feedback";
  topicAlert              = "classroom/" + String(ROOM_ID) + "/alert";
  topicStatus             = "classroom/" + String(ROOM_ID) + "/status";

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("[WIFI] Connecting");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] Connected! IP: ");
    Serial.println(WiFi.localIP());
  }

  if (MDNS.begin(ROOM_ID)) {
    Serial.printf("[mDNS] %s.local\n", ROOM_ID);
  }

  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);

  startBuzzer(1);
  Serial.println("[SYSTEM] ESP32_02 Ready as Thin I/O Gateway.");
  Serial.println("====================================");
}

void loop() {
  ketNoiWiFi();
  ketNoiMQTT();

  if (mqtt.connected()) mqtt.loop();

  updateBuzzer();
  xuLyAlarm();
  xuLyRFID();
  docCamBien();
}
