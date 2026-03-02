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

    // === INICIALIZACIÓN DE LOCAL STORAGE ===
    let scheduleData = JSON.parse(localStorage.getItem('profeges_schedule')) || [];
    let todoData = JSON.parse(localStorage.getItem('profeges_todos')) || [];
    let eventData = JSON.parse(localStorage.getItem('profeges_events')) || [];
    let notesData = JSON.parse(localStorage.getItem('profeges_notes')) || {};

    // === BINDING FIREBASE ===
    let debounceSave = null;
    const syncToFirebase = () => {
        if (!auth.currentUser) return;
        clearTimeout(debounceSave);
        debounceSave = setTimeout(async () => {
            try {
                await setDoc(doc(db, "users", auth.currentUser.uid), {
                    schedule: scheduleData,
                    todos: todoData,
                    events: eventData,
                    notes: notesData,
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
                auth.signOut();
            }
        });
    }

    onAuthStateChanged(auth, user => {
        if (user && btnLogin) {
            loginText.textContent = user.displayName.split(" ")[0] || "Conectado";
            btnLogin.style.borderColor = "var(--accent-green)";
            btnLogin.innerHTML = `<i class='bx bx-cloud-check' style="color:var(--accent-green);"></i> <span id="login-text">${loginText.textContent}</span>`;

            // Suscribirse a cambios del servidor en tiempo real (PULL)
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                const source = docSnap.metadata.hasPendingWrites ? "Local" : "Server";
                if (source === "Server" && docSnap.exists()) {
                    const data = docSnap.data();

                    if (data.schedule) scheduleData = data.schedule;
                    if (data.todos) todoData = data.todos;
                    if (data.events) eventData = data.events;
                    if (data.notes) notesData = data.notes;

                    // Actualizar localStorage real, saltando nuestro interceptor
                    originalSetItem.call(localStorage, 'profeges_schedule', JSON.stringify(scheduleData));
                    originalSetItem.call(localStorage, 'profeges_todos', JSON.stringify(todoData));
                    originalSetItem.call(localStorage, 'profeges_events', JSON.stringify(eventData));
                    originalSetItem.call(localStorage, 'profeges_notes', JSON.stringify(notesData));

                    // Repintar UI si las vars existen
                    if (typeof updateViews === "function") updateViews();
                    if (typeof renderTodos === "function") renderTodos();
                }
            });

            // Al inicio siempre llamamos un push si tenemos datos sin sincronizar
            syncToFirebase();

        } else if (btnLogin) {
            loginText.textContent = "Conectar";
            btnLogin.innerHTML = `<i class='bx bxl-google'></i> <span id="login-text">Conectar</span>`;
            btnLogin.style.borderColor = "var(--border-color)";
        }
    });

    // === ESTADO DE LA APLICACIÓN ===
    let plannerDate = new Date(); // El día actual de la semana mostrada (Planificador)
    let calendarDate = new Date(); // El mes actual mostrado (Calendario)

    // Nombres de meses y días para mostrar
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Función para obtener el Lunes de una semana dada
    const getMonday = (d) => {
        d = new Date(d);
        d.setHours(0, 0, 0, 0); // Ajustar hora a medianoche para evitar bugs en comparaciones
        var day = d.getDay();
        var diff = d.getDate() - day + (day == 0 ? -6 : 1); // ajusta para cuando el día es domingo (0)
        return new Date(d.setDate(diff));
    };

    // === RENDERIZAR CALENDARIO MENSUAL ===
    const renderCalendar = (calDate, planDate) => {
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

            const dayEvent = events.find(e => e.date === dateStr);
            if (dayEvent) {
                classStr += ` has-event event-${dayEvent.color}`;
            }

            // Marcar SOLO el día de hoy real en rojo
            if (thisDayDate.toDateString() === new Date().toDateString()) {
                classStr += " is-today";
            }

            gridDays.innerHTML += `<div class="${classStr}" data-day="${idx}">${idx}</div>`;
        }
    };

    // === RENDERIZAR PLANIFICADOR SEMANAL ===
    const renderPlanner = (date) => {
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

        scheduleData.forEach(item => {
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

        const pixelsPerHour = 90;
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
            const dayClasses = scheduleData.filter(s => s.day === dayId);
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

                const noteKey = `${dayId}_${classItem.start}`;
                const savedNote = notesData[noteKey] || '';

                currentHtml += `<div class="class-slot ${classItem.color}" style="position: absolute; top: ${topPx}px; height: ${Math.max(35, heightPx)}px; width: 100%; left: 0; z-index: 2; margin: 0; padding: 4px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;" title="${classItem.start} - ${classItem.end}">
                                    <div class="class-title" style="margin-bottom: 2px;">${classItem.course} ${classItem.subject || ''}</div>
                                    <textarea class="class-notes" data-key="${noteKey}" placeholder="Objetivo de clase...">${savedNote}</textarea>
                                </div>`;
            });


            currentHtml += `</div>`;
            dayCol.innerHTML = currentHtml;
        });

        // Adjuntar listeners a las nuevas textareas para guardarlas automáticamente
        document.querySelectorAll('.class-notes').forEach(ta => {
            ta.addEventListener('blur', (e) => {
                const key = e.target.dataset.key;
                notesData[key] = e.target.value;
                localStorage.setItem('profeges_notes', JSON.stringify(notesData));
            });
        });

    };

    // === EVENTOS DEL MES ===
    const eventList = document.getElementById('monthly-event-list');

    const renderEvents = () => {
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
    const updateViews = () => {
        renderCalendar(calendarDate, plannerDate);
        renderPlanner(plannerDate);

        // --- FILTRAR Y ESTILIZAR EVENTOS DEL MES ---
        renderEvents();
    };

    updateViews(); // Renderizar inicio

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
                mobileModalTitle.textContent = "Calendario Mensual";
                mobileModalBody.appendChild(miniCalendarCard);
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
    const todoListContainer = document.getElementById('todo-list-container');
    const newTaskInput = document.getElementById('new-task-input');
    const btnAddTask = document.getElementById('btn-add-task');

    const renderTodos = () => {
        if (!todoListContainer) return;
        todoListContainer.innerHTML = '';

        // Opcional: Asegurar orden inicial por si hay nuevos sin ordenar
        todoData.sort((a, b) => (a.priority || 3) - (b.priority || 3));

        todoData.forEach((todo, index) => {
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
        // Toggle complete
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            const index = e.target.dataset.index;
            todoData[index].completed = e.target.checked;
            localStorage.setItem('profeges_todos', JSON.stringify(todoData));
            renderTodos();
        }

        // Delete
        const deleteBtn = e.target.closest('.delete-todo-btn');
        if (deleteBtn) {
            const index = deleteBtn.dataset.index;
            todoData.splice(index, 1);
            localStorage.setItem('profeges_todos', JSON.stringify(todoData));
            renderTodos();
        }
    });

    const addTask = () => {
        const text = newTaskInput.value.trim();
        const prioritySelect = document.getElementById('new-task-priority');
        const prioVal = prioritySelect ? prioritySelect.value : 'normal';

        let priorityNum = 3;
        if (prioVal === 'urgent') priorityNum = 1;
        if (prioVal === 'important') priorityNum = 2;

        if (text !== '') {
            todoData.push({ text, completed: false, priority: priorityNum, prioColor: prioVal });
            todoData.sort((a, b) => (a.priority || 3) - (b.priority || 3));
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

        const sortedData = scheduleData.map((item, originalIndex) => {
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
                    <td><button class="btn-icon-small delete-schedule-btn" data-original-index="${item.originalIndex}"><i class='bx bx-trash'></i></button></td>
                </tr>
            `);
        });
    };

    document.getElementById('btn-add-schedule')?.addEventListener('click', () => {
        const day = document.getElementById('config-day').value;
        const start = document.getElementById('config-start').value;
        const end = document.getElementById('config-end').value;
        const course = document.getElementById('config-course').value.trim();
        const subject = document.getElementById('config-subject')?.value.trim() || '';
        const color = document.getElementById('config-color').value;

        if (day && start && end && course && subject) {
            scheduleData.push({ day, start, end, course, subject, color });
            localStorage.setItem('profeges_schedule', JSON.stringify(scheduleData));
            renderConfigScheduleTable();
            updateViews();

            document.getElementById('config-start').value = '';
            document.getElementById('config-end').value = '';
            document.getElementById('config-course').value = '';
            document.getElementById('config-subject').value = '';
        }
    });

    document.getElementById('config-schedule-list')?.addEventListener('click', (e) => {
        const trash = e.target.closest('.delete-schedule-btn');
        if (trash) {
            const originalIndex = trash.dataset.originalIndex;
            scheduleData.splice(originalIndex, 1);
            localStorage.setItem('profeges_schedule', JSON.stringify(scheduleData));
            renderConfigScheduleTable();
            updateViews();
        }
    });

    // Populate table on open
    btnConfig.addEventListener('click', () => {
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

});
