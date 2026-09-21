/**
 * @file app.js
 * @description Client-side controller for CoffeeExpress customer storefront.
 * Handles asynchronous catalog hydration, dynamic DOM rendering, 
 * category filtering, drink customization logic, in-memory shopping cart operations,
 * and form validation for RESTful order submission.
 *
 * Tech Stack: Vanilla JavaScript (ES6+), Fetch API, Bootstrap 5 Modals.
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. APPLICATION STATE
    // =========================================================================
    
    /** @type {Array<Object>} Cached product catalog fetched from server */
    let catalog = [];

    /** @type {Array<Object>} Current active customer shopping cart items */
    let cart = [];

    /** @type {string} Currently selected category filter: 'Всі' | 'Кава' | 'Десерти' */
    let activeCategory = 'Всі';

    /** @type {Object|null} Reference to catalog item currently opened in customization modal */
    let currentCustomItem = null;

    // =========================================================================
    // 2. DOM CACHE & ELEMENT SELECTORS
    // =========================================================================
    
    const productsGrid = document.getElementById('productsGrid');
    const categoryButtons = document.querySelectorAll('.category-filter-btn');
    const cartCountBadge = document.getElementById('cartCountBadge');
    
    // Cart modal elements
    const cartEmptyMessage = document.getElementById('cartEmptyMessage');
    const cartContentWrapper = document.getElementById('cartContentWrapper');
    const cartTableBody = document.getElementById('cartTableBody');
    const cartTotalSum = document.getElementById('cartTotalSum');
    
    // Order checkout form elements
    const checkoutForm = document.getElementById('checkoutForm');
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    const submitSpinner = document.getElementById('submitSpinner');
    const orderErrorAlert = document.getElementById('orderErrorAlert');
    const orderSuccessWrapper = document.getElementById('orderSuccessWrapper');
    const successOrderId = document.getElementById('successOrderId');

    // Beverage customization modal elements
    const customizeModalEl = document.getElementById('customizeModal');
    const customizeModal = new bootstrap.Modal(customizeModalEl);
    const customItemImage = document.getElementById('customItemImage');
    const customItemName = document.getElementById('customItemName');
    const customBasePrice = document.getElementById('customBasePrice');
    const customCalculatedPrice = document.getElementById('customCalculatedPrice');
    const confirmCustomAddBtn = document.getElementById('confirmCustomAddBtn');

    // =========================================================================
    // 3. CATALOG FETCHING & RENDERING PIPELINE
    // =========================================================================

    /**
     * Asynchronously loads menu items from the REST API endpoint.
     * Updates catalog state and triggers initial DOM rendering.
     * 
     * @async
     * @returns {Promise<void>}
     */
    async function fetchProducts() {
        try {
            const response = await fetch('/api/products');
            if (!response.ok) {
                throw new Error(`Server returned HTTP status ${response.status}`);
            }
            catalog = await response.json();
            renderProducts();
        } catch (error) {
            // Render user-friendly error state on network or server failure
            productsGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="alert alert-danger d-inline-block shadow-sm">
                        <i class="bi bi-exclamation-octagon-fill me-2"></i>
                        Помилка завантаження каталогу: ${error.message}
                    </div>
                </div>
            `;
        }
    }

    /**
     * Renders product cards according to the active category filter.
     * Utilizes semantic card layouts with lazy image loading and event delegation.
     * 
     * @returns {void}
     */
    function renderProducts() {
        const filtered = activeCategory === 'Всі'
            ? catalog
            : catalog.filter(item => item.category === activeCategory);

        if (filtered.length === 0) {
            productsGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <p class="text-muted">У вибраній категорії позиції наразі відсутні.</p>
                </div>
            `;
            return;
        }

        productsGrid.innerHTML = filtered.map(item => `
            <div class="col-md-6 col-lg-4 col-xl-3">
                <article class="product-card">
                    <div class="product-image-wrapper">
                        <img src="${item.image_url}" alt="${item.name}" loading="lazy">
                        <span class="product-price-tag">${item.price.toFixed(2)} грн</span>
                    </div>
                    <div class="p-3 d-flex flex-column flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="fw-bold mb-0">${item.name}</h6>
                            <span class="badge bg-light text-secondary border small">${item.category}</span>
                        </div>
                        <p class="text-muted small flex-grow-1" style="font-size: 0.85rem;">${item.description || ''}</p>
                        <button class="btn btn-primary-coffee w-100 mt-2 open-customize-btn" data-id="${item.id}">
                            <i class="bi ${item.category === 'Кава' ? 'bi-sliders' : 'bi-plus-circle'} me-1"></i>
                            ${item.category === 'Кава' ? 'Налаштувати' : 'У кошик'}
                        </button>
                    </div>
                </article>
            </div>
        `).join('');

        // Bind click event listeners to customization / add buttons
        document.querySelectorAll('.open-customize-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                openCustomizer(id);
            });
        });
    }

    // =========================================================================
    // 4. CATEGORY FILTER NAVIGATION
    // =========================================================================

    categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.getAttribute('data-category');
            renderProducts();
        });
    });

    // =========================================================================
    // 5. BEVERAGE CUSTOMIZATION MODAL LOGIC
    // =========================================================================

    /**
     * Prepares and opens customization dialog for coffee or directly adds pastries.
     * 
     * @param {number} productId - Target item identifier from catalog
     */
    function openCustomizer(productId) {
        currentCustomItem = catalog.find(i => i.id === productId);
        if (!currentCustomItem) return;

        // Desserts require no milk or syrup options; added immediately
        if (currentCustomItem.category !== 'Кава') {
            addItemToCart({
                id: currentCustomItem.id,
                name: currentCustomItem.name,
                details: 'Класична порція',
                price: currentCustomItem.price,
                quantity: 1
            });
            return;
        }

        // Hydrate coffee customization modal dialog
        customItemImage.src = currentCustomItem.image_url;
        customItemName.textContent = currentCustomItem.name;
        customBasePrice.textContent = `Базова ціна: ${currentCustomItem.price.toFixed(2)} грн`;

        // Reset radio buttons to default presets
        document.getElementById('sizeM').checked = true;
        document.getElementById('milkRegular').checked = true;
        document.getElementById('syrupNone').checked = true;

        recalcCustomPrice();
        customizeModal.show();
    }

    /**
     * Dynamically calculates item price based on selected modifiers in real-time.
     * 
     * @returns {number} Computed total item cost
     */
    function recalcCustomPrice() {
        if (!currentCustomItem) return 0;

        let total = currentCustomItem.price;
        const selectedSize = document.querySelector('input[name="itemSize"]:checked');
        const selectedMilk = document.querySelector('input[name="milkType"]:checked');
        const selectedSyrup = document.querySelector('input[name="syrupType"]:checked');

        if (selectedSize) total += parseFloat(selectedSize.getAttribute('data-cost'));
        if (selectedMilk) total += parseFloat(selectedMilk.getAttribute('data-cost'));
        if (selectedSyrup) total += parseFloat(selectedSyrup.getAttribute('data-cost'));

        customCalculatedPrice.textContent = `${total.toFixed(2)} грн`;
        return total;
    }

    // Attach real-time price recalculation listeners to modifier radio chips
    document.querySelectorAll('#customizeModal input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', recalcCustomPrice);
    });

    // Confirm button click handler in customization modal
    confirmCustomAddBtn.addEventListener('click', () => {
        if (!currentCustomItem) return;

        const size = document.querySelector('input[name="itemSize"]:checked').value;
        const milk = document.querySelector('input[name="milkType"]:checked').value;
        const syrup = document.querySelector('input[name="syrupType"]:checked').value;
        const finalPrice = recalcCustomPrice();

        const details = `Розмір: ${size}, Молоко: ${milk}, Сироп: ${syrup}`;

        addItemToCart({
            id: currentCustomItem.id,
            name: currentCustomItem.name,
            details: details,
            price: finalPrice,
            quantity: 1
        });

        customizeModal.hide();
    });

    // =========================================================================
    // 6. SHOPPING CART STATE MANAGEMENT
    // =========================================================================

    /**
     * Appends an item to cart or increments quantity if identical modifier exists.
     * Triggers micro-interaction badge bounce animation.
     * 
     * @param {Object} itemObj - Item with id, name, details, price, quantity
     */
    function addItemToCart(itemObj) {
        const existing = cart.find(i => i.id === itemObj.id && i.details === itemObj.details);
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push(itemObj);
        }

        // Trigger visual pulse animation on navigation badge
        cartCountBadge.classList.remove('badge-bounce');
        void cartCountBadge.offsetWidth; // Force CSS repaint
        cartCountBadge.classList.add('badge-bounce');

        updateCartUI();
    }

    /**
     * Increments or decrements item quantity; removes if count drops to zero.
     * 
     * @param {number} index - Index of element in cart array
     * @param {number} delta - Quantity step (+1 or -1)
     */
    function changeQuantity(index, delta) {
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        updateCartUI();
    }

    /**
     * Removes specified element from cart array.
     * 
     * @param {number} index - Index of element to delete
     */
    function removeFromCart(index) {
        cart.splice(index, 1);
        updateCartUI();
    }

    /**
     * Calculates total order amount across all items.
     * 
     * @returns {number} Sum of all items multiplied by their quantity
     */
    function calculateTotal() {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    /**
     * Synchronizes DOM representations with internal cart state.
     */
    function updateCartUI() {
        const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
        cartCountBadge.textContent = totalItemsCount;

        if (cart.length === 0) {
            cartEmptyMessage.classList.remove('d-none');
            cartContentWrapper.classList.add('d-none');
            return;
        }

        cartEmptyMessage.classList.add('d-none');
        cartContentWrapper.classList.remove('d-none');

        cartTableBody.innerHTML = cart.map((item, index) => `
            <tr>
                <td>
                    <strong>${item.name}</strong>
                    <div class="text-muted" style="font-size: 0.78rem;">${item.details || ''}</div>
                    <div class="small text-muted">${item.price.toFixed(2)} грн / шт.</div>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-secondary qty-decrease-btn" data-index="${index}">-</button>
                        <span class="btn btn-outline-secondary disabled px-3 fw-bold">${item.quantity}</span>
                        <button class="btn btn-outline-secondary qty-increase-btn" data-index="${index}">+</button>
                    </div>
                </td>
                <td class="text-end fw-bold">${(item.price * item.quantity).toFixed(2)} грн</td>
                <td class="text-end">
                    <button class="btn btn-link text-danger p-0 delete-item-btn" data-index="${index}" aria-label="Видалити">
                        <i class="bi bi-trash3"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        cartTotalSum.textContent = `${calculateTotal().toFixed(2)} грн`;

        // Re-bind click event listeners to dynamic cart controls
        document.querySelectorAll('.qty-decrease-btn').forEach(btn => {
            btn.addEventListener('click', () => changeQuantity(parseInt(btn.getAttribute('data-index'), 10), -1));
        });
        document.querySelectorAll('.qty-increase-btn').forEach(btn => {
            btn.addEventListener('click', () => changeQuantity(parseInt(btn.getAttribute('data-index'), 10), 1));
        });
        document.querySelectorAll('.delete-item-btn').forEach(btn => {
            btn.addEventListener('click', () => removeFromCart(parseInt(btn.getAttribute('data-index'), 10)));
        });
    }

    // =========================================================================
    // 7. ORDER CHECKOUT & REST API SUBMISSION
    // =========================================================================

    /**
     * Handles checkout form submission, validates inputs, and sends POST /api/orders.
     */
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        orderErrorAlert.classList.add('d-none');

        const customerName = document.getElementById('customerName').value.trim();
        const customerPhone = document.getElementById('customerPhone').value.trim();
        const pickupTime = document.getElementById('pickupTime').value.trim();

        // Validation Step 1: Customer Name
        if (customerName.length < 2) {
            orderErrorAlert.textContent = "Вкажіть ваше ім'я (мінімум 2 символи).";
            orderErrorAlert.classList.remove('d-none');
            return;
        }

        // Validation Step 2: Contact Phone Format
        const phoneRegex = /^\+?\d{10,13}$/;
        const cleanPhone = customerPhone.replace(/[\s\-\(\)]/g, '');
        if (!phoneRegex.test(cleanPhone)) {
            orderErrorAlert.textContent = "Введіть коректний номер телефону (наприклад, +380XXXXXXXXX).";
            orderErrorAlert.classList.remove('d-none');
            return;
        }

        // Validation Step 3: Pickup Time Presence
        if (!pickupTime) {
            orderErrorAlert.textContent = "Оберіть бажаний час самовивозу замовлення.";
            orderErrorAlert.classList.remove('d-none');
            return;
        }

        // Prepare JSON payload according to REST API specification
        const orderPayload = {
            customer_name: customerName,
            customer_phone: cleanPhone,
            pickup_time: pickupTime,
            items: cart,
            total_price: calculateTotal()
        };

        // UI loading state feedback
        submitOrderBtn.disabled = true;
        submitSpinner.classList.remove('d-none');

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Помилка реєстрації замовлення на сервері.');
            }

            // Order registered successfully: purge cart and render success view
            cart = [];
            updateCartUI();
            checkoutForm.reset();

            cartContentWrapper.classList.add('d-none');
            orderSuccessWrapper.classList.remove('d-none');
            successOrderId.textContent = `#${result.order_id}`;
        } catch (err) {
            orderErrorAlert.textContent = err.message;
            orderErrorAlert.classList.remove('d-none');
        } finally {
            submitOrderBtn.disabled = false;
            submitSpinner.classList.add('d-none');
        }
    });

    // Reset success banner state when modal is dismissed
    document.getElementById('closeSuccessBtn').addEventListener('click', () => {
        orderSuccessWrapper.classList.add('d-none');
        cartEmptyMessage.classList.remove('d-none');
    });

    // =========================================================================
    // 8. INITIAL APPLICATION HYDRATION
    // =========================================================================
    fetchProducts();
});