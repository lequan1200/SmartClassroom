#include <WiFi.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <DHT.h>
#include <time.h>

// WiFi & MQTT
const char* WIFI_SSID = "Dong Trung Ha Thao T2";
const char* WIFI_PASS = "Binhhien1974";
const char* MQTT_HOSTNAME = "mypi5";
const int MQTT_PORT = 1883;
#define ROOM_ID "room01"

// GPIO
#define DHTPIN 4
#define DHTTYPE DHT11
#define GAS_PIN 34
#define DOOR_PIN 14
#define RFID_SS_PIN 17
#define RFID_RST_PIN 2
#define BUZZER_PIN 15
#define RELAY_LIGHT1 25
#define RELAY_LIGHT2 26
#define RELAY_FAN 27
#define RELAY_AC 32
#define RELAY_ON LOW
#define RELAY_OFF HIGH

DHT dht(DHTPIN, DHTTYPE);
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
IPAddress mqttServerIP;

// Time
const char* NTP_SERVER = "pool.ntp.org";
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

// Sensor
const int GAS_THRESHOLD = 1500;
const int LATE_HOUR = 7;
const int LATE_MINUTE = 0;
const unsigned long SENSOR_INTERVAL = 2000;
unsigned long lastSensorRead = 0;

// Reconnect
const unsigned long WIFI_RETRY_INTERVAL = 5000;
const unsigned long MQTT_RETRY_INTERVAL = 5000;
unsigned long lastWiFiAttempt = 0;
unsigned long lastMQTTAttempt = 0;

// Gas alarm
bool isGasDanger = false;
bool previousGasDanger = false;
unsigned long lastAlarmToggle = 0;
const unsigned long ALARM_TOGGLE_INTERVAL = 100;
bool alarmToggleState = false;

// RFID buzzer
bool buzzerActive = false;
bool buzzerState = false;
int buzzerRemaining = 0;
unsigned long buzzerTimer = 0;
const unsigned long BUZZER_ON_TIME = 100;
const unsigned long BUZZER_GAP_TIME = 80;

// RFID
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

// MQTT topics
String topicTemperature;
String topicHumidity;
String topicGas;
String topicDoor;

String topicLight1Status;
String topicLight2Status;
String topicFanStatus;
String topicACStatus;

String topicAttendance;
String topicAlert;

// =====================================================
// TIME
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
// BUZZER
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
// RFID
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
    Serial.println("[RFID] Database the da day!");
    return -1;
  }

  cards[cardCount].uid = uid;
  cards[cardCount].checkedIn = false;
  cardCount++;

  return cardCount - 1;
}

// =====================================================
// MQTT DEVICE STATUS
// =====================================================

void publishDeviceStatus(const char* device, const char* state) {
  String topic;

  if (strcmp(device, "light1") == 0) topic = topicLight1Status;
  else if (strcmp(device, "light2") == 0) topic = topicLight2Status;
  else if (strcmp(device, "fan") == 0) topic = topicFanStatus;
  else if (strcmp(device, "ac") == 0) topic = topicACStatus;
  else return;

  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["device"] = device;
  doc["state"] = state;
  doc["time"] = getCurrentTime();

  char buffer[180];
  serializeJson(doc, buffer);

  if (mqtt.connected()) {
    if (mqtt.publish(topic.c_str(), buffer, true)) {
      Serial.printf("[MQTT STATUS] %s -> %s\n", topic.c_str(), buffer);
    } else {
      Serial.println("[MQTT] Gui STATUS that bai!");
    }
  }
}

// =====================================================
// MQTT COMMAND
// =====================================================

void xuLyMQTT(char* topic, byte* payload, unsigned int length) {
  String data;

  for (unsigned int i = 0; i < length; i++) data += (char)payload[i];

  Serial.println("\n========== MQTT COMMAND ==========");
  Serial.printf("Topic: %s\n", topic);
  Serial.printf("Payload: %s\n", data.c_str());
  Serial.println("==================================");

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

  String state = String(command);
  state.toUpperCase();

  if (state != "ON" && state != "OFF") {
    Serial.println("[MQTT] Command phai la ON hoac OFF!");
    return;
  }

  String topicString = String(topic);
  String prefix = "classroom/" + String(ROOM_ID) + "/device/";

  if (!topicString.startsWith(prefix)) {
    Serial.println("[MQTT] Topic khong dung ROOM_ID!");
    return;
  }

  String remaining = topicString.substring(prefix.length());
  int slashIndex = remaining.indexOf('/');

  if (slashIndex <= 0) {
    Serial.println("[MQTT] Topic device khong hop le!");
    return;
  }

  String device = remaining.substring(0, slashIndex);
  String action = remaining.substring(slashIndex + 1);

  if (action != "set") return;

  uint8_t pinLevel = state == "ON" ? RELAY_ON : RELAY_OFF;
  bool validDevice = true;

  if (device == "light1") digitalWrite(RELAY_LIGHT1, pinLevel);
  else if (device == "light2") digitalWrite(RELAY_LIGHT2, pinLevel);
  else if (device == "fan") digitalWrite(RELAY_FAN, pinLevel);
  else if (device == "ac") digitalWrite(RELAY_AC, pinLevel);
  else {
    validDevice = false;
    Serial.printf("[MQTT] Device khong hop le: %s\n", device.c_str());
  }

  if (!validDevice) return;

  publishDeviceStatus(device.c_str(), state.c_str());
}

// =====================================================
// WIFI
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
// MQTT
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
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;

  unsigned long now = millis();
  if (now - lastMQTTAttempt < MQTT_RETRY_INTERVAL) return;

  lastMQTTAttempt = now;

  if (!timMQTTBroker()) return;

  mqtt.setServer(mqttServerIP, MQTT_PORT);
  mqtt.setCallback(xuLyMQTT);

  String clientID = String("ESP32_") + ROOM_ID;

  Serial.println("[MQTT] Dang ket noi...");

  if (mqtt.connect(clientID.c_str())) {
    Serial.println("[MQTT] KET NOI THANH CONG!");

    String commandTopic = "classroom/" + String(ROOM_ID) + "/device/+/set";

    if (mqtt.subscribe(commandTopic.c_str(), 1)) {
      Serial.printf("[MQTT] SUB: %s\n", commandTopic.c_str());
    } else {
      Serial.println("[MQTT] SUBSCRIBE THAT BAI!");
    }
  } else {
    Serial.printf("[MQTT] Loi ket noi. State = %d\n", mqtt.state());
  }
}

// =====================================================
// SENSOR
// =====================================================

void publishSensor(const String& topic, float value, const char* unit) {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["value"] = value;
  doc["unit"] = unit;
  doc["time"] = getCurrentTime();

  char buffer[180];
  serializeJson(doc, buffer);

  if (mqtt.publish(topic.c_str(), buffer)) {
    Serial.printf("[SENSOR MQTT] %s -> %s\n", topic.c_str(), buffer);
  }
}

void docCamBien() {
  unsigned long now = millis();

  if (now - lastSensorRead < SENSOR_INTERVAL) return;

  lastSensorRead = now;

  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  bool dhtError = isnan(temp) || isnan(hum);

  if (!dhtError) {
    publishSensor(topicTemperature, temp, "C");
    publishSensor(topicHumidity, hum, "%");
  } else {
    Serial.println("[DHT] Loi doc cam bien!");
  }

  int gasVal = analogRead(GAS_PIN);
  publishSensor(topicGas, gasVal, "ADC");

  bool doorOpen = digitalRead(DOOR_PIN) == HIGH;
  publishSensor(topicDoor, doorOpen ? 1 : 0, "bool");

  Serial.println("\n------------- SENSOR -------------");

  if (!dhtError) {
    Serial.printf("Nhiet do : %.1f C\n", temp);
    Serial.printf("Do am    : %.1f %%\n", hum);
  } else {
    Serial.println("DHT      : ERROR");
  }

  Serial.printf("Khi gas  : %d\n", gasVal);
  Serial.printf("Cua      : %s\n", doorOpen ? "DANG MO" : "DA DONG");

  isGasDanger = gasVal > GAS_THRESHOLD;

  if (isGasDanger != previousGasDanger) {
    previousGasDanger = isGasDanger;

    if (isGasDanger) {
      Serial.println("!!! CANH BAO GAS !!!");

      if (mqtt.connected()) {
        mqtt.publish(topicAlert.c_str(), "{\"alert\":\"GAS_LEAK\",\"level\":\"DANGER\"}", true);
      }
    } else {
      Serial.println("[GAS] Da tro lai binh thuong.");

      if (mqtt.connected()) {
        mqtt.publish(topicAlert.c_str(), "{\"alert\":\"GAS_NORMAL\",\"level\":\"NORMAL\"}", true);
      }
    }
  }

  Serial.println("----------------------------------");
}

// =====================================================
// GAS ALARM
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
// RFID SCAN
// =====================================================

void xuLyRFID() {
  if (rfidCardLocked) {
    if (!rfid.PICC_IsNewCardPresent()) {
      rfidCardLocked = false;
      currentRFID = "";
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

  Serial.println("\n========== RFID ==========");
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
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n====================================");
  Serial.println(" ESP32 SMART CLASSROOM");
  Serial.println("====================================");

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

  dht.begin();

  SPI.begin();
  rfid.PCD_Init();
  delay(50);

  // MQTT topic
  topicTemperature = "classroom/" + String(ROOM_ID) + "/sensor/temperature";
  topicHumidity = "classroom/" + String(ROOM_ID) + "/sensor/humidity";
  topicGas = "classroom/" + String(ROOM_ID) + "/sensor/gas";
  topicDoor = "classroom/" + String(ROOM_ID) + "/sensor/door";

  topicLight1Status = "classroom/" + String(ROOM_ID) + "/device/light1/status";
  topicLight2Status = "classroom/" + String(ROOM_ID) + "/device/light2/status";
  topicFanStatus = "classroom/" + String(ROOM_ID) + "/device/fan/status";
  topicACStatus = "classroom/" + String(ROOM_ID) + "/device/ac/status";

  topicAttendance = "classroom/" + String(ROOM_ID) + "/attendance";
  topicAlert = "classroom/" + String(ROOM_ID) + "/alert";

  // WiFi
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

  // mDNS
  if (MDNS.begin(ROOM_ID)) {
    Serial.printf("[mDNS] ESP32: %s.local\n", ROOM_ID);
  } else {
    Serial.println("[mDNS] Khoi dong that bai!");
  }

  // NTP
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);

  startBuzzer(1);

  Serial.println("[SYSTEM] HE THONG SAN SANG!");
  Serial.println("[RFID] 1 beep CHECK_IN, 2 beep CHECK_OUT.");
  Serial.println("[MQTT] Protocol: classroom/room01/...");
  Serial.println("====================================");
}

// =====================================================
// LOOP
// =====================================================

void loop() {
  ketNoiWiFi();
  ketNoiMQTT();

  if (mqtt.connected()) mqtt.loop();

  updateBuzzer();
  xuLyGasAlarm();
  xuLyRFID();
  docCamBien();
}