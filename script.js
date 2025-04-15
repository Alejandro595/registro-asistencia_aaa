import { ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const db = window.firebaseDB;
  const storage = getStorage(); // Firebase Storage

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
  let attendance = [];
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
    setTimeout(() => elements.feedbackMessage.textContent = "", 3000);
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      elements.video.srcObject = stream;
    } catch {
      showError("No se pudo acceder a la cámara.");
    }
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach(track => track.stop());
  }

  function startVoiceRecognition(callback) {
    try {
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = "es-ES";
      recognition.start();
      recognition.onresult = e => callback(e.results[0][0].transcript.trim());
      recognition.onerror = () => showError("Error de reconocimiento de voz.");
    } catch {
      showError("Navegador no soporta reconocimiento de voz.");
    }
  }

  // Función de login
  function login(username, password) {
    if (users[username]?.password === password) {
      currentUser = username;
      userRole = users[username].role;
      elements.loginForm.style.display = "none";
      elements.mainContainer.style.display = "block";
      elements.adminPanel.style.display = userRole === "admin" ? "block" : "none";
      startCamera();
      cargarAsistenciaDesdeFirebase();
    } else {
      showError("Credenciales incorrectas");
    }
  }

  // Función de registro
  function register(username, password, role) {
    if (!username || !password) return showError("Usuario y contraseña requeridos");
    if (users[username]) return showError("Usuario ya registrado");
    users[username] = { password, role };
    localStorage.setItem("users", JSON.stringify(users));
    showSuccess("✅ Usuario registrado");
  }

  // Enlace de los botones de login y registro
  const loginButton = elements.loginButton;
  const registerButton = elements.registerButton;

  if (loginButton && registerButton) {
    loginButton.addEventListener("click", () => {
      const username = elements.usernameInput.value.trim();
      const password = elements.passwordInput.value.trim();
      login(username, password);
    });

    registerButton.addEventListener("click", () => {
      const username = elements.usernameInput.value.trim();
      const password = elements.passwordInput.value.trim();
      const role = elements.roleSelect.value;
      register(username, password, role);
    });
  }

  elements.captureButton.addEventListener("click", async () => {
    if (!currentUser) return showError("Inicia sesión para registrar asistencia");

    const now = new Date();
    const fecha = now.toLocaleDateString();
    const hora = now.toLocaleTimeString();

    if (attendance.some(r => r.usuario === currentUser && r.fecha === fecha)) {
      return showError("Ya registraste asistencia hoy");
    }

    // Captura de la imagen
    const canvas = document.createElement("canvas");
    canvas.width = elements.video.videoWidth;
    canvas.height = elements.video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) return showError("No se pudo capturar imagen");

      const imageRef = storageRef(storage, `asistencias/${currentUser}-${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob);
      const imageURL = await getDownloadURL(imageRef);

      const record = { usuario: currentUser, fecha, hora, imagen: imageURL };
      guardarAsistenciaEnFirebase(record);
    }, "image/jpeg");
  });

  // Guardar asistencia en Firebase
  function guardarAsistenciaEnFirebase(record) {
    const asistenciaRef = ref(db, "asistencias");
    push(asistenciaRef, record)
      .then(() => showSuccess("☁️ Asistencia guardada con imagen"))
      .catch(() => showError("❌ Error al guardar en la nube"));
  }

  // Cargar asistencia desde Firebase
  function cargarAsistenciaDesdeFirebase() {
    const asistenciaRef = ref(db, "asistencias");
    onValue(asistenciaRef, snapshot => {
      const data = snapshot.val();
      attendance = [];
      for (const key in data) attendance.push(data[key]);
      renderAttendanceTable();
      renderAdminTable();
    });
  }

  // Renderizar la tabla de asistencia
  function renderAttendanceTable() {
    elements.attendanceTable.innerHTML = "";
    attendance.filter(r => r.usuario === currentUser).forEach(r => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.usuario}</td>
        <td>${r.fecha}</td>
        <td>${r.hora}</td>
        <td><a href="${r.imagen}" target="_blank">Ver Foto</a></td>`;
      elements.attendanceTable.appendChild(row);
    });
  }

  // Renderizar la tabla de administración
  function renderAdminTable() {
    if (userRole !== "admin") return;
    elements.adminTable.innerHTML = "";
    attendance.forEach(r => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.usuario}</td>
        <td>${r.fecha}</td>
        <td>${r.hora}</td>
        <td><a href="${r.imagen}" target="_blank">Ver Foto</a></td>`;
      elements.adminTable.appendChild(row);
    });
  }

  // Logout
  elements.logoutButton?.addEventListener("click", () => {
    currentUser = "";
    userRole = "";
    elements.loginForm.style.display = "block";
    elements.mainContainer.style.display = "none";
    elements.adminPanel.style.display = "none";
    stopCamera();
  });

  // Voz registro
  elements.voiceRegisterButton.addEventListener("click", () => {
    startVoiceRecognition(username => {
      startVoiceRecognition(password => {
        register(username, password, elements.roleSelect.value);
      });
    });
  });

  // Voz login
  elements.voiceLoginButton.addEventListener("click", () => {
    startVoiceRecognition(username => {
      startVoiceRecognition(password => {
        login(username, password);
      });
    });
  });

  elements.mainContainer.style.display = "none";
  elements.adminPanel.style.display = "none";
});
