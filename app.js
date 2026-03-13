import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyACMHNeSM9jsK73fRwXL-l2-Q6a-LhoDgs",
    authDomain: "app-profe-ges.firebaseapp.com",
    projectId: "app-profe-ges",
    storageBucket: "app-profe-ges.firebasestorage.app",
    messagingSenderId: "867685731045",
    appId: "1:867685731045:web:20be3b47d949e1d53c620c"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);
const auth = getAuth(appFirebase);

try {
    enableIndexedDbPersistence(db).catch(err => console.log("Offline:", err.code));
} catch (e) {
    console.log("Persistence:", e);
}

// Lógica básica inicial de la vista
document.addEventListener('DOMContentLoaded', () => {

    // === REGISTRO DE SERVICE WORKER (PWA Y OFFLINE) ===
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
        });
    }

    // === ELEMENTOS DEL DOM ===
    const eventList = document.getElementById('monthly-event-list');
    const todoListContainer = document.getElementById('todo-list-container');
    const newTaskInput = document.getElementById('new-task-input');
    const btnAddTask = document.getElementById('btn-add-task');

    // === FUNCIONES AUXILIARES DE FECHAS ===
    const getMonday = (d) => {
        d = new Date(d);
        d.setHours(0, 0, 0, 0);
        var day = d.getDay();
        var diff = d.getDate() - day + (day == 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const getWeekId = (d) => {
        const mon = getMonday(d);
        const yyyy = mon.getFullYear();
        const mm = String(mon.getMonth() + 1).padStart(2, '0');
        const dd = String(mon.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // === INICIALIZACIÓN DE LOCAL STORAGE ===
    let scheduleData = JSON.parse(localStorage.getItem('profeges_schedule')) || [];
    let meetingsData = JSON.parse(localStorage.getItem('profeges_meetings')) || [];
    let todoData = JSON.parse(localStorage.getItem('profeges_todos')) || {};
    let eventData = JSON.parse(localStorage.getItem('profeges_events')) || [];
    let notesData = JSON.parse(localStorage.getItem('profeges_notes')) || {};
    let planningData = JSON.parse(localStorage.getItem('profeges_planning')) || {};
    let coursesData = JSON.parse(localStorage.getItem('profeges_courses')) || [];
    let subjectsData = JSON.parse(localStorage.getItem('profeges_subjects')) || [];
    let currentZoom = parseFloat(localStorage.getItem('profeges_zoom')) || 1.0;

    // Migración: si todoData es un array (antiguo formato), moverlo a la semana actual
    if (Array.isArray(todoData)) {
        const legacyTodos = [...todoData];
        const currentWeekId = getWeekId(new Date());
        todoData = {};
        if (legacyTodos.length > 0) {
            todoData[currentWeekId] = legacyTodos;
            localStorage.setItem('profeges_todos', JSON.stringify(todoData));
        }
    }

    // === BINDING FIREBASE ===
    let debounceSave = null;
    const syncToFirebase = () => {
        if (!auth.currentUser) return;
        clearTimeout(debounceSave);
        debounceSave = setTimeout(async () => {
            try {
                await setDoc(doc(db, "users", auth.currentUser.uid), {
                    schedule: scheduleData,
                    meetings: meetingsData,
                    todos: todoData,
                    events: eventData,
                    notes: notesData,
                    planning: planningData,
                    courses: coursesData,
                    subjects: subjectsData,
                    timestamp: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.error("No se pudo guardar en firebase", e);
            }
        }, 2000);
    };

    // Interceptar localStorage para autorreplicar en firebase
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function (key, value) {
        originalSetItem.apply(this, arguments);
        if (key.startsWith('profeges_') && !key.includes('width')) {
            syncToFirebase();
        }
    };

    // Manejo de UI de Autenticación
    const btnLogin = document.getElementById('btn-login');
    const loginText = document.getElementById('login-text');
    if (btnLogin) btnLogin.style.display = 'inline-flex';

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            if (!auth.currentUser) {
                const provider = new GoogleAuthProvider();
                try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
            } else {
                if (confirm("¿Estás seguro que deseas cerrar sesión?")) {
                    auth.signOut();
                }
            }
        });
    }

    onAuthStateChanged(auth, user => {
        if (user && btnLogin) {
            loginText.textContent = user.displayName || "Conectado";
            btnLogin.style.borderColor = "var(--border-color)";
            const photoHtml = user.photoURL ? `<img src="${user.photoURL}" class="user-avatar" alt="Avatar">` : `<i class='bx bx-user'></i>`;
            btnLogin.innerHTML = `${photoHtml} <span id="login-text">${loginText.textContent}</span>`;

            // Suscribirse a cambios del servidor en tiempo real (PULL)
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                const source = docSnap.metadata.hasPendingWrites ? "Local" : "Server";
                if (source === "Server" && docSnap.exists()) {
                    const data = docSnap.data();

                    if (data.schedule) scheduleData = data.schedule;
                    if (data.meetings) meetingsData = data.meetings;
                    if (data.todos) {
                        todoData = data.todos;
                        if (Array.isArray(todoData)) {
                            const legacy = [...todoData];
                            todoData = {};
                            if (legacy.length > 0) todoData[getWeekId(new Date())] = legacy;
                        }
                    }
                    if (data.events) eventData = data.events;
                    if (data.notes) notesData = data.notes;
                    if (data.planning) planningData = data.planning;
                    if (data.courses) coursesData = data.courses;
                    if (data.subjects) subjectsData = data.subjects;

                    // Actualizar localStorage real, saltando nuestro interceptor
                    originalSetItem.call(localStorage, 'profeges_schedule', JSON.stringify(scheduleData));
                    originalSetItem.call(localStorage, 'profeges_meetings', JSON.stringify(meetingsData));
                    originalSetItem.call(localStorage, 'profeges_todos', JSON.stringify(todoData));
                    originalSetItem.call(localStorage, 'profeges_events', JSON.stringify(eventData));
                    originalSetItem.call(localStorage, 'profeges_notes', JSON.stringify(notesData));
                    originalSetItem.call(localStorage, 'profeges_planning', JSON.stringify(planningData));
                    originalSetItem.call(localStorage, 'profeges_courses', JSON.stringify(coursesData));
                    originalSetItem.call(localStorage, 'profeges_subjects', JSON.stringify(subjectsData));

                    // Repintar UI si las vars existen
                    if (typeof updateViews === "function") updateViews();
                    if (typeof renderTodos === "function") renderTodos();
                    if (typeof renderCoursesAndSubjectsLists === "function") renderCoursesAndSubjectsLists();
                }
            });

        } else if (btnLogin) {
            loginText.textContent = "Conectar";
            btnLogin.innerHTML = `<i class='bx bxl-google'></i> <span id="login-text">Conectar</span>`;
            btnLogin.style.borderColor = "var(--border-color)";
        }
    });

    // === LÓGICA DE TOOLTIP PREMIUM ===
    const premiumTooltip = document.getElementById('premium-tooltip');
    
    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[title]');
        if (target && !e.target.closest('.delete-event-btn') && !e.target.closest('.btn-close-modal')) {
            const titleText = target.getAttribute('title');
            if (titleText && titleText.trim() !== "") {
                target.dataset.originalTitle = titleText;
                target.removeAttribute('title');
                
                premiumTooltip.textContent = titleText;
                premiumTooltip.classList.add('visible');
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (premiumTooltip.classList.contains('visible')) {
            const x = e.clientX;
            const y = e.clientY;
            
            // Posicionar el tooltip con un margen mayor para no tapar el cursor
            const offsetX = 18;
            const offsetY = 18;
            
            premiumTooltip.style.left = (x + offsetX) + 'px';
            premiumTooltip.style.top = (y - premiumTooltip.offsetHeight - offsetY) + 'px';
            
            // Ajustar si se sale por arriba
            if (y - premiumTooltip.offsetHeight - offsetY < 0) {
                premiumTooltip.style.top = (y + offsetY + 5) + 'px';
                premiumTooltip.classList.add('bottom-tip');
            } else {
                premiumTooltip.classList.remove('bottom-tip');
            }
        }
    });

    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-original-title]');
        if (target) {
            target.setAttribute('title', target.dataset.originalTitle);
            target.removeAttribute('data-original-title');
            premiumTooltip.classList.remove('visible');
        }
    });

    // === ESTADO DE LA APLICACIÓN ===
    let plannerDate = new Date(); // El día actual de la semana mostrada (Planificador)
    let calendarDate = new Date(); // El mes actual mostrado (Calendario)
    let currentViewMode = 'classes'; // 'classes' o 'meetings'

    // Nombres de meses y días para mostrar
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // === RENDERIZAR CALENDARIO MENSUAL ===
    function renderCalendar(calDate, planDate) {
        const year = calDate.getFullYear();
        const month = calDate.getMonth();

        document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Ajuste porque JS getDay empieza en domingo(0), pero nuestro calendario en lunes
        let startDayOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        const gridDays = document.getElementById('calendar-grid-days');
        if (!gridDays) return;
        gridDays.innerHTML = '';

        // Días vacíos al inicio
        for (let i = 0; i < startDayOffset; i++) {
            gridDays.innerHTML += `<div class="day empty"></div>`;
        }

        // Rango de la semana actual para marcar en gris (usando el planDate!)
        const monday = getMonday(planDate);
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        // Obtener eventos actuales desde eventData
        const todayStr = new Date();
        todayStr.setHours(0, 0, 0, 0);

        const events = eventData.map(item => {
            const eventDate = new Date(item.date + 'T00:00:00');
            return {
                date: item.date,
                color: eventDate < todayStr ? 'gray' : item.color
            };
        });

        for (let idx = 1; idx <= daysInMonth; idx++) {
            const thisDayDate = new Date(year, month, idx);
            let classStr = "day";

            // Marcar si está en la semana activa
            if (thisDayDate >= monday && thisDayDate <= sunday) {
                classStr += " active-week";
            }

            // Formatear a YYYY-MM-DD para comparar con el evento
            const yyyy = thisDayDate.getFullYear();
            const mm = String(thisDayDate.getMonth() + 1).padStart(2, '0');
            const dd = String(thisDayDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;

            // Buscar todos los eventos para este día
            const dayEvents = eventData.filter(e => e.date === dateStr);
            let dayTitle = "";

            if (dayEvents.length > 0) {
                // Determinar el color (prioridad al primero o al que no sea gris)
                const firstColor = dayEvents[0].color;
                const isPast = new Date(dateStr + 'T00:00:00') < todayStr;
                classStr += ` has-event event-${isPast ? 'gray' : firstColor}`;
                
                // Construir el título con todos los eventos del día
                dayTitle = dayEvents.map(e => e.title).join("\n");
            }

            // Marcar SOLO el día de hoy real en rojo
            if (thisDayDate.toDateString() === new Date().toDateString()) {
                classStr += " is-today";
            }

            gridDays.innerHTML += `<div class="${classStr}" data-day="${idx}" title="${dayTitle}">${idx}</div>`;
        }
    };

    // === RENDERIZAR PLANIFICADOR SEMANAL ===
    function renderPlanner(date) {
        const monday = getMonday(date);
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);

        const isMobile = window.innerWidth <= 1024;

        // Título de semana o día
        let title = '';
        if (isMobile) {
            let dayNameStr = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][date.getDay()];
            let monthStr = monthNames[date.getMonth()].slice(0, 3);
            title = `${dayNameStr} ${date.getDate()} ${monthStr}`;
        } else {
            let monthStartStr = monthNames[monday.getMonth()].slice(0, 3);
            let monthEndStr = monthNames[friday.getMonth()].slice(0, 3);
            title = `Semana del ${monday.getDate()} al ${friday.getDate()} ${monthEndStr}`;
            if (monday.getMonth() !== friday.getMonth()) {
                title = `Semana del ${monday.getDate()} ${monthStartStr} al ${friday.getDate()} ${monthEndStr}`;
            }
        }
        document.getElementById('current-week-title').textContent = title;

        // Limpiar mensaje de fin de semana previo si existe
        const existingWeekendMsg = document.getElementById('weekend-message');
        if (existingWeekendMsg) existingWeekendMsg.remove();
        document.getElementById('planner-time-column').style.display = '';

        // Actualizar números de los días en las columnas
        const colIds = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        const todayReal = new Date();
        const plannerDayOfWeek = date.getDay(); // 0(Dom) a 6(Sab)

        colIds.forEach(col => document.getElementById(`col-${col}`).classList.remove('show-day'));

        const colDatesMap = {};

        if (isMobile && (plannerDayOfWeek === 0 || plannerDayOfWeek === 6)) {
            // Es fin de semana en móvil
            document.getElementById('planner-time-column').style.display = 'none';
            const plannerGrid = document.querySelector('.planner-grid');
            plannerGrid.insertAdjacentHTML('beforeend', `
                <div id="weekend-message" class="weekend-message">
                    <i class='bx bx-party'></i>
                    <h3>¡Día libre, no hay clases!</h3>
                </div>
            `);
        } else {
            for (let i = 0; i < 5; i++) {
                const colDate = new Date(monday);
                colDate.setDate(monday.getDate() + i);

                // Formatear fecha para el key de las notas
                const yyyy = colDate.getFullYear();
                const mm = String(colDate.getMonth() + 1).padStart(2, '0');
                const dd = String(colDate.getDate()).padStart(2, '0');
                colDatesMap[colIds[i]] = `${yyyy}-${mm}-${dd}`;

                const header = document.getElementById(`header-${colIds[i]}`);
                const colElement = document.getElementById(`col-${colIds[i]}`);

                if (header) {
                    header.querySelector('.day-number').textContent = colDate.getDate();

                    // Marcar 'Hoy'
                    if (colDate.toDateString() === todayReal.toDateString()) {
                        header.classList.add('is-today');
                    } else {
                        header.classList.remove('is-today');
                    }

                    // Mostrar solo el día activo en mobile
                    if (isMobile) {
                        // plannerDayOfWeek del 1 al 5 coinciden con i de 0 a 4
                        if (plannerDayOfWeek === i + 1) {
                            colElement.classList.add('show-day');
                        }
                    } else {
                        // En desktop mostramos todas mediante flex de CSS normal
                        colElement.style.display = '';
                    }
                }
            }
        }

        // --- GENERAR GRILLA DE HORARIOS CON POSICIONAMIENTO ABSOLUTO ---
        let minMin = Infinity;
        let maxMin = -Infinity;
        const uniqueTimes = new Set();

        let activeData = currentViewMode === 'classes' ? scheduleData : meetingsData;

        activeData.forEach(item => {
            if (!item.start || !item.end) return;
            const sParts = item.start.split(':').map(Number);
            const eParts = item.end.split(':').map(Number);
            const sTotal = sParts[0] * 60 + sParts[1];
            const eTotal = eParts[0] * 60 + eParts[1];

            if (sTotal < minMin) minMin = sTotal;
            if (eTotal > maxMin) maxMin = eTotal;

            uniqueTimes.add(sTotal);
            uniqueTimes.add(eTotal);
        });

        // Default if no classes exist
        if (minMin === Infinity) {
            minMin = 8 * 60;
            maxMin = 15 * 60;
            uniqueTimes.add(8 * 60);
        }

        const pixelsPerHour = 90 * currentZoom;
        const totalDurationMins = maxMin - minMin;
        const totalHeight = (totalDurationMins / 60) * pixelsPerHour + 50; // extra padding bottom

        const timeColumn = document.getElementById('planner-time-column');
        if (timeColumn) {
            let timeHtml = '<div class="time-header">Hora</div>';
            timeHtml += `<div class="time-grid-body" style="position: relative; height: ${totalHeight}px; width: 100%;">`;
            uniqueTimes.forEach(t => {
                const top = ((t - minMin) / 60) * pixelsPerHour;
                const hh = Math.floor(t / 60);
                const mm = t % 60;
                const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                // Avoid line overlapping too closely by CSS but mostly relies on the design
                timeHtml += `<div style="position:absolute; top: ${top}px; transform: translateY(-50%); width: 100%; text-align: center; color: var(--text-muted); font-size: 11px; z-index: 5; background: var(--surface-color); padding: 2px 0;">${timeStr}</div>`;
            });
            timeHtml += '</div>';
            timeColumn.innerHTML = timeHtml;
        }

        colIds.forEach(dayId => {
            const dayCol = document.getElementById(`col-${dayId}`);
            if (!dayCol) return;
            const headerHtml = dayCol.querySelector('.day-header').outerHTML;
            let currentHtml = headerHtml;

            // Contenedor principal del día donde van las clases posicionadas absolutamente
            currentHtml += `<div class="day-grid-body" style="position: relative; height: ${totalHeight}px; width: 100%;">`;

            // Dibujar lineas de la grilla de fondo en cada timestamp
            uniqueTimes.forEach(t => {
                const top = ((t - minMin) / 60) * pixelsPerHour;
                currentHtml += `<div style="position:absolute; top: ${top}px; left:0; width:100%; border-top: 1px dashed var(--border-color); z-index: 1;"></div>`;
            });

            // Filtrar las clases de este día
            const dayClasses = activeData.filter(s => s.day === dayId);
            dayClasses.forEach(classItem => {
                if (!classItem.start || !classItem.end) return;

                const sParts = classItem.start.split(':').map(Number);
                const eParts = classItem.end.split(':').map(Number);
                const sTotal = sParts[0] * 60 + sParts[1];
                const eTotal = eParts[0] * 60 + eParts[1];

                const durMinutes = eTotal - sTotal;

                // Calcular offsets de pixeles 
                const topPx = ((sTotal - minMin) / 60) * pixelsPerHour;
                const heightPx = (durMinutes / 60) * pixelsPerHour;

                const now = new Date();
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                const noteKey = currentViewMode === 'classes' ? `${colDatesMap[dayId]}_${classItem.start}` : `${colDatesMap[dayId]}_${classItem.start}_meetings`;
                const savedNote = notesData[noteKey] || '';
                const savedObs = notesData[noteKey + '_obs'] || '';

                // Determinar si esta clase es la actual
                const isCurrentDate = colDatesMap[dayId] === todayISO;
                const isCurrentTime = nowMins >= sTotal && nowMins < eTotal;
                const isActive = isCurrentDate && isCurrentTime;

                // Validar si hay observaciones
                const hasObs = savedObs.trim().length > 0;
                const obsClass = hasObs ? 'has-obs' : '';

                currentHtml += `<div class="class-slot-container" style="position: absolute; top: ${topPx}px; height: ${Math.max(35, heightPx)}px; width: 100%; left: 0; z-index: 2; box-sizing: border-box;">
                                    <div class="class-slot-inner">
                                        <!-- Front face -->
                                        <div class="class-slot-face class-slot-front ${classItem.color} ${isActive ? 'is-active-class' : ''}" title="${classItem.start} - ${classItem.end}">
                                            <div class="class-title-wrapper">
                                                <div class="class-title">${classItem.course} ${classItem.subject || ''}</div>
                                                <button class="btn-flip ${obsClass}" title="Anotar observaciones"><i class='bx bx-message-square-edit'></i></button>
                                            </div>
                                            <textarea class="class-notes" data-key="${noteKey}" placeholder="">${savedNote}</textarea>
                                        </div>
                                        <!-- Back face -->
                                        <div class="class-slot-face class-slot-back" title="Observaciones: ${classItem.start} - ${classItem.end}">
                                            <div style="font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; text-align: center; margin-bottom: 2px; opacity: 0.9;">Observación</div>
                                            <div class="class-title-wrapper" style="margin-bottom: 2px;">
                                                <div class="class-title">${classItem.course} ${classItem.subject || ''}</div>
                                                <button class="btn-flip" title="Volver"><i class='bx bx-undo'></i></button>
                                            </div>
                                            <textarea class="class-obs" data-key="${noteKey}_obs" placeholder="Escribe tus observaciones de la clase...">${savedObs}</textarea>
                                        </div>
                                    </div>
                                </div>`;
            });


            currentHtml += `</div>`;
            dayCol.innerHTML = currentHtml;
        });

        // Adjuntar listeners a las nuevas textareas para guardarlas automáticamente
        document.querySelectorAll('.class-notes, .class-obs').forEach(ta => {
            ta.addEventListener('blur', (e) => {
                const key = e.target.dataset.key;
                notesData[key] = e.target.value;
                localStorage.setItem('profeges_notes', JSON.stringify(notesData));
            });

            // Si es área de observaciones, añadir listener en input para que el botón frontal cambie de color dinámicamente
            if (ta.classList.contains('class-obs')) {
                ta.addEventListener('input', (e) => {
                    const hasText = e.target.value.trim().length > 0;
                    const container = e.target.closest('.class-slot-container');
                    if (container) {
                        const flipBtn = container.querySelector('.class-slot-front .btn-flip');
                        if (flipBtn) {
                            if (hasText) {
                                flipBtn.classList.add('has-obs');
                            } else {
                                flipBtn.classList.remove('has-obs');
                            }
                        }
                    }
                });
            }
        });

        // Listeners for flipping cards
        document.querySelectorAll('.btn-flip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const container = e.target.closest('.class-slot-container');
                if (container) {
                    container.classList.toggle('is-flipped');
                }
            });
        });

    };

    // === EVENTOS DEL MES ===
    function renderEvents() {
        if (!eventList) return;
        eventList.innerHTML = '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const calYear = calendarDate.getFullYear();
        const calMonth = calendarDate.getMonth();

        eventData.forEach((item, index) => {
            const eventDate = new Date(item.date + 'T00:00:00');

            // Mostrar solo si pertenece al mes/año visible en calendario
            if (eventDate.getFullYear() !== calYear || eventDate.getMonth() !== calMonth) {
                return;
            }

            const isPast = eventDate < today;
            const finalColor = isPast ? 'gray' : item.color;
            const day = eventDate.getDate();
            const monthStr = monthNames[eventDate.getMonth()].slice(0, 3);

            const li = document.createElement('li');
            li.className = `event-item ${isPast ? 'past-event' : ''}`;
            li.innerHTML = `
                <div class="event-color ${finalColor}"></div>
                <span class="event-text">${item.title} (${day} ${monthStr})</span>
                <button class="delete-event-btn" data-index="${index}" title="Eliminar"><i class='bx bx-trash'></i></button>
            `;
            eventList.appendChild(li);
        });
    };

    // Actualizar Vistas
    function updateViews() {
        renderCalendar(calendarDate, plannerDate);
        renderPlanner(plannerDate);
        renderTodos();

        // --- FILTRAR Y ESTILIZAR EVENTOS DEL MES ---
        renderEvents();
    }

    updateViews(); // Renderizar inicio

    // === TABS DE VISTA (CLASES VS REUNIONES VS PLANIFICACION) ===
    const tabClasses = document.getElementById('tab-classes');
    const tabMeetings = document.getElementById('tab-meetings');
    const tabPlanning = document.getElementById('tab-planning');
    const configModalTitle = document.getElementById('config-modal-title');
    const weeklyView = document.getElementById('weekly-view-container');
    const planningView = document.getElementById('planning-view-container');

    function switchViewMode(mode) {
        currentViewMode = mode;

        // Reset all tabs
        [tabClasses, tabMeetings, tabPlanning].forEach(tab => {
            if (!tab) return;
            tab.classList.remove('active');
            tab.style.background = '';
            tab.style.color = '';
            tab.style.border = '';
        });

        if (mode === 'classes' || mode === 'meetings') {
            if (weeklyView) weeklyView.style.display = 'flex';
            if (planningView) planningView.style.display = 'none';

            if (mode === 'classes') {
                tabClasses.classList.add('active');
                if (configModalTitle) configModalTitle.textContent = "Cursos y Horarios";
                document.querySelector('.app-header h1').textContent = "Mis Clases";
            } else {
                tabMeetings.classList.add('active');
                if (configModalTitle) configModalTitle.textContent = "Mis Reuniones";
                document.querySelector('.app-header h1').textContent = "Reuniones";
            }
            updateViews();
            if (!document.getElementById('config-modal').classList.contains('hidden')) {
                renderConfigScheduleTable();
            }
        } else if (mode === 'planning') {
            tabPlanning.classList.add('active');
            if (weeklyView) weeklyView.style.display = 'none';
            if (planningView) planningView.style.display = 'flex';
            document.querySelector('.app-header h1').textContent = "Mi Planificación";
            renderPlanningView();
        }
    }

    if (tabClasses) tabClasses.addEventListener('click', () => switchViewMode('classes'));
    if (tabMeetings) tabMeetings.addEventListener('click', () => switchViewMode('meetings'));
    if (tabPlanning) tabPlanning.addEventListener('click', () => switchViewMode('planning'));

    function renderPlanningView() {
        const select = document.getElementById('planning-course-select');
        if (!select) return;

        // Populate select with unique courses from scheduleData, sorted alphanumerically
        const uniqueCourses = [...new Set(scheduleData.map(item => `${item.course} ${item.subject || ''}`.trim().toUpperCase()))].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const currentSelection = select.value;
        select.innerHTML = '<option value="">Seleccione un curso...</option>';
        uniqueCourses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });

        if (uniqueCourses.includes(currentSelection)) {
            select.value = currentSelection;
        }

        renderPlanningContent();
    }

    function renderPlanningContent() {
        const select = document.getElementById('planning-course-select');
        const content = document.getElementById('planning-content');
        if (!select || !content) return;

        const course = select.value;

        if (!course) {
            content.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); margin-top: 40px;">
                    <i class='bx bx-book-content' style="font-size: 48px; opacity: 0.5;"></i>
                    <p>Selecciona un curso de tu lista para comenzar a planificar.</p>
                </div>
            `;
            return;
        }

        const courseClasses = scheduleData.filter(item => `${item.course} ${item.subject || ''}`.trim().toUpperCase() === course.toUpperCase());

        const semesters = [
            {
                id: 'sem1',
                name: 'Primer Semestre',
                start: new Date(2026, 2, 1, 12, 0, 0), // 1 de Marzo (mediodía para evitar bugs)
                end: new Date(2026, 6, 10, 23, 59, 59) // 10 de Julio al final del día
            },
            {
                id: 'sem2',
                name: 'Segundo Semestre',
                start: new Date(2026, 6, 27, 12, 0, 0), // 27 de Julio
                end: new Date(2026, 11, 4, 23, 59, 59)  // 4 de Diciembre pleno
            }
        ];

        const jsDayMap = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6 };
        const dayNamesMap = { 0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
        const monthNamesArr = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        let html = '';

        semesters.forEach(sem => {
            html += `<div class="semester-block" style="background: rgba(134, 129, 180, 0.05); border-radius: var(--radius-lg); padding: 20px; display: flex; flex-direction: column; gap: 15px;">`;
            html += `<h3 class="semester-title" style="font-size: 18px; color: var(--text-main); font-weight: 600; border-bottom: 2px solid var(--border-color); padding-bottom: 10px;">${sem.name}</h3>`;

            const groupedByMonth = {};

            let currentDate = new Date(sem.start);
            while (currentDate <= sem.end) {
                const dayOfWeek = currentDate.getDay();
                const yyyy = currentDate.getFullYear();
                const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
                const dd = String(currentDate.getDate()).padStart(2, '0');
                const dateISO = `${yyyy}-${mm}-${dd}`;

                courseClasses.forEach(cClass => {
                    if (jsDayMap[cClass.day] === dayOfWeek) {
                        const monthIndex = currentDate.getMonth();
                        if (!groupedByMonth[monthIndex]) {
                            groupedByMonth[monthIndex] = [];
                        }

                        const noteKey = `${dateISO}_${cClass.start}`;
                        groupedByMonth[monthIndex].push({
                            dateStr: `${dayNamesMap[dayOfWeek]} ${currentDate.getDate()}`,
                            noteKey: noteKey,
                            start: cClass.start
                        });
                    }
                });

                currentDate.setDate(currentDate.getDate() + 1);
            }

            Object.keys(groupedByMonth).sort((a, b) => Number(a) - Number(b)).forEach(mIdx => {
                const monthName = monthNamesArr[mIdx];
                const classesInMonth = groupedByMonth[mIdx];

                html += `
                    <div class="month-block" style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                        <span class="month-title" style="font-size: 16px; font-weight: 600; color: var(--accent-purple);">${monthName}</span>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-left: 10px;">
                `;

                classesInMonth.forEach(cls => {
                    // Cargar el texto desde las notas reales del planificador diario
                    const savedVal = notesData[cls.noteKey] || '';
                    html += `
                        <div class="class-plan-row" style="display: flex; align-items: flex-start; gap: 10px;">
                            <span style="font-size: 13px; font-weight: 600; color: var(--text-main); width: 80px; padding-top: 8px;">${cls.dateStr}</span>
                            <textarea class="note-textarea" data-key="${cls.noteKey}" placeholder="" style="flex: 1; min-height: 50px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px; font-size: 13px; font-family: inherit; resize: vertical; outline: none; transition: border-color 0.3s; background: rgba(255, 255, 255, 0.85);">${savedVal}</textarea>
                        </div>
                    `;
                });

                html += `   </div>
                        </div>`;
            });

            html += `</div>`;
        });

        content.innerHTML = html;

        content.querySelectorAll('.note-textarea').forEach(ta => {
            ta.addEventListener('blur', (e) => {
                const k = e.target.dataset.key;
                notesData[k] = e.target.value;
                localStorage.setItem('profeges_notes', JSON.stringify(notesData));
            });
            ta.addEventListener('focus', (e) => {
                e.target.style.borderColor = 'var(--accent-purple)';
            });
            ta.addEventListener('blur', (e) => {
                e.target.style.borderColor = 'var(--border-color)';
            });
        });
    }

    const planningSelect = document.getElementById('planning-course-select');
    if (planningSelect) planningSelect.addEventListener('change', renderPlanningContent);

    // === EVENTOS NAVEGACIÓN ZOOM ===
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
        if (currentZoom < 3.0) {
            currentZoom += 0.25;
            localStorage.setItem('profeges_zoom', currentZoom.toString());
            updateViews();
        }
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        if (currentZoom > 0.4) {
            currentZoom -= 0.25;
            localStorage.setItem('profeges_zoom', currentZoom.toString());
            updateViews();
        }
    });

    // === EVENTOS NAVEGACIÓN CALENDARIO MENSUAL ===
    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        updateViews();
    });

    document.getElementById('btn-next-month')?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        updateViews();
    });

    // Click en un día del calendario
    document.getElementById('calendar-grid-days')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('day') && !e.target.classList.contains('empty')) {
            const dayNum = parseInt(e.target.dataset.day);
            // Cambiar la vista del planificador a este día tocado
            plannerDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), dayNum);
            updateViews();

            // Cerrar el modal en móvil si se estaba viendo el calendario
            if (window.innerWidth <= 1024) closeMobileModal();
        }
    });

    // === EVENTOS NAVEGACIÓN PLANIFICADOR SEMANAL/DIARIO ===
    document.getElementById('btn-prev-week')?.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            plannerDate.setDate(plannerDate.getDate() - 1); // Día por día en móvil
        } else {
            plannerDate.setDate(plannerDate.getDate() - 7); // Semana en escritorio
        }
        calendarDate = new Date(plannerDate); // Sincroniza el calendario con el planificador
        updateViews();
    });

    document.getElementById('btn-next-week')?.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            plannerDate.setDate(plannerDate.getDate() + 1); // Día por día en móvil
        } else {
            plannerDate.setDate(plannerDate.getDate() + 7); // Semana en escritorio
        }
        calendarDate = new Date(plannerDate); // Sincroniza el calendario con el planificador
        updateViews();
    });

    document.getElementById('btn-today')?.addEventListener('click', () => {
        plannerDate = new Date();
        calendarDate = new Date();
        updateViews();
    });

    let windowWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (window.innerWidth !== windowWidth) {
            windowWidth = window.innerWidth;
            updateViews();
        }
    });

    // === LOGICA DEL MENU INFERIOR MÓVIL (BOTTOM NAV) ===
    const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');
    const mobileOverlay = document.getElementById('mobile-overlay');
    const mobileModalTitle = document.getElementById('mobile-modal-title');
    const mobileModalBody = document.getElementById('mobile-modal-body');
    const closeMobileModalBtn = document.getElementById('close-mobile-modal-btn');

    // Mover componentes reales a variables
    const miniCalendarCard = document.querySelector('.mini-calendar-card');
    const extraCard = document.querySelector('.extra-card');
    const todoCard = document.querySelector('.todo-card');

    // Contenedores originales para devolverlos si se cambia tamaño a desktop
    const leftPanel = document.querySelector('.left-panel');
    const rightPanel = document.querySelector('.right-panel');

    const closeMobileModal = () => {
        mobileOverlay.classList.add('hidden');
        bottomNavBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-target="planner"]').classList.add('active'); // Volver a "Día" (planner)
    };

    if (closeMobileModalBtn) {
        closeMobileModalBtn.addEventListener('click', closeMobileModal);
    }

    mobileOverlay?.addEventListener('click', (e) => {
        if (e.target === mobileOverlay) closeMobileModal();
    });

    bottomNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            bottomNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const target = btn.dataset.target;

            if (target === 'planner') {
                closeMobileModal();
                return; // el planificador ya está en la pantalla principal
            }

            // Mover temporalmente el DOM a mobile modal
            mobileModalBody.innerHTML = '';

            if (target === 'calendar') {
                mobileModalTitle.textContent = "Calendario y Eventos";
                mobileModalBody.appendChild(miniCalendarCard);
                // También agregamos los eventos aquí para ver todo junto
                mobileModalBody.appendChild(extraCard);
            } else if (target === 'events') {
                mobileModalTitle.textContent = "Eventos Mensuales";
                mobileModalBody.appendChild(extraCard);
            } else if (target === 'tasks') {
                mobileModalTitle.textContent = "Lista de Tareas";
                mobileModalBody.appendChild(todoCard);
            }

            mobileOverlay.classList.remove('hidden');
        });
    });

    // Validar en resize para devolver los componentes si agrandamos pantalla
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            mobileOverlay?.classList.add('hidden');
            if (leftPanel && rightPanel) {
                leftPanel.appendChild(miniCalendarCard);
                leftPanel.appendChild(extraCard);
                rightPanel.appendChild(todoCard);
            }
        }
    });

    // === RESIZERS DE PANELES (Arrastrar para redimensionar) ===
    const mainLayout = document.getElementById('main-layout');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');

    let isResizingLeft = false;
    let isResizingRight = false;

    // Anchos iniciales / default
    let currentLeftWidth = 280;
    let currentRightWidth = 280;

    // Recuperar anchos guardados
    const savedLeftWidth = localStorage.getItem('profeges_left_width');
    if (savedLeftWidth) {
        currentLeftWidth = parseInt(savedLeftWidth);
        document.documentElement.style.setProperty('--left-panel-width', currentLeftWidth + 'px');
    }
    const savedRightWidth = localStorage.getItem('profeges_right_width');
    if (savedRightWidth) {
        currentRightWidth = parseInt(savedRightWidth);
        document.documentElement.style.setProperty('--right-panel-width', currentRightWidth + 'px');
    }

    if (resizerLeft && resizerRight && mainLayout) {
        resizerLeft.addEventListener('mousedown', (e) => {
            isResizingLeft = true;
            document.body.style.cursor = 'col-resize';
            resizerLeft.classList.add('is-resizing');
        });

        resizerRight.addEventListener('mousedown', (e) => {
            isResizingRight = true;
            document.body.style.cursor = 'col-resize';
            resizerRight.classList.add('is-resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingLeft && !isResizingRight) return;

            // Ignorar redimensionado si estamos en movil (ancho layout normalizado a 1 columna por css)
            if (window.innerWidth <= 1024) return;

            if (isResizingLeft) {
                const rect = mainLayout.getBoundingClientRect();
                let newWidth = e.clientX - rect.left;
                if (newWidth < 200) newWidth = 200; // Mínimo
                if (newWidth > 500) newWidth = 500; // Máximo
                currentLeftWidth = newWidth;
                document.documentElement.style.setProperty('--left-panel-width', newWidth + 'px');
            }

            if (isResizingRight) {
                const rect = mainLayout.getBoundingClientRect();
                let newWidth = rect.right - e.clientX;
                if (newWidth < 200) newWidth = 200; // Mínimo
                if (newWidth > 500) newWidth = 500; // Máximo
                currentRightWidth = newWidth;
                document.documentElement.style.setProperty('--right-panel-width', newWidth + 'px');
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingLeft) {
                isResizingLeft = false;
                resizerLeft.classList.remove('is-resizing');
                localStorage.setItem('profeges_left_width', currentLeftWidth);
            }
            if (isResizingRight) {
                isResizingRight = false;
                resizerRight.classList.remove('is-resizing');
                localStorage.setItem('profeges_right_width', currentRightWidth);
            }
            if (!isResizingLeft && !isResizingRight) {
                document.body.style.cursor = '';
            }
        });
    }

    // === TAREAS DE LA SEMANA (To-Do List) ===
    function renderTodos() {
        if (!todoListContainer) return;
        todoListContainer.innerHTML = '';

        const weekId = getWeekId(plannerDate);
        const currentWeekTodos = todoData[weekId] || [];

        // Opcional: Asegurar orden inicial por si hay nuevos sin ordenar
        currentWeekTodos.sort((a, b) => (a.priority || 3) - (b.priority || 3));

        currentWeekTodos.forEach((todo, index) => {
            const prioClass = todo.prioColor || 'normal';
            const newItem = document.createElement('label');
            newItem.className = 'todo-item';
            newItem.innerHTML = `
                <input type="checkbox" data-index="${index}" ${todo.completed ? 'checked' : ''}>
                <span class="custom-checkbox"></span>
                <div class="priority-dot ${prioClass}"></div>
                <span class="todo-text ${todo.completed ? 'completed' : ''}">${todo.text}</span>
                <button class="delete-todo-btn" data-index="${index}" title="Eliminar"><i class='bx bx-trash'></i></button>
            `;
            todoListContainer.appendChild(newItem);
        });
    };

    renderTodos();

    todoListContainer.addEventListener('click', (e) => {
        const weekId = getWeekId(plannerDate);
        if (!todoData[weekId]) todoData[weekId] = [];

        // Toggle complete
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            const index = e.target.dataset.index;
            todoData[weekId][index].completed = e.target.checked;
            localStorage.setItem('profeges_todos', JSON.stringify(todoData));
            renderTodos();
        }

        // Delete
        const deleteBtn = e.target.closest('.delete-todo-btn');
        if (deleteBtn) {
            const index = deleteBtn.dataset.index;
            todoData[weekId].splice(index, 1);
            localStorage.setItem('profeges_todos', JSON.stringify(todoData));
            renderTodos();
        }
    });

    const addTask = () => {
        const weekId = getWeekId(plannerDate);
        if (!todoData[weekId]) todoData[weekId] = [];

        const text = newTaskInput.value.trim();
        const prioritySelect = document.getElementById('new-task-priority');
        const prioVal = prioritySelect ? prioritySelect.value : 'normal';

        let priorityNum = 3;
        if (prioVal === 'urgent') priorityNum = 1;
        if (prioVal === 'important') priorityNum = 2;

        if (text !== '') {
            todoData[weekId].push({ text, completed: false, priority: priorityNum, prioColor: prioVal });
            todoData[weekId].sort((a, b) => (a.priority || 3) - (b.priority || 3));
            localStorage.setItem('profeges_todos', JSON.stringify(todoData));
            renderTodos();
            newTaskInput.value = '';
        }
    };

    newTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    btnAddTask.addEventListener('click', addTask);


    eventList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-event-btn');
        if (deleteBtn) {
            const index = deleteBtn.dataset.index;
            eventData.splice(index, 1);
            localStorage.setItem('profeges_events', JSON.stringify(eventData));
            updateViews(); // Actualizar mini-calendario y lista
        }
    });

    document.getElementById('btn-add-event')?.addEventListener('click', () => {
        const titleInput = document.getElementById('new-event-title');
        const dateInput = document.getElementById('new-event-date');
        const colorInput = document.getElementById('new-event-color');

        if (titleInput.value.trim() && dateInput.value) {

            eventData.push({
                title: titleInput.value.trim(),
                date: dateInput.value,
                color: colorInput.value
            });

            // Ordenar por fecha cronológicamente
            eventData.sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));

            // Guardar local
            localStorage.setItem('profeges_events', JSON.stringify(eventData));

            titleInput.value = '';
            dateInput.value = '';

            updateViews(); // Pintar el nuevo evento en el calendario y lista
        }
    });

    // Modal Configuración
    const btnConfig = document.getElementById('btn-config');
    const modalConfig = document.getElementById('config-modal');
    const closeBtns = [document.getElementById('close-modal-btn'), document.getElementById('cancel-config-btn')];

    const renderConfigScheduleTable = () => {
        const list = document.getElementById('config-schedule-list');
        if (!list) return;
        list.innerHTML = '';

        // Ordenar por día y luego por hora
        const dayOrder = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
        const dayNames = { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes' };

        let activeData = currentViewMode === 'classes' ? scheduleData : meetingsData;

        const sortedData = activeData.map((item, originalIndex) => {
            return { ...item, originalIndex };
        }).sort((a, b) => {
            if (dayOrder[a.day] !== dayOrder[b.day]) return dayOrder[a.day] - dayOrder[b.day];
            return a.start.localeCompare(b.start);
        });

        sortedData.forEach((item) => {
            list.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${dayNames[item.day]}</td>
                    <td>${item.start} - ${item.end}</td>
                    <td>${item.course}</td>
                    <td>${item.subject || ''}</td>
                    <td><span class="color-dot ${item.color}" style="background:var(--accent-${item.color.split('-')[1]});"></span></td>
                    <td>
                        <button class="btn-icon-small edit-schedule-btn" data-original-index="${item.originalIndex}" title="Editar" style="margin-right: 5px; color: var(--accent-blue);"><i class='bx bx-edit'></i></button>
                        <button class="btn-icon-small delete-schedule-btn" data-original-index="${item.originalIndex}" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </td>
                </tr>
            `);
        });
    };

    // -- Lógica para Listas de Cursos y Asignaturas --
    const renderCoursesAndSubjectsLists = () => {
        const cList = document.getElementById('added-courses-list');
        const sList = document.getElementById('added-subjects-list');
        const cSelect = document.getElementById('config-course-select');
        const sSelect = document.getElementById('config-subject-select');

        if (cList && cSelect) {
            cList.innerHTML = '';
            cSelect.innerHTML = '<option value="">Curso...</option>';
            coursesData.forEach((c, idx) => {
                const displayName = c.level + (c.letter ? ' ' + c.letter : '');
                cList.insertAdjacentHTML('beforeend', `<span class="added-tag ${c.color}" style="background:var(--accent-${c.color.split('-')[1]}); color:white; padding: 4px 8px; border-radius: 12px; font-size: 12px; display:inline-flex; align-items:center; gap:4px;">${displayName} <i class='bx bx-x remove-course' data-index="${idx}" style="cursor:pointer; font-size:14px;"></i></span>`);
                cSelect.insertAdjacentHTML('beforeend', `<option value="${idx}">${displayName}</option>`);
            });
        }

        if (sList && sSelect) {
            sList.innerHTML = '';
            sSelect.innerHTML = '<option value="">Asignatura...</option>';
            subjectsData.forEach((s, idx) => {
                sList.insertAdjacentHTML('beforeend', `<span class="added-tag" style="background:#e0e0e0; color:#333; padding: 4px 8px; border-radius: 12px; font-size: 12px; display:inline-flex; align-items:center; gap:4px;">${s.name} <i class='bx bx-x remove-subject' data-index="${idx}" style="cursor:pointer; font-size:14px;"></i></span>`);
                sSelect.insertAdjacentHTML('beforeend', `<option value="${idx}">${s.name}</option>`);
            });
        }
    };

    // Asignar en window para acceso global
    window.renderCoursesAndSubjectsLists = renderCoursesAndSubjectsLists;

    // Listeners for "Otro" option
    document.getElementById('course-level')?.addEventListener('change', (e) => {
        const custom = document.getElementById('course-custom-level');
        if (custom) custom.style.display = e.target.value === 'Otro' ? 'inline-block' : 'none';
    });
    document.getElementById('course-letter')?.addEventListener('change', (e) => {
        const custom = document.getElementById('course-custom-letter');
        if (custom) custom.style.display = e.target.value === 'Otro' ? 'inline-block' : 'none';
    });
    document.getElementById('subject-common')?.addEventListener('change', (e) => {
        const custom = document.getElementById('subject-custom');
        if (custom) custom.style.display = e.target.value === 'Otro' ? 'inline-block' : 'none';
    });

    document.getElementById('btn-add-course')?.addEventListener('click', () => {
        const lvlSel = document.getElementById('course-level').value;
        const level = lvlSel === 'Otro' ? document.getElementById('course-custom-level').value.trim() : lvlSel;
        const letSel = document.getElementById('course-letter').value;
        const letter = letSel === 'Otro' ? document.getElementById('course-custom-letter').value.trim() : letSel;
        const color = document.getElementById('course-color').value;

        if (level) {
            coursesData.push({ level, letter, color });
            localStorage.setItem('profeges_courses', JSON.stringify(coursesData));
            renderCoursesAndSubjectsLists();

            // reset
            document.getElementById('course-level').value = '1° Básico';
            document.getElementById('course-letter').value = 'A';
            document.getElementById('course-color').value = 'block-blue';
            document.getElementById('course-custom-level').style.display = 'none';
            document.getElementById('course-custom-letter').style.display = 'none';
            document.getElementById('course-custom-level').value = '';
            document.getElementById('course-custom-letter').value = '';
        }
    });

    document.getElementById('btn-add-subject')?.addEventListener('click', () => {
        const sel = document.getElementById('subject-common').value;
        const name = sel === 'Otro' ? document.getElementById('subject-custom').value.trim() : sel;

        if (name) {
            subjectsData.push({ name });
            localStorage.setItem('profeges_subjects', JSON.stringify(subjectsData));
            renderCoursesAndSubjectsLists();

            document.getElementById('subject-common').value = 'Lenguaje';
            document.getElementById('subject-custom').style.display = 'none';
            document.getElementById('subject-custom').value = '';
        }
    });

    document.getElementById('added-courses-list')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-course')) {
            const idx = e.target.dataset.index;
            coursesData.splice(idx, 1);
            localStorage.setItem('profeges_courses', JSON.stringify(coursesData));
            renderCoursesAndSubjectsLists();
        }
    });

    document.getElementById('added-subjects-list')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-subject')) {
            const idx = e.target.dataset.index;
            subjectsData.splice(idx, 1);
            localStorage.setItem('profeges_subjects', JSON.stringify(subjectsData));
            renderCoursesAndSubjectsLists();
        }
    });

    document.getElementById('btn-add-schedule')?.addEventListener('click', () => {
        const day = document.getElementById('config-day').value;
        const start = document.getElementById('config-start').value;
        const end = document.getElementById('config-end').value;
        const courseIdx = document.getElementById('config-course-select').value;
        const subjectIdx = document.getElementById('config-subject-select').value;

        if (day && start && end && courseIdx !== '') {
            const courseObj = coursesData[courseIdx];
            const subjectObj = subjectIdx !== '' ? subjectsData[subjectIdx] : null;

            const courseStr = courseObj.level + (courseObj.letter ? ' ' + courseObj.letter : '');
            const subjectStr = subjectObj ? subjectObj.name : '';
            const color = courseObj.color;

            let activeData = currentViewMode === 'classes' ? scheduleData : meetingsData;
            activeData.push({ day, start, end, course: courseStr, subject: subjectStr, color });

            if (currentViewMode === 'classes') {
                localStorage.setItem('profeges_schedule', JSON.stringify(scheduleData));
            } else {
                localStorage.setItem('profeges_meetings', JSON.stringify(meetingsData));
            }

            renderConfigScheduleTable();
            updateViews();

            document.getElementById('config-start').value = '';
            document.getElementById('config-end').value = '';
            document.getElementById('config-course-select').value = '';
            document.getElementById('config-subject-select').value = '';
        }
    });

    document.getElementById('config-schedule-list')?.addEventListener('click', (e) => {
        const trash = e.target.closest('.delete-schedule-btn');
        const edit = e.target.closest('.edit-schedule-btn');
        let activeData = currentViewMode === 'classes' ? scheduleData : meetingsData;

        if (trash) {
            const originalIndex = trash.dataset.originalIndex;
            activeData.splice(originalIndex, 1);
            if (currentViewMode === 'classes') {
                localStorage.setItem('profeges_schedule', JSON.stringify(scheduleData));
            } else {
                localStorage.setItem('profeges_meetings', JSON.stringify(meetingsData));
            }
            renderConfigScheduleTable();
            updateViews();
        } else if (edit) {
            const originalIndex = edit.dataset.originalIndex;
            const itemToEdit = activeData[originalIndex];

            document.getElementById('config-day').value = itemToEdit.day;
            document.getElementById('config-start').value = itemToEdit.start;
            document.getElementById('config-end').value = itemToEdit.end;

            // Tratamos de buscar si el nombre coincide con algún curso configurado para pre-seleccionarlo
            const foundCourseIdx = coursesData.findIndex(c => (c.level + (c.letter ? ' ' + c.letter : '')) === itemToEdit.course);
            if (foundCourseIdx !== -1) document.getElementById('config-course-select').value = foundCourseIdx;
            else document.getElementById('config-course-select').value = '';

            const foundSubjIdx = subjectsData.findIndex(s => s.name === itemToEdit.subject);
            if (foundSubjIdx !== -1) document.getElementById('config-subject-select').value = foundSubjIdx;
            else document.getElementById('config-subject-select').value = '';

            activeData.splice(originalIndex, 1);
            if (currentViewMode === 'classes') {
                localStorage.setItem('profeges_schedule', JSON.stringify(scheduleData));
            } else {
                localStorage.setItem('profeges_meetings', JSON.stringify(meetingsData));
            }
            renderConfigScheduleTable();
            updateViews();
        }
    });

    // Populate table on open
    btnConfig.addEventListener('click', () => {
        renderCoursesAndSubjectsLists();
        renderConfigScheduleTable();
        modalConfig.classList.remove('hidden');
    });

    closeBtns.forEach(btn => btn?.addEventListener('click', () => {
        modalConfig.classList.add('hidden');
    }));

    // Cerrar también con Save (ahora guarda on the fly, así que puede solo cerrar)
    document.getElementById('save-config-btn')?.addEventListener('click', () => {
        modalConfig.classList.add('hidden');
    });

    // --- REFREZCO AUTOMÁTICO CADA MINUTO PARA CLASE ACTIVA ---
    setInterval(() => {
        // Prevent updateViews from wiping out user text if they are actively typing in a textarea or input
        const activeMode = document.activeElement;
        if (activeMode && (activeMode.tagName === 'TEXTAREA' || activeMode.tagName === 'INPUT')) {
            return;
        }
        updateViews();
    }, 60000);
});
