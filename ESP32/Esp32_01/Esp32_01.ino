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
// 1. WIFI & MQTT
// =====================================================
const char* WIFI_SSID = "P100";
const char* WIFI_PASS = "123123123";

const char* MQTT_HOSTNAME = "mypi5";
const int MQTT_PORT = 1883;

#define ROOM_ID "room01"

// =====================================================
// 2. GPIO
// =====================================================

// DHT11
#define DHTPIN        4
#define DHTTYPE       DHT11

// MQ-2 (gas)
#define GAS_PIN       34

// Cam bien cua (hoac chan cam bien)
#define DOOR_PIN      14

// RFID RC522 - SPI
#define RFID_SS_PIN   17
#define RFID_RST_PIN  2

// BH1750 - I2C
#define BH1750_SDA    26
#define BH1750_SCL    27

// Buzzer
#define BUZZER_PIN    15

// Relay - active LOW
// RELAY_LIGHT1: Den 1
// RELAY_LIGHT2: Den 2 (chan 33 hoac doi chan theo phan cung thuc te)
// RELAY_FAN:    Quat
// RELAY_AC:     Dieu hoa (neu co)
#define RELAY_LIGHT1  25   // Den 1 (IN1)
#define RELAY_LIGHT2  33   // Den 2 (chan tuy chon)
#define RELAY_FAN     21   // Quat (IN2)
#define RELAY_AC      32   // Dieu hoa (neu co)

#define RELAY_ON      LOW
#define RELAY_OFF     HIGH

// =====================================================
// 3. OBJECTS
// =====================================================

DHT dht(DHTPIN, DHTTYPE);
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
BH1750 lightMeter;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

IPAddress mqttServerIP;

// =====================================================
// 4. TIME
// =====================================================

const char* NTP_SERVER = "pool.ntp.org";
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

// =====================================================
// 5. CAU HINH CAM BIEN
// =====================================================

const int GAS_THRESHOLD = 1500;

// Sau 7:00 sang tinh la di muon
const int LATE_HOUR = 7;
const int LATE_MINUTE = 0;

// Doc cam bien moi 2 giay
const unsigned long SENSOR_INTERVAL = 2000;
unsigned long lastSensorRead = 0;

// =====================================================
// 6. WIFI / MQTT RECONNECT
// =====================================================

unsigned long lastWiFiAttempt = 0;
unsigned long lastMQTTAttempt = 0;
const unsigned long WIFI_RETRY_INTERVAL = 5000;
const unsigned long MQTT_RETRY_INTERVAL = 5000;

// =====================================================
// 7. GAS ALARM
// =====================================================

bool isGasDanger = false;
bool previousGasDanger = false;
unsigned long lastAlarmToggle = 0;
const unsigned long ALARM_TOGGLE_INTERVAL = 100;
bool alarmToggleState = false;

// =====================================================
// 8. BUZZER (non-blocking)
// =====================================================

bool buzzerActive = false;
int buzzerRemaining = 0;
unsigned long buzzerTimer = 0;
const unsigned long BUZZER_ON_TIME = 100;
const unsigned long BUZZER_GAP_TIME = 80;
bool buzzerState = false;

// =====================================================
// 9. RFID
// =====================================================

const unsigned long RFID_COOLDOWN = 1500;
String currentRFID = "";
unsigned long lastRFIDScan = 0;
bool rfidCardLocked = false;

#define MAX_CARDS 30

struct CardState {
  String uid;
  bool checkedIn;
};

CardState cards[MAX_CARDS];
int cardCount = 0;

// =====================================================
// 10. MQTT TOPICS
// =====================================================
// Topic theo chuan Smart Classroom:
//   classroom/{room_id}/sensor/{sensor_name}          (publish)
//   classroom/{room_id}/device/{device_name}/set      (subscribe)
//   classroom/{room_id}/device/{device_name}/status   (publish)
//   classroom/{room_id}/attendance                    (publish)
//   classroom/{room_id}/alert                          (publish)

String topicSensorPrefix;   // classroom/room01/sensor/
String topicDevicePrefix;   // classroom/room01/device/
String topicSetWildcard;    // classroom/room01/device/+/set
String topicAttendance;     // classroom/room01/attendance
String topicAlert;          // classroom/room01/alert

// =====================================================
// 11. THOI GIAN
// =====================================================

String getCurrentTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "N/A";

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buffer);
}

bool isLateNow() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return false;

  if (timeinfo.tm_hour > LATE_HOUR) return true;
  if (timeinfo.tm_hour == LATE_HOUR && timeinfo.tm_min > LATE_MINUTE) return true;
  return false;
}

// =====================================================
// 12. BUZZER NON-BLOCKING
// =====================================================

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

// =====================================================
// 13-14. DATABASE THE RFID
// =====================================================

int findCard(String uid) {
  for (int i = 0; i < cardCount; i++) {
    if (cards[i].uid == uid) return i;
  }
  return -1;
}

int getCard(String uid) {
  int index = findCard(uid);
  if (index >= 0) return index;

  if (cardCount >= MAX_CARDS) {
    Serial.println("[RFID] Database da day!");
    return -1;
  }

  cards[cardCount].uid = uid;
  cards[cardCount].checkedIn = false;
  cardCount++;

  return cardCount - 1;
}

// =====================================================
// 15. PUBLISH CAM BIEN (dung chung 1 ham cho moi sensor)
// =====================================================
// Payload: {"room_id":"room01","value":32.5,"unit":"C","time":"..."}

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

// =====================================================
// 16. DIEU KHIEN RELAY THEO TEN THIET BI
// =====================================================

bool setDevice(const String& device, uint8_t pinLevel) {
  if (device == "light1") {
    digitalWrite(RELAY_LIGHT1, pinLevel);
  } else if (device == "light2") {
    digitalWrite(RELAY_LIGHT2, pinLevel);
  } else if (device == "light") {
    // Dieu khien ca hai den neu nhan lenh 'light'
    digitalWrite(RELAY_LIGHT1, pinLevel);
    digitalWrite(RELAY_LIGHT2, pinLevel);
  } else if (device == "fan") {
    digitalWrite(RELAY_FAN, pinLevel);
  } else if (device == "ac") {
    digitalWrite(RELAY_AC, pinLevel);
  } else if (device == "all") {
    digitalWrite(RELAY_LIGHT1, pinLevel);
    digitalWrite(RELAY_LIGHT2, pinLevel);
    digitalWrite(RELAY_FAN, pinLevel);
    digitalWrite(RELAY_AC, pinLevel);
  } else {
    return false; // thiet bi khong hop le
  }
  return true;
}

// Ham gui phan hoi trang thai thiet bi len MQTT (Retain = true)
void publishDeviceStatus(const String& devName, const char* state) {
  if (!mqtt.connected()) return;

  JsonDocument response;
  response["room_id"] = ROOM_ID;
  response["device"] = devName;
  response["command"] = state;
  response["state"] = state;
  response["time"] = getCurrentTime();

  char buffer[160];
  serializeJson(response, buffer);

  String statusTopic = topicDevicePrefix + devName + "/status";
  mqtt.publish(statusTopic.c_str(), buffer, true);

  Serial.printf("[MQTT] %s -> %s\n", devName.c_str(), state);
}

// =====================================================
// 17. XU LY MQTT NHAN LENH DIEU KHIEN
// =====================================================
// Topic:   classroom/{room_id}/device/{device_name}/set
// Payload: {"command":"ON"} hoac {"command":"OFF"}

void xuLyMQTT(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);

  int startIdx = topicStr.indexOf("device/") + 7;
  int endIdx = topicStr.indexOf("/set");

  if (startIdx < 7 || endIdx < 0 || endIdx <= startIdx) {
    Serial.println("[MQTT] Topic khong hop le!");
    return;
  }

  String device = topicStr.substring(startIdx, endIdx);

  String data;
  for (unsigned int i = 0; i < length; i++) data += (char)payload[i];

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, data);
  if (error) {
    Serial.println("[MQTT] JSON khong hop le!");
    return;
  }

  const char* command = doc["command"];
  if (!command) {
    Serial.println("[MQTT] Thieu command!");
    return;
  }

  uint8_t pinLevel = (strcmp(command, "ON") == 0) ? RELAY_ON : RELAY_OFF;

  if (!setDevice(device, pinLevel)) {
    Serial.printf("[MQTT] Thiet bi khong hop le: %s\n", device.c_str());
    return;
  }

  // Phan hoi trang thai thiet bi len MQTT
  if (device == "light") {
    publishDeviceStatus("light1", command);
    publishDeviceStatus("light2", command);
  } else if (device == "all") {
    publishDeviceStatus("light1", command);
    publishDeviceStatus("light2", command);
    publishDeviceStatus("fan", command);
    publishDeviceStatus("ac", command);
  } else {
    publishDeviceStatus(device, command);
  }
}

// =====================================================
// 18. KET NOI WIFI
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

// =====================================================
// 19. TIM & KET NOI MQTT BROKER
// =====================================================

bool timMQTTBroker() {
  IPAddress ip = MDNS.queryHost(MQTT_HOSTNAME);

  if (ip == INADDR_NONE) {
    Serial.println("[MQTT] Khong tim thay Raspberry Pi (mypi5)");
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

  Serial.println("[MQTT] Dang ket noi...");

  if (mqtt.connect(clientID.c_str())) {
    Serial.println("[MQTT] KET NOI THANH CONG!");
    mqtt.subscribe(topicSetWildcard.c_str());

    // Gui trang thai ban dau de Backend va Web dong bo ngay khi ket noi
    publishDeviceStatus("light1", "OFF");
    publishDeviceStatus("light2", "OFF");
    publishDeviceStatus("fan", "OFF");
    publishDeviceStatus("ac", "OFF");
  } else {
    Serial.printf("[MQTT] Loi ket noi. State = %d\n", mqtt.state());
  }
}

// =====================================================
// 20. XU LY RFID (diem danh)
// =====================================================

void xuLyRFID() {
  if (rfidCardLocked) {
    if (!rfid.PICC_IsNewCardPresent()) {
      rfidCardLocked = false;
      currentRFID = "";
      publishSensor("RFID", 0, "card");
      Serial.println("[RFID] The da duoc nhac ra - san sang quet the moi.");
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

  int index = getCard(cardUID);
  if (index < 0) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  String eventType;
  String lateStatus = "";

  if (!cards[index].checkedIn) {
    cards[index].checkedIn = true;
    eventType = "CHECK_IN";
    lateStatus = isLateNow() ? "DI_MUON" : "DUNG_GIO";
    startBuzzer(1);
  } else {
    cards[index].checkedIn = false;
    eventType = "CHECK_OUT";
    startBuzzer(2);
  }

  String scanTime = getCurrentTime();

  // 1. Publish diem danh qua topic attendance
  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["card_uid"] = cardUID;
  doc["event_type"] = eventType;
  doc["timestamp"] = scanTime;
  if (eventType == "CHECK_IN") doc["status"] = lateStatus;

  char buffer[220];
  serializeJson(doc, buffer);

  if (mqtt.connected()) {
    mqtt.publish(topicAttendance.c_str(), buffer);
  } else {
    Serial.println("[RFID] MQTT mat ket noi - khong gui duoc!");
  }

  // 2. Publish trang thai the qua topic sensor/RFID
  publishSensor("RFID", 1, "card");

  Serial.println();
  Serial.println("========== RFID ==========");
  Serial.printf("UID       : %s\n", cardUID.c_str());
  Serial.printf("Su kien   : %s\n", eventType.c_str());
  if (eventType == "CHECK_IN") {
    Serial.printf("Trang thai: %s\n", lateStatus == "DI_MUON" ? "DI MUON" : "DUNG GIO");
  }
  Serial.printf("Thoi gian : %s\n", scanTime.c_str());
  Serial.printf("MQTT      : %s\n", buffer);
  Serial.println("==========================");

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

// =====================================================
// 21. DOC & GUI CAM BIEN
// =====================================================

void docCamBien() {
  unsigned long now = millis();
  if (now - lastSensorRead < SENSOR_INTERVAL) return;
  lastSensorRead = now;

  // ---- DHT11 ----
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[DHT11] Loi doc cam bien!");
    temp = 0;
    hum = 0;
  }

  // ---- MQ-2 (gas) ----
  int gasVal = analogRead(GAS_PIN);

  // ---- BH1750 (anh sang) ----
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    Serial.println("[BH1750] Loi doc cam bien!");
    lux = 0;
  }

  // ---- Trang thai gas nguy hiem ----
  isGasDanger = (gasVal > GAS_THRESHOLD);

  // ---- Publish tung sensor rieng (topic: classroom/{room_id}/sensor/{sensor_name}) ----
  publishSensor("temperature", temp, "C");
  publishSensor("humidity", hum, "%");
  publishSensor("gas", gasVal, "ppm");
  publishSensor("RFID", rfidCardLocked ? 1 : 0, "card");
  publishSensor("light", lux, "lux");

  // ---- Log gon ----
  Serial.println("------------- SENSOR -------------");
  Serial.printf("Nhiet do : %.1f C\n", temp);
  Serial.printf("Do am    : %.1f %%\n", hum);
  Serial.printf("Khi gas  : %d ppm\n", gasVal);
  Serial.printf("Anh sang : %.1f lux\n", lux);
  Serial.printf("The RFID : %s\n", rfidCardLocked ? "CO THE" : "KHONG THE");
  Serial.println("-----------------------------------");

  // ---- Canh bao gas ----
  if (isGasDanger != previousGasDanger) {
    previousGasDanger = isGasDanger;

    JsonDocument alertDoc;
    alertDoc["room_id"] = ROOM_ID;
    alertDoc["alert"] = isGasDanger ? "GAS_LEAK" : "GAS_NORMAL";
    alertDoc["level"] = isGasDanger ? "DANGER" : "NORMAL";
    alertDoc["time"] = getCurrentTime();

    char alertBuf[160];
    serializeJson(alertDoc, alertBuf);

    if (mqtt.connected()) {
      mqtt.publish(topicAlert.c_str(), alertBuf, true);
    }

    Serial.println(isGasDanger ? "!!! CANH BAO GAS !!!" : "[GAS] Da tro lai binh thuong.");
  }
}

// =====================================================
// 22. BUZZER CANH BAO GAS (nhap nhay lien tuc)
// =====================================================

void xuLyGasAlarm() {
  if (!isGasDanger) {
    noTone(BUZZER_PIN);
    alarmToggleState = false;
    return;
  }

  unsigned long now = millis();
  if (now - lastAlarmToggle >= ALARM_TOGGLE_INTERVAL) {
    lastAlarmToggle = now;
    alarmToggleState = !alarmToggleState;
    if (alarmToggleState) tone(BUZZER_PIN, 2000);
    else noTone(BUZZER_PIN);
  }
}

// =====================================================
// 23. SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n====================================");
  Serial.println(" ESP32 SMART CLASSROOM");
  Serial.println("====================================");

  // ---- GPIO ----
  pinMode(GAS_PIN, INPUT);
  pinMode(DOOR_PIN, INPUT_PULLUP);
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

  // ---- DHT11 ----
  dht.begin();

  // ---- BH1750 (I2C tren chan SDA=26, SCL=27) ----
  Wire.begin(BH1750_SDA, BH1750_SCL);
  if (lightMeter.begin()) {
    Serial.println("[BH1750] Khoi dong thanh cong.");
  } else {
    Serial.println("[BH1750] Khoi dong that bai!");
  }

  // ---- RFID (SPI) ----
  SPI.begin();
  rfid.PCD_Init();
  delay(50);

  // ---- MQTT TOPICS ----
  topicSensorPrefix = "classroom/" + String(ROOM_ID) + "/sensor/";
  topicDevicePrefix = "classroom/" + String(ROOM_ID) + "/device/";
  topicSetWildcard  = topicDevicePrefix + "+/set";
  topicAttendance   = "classroom/" + String(ROOM_ID) + "/attendance";
  topicAlert        = "classroom/" + String(ROOM_ID) + "/alert";

  // ---- WIFI ----
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("[WIFI] Dang ket noi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] KET NOI THANH CONG!");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI] Chua ket noi - se tu thu lai.");
  }

  // ---- mDNS ----
  if (MDNS.begin(ROOM_ID)) {
    Serial.printf("[mDNS] ESP32: %s.local\n", ROOM_ID);
  } else {
    Serial.println("[mDNS] Khoi dong that bai!");
  }

  // ---- NTP ----
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);

  // ---- Buzzer khoi dong ----
  startBuzzer(1);

  Serial.println("\n[SYSTEM] HE THONG SAN SANG!");
  Serial.println("[RFID] Quet the -> 1 beep CHECK_IN, 2 beep CHECK_OUT.");
  Serial.println("====================================");
}

// =====================================================
// 24. LOOP
// =====================================================

void loop() {
  ketNoiWiFi();
  ketNoiMQTT();

  if (mqtt.connected()) mqtt.loop();

  updateBuzzer();
  xuLyGasAlarm();
  xuLyRFID();
  docCamBien();

  // Khong dung delay() o day
}
