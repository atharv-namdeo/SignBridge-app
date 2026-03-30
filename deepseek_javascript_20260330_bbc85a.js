// SmartSign Web App
class SmartSignApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.video = null;
        this.stream = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.analyser = null;
        this.waveformCanvas = null;
        this.waveformCtx = null;
        this.hapticsEnabled = true;
        this.audioSnifferEnabled = true;
        this.voiceOutputEnabled = true;
        this.devices = {
            light: { status: false, sign: 'light' },
            fan: { status: false, sign: 'fan' },
            ac: { status: false, sign: 'ac' }
        };
        this.macros = [
            { id: 1, gesture: 'emergency', phrase: 'I have a severe nut allergy' },
            { id: 2, gesture: 'help', phrase: 'I need immediate assistance' }
        ];
        this.signCount = 0;
        this.recentTranslations = [];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupHaptics();
        this.setupAudioSniffer();
        this.loadSettings();
        this.startCamera();
        this.startGestureDetection();
        this.updateDashboard();
    }
    
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = item.dataset.page;
                this.switchPage(page);
                this.vibrate('light');
            });
        });
        
        // Smart Phrases
        document.querySelectorAll('.phrase-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const phrase = chip.dataset.phrase;
                this.showTranslation(phrase);
                this.vibrate('light');
            });
        });
        
        // IoT Controls
        document.querySelectorAll('.device-control').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const device = btn.dataset.device;
                this.toggleDevice(device);
                this.vibrate('medium');
            });
        });
        
        // Macro Recording
        const recordBtn = document.getElementById('startRecording');
        if (recordBtn) {
            recordBtn.addEventListener('click', () => this.startMacroRecording());
        }
        
        // Settings Toggles
        const hapticToggle = document.getElementById('hapticToggle');
        if (hapticToggle) {
            hapticToggle.addEventListener('change', (e) => {
                this.hapticsEnabled = e.target.checked;
                this.saveSetting('haptics', this.hapticsEnabled);
            });
        }
        
        const audioSnifferToggle = document.getElementById('audioSnifferToggle');
        if (audioSnifferToggle) {
            audioSnifferToggle.addEventListener('change', (e) => {
                this.audioSnifferEnabled = e.target.checked;
                this.saveSetting('audioSniffer', this.audioSnifferEnabled);
            });
        }
        
        const voiceOutputToggle = document.getElementById('voiceOutputToggle');
        if (voiceOutputToggle) {
            voiceOutputToggle.addEventListener('change', (e) => {
                this.voiceOutputEnabled = e.target.checked;
                this.saveSetting('voiceOutput', this.voiceOutputEnabled);
            });
        }
        
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    document.body.classList.add('dark');
                } else {
                    document.body.classList.remove('dark');
                }
                this.saveSetting('darkMode', e.target.checked);
            });
        }
        
        // Speak Button
        const speakBtn = document.getElementById('speakButton');
        if (speakBtn) {
            speakBtn.addEventListener('click', () => {
                const resultText = document.querySelector('.result-text')?.innerText;
                if (resultText && resultText !== 'Ready to translate') {
                    this.speakText(resultText);
                }
            });
        }
        
        // Add Device Button
        const addDeviceBtn = document.getElementById('addDeviceBtn');
        if (addDeviceBtn) {
            addDeviceBtn.addEventListener('click', () => this.showAddDeviceDialog());
        }
        
        // Test Connection
        const testConnBtn = document.getElementById('testConnection');
        if (testConnBtn) {
            testConnBtn.addEventListener('click', () => this.testIoTConnection());
        }
        
        // Save Macro
        const saveMacroBtn = document.getElementById('saveMacro');
        if (saveMacroBtn) {
            saveMacroBtn.addEventListener('click', () => this.saveMacro());
        }
        
        // Delete Macros
        document.querySelectorAll('.delete-macro').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(btn.dataset.id);
                this.deleteMacro(id);
            });
        });
        
        // Bento Cards
        document.getElementById('statsCard')?.addEventListener('click', () => this.showStatsDialog());
        document.getElementById('macroCard')?.addEventListener('click', () => this.switchPage('macros'));
        document.getElementById('devicesCard')?.addEventListener('click', () => this.switchPage('iot'));
        document.getElementById('recentCard')?.addEventListener('click', () => this.showRecentDialog());
    }
    
    setupHaptics() {
        // Check if vibration is supported
        if (!('vibrate' in navigator)) {
            console.log('Vibration not supported');
            this.hapticsEnabled = false;
        }
    }
    
    vibrate(type) {
        if (!this.hapticsEnabled) return;
        
        switch(type) {
            case 'light':
                navigator.vibrate(50);
                break;
            case 'medium':
                navigator.vibrate(100);
                break;
            case 'success':
                navigator.vibrate([50, 100, 50]);
                break;
            case 'error':
                navigator.vibrate([200, 100, 200]);
                break;
            case 'warning':
                navigator.vibrate([100, 100, 100, 100]);
                break;
            default:
                navigator.vibrate(50);
        }
    }
    
    setupAudioSniffer() {
        if (!this.audioSnifferEnabled) return;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const source = this.audioContext.createMediaStreamSource(stream);
                    source.connect(this.analyser);
                    this.startNoiseDetection();
                })
                .catch(err => console.log('Audio permission denied:', err));
                
        } catch(err) {
            console.log('AudioContext not supported');
        }
        
        // Setup waveform
        this.waveformCanvas = document.getElementById('waveform');
        if (this.waveformCanvas) {
            this.waveformCtx = this.waveformCanvas.getContext('2d');
            this.setupWaveform();
        }
    }
    
    startNoiseDetection() {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        const detectNoise = () => {
            if (!this.audioSnifferEnabled) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            let average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            let noiseLevel = average / 255;
            
            // Update noise indicator
            const noiseBar = document.getElementById('noiseBar');
            const noiseText = document.getElementById('noiseText');
            
            if (noiseBar) {
                noiseBar.style.width = `${noiseLevel * 100}%`;
                
                if (noiseLevel < 0.3) {
                    noiseBar.style.background = 'var(--success)';
                    if (noiseText) noiseText.textContent = 'Noise Level: Low';
                } else if (noiseLevel < 0.7) {
                    noiseBar.style.background = 'var(--warning)';
                    if (noiseText) noiseText.textContent = 'Noise Level: Medium';
                } else {
                    noiseBar.style.background = 'var(--error)';
                    if (noiseText) noiseText.textContent = 'Noise Level: High - Move to quieter area';
                    this.vibrate('warning');
                }
            }
            
            requestAnimationFrame(detectNoise);
        };
        
        detectNoise();
    }
    
    setupWaveform() {
        if (!this.waveformCanvas || !this.waveformCtx) return;
        
        const drawWaveform = () => {
            if (!this.analyser || !this.audioSnifferEnabled) return;
            
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteTimeDomainData(dataArray);
            
            this.waveformCtx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
            this.waveformCtx.beginPath();
            this.waveformCtx.strokeStyle = 'var(--primary)';
            this.waveformCtx.lineWidth = 2;
            
            const sliceWidth = this.waveformCanvas.width / dataArray.length;
            let x = 0;
            
            for (let i = 0; i < dataArray.length; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * this.waveformCanvas.height / 2;
                
                if (i === 0) {
                    this.waveformCtx.moveTo(x, y);
                } else {
                    this.waveformCtx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            this.waveformCtx.stroke();
            requestAnimationFrame(drawWaveform);
        };
        
        drawWaveform();
    }
    
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user' },
                audio: false 
            });
            
            this.video = document.getElementById('video');
            if (this.video) {
                this.video.srcObject = this.stream;
            }
        } catch(err) {
            console.error('Camera error:', err);
            this.showToast('Camera access denied');
        }
    }
    
    startGestureDetection() {
        // Simulate gesture detection with MediaPipe in production
        setInterval(() => {
            if (this.currentPage === 'camera') {
                this.simulateGestureDetection();
            }
        }, 2000);
    }
    
    simulateGestureDetection() {
        const gestures = ['Hello', 'Thank you', 'I need water', 'Help'];
        const randomGesture = gestures[Math.floor(Math.random() * gestures.length)];
        
        // Update confidence
        const confidence = 0.7 + Math.random() * 0.3;
        const confidenceFill = document.getElementById('confidenceFill');
        if (confidenceFill) {
            confidenceFill.style.width = `${confidence * 100}%`;
        }
        
        // Check if gesture matches any macro
        const macro = this.macros.find(m => randomGesture.toLowerCase().includes(m.gesture));
        if (macro) {
            this.showTranslation(macro.phrase);
            this.vibrate('success');
            this.showToast(`Macro triggered: ${macro.phrase}`);
        } else {
            this.showTranslation(randomGesture);
            this.vibrate('light');
        }
        
        // Check if gesture matches IoT devices
        for (const [device, config] of Object.entries(this.devices)) {
            if (randomGesture.toLowerCase().includes(config.sign)) {
                this.toggleDevice(device);
                this.showToast(`Sign detected: Turning ${device} ${!config.status ? 'ON' : 'OFF'}`);
            }
        }
    }
    
    showTranslation(text) {
        const resultDiv = document.querySelector('.result-text');
        if (resultDiv) {
            resultDiv.textContent = text;
            this.addToRecent(text);
            
            if (this.voiceOutputEnabled) {
                this.speakText(text);
            }
        }
        
        // Update sign count
        this.signCount++;
        const signCountElement = document.getElementById('signCount');
        if (signCountElement) {
            signCountElement.textContent = this.signCount;
        }
    }
    
    speakText(text) {
        if (!('speechSynthesis' in window)) return;
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }
    
    addToRecent(text) {
        this.recentTranslations.unshift(text);
        if (this.recentTranslations.length > 5) {
            this.recentTranslations.pop();
        }
        
        // Update recent list in dashboard
        const recentList = document.getElementById('recentList');
        if (recentList) {
            recentList.innerHTML = this.recentTranslations.map(t => 
                `<div class="recent-item">${t}</div>`
            ).join('');
        }
    }
    
    toggleDevice(device) {
        const deviceConfig = this.devices[device];
        if (!deviceConfig) return;
        
        deviceConfig.status = !deviceConfig.status;
        
        // Update UI
        const statusElement = document.getElementById(`${device}Status`);
        if (statusElement) {
            statusElement.textContent = deviceConfig.status ? 'On' : 'Off';
            if (deviceConfig.status) {
                statusElement.classList.add('on');
            } else {
                statusElement.classList.remove('on');
            }
        }
        
        // Send command to IoT device
        this.sendIoTCommand(device, deviceConfig.status);
        
        this.showToast(`${device} turned ${deviceConfig.status ? 'ON' : 'OFF'}`);
        this.vibrate('medium');
    }
    
    sendIoTCommand(device, state) {
        // Simulate sending to ESP32/Raspberry Pi
        const serverUrl = document.getElementById('serverUrl')?.value || 'ws://localhost:8080';
        
        // In production, send WebSocket/HTTP request
        console.log(`Sending command to ${serverUrl}: ${device} -> ${state}`);
        
        // Simulate response
        setTimeout(() => {
            this.showToast(`${device} command sent successfully`);
        }, 500);
    }
    
    testIoTConnection() {
        const serverUrl = document.getElementById('serverUrl')?.value;
        if (!serverUrl) {
            this.showToast('Please enter server URL');
            return;
        }
        
        this.showToast('Testing connection...');
        this.vibrate('light');
        
        // Simulate connection test
        setTimeout(() => {
            this.showToast('Connection successful!');
            this.vibrate('success');
        }, 1000);
    }
    
    startMacroRecording() {
        const recordBtn = document.getElementById('startRecording');
        const recordingStatus = document.getElementById('recordingStatus');
        const macroInput = document.getElementById('macroInput');
        
        if (recordBtn) recordBtn.style.display = 'none';
        if (recordingStatus) recordingStatus.style.display = 'flex';
        
        this.vibrate('medium');
        this.showToast('Recording gesture... Make your sign');
        
        // Simulate recording for 3 seconds
        setTimeout(() => {
            if (recordingStatus) recordingStatus.style.display = 'none';
            if (macroInput) macroInput.style.display = 'block';
            this.vibrate('success');
        }, 3000);
    }
    
    saveMacro() {
        const phraseInput = document.getElementById('macroPhrase');
        const phrase = phraseInput?.value;
        
        if (!phrase) {
            this.showToast('Please enter a phrase');
            return;
        }
        
        const newMacro = {
            id: this.macros.length + 1,
            gesture: `custom_${Date.now()}`,
            phrase: phrase
        };
        
        this.macros.push(newMacro);
        this.updateMacrosList();
        
        // Reset UI
        const macroInput = document.getElementById('macroInput');
        const recordBtn = document.getElementById('startRecording');
        if (macroInput) macroInput.style.display = 'none';
        if (recordBtn) recordBtn.style.display = 'flex';
        if (phraseInput) phraseInput.value = '';
        
        this.showToast('Macro saved successfully!');
        this.vibrate('success');
    }
    
    updateMacrosList() {
        const macroItems = document.getElementById('macroItems');
        if (!macroItems) return;
        
        macroItems.innerHTML = this.macros.map(macro => `
            <div class="macro-item">
                <div class="macro-info">
                    <div class="macro-gesture">🤚 ${macro.gesture}</div>
                    <div class="macro-phrase">"${macro.phrase}"</div>
                </div>
                <button class="delete-macro" data-id="${macro.id}">Delete</button>
            </div>
        `).join('');
        
        // Reattach delete listeners
        document.querySelectorAll('.delete-macro').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(btn.dataset.id);
                this.deleteMacro(id);
            });
        });
    }
    
    deleteMacro(id) {
        this.macros = this.macros.filter(m => m.id !== id);
        this.updateMacrosList();
        this.showToast('Macro deleted');
        this.vibrate('light');
    }
    
    switchPage(page) {
        this.currentPage = page;
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
        
        // Update pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        const activePage = document.getElementById(`${page}Page`);
        if (activePage) {
            activePage.classList.add('active');
        }
        
        // Page-specific actions
        if (page === 'camera') {
            this.startCamera();
        }
    }
    
    updateDashboard() {
        // Update stats
        const signCountElement = document.getElementById('signCount');
        if (signCountElement) {
            signCountElement.textContent = this.signCount;
        }
        
        const activeMacrosElement = document.getElementById('activeMacros');
        if (activeMacrosElement) {
            activeMacrosElement.textContent = this.macros.length;
        }
        
        const connectedDevicesElement = document.getElementById('connectedDevices');
        if (connectedDevicesElement) {
            connectedDevicesElement.textContent = Object.keys(this.devices).length;
        }
    }
    
    loadSettings() {
        // Load saved settings from localStorage
        const haptics = localStorage.getItem('haptics');
        if (haptics !== null) {
            this.hapticsEnabled = haptics === 'true';
            const toggle = document.getElementById('hapticToggle');
            if (toggle) toggle.checked = this.hapticsEnabled;
        }
        
        const audioSniffer = localStorage.getItem('audioSniffer');
        if (audioSniffer !== null) {
            this.audioSnifferEnabled = audioSniffer === 'true';
            const toggle = document.getElementById('audioSnifferToggle');
            if (toggle) toggle.checked = this.audioSnifferEnabled;
        }
        
        const voiceOutput = localStorage.getItem('voiceOutput');
        if (voiceOutput !== null) {
            this.voiceOutputEnabled = voiceOutput === 'true';
            const toggle = document.getElementById('voiceOutputToggle');
            if (toggle) toggle.checked = this.voiceOutputEnabled;
        }
        
        const darkMode = localStorage.getItem('darkMode');
        if (darkMode === 'true') {
            document.body.classList.add('dark');
            const toggle = document.getElementById('darkModeToggle');
            if (toggle) toggle.checked = true;
        }
        
        const serverUrl = localStorage.getItem('serverUrl');
        if (serverUrl) {
            const urlInput = document.getElementById('serverUrl');
            if (urlInput) urlInput.value = serverUrl;
        }
    }
    
    saveSetting(key, value) {
        localStorage.setItem(key, value);
    }
    
    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    showStatsDialog() {
        this.showToast(`You've made ${this.signCount} signs today!`);
    }
    
    showRecentDialog() {
        if (this.recentTranslations.length === 0) {
            this.showToast('No recent translations');
        } else {
            this.showToast(`Recent: ${this.recentTranslations[0]}`);
        }
    }
    
    showAddDeviceDialog() {
        const deviceName = prompt('Enter device name:');
        if (deviceName) {
            const signMapping = prompt('Enter sign to trigger this device:');
            if (signMapping) {
                this.devices[deviceName.toLowerCase()] = {
                    status: false,
                    sign: signMapping.toLowerCase()
                };
                this.showToast(`Device ${deviceName} added!`);
                this.updateDevicesGrid();
            }
        }
    }
    
    updateDevicesGrid() {
        const devicesGrid = document.getElementById('devicesGrid');
        if (!devicesGrid) return;
        
        devicesGrid.innerHTML = Object.entries(this.devices).map(([device, config]) => `
            <div class="device-card" data-device="${device}">
                <div class="device-icon">${this.getDeviceIcon(device)}</div>
                <div class="device-name">${device.charAt(0).toUpperCase() + device.slice(1)}</div>
                <div class="device-status ${config.status ? 'on' : ''}" id="${device}Status">${config.status ? 'On' : 'Off'}</div>
                <button class="device-control" data-device="${device}" data-action="toggle">Toggle</button>
                <div class="sign-mapping">Sign: "${config.sign}"</div>
            </div>
        `).join('');
        
        // Reattach device control listeners
        document.querySelectorAll('.device-control').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const device = btn.dataset.device;
                this.toggleDevice(device);
                this.vibrate('medium');
            });
        });
    }
    
    getDeviceIcon(device) {
        const icons = {
            light: '💡',
            fan: '🌀',
            ac: '❄️',
            default: '🔌'
        };
        return icons[device] || icons.default;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SmartSignApp();
});

// Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('ServiceWorker registration failed:', err);
    });
}