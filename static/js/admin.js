/**
 * @file admin.js
 * @description Barista and Administrator workspace logic for CoffeeExpress.
 * Manages administrator authentication, real-time orders fetching, 
 * dynamic lifecycle state transitions via PATCH requests, and automated polling.
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. APPLICATION STATE AND VARIABLES
    // =========================================================================

    /** @type {Array<Object>} In-memory collection of all orders */
    let ordersList = [];

    /** @type {string} Active filter category: 'all' | 'Нове' | 'Готується' | 'Готове' | 'Видано' */
    let currentFilter = 'all';

    /** @type {number|null} Polling timer reference for automatic updates */
    let pollingInterval = null;

    // =========================================================================
    // 2. DOM CACHE AND ELEMENT SELECTORS
    // =========================================================================

    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const adminLoginForm = document.getElementById('adminLoginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const loginSpinner = document.getElementById('loginSpinner');
    const loginErrorAlert = document.getElementById('loginErrorAlert');
    const logoutBtn = document.getElementById('logoutBtn');

    // Dashboard controls
    const ordersContainer = document.getElementById('ordersContainer');
    const manualRefreshBtn = document.getElementById('manualRefreshBtn');
    const filterButtons = document.querySelectorAll('#statusFilterGroup button');

    // Analytical counters
    const statTotalOrders = document.getElementById('statTotalOrders');
    const statNewOrders = document.getElementById('statNewOrders');
    const statCookingOrders = document.getElementById('statCookingOrders');
    const statReadyOrders = document.getElementById('statReadyOrders');

    // =========================================================================
    // 3. AUTHENTICATION & SESSION MANAGEMENT
    // =========================================================================

    /**
     * Checks if admin session is already active on the server.
     * @async
     * @returns {Promise<void>}
     */
    async function checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            if (data.is_authenticated) {
                showDashboard();
            } else {
                showLogin();
            }
        } catch {
            showLogin();
        }
    }

    /**
     * Handles administrative login submission.
     */
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErrorAlert.classList.add('d-none');
        loginSubmitBtn.disabled = true;
        loginSpinner.classList.remove('d-none');

        const payload = {
            username: loginUsername.value.trim(),
            password: loginPassword.value.trim()
        };

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Невірні облікові дані адміністратора');
            }

            showDashboard();
        } catch (err) {
            loginErrorAlert.textContent = err.message;
            loginErrorAlert.classList.remove('d-none');
        } finally {
            loginSubmitBtn.disabled = false;
            loginSpinner.classList.add('d-none');
        }
    });

    /**
     * Logs out the administrator and invalidates session.
     */
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
            showLogin();
        }
    });

    function showLogin() {
        if (pollingInterval) clearInterval(pollingInterval);
        loginSection.classList.remove('d-none');
        dashboardSection.classList.add('d-none');
        logoutBtn.classList.add('d-none');
        adminLoginForm.reset();
    }

    function showDashboard() {
        loginSection.classList.add('d-none');
        dashboardSection.classList.remove('d-none');
        logoutBtn.classList.remove('d-none');
        loadOrders();

        // Setup automated polling every 10 seconds for real-time updates
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(loadOrders, 10000);
    }

    // =========================================================================
    // 4. ORDERS RETRIEVAL & RENDERING PIPELINE
    // =========================================================================

    /**
     * Loads orders list from GET /api/orders.
     * @async
     * @returns {Promise<void>}
     */
    async function loadOrders() {
        try {
            const response = await fetch('/api/orders');
            if (response.status === 401) {
                showLogin();
                return;
            }
            if (!response.ok) throw new Error('Помилка сервера під час зчитування замовлень');

            ordersList = await response.json();
            updateStatistics();
            renderOrders();
        } catch (error) {
            ordersContainer.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="alert alert-danger d-inline-block">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i> ${error.message}
                    </div>
                </div>
            `;
        }
    }

    /**
     * Updates top analytical counter widgets.
     */
    function updateStatistics() {
        statTotalOrders.textContent = ordersList.length;
        statNewOrders.textContent = ordersList.filter(o => o.status === 'Нове').length;
        statCookingOrders.textContent = ordersList.filter(o => o.status === 'Готується').length;
        statReadyOrders.textContent = ordersList.filter(o => o.status === 'Готове').length;
    }

    /**
     * Renders filtered order cards into the grid.
     */
    function renderOrders() {
        const filtered = currentFilter === 'all'
            ? ordersList
            : ordersList.filter(o => o.status === currentFilter);

        if (filtered.length === 0) {
            ordersContainer.innerHTML = `
                <div class="col-12 text-center py-5">
                    <p class="text-muted fs-5"><i class="bi bi-inbox me-2"></i>Замовлень у цій категорії немає</p>
                </div>
            `;
            return;
        }

        ordersContainer.innerHTML = filtered.map(order => {
            let headerClass = 'order-border-new';
            let badgeClass = 'bg-warning text-dark';

            if (order.status === 'Готується') {
                headerClass = 'order-border-progress';
                badgeClass = 'bg-info text-dark';
            } else if (order.status === 'Готове') {
                headerClass = 'order-border-ready';
                badgeClass = 'bg-success text-white';
            } else if (order.status === 'Видано') {
                headerClass = 'order-border-completed';
                badgeClass = 'bg-secondary text-white';
            } else if (order.status === 'Скасовано') {
                headerClass = 'order-border-cancelled';
                badgeClass = 'bg-danger text-white';
            }

            const itemsHtml = (order.items || []).map(item => `
                <li class="list-group-item d-flex justify-content-between align-items-start px-0 border-0 py-1">
                    <div class="ms-2 me-auto">
                        <div class="fw-bold small">${item.name} <span class="badge bg-light text-dark border">x${item.quantity}</span></div>
                        <span class="text-muted" style="font-size: 0.76rem;">${item.details || ''}</span>
                    </div>
                    <span class="small fw-semibold">${(item.price * item.quantity).toFixed(2)} грн</span>
                </li>
            `).join('');

            return `
                <div class="col-md-6 col-lg-4">
                    <div class="order-card p-4 shadow-sm ${headerClass}">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="fw-bold fs-5">#${order.id}</span>
                            <span class="status-badge ${badgeClass}">${order.status}</span>
                        </div>

                        <div class="mb-3">
                            <h6 class="fw-bold mb-1"><i class="bi bi-person me-1"></i>${order.customer_name}</h6>
                            <div class="small text-muted mb-1"><i class="bi bi-telephone me-1"></i>${order.customer_phone}</div>
                            <div class="small text-danger fw-semibold"><i class="bi bi-clock me-1"></i>Самовивіз: ${order.pickup_time}</div>
                        </div>

                        <div class="border-top border-bottom py-2 my-3">
                            <ul class="list-group list-group-flush mb-0">
                                ${itemsHtml}
                            </ul>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="text-muted small">Підсумок:</span>
                            <span class="fs-5 fw-bold text-success">${order.total_price.toFixed(2)} грн</span>
                        </div>

                        <!-- Barista Status Action Controls -->
                        <div class="d-flex flex-wrap gap-1">
                            ${order.status === 'Нове' ? `
                                <button class="btn btn-sm btn-info w-100 mb-1 change-status-btn" data-id="${order.id}" data-status="Готується">
                                    <i class="bi bi-fire me-1"></i> Почати готувати
                                </button>
                            ` : ''}

                            ${order.status === 'Готується' ? `
                                <button class="btn btn-sm btn-success w-100 mb-1 change-status-btn" data-id="${order.id}" data-status="Готове">
                                    <i class="bi bi-check-circle me-1"></i> Готово до видачі
                                </button>
                            ` : ''}

                            ${order.status === 'Готове' ? `
                                <button class="btn btn-sm btn-secondary w-100 mb-1 change-status-btn" data-id="${order.id}" data-status="Видано">
                                    <i class="bi bi-bag-check me-1"></i> Видати клієнту
                                </button>
                            ` : ''}

                            ${(order.status !== 'Видано' && order.status !== 'Скасовано') ? `
                                <button class="btn btn-sm btn-outline-danger w-100 change-status-btn" data-id="${order.id}" data-status="Скасовано">
                                    <i class="bi bi-x-circle me-1"></i> Скасувати
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach listeners for status change action buttons
        document.querySelectorAll('.change-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = btn.getAttribute('data-id');
                const newStatus = btn.getAttribute('data-status');
                updateOrderStatus(orderId, newStatus);
            });
        });
    }

    /**
     * Dispatches PATCH request to update order status.
     * @param {string} orderId 
     * @param {string} newStatus 
     */
    async function updateOrderStatus(orderId, newStatus) {
        try {
            const response = await fetch(`/api/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Помилка зміни статусу');
            }

            // Immediately reload list
            loadOrders();
        } catch (error) {
            alert(`Помилка: ${error.message}`);
        }
    }

    // =========================================================================
    // 5. FILTERS & MANUAL REFRESH EVENTS
    // =========================================================================

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderOrders();
        });
    });

    manualRefreshBtn.addEventListener('click', loadOrders);

    // Initial check
    checkAuthStatus();
});