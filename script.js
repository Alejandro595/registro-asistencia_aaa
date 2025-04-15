import FirebaseDatabase from 'https://cdn.jsdelivr.net/npm/@firebase/database@1.0.14/+esm';

document.addEventListener("DOMContentLoaded", async () => {
    const elements = {
        video: document.getElementById("video"),
        captureButton: document.getElementById("capture"),
        errorMessage: document.getElementById("mensaje"),
        feedbackMessage: document.getElementById("feedback"),
        loginForm: document.getElementById("login-form"),
        usernameInput: document.getElementById("username"),
        passwordInput: document.getElementById("password"),
        roleSelect: document.getElementById("role-select"),
        loginButton: document.getElementById("login-button"),
        registerButton: document.getElementById("register-button"),
        logoutButton: document.getElementById("logout-button"),
        attendanceTable: document.querySelector("#attendance-table tbody"),
        adminPanel: document.getElementById("admin-panel"),
        adminTable: document.getElementById("admin-attendance"),
        mainContainer: document.querySelector(".container"),
        voiceRegisterButton: document.getElementById("voice-register"),
        voiceLoginButton: document.getElementById("voice-login")
    };

    let users = JSON.parse(localStorage.getItem("users")) || {};
    let attendance = JSON.parse(localStorage.getItem("attendance")) || [];
    let currentUser = "";
    let userRole = "";
    let stream = null;
    const successSound = new Audio("https://www.soundjay.com/buttons/sounds/button-3.mp3");

    function showError(message) {
        elements.errorMessage.textContent = `⚠️ ${message}`;
        elements.errorMessage.style.color = "red";
    }

    function showSuccess(message) {
        elements.feedbackMessage.textContent = message;
        elements.feedbackMessage.style.color = "green";
        successSound.play();
        setTimeout(() => {
            elements.feedbackMessage.textContent = "";
        }, 3000);
    }

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            elements.video.srcObject = stream;
        } catch (error) {
            showError("No se pudo acceder a la cámara. Verifica los permisos.");
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }

    function startVoiceRecognition(callback) {
        try {
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.lang = "es-ES";
            recognition.start();
            recognition.onresult = event => callback(event.results[0][0].transcript.trim());
            recognition.onerror = () => showError("No se pudo reconocer la voz. Inténtalo de nuevo.");
        } catch (error) {
            showError("Tu navegador no soporta reconocimiento de voz.");
        }
    }

    function login(username, password) {
        if (users[username]?.password === password) {
            currentUser = username;
            userRole = users[username].role;
            elements.loginForm.style.display = "none";
            elements.mainContainer.style.display = "block";
            elements.adminPanel.style.display = userRole === "admin" ? "block" : "none";
            startCamera();
            cargarAsistenciaDesdeFirebase(); // Cargar desde Firebase
        } else {
            showError("Credenciales incorrectas");
        }
    }

    function register(username, password, role) {
        if (!username || !password) {
            showError("Debe proporcionar un nombre de usuario y una contraseña.");
            return;
        }
        if (users[username]) {
            showError("Este usuario ya está registrado.");
            return;
        }
        users[username] = { password, role };
        localStorage.setItem("users", JSON.stringify(users));
        elements.errorMessage.textContent = "✅ Usuario registrado correctamente";
        elements.errorMessage.style.color = "green";
    }

    elements.registerButton.addEventListener("click", () => {
        const username = elements.usernameInput.value.trim();
        const password = elements.passwordInput.value.trim();
        const role = elements.roleSelect.value;
        register(username, password, role);
    });

    elements.loginButton.addEventListener("click", () => {
        const username = elements.usernameInput.value.trim();
        const password = elements.passwordInput.value.trim();
        login(username, password);
    });

    function renderAttendanceTable() {
        elements.attendanceTable.innerHTML = "";
        attendance.filter(record => record.usuario === currentUser).forEach(record => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${record.usuario}</td><td>${record.fecha}</td><td>${record.hora}</td>`;
            elements.attendanceTable.appendChild(row);
        });
    }

    function renderAdminTable() {
        if (userRole !== "admin") return;
        elements.adminTable.innerHTML = "";
        attendance.forEach((record, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${record.usuario}</td>
                <td>${record.fecha}</td>
                <td>${record.hora}</td>
                <td><button class="delete-btn" data-index="${index}">Eliminar</button></td>
            `;
            elements.adminTable.appendChild(row);
        });
        document.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", (event) => {
                const index = event.target.getAttribute("data-index");
                attendance.splice(index, 1);
                localStorage.setItem("attendance", JSON.stringify(attendance));
                renderAdminTable();
                renderAttendanceTable();
            });
        });
    }

    elements.captureButton.addEventListener("click", () => {
        if (!currentUser) {
            showError("Debes iniciar sesión para registrar asistencia.");
            return;
        }
        const now = new Date();
        const fecha = now.toLocaleDateString();
        if (attendance.some(record => record.usuario === currentUser && record.fecha === fecha)) {
            showError("Ya has registrado tu asistencia hoy.");
            return;
        }
        const record = { usuario: currentUser, fecha, hora: now.toLocaleTimeString() };
        attendance.push(record);
        localStorage.setItem("attendance", JSON.stringify(attendance));
        guardarAsistenciaEnFirebase(record);
        renderAttendanceTable();
        renderAdminTable();
    });

    elements.logoutButton?.addEventListener("click", () => {
        currentUser = "";
        userRole = "";
        elements.loginForm.style.display = "block";
        elements.mainContainer.style.display = "none";
        elements.adminPanel.style.display = "none";
        stopCamera();
    });

    elements.voiceRegisterButton.addEventListener("click", () => {
        startVoiceRecognition(username => {
            startVoiceRecognition(password => {
                register(username, password, elements.roleSelect.value);
            });
        });
    });

    elements.voiceLoginButton.addEventListener("click", () => {
        startVoiceRecognition(username => {
            startVoiceRecognition(password => {
                login(username, password);
            });
        });
    });

    elements.mainContainer.style.display = "none";
    elements.adminPanel.style.display = "none";

    // Función para guardar en Firebase
    function guardarAsistenciaEnFirebase(record) {
        db.ref("asistencias").push(record, error => {
            if (error) {
                showError("❌ Error al guardar en la nube");
            } else {
                showSuccess("☁️ Asistencia guardada en la nube");
            }
        });
    }

    // Función para cargar asistencia desde Firebase
    function cargarAsistenciaDesdeFirebase() {
        db.ref("asistencias").on("value", snapshot => {
            const data = snapshot.val();
            attendance = [];
            for (const key in data) {
                attendance.push(data[key]);
            }
            renderAttendanceTable();
            renderAdminTable();
        });
    }
});
