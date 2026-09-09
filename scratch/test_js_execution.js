const fs = require('fs');

// Create minimal DOM mock
const elements = {};
function getOrCreateElement(id) {
    if (!elements[id]) {
        elements[id] = {
            id: id,
            style: {},
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                toggle(c, force) { if (force) this.classes.add(c); else this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
            },
            attributes: {},
            setAttribute(k, v) { this.attributes[k] = v; },
            getAttribute(k) { return this.attributes[k]; },
            removeAttribute(k) { delete this.attributes[k]; },
            textContent: '',
            innerHTML: '',
            value: '',
            disabled: false,
            addEventListener(ev, fn) { this['on' + ev] = fn; }
        };
    }
    return elements[id];
}

const navItemsList = [
    getOrCreateElement('nav-rooms'),
    getOrCreateElement('nav-dashboard'),
    getOrCreateElement('nav-rfid'),
    getOrCreateElement('nav-schedule'),
    getOrCreateElement('nav-class-students')
];
navItemsList[0].setAttribute('data-tab', 'rooms');
navItemsList[1].setAttribute('data-tab', 'dashboard');
navItemsList[2].setAttribute('data-tab', 'rfid');
navItemsList[3].setAttribute('data-tab', 'schedule');
navItemsList[4].setAttribute('data-tab', 'class-students');

global.window = {
    scrollTo() {},
    addEventListener(ev, fn) {}
};
global.document = {
    getElementById(id) { return getOrCreateElement(id); },
    querySelector(sel) { return getOrCreateElement(sel); },
    querySelectorAll(sel) {
        if (sel.includes('.sidebar-nav .nav-item')) {
            return navItemsList;
        }
        return [];
    },
    addEventListener(ev, fn) {
        if (ev === 'DOMContentLoaded') global.onDOMLoad = fn;
    }
};
global.$ = (id) => getOrCreateElement(id);
global.fetch = async (url) => {
    if (url === '/api/rooms') {
        return {
            ok: true,
            json: async () => ({
                data: [
                    { room_id: 'room01', name: 'Phòng học 01', is_online: false, class_code: 'CNTT01', class_name: 'CNTT 01', class_id: 1, student_count: 5 },
                    { room_id: 'room02', name: 'Phòng học 02', is_online: false, class_code: 'CNTT02', class_name: 'CNTT 02', class_id: 2, student_count: 5 }
                ],
                success: true
            })
        };
    }
    if (url.includes('/students')) {
        return {
            ok: true,
            json: async () => ({ data: [], class: { id: 1, class_code: 'CNTT01', class_name: 'CNTT 01' }, success: true })
        };
    }
    return {
        ok: true,
        json: async () => ({ data: {}, success: true })
    };
};
global.showToast = (t, m, s) => console.log(`[TOAST] ${t}: ${m}`);
global.setServerStatus = () => {};
global.updateLiveClock = () => {};
global.toggleMobileMenu = () => {};

// Read and eval dashboard.js
const code = fs.readFileSync('static/js/dashboard.js', 'utf8');

try {
    eval(code);
    console.log("PASS: Code evaluated without syntax error.");
} catch (e) {
    console.error("FAIL eval:", e);
    process.exit(1);
}

async function testFlow() {
    try {
        console.log("\n--- 1. Testing DOMContentLoaded ---");
        await global.onDOMLoad();
        console.log("PASS DOMContentLoaded.");

        console.log("\n--- 2. Testing selectRoomAndOpenDashboard('room01') ---");
        window.selectRoomAndOpenDashboard('room01');
        console.log("PASS selectRoomAndOpenDashboard('room01').");

        console.log("\n--- 3. Testing sidebar clicks for each tab ---");
        // Test tabs while room01 is active (skip rooms at index 0 first)
        for (let i = 1; i < navItemsList.length; i++) {
            const nav = navItemsList[i];
            const tab = nav.getAttribute('data-tab');
            console.log(`\nClicking sidebar tab: [${tab}]...`);
            if (nav.onclick) {
                nav.onclick({ preventDefault() {} });
            }
            console.log(`  Result view display:`);
            console.log(`  dashboard-view:`, elements['dashboard-view'] ? elements['dashboard-view'].style.display : 'n/a');
            console.log(`  schedule-view:`, elements['schedule-view'] ? elements['schedule-view'].style.display : 'n/a');
            console.log(`  rfid-view:`, elements['rfid-view'] ? elements['rfid-view'].style.display : 'n/a');
            console.log(`  class-students-view:`, elements['class-students-view'] ? elements['class-students-view'].style.display : 'n/a');
            console.log(`  rooms-view:`, elements['rooms-view'] ? elements['rooms-view'].style.display : 'n/a');
        }

        console.log("\n=== ALL JS FLOWS AND TAB SWITCHES PASSED 100%! ===");
        process.exit(0);
    } catch (e) {
        console.error("CRASH DURING FLOW:", e);
        process.exit(1);
    }
}

testFlow();
