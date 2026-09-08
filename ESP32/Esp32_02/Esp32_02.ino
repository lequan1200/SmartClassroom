#include <ArduinoJson.h>
#include <BH1750.h>
#include <DHT.h>
#include <ESPmDNS.h>
#include <MFRC522.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

// =====================================================
// 1. WIFI & MQTT
// =====================================================
const char *WIFI_SSID = "P100";
const char *WIFI_PASS = "123123123";

const char *MQTT_HOSTNAME = "mypi5";
const int MQTT_PORT = 1883;

#define ROOM_ID "room01"

// =====================================================
// 2. GPIO
// =====================================================

// DHT11
#define DHTPIN 4
#define DHTTYPE DHT11

// MQ-2 (gas)
#define GAS_PIN 34

// Cam bien cua
#define DOOR_PIN 14

// RFID RC522 - SPI (chan mac dinh cua ESP32: SCK=18, MISO=19, MOSI=23)
#define RFID_SS_PIN 17
#define RFID_RST_PIN 12

// BH1750 - I2C
#define BH1750_SDA 26
#define BH1750_SCL 27

// Buzzer
#define BUZZER_PIN 15

// Relay - active LOW
#define RELAY_LIGHT1 25 // Den 1 (IN1)
#define RELAY_LIGHT2 22 // Den 2 (phu)
#define RELAY_FAN 21    // Quat (IN2)
#define RELAY_AC 32     // Dieu hoa (neu co)

#define RELAY_ON LOW
#define RELAY_OFF HIGH

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

const char *NTP_SERVER = "pool.ntp.org";
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

// ================================== ===================
// 5. CAU HINH CAM BIEN
// =====================================================

const int GAS_THRESHOLD = 1500;

// Doc cam bien moi 2 giay
const unsigned long SENSOR_INTERVAL = 2000;
unsigned long lastSensorRead = 0;

// Nguong tu dong bat/tat den theo anh sang (co hysteresis chong nhap nhay)
// Light1: den chinh, hoat dong doc lap theo lux
const float LUX_LIGHT1_ON_THRESHOLD = 300.0;  // lux < 200  -> BAT Light1
const float LUX_LIGHT1_OFF_THRESHOLD = 350.0; // lux > 200  -> TAT Light1

// Light2: den phu - CHI duoc bat khi Light1 dang bat ma van con toi hon nguong
// nay
const float LUX_LIGHT2_ON_THRESHOLD =
    200.0; // lux < 15  -> BAT THEM Light2 (neu light1 dang ON)
const float LUX_LIGHT2_OFF_THRESHOLD = 250.0; // lux > 25  -> TAT Light2

// =====================================================
// 5B. TRANG THAI AUTO/MANUAL - DOC LAP CHO TUNG DEN
// =====================================================

bool light1AutoMode = true; // true = AUTO (theo lux), false = MANUAL
bool light2AutoMode = true; // true = AUTO (theo lux + light1), false = MANUAL

bool light1IsOn = false; // trang thai relay thuc te Light1
bool light2IsOn = false; // trang thai relay thuc te Light2

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

// =====================================================
// 10. MQTT TOPICS
// =====================================================
// Cau truc:
//   classroom/{room_id}/sensor/{sensor_name}          (publish)
//   classroom/{room_id}/device/{device_name}/set      (subscribe)
//   classroom/{room_id}/device/{device_name}/status   (publish, retained)
//   classroom/{room_id}/attendance                    (publish)
//   classroom/{room_id}/alert                         (publish, retained)
//
// device_name hop le:
//   light1, light2       -> {"command":"ON"/"OFF"}      (tu dong chuyen sang
//   MANUAL) light1_mode           -> {"command":"AUTO"/"MANUAL"} (bat/tat auto
//   rieng cho Light1) light2_mode           -> {"command":"AUTO"/"MANUAL"}
//   (bat/tat auto rieng cho Light2) light                 ->
//   {"command":"ON"/"OFF"}      (dieu khien ca 2 den, chuyen MANUAL) fan, ac ->
//   {"command":"ON"/"OFF"} all                   -> {"command":"ON"/"OFF"}
//   (light1, light2, fan, ac; den chuyen MANUAL)

String topicSensorPrefix;       // classroom/room01/sensor/
String topicDevicePrefix;       // classroom/room01/device/
String topicSetWildcard;        // classroom/room01/device/+/set
String topicAttendance;         // classroom/room01/attendance
String topicAttendanceFeedback; // classroom/room01/attendance/feedback
String topicAlert;              // classroom/room01/alert
String topicStatus;             // classroom/room01/status  (LWT + Online announce)

// =====================================================
// 11. THOI GIAN
// =====================================================

String getCurrentTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo))
    return "N/A";

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buffer);
}

// =====================================================
// 12. BUZZER NON-BLOCKING
// =====================================================

void startBuzzer(int times) {
  if (times <= 0)
    return;

  buzzerRemaining = times;
  buzzerActive = true;
  buzzerState = true;
  buzzerTimer = millis();

  tone(BUZZER_PIN, 2000);
}

void updateBuzzer() {
  if (!buzzerActive)
    return;

  unsigned long now = millis();

  if (buzzerState) {
    if (now - buzzerTimer >= BUZZER_ON_TIME) {
      noTone(BUZZER_PIN);
      buzzerState = false;
      buzzerTimer = now;
      buzzerRemaining--;
      if (buzzerRemaining <= 0)
        buzzerActive = false;
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

// 13-14. XU LY THE RFID (Duoc quan ly boi Server)

// =====================================================
// 15. PUBLISH CAM BIEN (dung chung 1 ham cho moi sensor)
// =====================================================
// Payload: {"room_id":"room01","value":32.5,"unit":"C","time":"..."}

void publishSensor(const char *sensorName, float value, const char *unit) {
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
// 16. PUBLISH TRANG THAI THIET BI
// =====================================================
// Payload:
// {"room_id":"room01","device":"light1","command":"ON","state":"ON","source":"AUTO","time":"..."}
// "source" = "AUTO" (do he thong tu dieu khien theo lux) hoac "MANUAL" (do
// nguoi dung/API ra lenh) Voi fan/ac (khong co auto), source luon la "MANUAL".

void publishDeviceStatus(const String &devName, const char *state,
                         const char *source) {
  if (!mqtt.connected())
    return;

  JsonDocument response;
  response["room_id"] = ROOM_ID;
  response["device"] = devName;
  response["command"] = state;
  response["state"] = state;
  response["source"] = source;
  response["time"] = getCurrentTime();

  char buffer[192];
  serializeJson(response, buffer);

  String statusTopic = topicDevicePrefix + devName + "/status";
  mqtt.publish(statusTopic.c_str(), buffer, true);

  Serial.printf("[%s] %s (%s)\n", devName.c_str(), state, source);
}

// Phan hoi trang thai che do AUTO/MANUAL cua 1 den (retained)
void publishLightMode(const String &devName, bool autoMode) {
  if (!mqtt.connected())
    return;

  JsonDocument response;
  response["room_id"] = ROOM_ID;
  response["device"] = devName;
  response["mode"] = autoMode ? "AUTO" : "MANUAL";
  response["time"] = getCurrentTime();

  char buffer[160];
  serializeJson(response, buffer);

  String statusTopic = topicDevicePrefix + devName + "/status";
  mqtt.publish(statusTopic.c_str(), buffer, true);

  Serial.printf("[%s] mode -> %s\n", devName.c_str(),
                autoMode ? "AUTO" : "MANUAL");
}

// =====================================================
// 17. AP DUNG TRANG THAI RELAY CHO TUNG DEN (dung chung cho AUTO & MANUAL)
// =====================================================

void applyLight1(bool turnOn, const char *source) {
  light1IsOn = turnOn;
  digitalWrite(RELAY_LIGHT1, turnOn ? RELAY_ON : RELAY_OFF);
  publishDeviceStatus("light1", turnOn ? "ON" : "OFF", source);
}

void applyLight2(bool turnOn, const char *source) {
  light2IsOn = turnOn;
  digitalWrite(RELAY_LIGHT2, turnOn ? RELAY_ON : RELAY_OFF);
  publishDeviceStatus("light2", turnOn ? "ON" : "OFF", source);
}

// =====================================================
// 18. LOGIC AUTO CHO 2 DEN
// =====================================================
// Light1: doc lap, chi theo lux.
// Light2: la den PHU - trong AUTO chi duoc bat THEM khi Light1 dang bat ma
//         van con toi hon nguong cua Light2; se tu tat khi du sang HOAC khi
//         Light1 da tat (Light2 khong tu "dung mot minh").
// QUAN TRONG: xu ly Light1 truoc, Light2 sau, trong cung 1 lan goi, de Light2
// luon doc duoc trang thai light1IsOn moi nhat (ke ca khi Light1 vua auto-tat
// ngay trong lan doc lux nay).

void autoControlLights(float lux) {
  // ---- Light1: hoan toan theo lux ----
  if (light1AutoMode) {
    if (!light1IsOn && lux < LUX_LIGHT1_ON_THRESHOLD) {
      applyLight1(true, "AUTO");
    } else if (light1IsOn && lux > LUX_LIGHT1_OFF_THRESHOLD) {
      applyLight1(false, "AUTO");
    }
  }

  // ---- Light2: phu thuoc lux VA trang thai Light1 ----
  if (light2AutoMode) {
    if (!light2IsOn && light1IsOn && lux < LUX_LIGHT2_ON_THRESHOLD) {
      applyLight2(true, "AUTO");
    } else if (light2IsOn && (lux > LUX_LIGHT2_OFF_THRESHOLD || !light1IsOn)) {
      applyLight2(false, "AUTO");
    }
  }
}

// =====================================================
// 19. DIEU KHIEN RELAY THEO TEN THIET BI (FAN / AC - khong co AUTO)
// =====================================================

bool setDevice(const String &device, uint8_t pinLevel) {
  if (device == "fan") {
    digitalWrite(RELAY_FAN, pinLevel);
  } else if (device == "ac") {
    digitalWrite(RELAY_AC, pinLevel);
  } else {
    return false; // thiet bi khong hop le (light1/light2/light/all duoc xu ly
                  // rieng)
  }
  return true;
}

// =====================================================
// 20. XU LY MQTT NHAN LENH DIEU KHIEN
// =====================================================
// Topic:   classroom/{room_id}/device/{device_name}/set
// Payload: {"command":"ON"} / {"command":"OFF"} / {"command":"AUTO"} /
// {"command":"MANUAL"}

void xuLyMQTT(char *topic, byte *payload, unsigned int length) {
  String topicStr = String(topic);

  String data;
  for (unsigned int i = 0; i < length; i++)
    data += (char)payload[i];

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, data);
  if (error) {
    Serial.println("[MQTT] JSON khong hop le!");
    return;
  }

  // 0. Xu ly topic phan hoi diem danh tu Server:
  // classroom/{room_id}/attendance/feedback
  if (topicStr.endsWith("/attendance/feedback")) {
    int beeps = doc["beeps"] | 1;
    const char *status = doc["status"] | "INFO";
    const char *studentName = doc["student_name"] | "";
    const char *msg = doc["message"] | "";
    Serial.printf("[ATTENDANCE FEEDBACK] Status: %s | %s (%s) | Beeps: %d\n",
                  status, studentName, msg, beeps);
    startBuzzer(beeps);
    return;
  }

  int startIdx = topicStr.indexOf("device/") + 7;
  int endIdx = topicStr.indexOf("/set");

  if (startIdx < 7 || endIdx < 0 || endIdx <= startIdx) {
    Serial.println("[MQTT] Topic khong hop le!");
    return;
  }

  String device = topicStr.substring(startIdx, endIdx);

  const char *command = doc["command"];
  if (!command) {
    Serial.println("[MQTT] Thieu command!");
    return;
  }

  // -----------------------------------------------------
  // light1_mode / light2_mode: bat/tat AUTO rieng cho tung den
  // -----------------------------------------------------
  if (device == "light1_mode" || device == "light2_mode") {
    bool wantAuto;
    if (strcmp(command, "AUTO") == 0) {
      wantAuto = true;
    } else if (strcmp(command, "MANUAL") == 0) {
      wantAuto = false;
    } else {
      Serial.println("[MQTT] light_mode chi nhan AUTO hoac MANUAL!");
      return;
    }

    if (device == "light1_mode") {
      light1AutoMode = wantAuto;
      publishLightMode("light1_mode", light1AutoMode);
    } else {
      light2AutoMode = wantAuto;
      publishLightMode("light2_mode", light2AutoMode);
    }
    return;
  }

  bool turnOn = (strcmp(command, "ON") == 0);
  uint8_t pinLevel = turnOn ? RELAY_ON : RELAY_OFF;

  // -----------------------------------------------------
  // light1 / light2: lenh thu cong -> tu dong chuyen sang MANUAL
  // de khong bi auto ghi de ngay sau do
  // -----------------------------------------------------
  if (device == "light1") {
    light1AutoMode = false;
    applyLight1(turnOn, "MANUAL");
    Serial.println("[MQTT] light1 nhan lenh thu cong -> chuyen sang MANUAL");
    return;
  }

  if (device == "light2") {
    light2AutoMode = false;
    applyLight2(turnOn, "MANUAL");
    Serial.println("[MQTT] light2 nhan lenh thu cong -> chuyen sang MANUAL");
    return;
  }

  // -----------------------------------------------------
  // light: dieu khien ca 2 den cung luc, chuyen ca 2 sang MANUAL
  // -----------------------------------------------------
  if (device == "light") {
    light1AutoMode = false;
    light2AutoMode = false;
    applyLight1(turnOn, "MANUAL");
    applyLight2(turnOn, "MANUAL");
    return;
  }

  // -----------------------------------------------------
  // all: dieu khien light1, light2 (chuyen MANUAL), fan va ac
  // -----------------------------------------------------
  if (device == "all") {
    light1AutoMode = false;
    light2AutoMode = false;
    applyLight1(turnOn, "MANUAL");
    applyLight2(turnOn, "MANUAL");
    setDevice("fan", pinLevel);
    setDevice("ac", pinLevel);
    publishDeviceStatus("fan", command, "MANUAL");
    publishDeviceStatus("ac", command, "MANUAL");
    Serial.printf("[MQTT] all -> %s\n", command);
    return;
  }

  // -----------------------------------------------------
  // fan / ac
  // -----------------------------------------------------
  if (!setDevice(device, pinLevel)) {
    Serial.printf("[MQTT] Thiet bi khong hop le: %s\n", device.c_str());
    return;
  }

  publishDeviceStatus(device, command, "MANUAL");
}

// =====================================================
// 21. KET NOI WIFI
// =====================================================

void ketNoiWiFi() {
  if (WiFi.status() == WL_CONNECTED)
    return;

  unsigned long now = millis();
  if (now - lastWiFiAttempt < WIFI_RETRY_INTERVAL)
    return;
  lastWiFiAttempt = now;

  Serial.printf("\n[WIFI] Dang ket noi toi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

// =====================================================
// 22. TIM & KET NOI MQTT BROKER
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
  if (WiFi.status() != WL_CONNECTED)
    return;
  if (mqtt.connected())
    return;

  unsigned long now = millis();
  if (now - lastMQTTAttempt < MQTT_RETRY_INTERVAL)
    return;
  lastMQTTAttempt = now;

  Serial.println("[MQTT] Dang tim broker...");
  if (!timMQTTBroker())
    return;

  mqtt.setServer(mqttServerIP, MQTT_PORT);
  mqtt.setCallback(xuLyMQTT);

  String clientID = String("ESP32_") + ROOM_ID;
  String willTopic = topicStatus;
  String willMsg   = "OFFLINE";

  Serial.println("[MQTT] Dang ket noi...");

  // Ket noi voi Last Will & Testament: Broker tu dong gui 'OFFLINE' khi mat ket noi
  if (mqtt.connect(clientID.c_str(),
                   NULL, NULL,
                   willTopic.c_str(), 1, true, willMsg.c_str())) {
    Serial.println("[MQTT] KET NOI THANH CONG!");

    // Bao hieu phong dang ONLINE (retained, QoS 1)
    mqtt.publish(topicStatus.c_str(), "ONLINE", true);

    mqtt.subscribe(topicSetWildcard.c_str());
    mqtt.subscribe(topicAttendanceFeedback.c_str());

    // Gui trang thai ban dau de Backend va Web dong bo ngay khi ket noi
    publishDeviceStatus("light1", light1IsOn ? "ON" : "OFF", "MANUAL");
    publishDeviceStatus("light2", light2IsOn ? "ON" : "OFF", "MANUAL");
    publishLightMode("light1_mode", light1AutoMode);
    publishLightMode("light2_mode", light2AutoMode);
    publishDeviceStatus("fan", "OFF", "MANUAL");
    publishDeviceStatus("ac", "OFF", "MANUAL");
  } else {
    Serial.printf("[MQTT] Loi ket noi. State = %d\n", mqtt.state());
  }
}

// =====================================================
// 23. XU LY RFID (diem danh)
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

  if (!rfid.PICC_IsNewCardPresent())
    return;
  if (!rfid.PICC_ReadCardSerial())
    return;

  String cardUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10)
      cardUID += "0";
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

  // Bip nhe 1 tieng bao nhan the vat ly
  startBuzzer(1);

  String scanTime = getCurrentTime();

  // 1. Publish diem danh len Server qua MQTT de phan tich ca hoc & dung gio /
  // muon
  JsonDocument doc;
  doc["room_id"] = ROOM_ID;
  doc["card_uid"] = cardUID;
  doc["timestamp"] = scanTime;

  char buffer[220];
  serializeJson(doc, buffer);

  if (mqtt.connected()) {
    mqtt.publish(topicAttendance.c_str(), buffer);
    Serial.printf("[RFID] Da gui MQTT diem danh: %s\n", buffer);
  } else {
    Serial.println("[RFID] MQTT mat ket noi - khong the gui!");
  }

  // 2. Publish trang thai the qua topic sensor/RFID de giam sat thoi gian thuc
  publishSensor("RFID", 1, "card");

  Serial.println();
  Serial.println("========== RFID ==========");
  Serial.printf("UID       : %s\n", cardUID.c_str());
  Serial.printf("Thoi gian : %s\n", scanTime.c_str());
  Serial.println("==========================");

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

// =====================================================
// 24. DOC & GUI CAM BIEN
// =====================================================

void docCamBien() {
  unsigned long now = millis();
  if (now - lastSensorRead < SENSOR_INTERVAL)
    return;
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

  // ---- Cua ----
  bool doorOpen = (digitalRead(DOOR_PIN) == HIGH);

  // ---- BH1750 (anh sang) ----
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    Serial.println("[BH1750] Loi doc cam bien!");
    lux = 0;
  }

  // ---- Trang thai gas nguy hiem ----
  isGasDanger = (gasVal > GAS_THRESHOLD);

  // ---- Tu dong bat/tat den theo anh sang (rieng cho tung den dang AUTO) ----
  autoControlLights(lux);

  // ---- Publish tung sensor rieng ----
  publishSensor("temperature", temp, "C");
  publishSensor("humidity", hum, "%");
  publishSensor("gas", gasVal, "ppm");
  publishSensor("door", doorOpen ? 1 : 0, "state");
  publishSensor("light", lux, "lux");
  publishSensor("RFID", rfidCardLocked ? 1 : 0, "card");

  // ---- Log gon ----
  Serial.println("------------- SENSOR -------------");
  Serial.printf("Nhiet do : %.1f C\n", temp);
  Serial.printf("Do am    : %.1f %%\n", hum);
  Serial.printf("Khi gas  : %d ppm\n", gasVal);
  Serial.printf("Anh sang : %.1f lux\n", lux);
  Serial.printf("Cua      : %s\n", doorOpen ? "DANG MO" : "DA DONG");
  Serial.printf("Light1   : %s (%s)\n", light1IsOn ? "BAT" : "TAT",
                light1AutoMode ? "AUTO" : "MANUAL");
  Serial.printf("Light2   : %s (%s)\n", light2IsOn ? "BAT" : "TAT",
                light2AutoMode ? "AUTO" : "MANUAL");
  Serial.println("-----------------------------------");

  // ---- Canh bao gas (rieng, khong phai sensor thuong) ----
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

    Serial.println(isGasDanger ? "!!! CANH BAO GAS !!!"
                               : "[GAS] Da tro lai binh thuong.");
  }
}

// =====================================================
// 25. BUZZER CANH BAO GAS (nhap nhay lien tuc)
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
    if (alarmToggleState)
      tone(BUZZER_PIN, 2000);
    else
      noTone(BUZZER_PIN);
  }
}

// =====================================================
// 26. SETUP
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

  // ---- RFID (SPI mac dinh) ----
  SPI.begin();
  rfid.PCD_Init();
  delay(50);

  // ---- MQTT TOPICS ----
  topicSensorPrefix = "classroom/" + String(ROOM_ID) + "/sensor/";
  topicDevicePrefix = "classroom/" + String(ROOM_ID) + "/device/";
  topicSetWildcard = topicDevicePrefix + "+/set";
  topicAttendance = "classroom/" + String(ROOM_ID) + "/attendance";
  topicAttendanceFeedback =
      "classroom/" + String(ROOM_ID) + "/attendance/feedback";
  topicAlert  = "classroom/" + String(ROOM_ID) + "/alert";
  topicStatus = "classroom/" + String(ROOM_ID) + "/status";

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
// 27. LOOP
// =====================================================

void loop() {
  ketNoiWiFi();
  ketNoiMQTT();

  if (mqtt.connected())
    mqtt.loop();

  updateBuzzer();
  xuLyGasAlarm();
  xuLyRFID(); // van hoat dong ke ca khi MQTT mat
  docCamBien();

  // Khong dung delay() o day
}
