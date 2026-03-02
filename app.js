// Lógica básica inicial de la vista
document.addEventListener('DOMContentLoaded', () => {

    // === REGISTRO DE SERVICE WORKER (PWA Y OFFLINE) ===
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('ServiceWorker registrado con éxito:', registration.scope);
                })
                .catch(error => {
                    console.log('Error al registrar ServiceWorker:', error);
                });
        });
    }

    // === INICIALIZACIÓN DE LOCAL STORAGE ===
    let scheduleData = JSON.parse(localStorage.getItem('profeges_schedule')) || [];
    let todoData = JSON.parse(localStorage.getItem('profeges_todos')) || [];
    let eventData = JSON.parse(localStorage.getItem('profeges_events')) || [];
    let notesData = JSON.parse(localStorage.getItem('profeges_notes')) || {};

    // === ESTADO DE LA APLICACIÓN ===
    let plannerDate = new Date(); // El día actual de la semana mostrada (Planificador)
    let calendarDate = new Date(); // El mes actual mostrado (Calendario)

    // Nombres de meses y días para mostrar
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Función para obtener el Lunes de una semana dada
    const getMonday = (d) => {
        d = new Date(d);
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

        // Título de semana
        let monthStartStr = monthNames[monday.getMonth()].slice(0, 3);
        let monthEndStr = monthNames[friday.getMonth()].slice(0, 3);
        let title = `Semana del ${monday.getDate()} al ${friday.getDate()} ${monthEndStr}`;
        if (monday.getMonth() !== friday.getMonth()) {
            title = `Semana del ${monday.getDate()} ${monthStartStr} al ${friday.getDate()} ${monthEndStr}`;
        }
        document.getElementById('current-week-title').textContent = title;

        // Actualizar números de los días en las columnas
        const colIds = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        const todayReal = new Date();

        for (let i = 0; i < 5; i++) {
            const colDate = new Date(monday);
            colDate.setDate(monday.getDate() + i);

            const header = document.getElementById(`header-${colIds[i]}`);
            if (header) {
                header.querySelector('.day-number').textContent = colDate.getDate();

                // Marcar 'Hoy'
                if (colDate.toDateString() === todayReal.toDateString()) {
                    header.classList.add('is-today');
                    if (window.innerWidth <= 1024) {
                        // Mostrar solo esta col en mobile, ocultar resto
                        document.querySelectorAll('.day-column').forEach(col => col.style.display = 'none');
                        document.getElementById(`col-${colIds[i]}`).style.display = 'flex';
                    }
                } else {
                    header.classList.remove('is-today');
                }
            }
        }

        // --- GENERAR GRILLA DE HORARIOS DESDE DATOS GUARDADOS ---
        const getUniqueTimeSlots = () => {
            const slots = [];
            scheduleData.forEach(item => {
                const slotKey = `${item.start}-${item.end}`;
                if (!slots.some(s => `${s.start}-${s.end}` === slotKey)) {
                    slots.push({ start: item.start, end: item.end });
                }
            });
            return slots.sort((a, b) => a.start.localeCompare(b.start));
        };

        const timeSlots = getUniqueTimeSlots();
        const timeColumn = document.getElementById('planner-time-column');
        if (timeColumn) {
            let timeHtml = '<div class="time-header">Hora</div>';
            timeSlots.forEach(slot => {
                timeHtml += `<div class="time-slot class-time">
                                <span class="time-txt">${slot.start}</span>
                                <span class="time-txt">${slot.end}</span>
                            </div>`;
            });
            timeColumn.innerHTML = timeHtml;
        }

        colIds.forEach(dayId => {
            const dayCol = document.getElementById(`col-${dayId}`);
            if (!dayCol) return;
            const headerHtml = dayCol.querySelector('.day-header').outerHTML;
            let currentHtml = headerHtml;

            timeSlots.forEach(slot => {
                const classItem = scheduleData.find(s => s.day === dayId && s.start === slot.start && s.end === slot.end);
                if (classItem) {
                    const noteKey = `${dayId}_${slot.start}`;
                    const savedNote = notesData[noteKey] || '';
                    currentHtml += `<div class="class-slot ${classItem.color}">
                                        <div class="class-title">${classItem.course} ${classItem.subject || ''}</div>
                                        <textarea class="class-notes" data-key="${noteKey}" placeholder="Objetivo de clase...">${savedNote}</textarea>
                                    </div>`;
                } else {
                    currentHtml += `<div class="class-slot" style="background: transparent; box-shadow: none;"></div>`;
                }
            });
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
        }
    });

    // === EVENTOS NAVEGACIÓN PLANIFICADOR SEMANAL ===
    document.getElementById('btn-prev-week')?.addEventListener('click', () => {
        plannerDate.setDate(plannerDate.getDate() - 7);
        calendarDate = new Date(plannerDate); // Sincroniza el calendario con el planificador
        updateViews();
    });

    document.getElementById('btn-next-week')?.addEventListener('click', () => {
        plannerDate.setDate(plannerDate.getDate() + 7);
        calendarDate = new Date(plannerDate); // Sincroniza el calendario con el planificador
        updateViews();
    });

    document.getElementById('btn-today')?.addEventListener('click', () => {
        plannerDate = new Date();
        calendarDate = new Date();
        updateViews();
    });

    window.addEventListener('resize', updateViews);

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

        const sortedData = [...scheduleData].sort((a, b) => {
            if (dayOrder[a.day] !== dayOrder[b.day]) return dayOrder[a.day] - dayOrder[b.day];
            return a.start.localeCompare(b.start);
        });

        sortedData.forEach((item, index) => {
            list.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${dayNames[item.day]}</td>
                    <td>${item.start} - ${item.end}</td>
                    <td>${item.course}</td>
                    <td>${item.subject || ''}</td>
                    <td><span class="color-dot ${item.color}" style="background:var(--accent-${item.color.split('-')[1]});"></span></td>
                    <td><button class="btn-icon-small delete-schedule-btn" data-index="${index}"><i class='bx bx-trash'></i></button></td>
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
            const index = trash.dataset.index;
            scheduleData.splice(index, 1);
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
