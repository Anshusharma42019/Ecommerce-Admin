const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api/v1'
  : 'https://ecommerce-backend-xi-ten.vercel.app/api/v1';

// Image URL formatter helper for local uploads static serving
function formatImageUrl(url) {
    if (!url) return 'https://via.placeholder.com/48';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const serverRoot = API_BASE_URL.replace('/api/v1', '');
    return `${serverRoot}${url}`;
}

// DOM Elements
const loginModal = document.getElementById('login-modal');
const adminApp = document.getElementById('admin-app');
const loginForm = document.getElementById('admin-login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item[data-target]');
const contentSections = document.querySelectorAll('.content-section');

// State
let token = localStorage.getItem('adminToken');
let salesTrendChartInstance = null;
let orderStatusChartInstance = null;
let userCurrentPage = 1;
let userSearchVal = '';
let userRoleVal = '';

// Products Section Dashboard State
let activeCategory = 'all';
let activeView = 'grid'; // grid or list
let productSearchQuery = '';
let productsData = []; // Caches loaded products data
let selectedImages = []; // Cache newly selected images for dynamic upload

// Initialize
function init() {
    if (token) {
        showApp();
        loadDashboardData();
    } else {
        showLogin();
    }
}

// Bind shortcut clicks for dashboard buttons globally
document.addEventListener('click', (e) => {
    const shortcut = e.target.closest('.nav-shortcut-btn');
    if (shortcut) {
        e.preventDefault();
        const targetId = shortcut.getAttribute('data-target');
        const sidebarNavItem = document.querySelector(`.sidebar-nav .nav-item[data-target="${targetId}"]`);
        if (sidebarNavItem) {
            sidebarNavItem.click();
        }
    }
});

// Authentication
function showLogin() {
    loginModal.classList.remove('hidden');
    adminApp.style.display = 'none';
}

function showApp() {
    loginModal.classList.add('hidden');
    adminApp.style.display = 'flex';
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (res.ok && data.data && data.data.user.role === 'admin') {
            token = data.data.accessToken;
            localStorage.setItem('adminToken', token);
            document.getElementById('admin-name').innerText = data.data.user.firstName;
            showApp();
            loadDashboardData();
        } else {
            loginError.innerText = data.message || 'Access Denied. Admins only.';
            if (res.ok) loginError.innerText = 'Access Denied. Admins only.';
        }
    } catch (err) {
        loginError.innerText = 'Server error. Please try again.';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    token = null;
    showLogin();
});

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Update active nav
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Show target section
        const targetId = item.getAttribute('data-target');
        contentSections.forEach(section => {
            section.classList.remove('active');
            section.classList.add('hidden');
        });
        document.getElementById(targetId).classList.remove('hidden');
        document.getElementById(targetId).classList.add('active');

        // Close sidebar on mobile after clicking
        if (typeof toggleSidebar === 'function' && window.innerWidth <= 768 && document.querySelector('.sidebar')?.classList.contains('open')) {
            toggleSidebar();
        }

        // Load data based on section
        if (targetId === 'dashboard-section') loadDashboardData();
        if (targetId === 'users-section') loadUsers();
        if (targetId === 'products-section') loadProducts();
        if (targetId === 'orders-section') loadOrders();
    });
});

// Fetch Helper
async function fetchApi(endpoint) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
            logoutBtn.click();
            throw new Error('Unauthorized');
        }
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return null;
    }
}

// Load Dashboard
async function loadDashboardData() {
    const data = await fetchApi('/admin/dashboard');
    if (!data || !data.data) return;

    const stats = data.data;
    document.getElementById('stat-users').innerText = stats.userCount || 0;
    document.getElementById('stat-products').innerText = stats.productCount || 0;
    document.getElementById('stat-orders').innerText = stats.orderCount || 0;
    document.getElementById('stat-revenue').innerText = `₹${(stats.revenue || 0).toLocaleString()}`;

    // ─── Render Order Status Doughnut Chart ───────────────────────
    const orderStats = stats.orderStats || [];
    const statusLabels = [];
    const statusCounts = [];
    const statusColors = [];
    
    // Map statuses to customized Ayurveda themes
    const colorMap = {
        'delivered': '#1e4d2b',  // Forest Green
        'shipped': '#4a7c59',     // Sage Green
        'processing': '#88b04b',  // Leafy Green
        'pending': '#d4af37',     // Gold
        'cancelled': '#e53e3e',   // Muted Red
        'failed': '#718096'       // Gray
    };

    orderStats.forEach(stat => {
        if (stat._id) {
            const label = stat._id.charAt(0).toUpperCase() + stat._id.slice(1);
            statusLabels.push(label);
            statusCounts.push(stat.count);
            statusColors.push(colorMap[stat._id] || '#718096');
        }
    });

    const canvasStatus = document.getElementById('orderStatusChart');
    if (canvasStatus) {
        const ctxStatus = canvasStatus.getContext('2d');
        if (orderStatusChartInstance) {
            orderStatusChartInstance.destroy();
        }
        orderStatusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: statusLabels.length > 0 ? statusLabels : ['No Orders'],
                datasets: [{
                    data: statusCounts.length > 0 ? statusCounts : [0],
                    backgroundColor: statusColors.length > 0 ? statusColors : ['#cbd5e1'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
                            color: '#2d3748',
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: '#112a18',
                        padding: 10,
                        cornerRadius: 6,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${context.raw} orders`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }

    // ─── Render Sales & Revenue Line Chart (30 Days) ───────────────
    const endDateObj = new Date();
    const startDateObj = new Date();
    startDateObj.setDate(endDateObj.getDate() - 30);
    const startDateStr = startDateObj.toISOString().split('T')[0];
    const endDateStr = endDateObj.toISOString().split('T')[0];
    
    const salesReportData = await fetchApi(`/admin/reports/sales?startDate=${startDateStr}&endDate=${endDateStr}`);
    
    const salesLabels = [];
    const salesRevenue = [];
    const salesOrders = [];
    
    if (salesReportData && salesReportData.data && Array.isArray(salesReportData.data)) {
        salesReportData.data.forEach(day => {
            const formattedDate = new Date(day._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            salesLabels.push(formattedDate);
            salesRevenue.push(day.revenue || 0);
            salesOrders.push(day.orders || 0);
        });
    }

    const canvasSales = document.getElementById('salesTrendChart');
    if (canvasSales) {
        const ctxSales = canvasSales.getContext('2d');
        if (salesTrendChartInstance) {
            salesTrendChartInstance.destroy();
        }
        
        // Gradient background fill
        const revenueGradient = ctxSales.createLinearGradient(0, 0, 0, 300);
        revenueGradient.addColorStop(0, 'rgba(30, 77, 43, 0.25)'); // Primary Forest Green
        revenueGradient.addColorStop(1, 'rgba(30, 77, 43, 0.00)');
        
        salesTrendChartInstance = new Chart(ctxSales, {
            type: 'line',
            data: {
                labels: salesLabels.length > 0 ? salesLabels : ['No Data'],
                datasets: [
                    {
                        label: 'Revenue (₹)',
                        data: salesRevenue.length > 0 ? salesRevenue : [0],
                        borderColor: '#1e4d2b',
                        borderWidth: 3,
                        backgroundColor: revenueGradient,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#1e4d2b',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Orders Count',
                        data: salesOrders.length > 0 ? salesOrders : [0],
                        borderColor: '#d4af37',
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.3,
                        pointBackgroundColor: '#d4af37',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1.5,
                        pointRadius: 3,
                        yAxisID: 'y1',
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
                            color: '#2d3748',
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: '#112a18',
                        titleFont: { family: "'Outfit', sans-serif", size: 12, weight: '600' },
                        bodyFont: { family: "'Inter', sans-serif", size: 11 },
                        padding: 10,
                        cornerRadius: 6,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 9 },
                            color: '#718096',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: '#e2e8f0' },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 9 },
                            color: '#718096',
                            callback: function(value) { return '₹' + value; }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 9 },
                            color: '#718096',
                            stepSize: 1,
                            precision: 0
                        }
                    }
                }
            }
        });
    }

    // ─── Fetch and Render Recent Orders ───────────────────────────
    const recentOrdersTbody = document.getElementById('recent-orders-tbody');
    if (recentOrdersTbody) {
        recentOrdersTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;"><i class="fas fa-spinner fa-spin"></i> Loading recent orders...</td></tr>';
        const ordersData = await fetchApi('/admin/orders?limit=10');
        recentOrdersTbody.innerHTML = '';
        if (ordersData && ordersData.data && Array.isArray(ordersData.data) && ordersData.data.length > 0) {
            // Display top 5 recent orders
            const top5Orders = ordersData.data.slice(0, 5);
            top5Orders.forEach(order => {
                const statusClass = order.status === 'delivered' ? 'delivered' : order.status === 'cancelled' ? 'cancelled' : 'pending';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong style="color: var(--primary); cursor: pointer;" class="order-link">#${order.orderNumber || order._id.substring(18)}</strong></td>
                    <td>
                        <div style="font-weight: 500">${order.user ? order.user.firstName + ' ' + order.user.lastName : 'Guest'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted)">${new Date(order.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td>₹${order.totalAmount}</td>
                    <td><span class="badge ${statusClass}">${order.status}</span></td>
                `;
                // View order detail onClick
                tr.querySelector('.order-link').addEventListener('click', () => showOrderDetails(order));
                recentOrdersTbody.appendChild(tr);
            });
        } else {
            recentOrdersTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No recent orders.</td></tr>`;
        }
    }

    // ─── Fetch and Render Top Rated Products ───────────────────────
    const topProductsList = document.getElementById('top-selling-products-list');
    if (topProductsList) {
        topProductsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 16px;"><i class="fas fa-spinner fa-spin"></i> Loading products...</div>';
        const productsData = await fetchApi('/admin/products?limit=10');
        topProductsList.innerHTML = '';
        if (productsData && productsData.data && Array.isArray(productsData.data) && productsData.data.length > 0) {
            // Sort by ratings or reviews to display top rated items
            const sortedProducts = [...productsData.data].sort((a, b) => {
                const ratingScoreA = (a.averageRating || 0) * (a.ratingCount || 1);
                const ratingScoreB = (b.averageRating || 0) * (b.ratingCount || 1);
                return ratingScoreB - ratingScoreA;
            }).slice(0, 4);

            sortedProducts.forEach(prod => {
                const ratingStars = '<i class="fas fa-star"></i>'.repeat(Math.round(prod.averageRating || 0)) + '<i class="far fa-star"></i>'.repeat(5 - Math.round(prod.averageRating || 0));
                const itemDiv = document.createElement('div');
                itemDiv.className = 'top-product-item';
                itemDiv.innerHTML = `
                    <div class="top-product-info">
                        <img src="${prod.images && prod.images[0] ? formatImageUrl(prod.images[0].url) : 'https://via.placeholder.com/40'}" style="width: 36px; height: 36px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--border);">
                        <div class="top-product-meta">
                            <h4 style="margin: 0; font-size: 0.875rem; font-weight: 600; cursor: pointer;" class="prod-link">${prod.name}</h4>
                            <span>Price: ₹${prod.price} | Stock: ${prod.stock}</span>
                        </div>
                    </div>
                    <div class="top-product-rating">
                        <div class="stars" style="color: #f59e0b; font-size: 0.75rem;">${ratingStars}</div>
                        <span class="rating-val" style="font-size: 0.8rem;">${prod.averageRating || 0} (${prod.ratingCount || 0})</span>
                    </div>
                `;
                // Open product edit modal on title click
                itemDiv.querySelector('.prod-link').addEventListener('click', () => openProductModal(prod));
                topProductsList.appendChild(itemDiv);
            });
        } else {
            topProductsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">No products found.</div>`;
        }
    }
}

// Load Users
async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;"><i class="fas fa-spinner fa-spin"></i> Loading users...</td></tr>';
    
    // Dynamically calculate and render stats across all accounts
    try {
        const statsData = await fetchApi('/admin/users?limit=1000');
        if (statsData && statsData.data && Array.isArray(statsData.data)) {
            const usersList = statsData.data;
            const total = usersList.length;
            const activeCustomers = usersList.filter(u => u.role === 'user' && u.isActive).length;
            const admins = usersList.filter(u => u.role === 'admin' && u.isActive).length;
            const inactive = usersList.filter(u => !u.isActive).length;
            
            document.getElementById('user-stat-total').innerText = total;
            document.getElementById('user-stat-active').innerText = activeCustomers;
            document.getElementById('user-stat-admins').innerText = admins;
            document.getElementById('user-stat-inactive').innerText = inactive;
        }
    } catch (err) {
        console.error('Error computing dynamic stats:', err);
    }
    
    const queryParams = [];
    if (userSearchVal) queryParams.push(`search=${encodeURIComponent(userSearchVal)}`);
    if (userRoleVal) queryParams.push(`role=${encodeURIComponent(userRoleVal)}`);
    queryParams.push(`page=${userCurrentPage}`);
    queryParams.push(`limit=10`);
    
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    const data = await fetchApi(`/admin/users${queryString}`);
    
    tbody.innerHTML = '';
    
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
        data.data.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${user.avatar?.url ? formatImageUrl(user.avatar.url) : `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}&background=random`}" class="img-thumb" style="width: 36px; height: 36px; border-radius: 50%;">
                        <div>
                            <div style="font-weight: 500">${user.firstName} ${user.lastName}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted)">${user.phone || 'N/A'}</div>
                        </div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td><span class="badge ${user.role === 'admin' ? 'active' : 'pending'}">${user.role}</span></td>
                <td>
                    <label class="toggle-switch toggle-user-status-btn" data-id="${user._id}" data-active="${user.isActive}" title="Click to toggle user status">
                        <input type="checkbox" ${user.isActive ? 'checked' : ''}>
                        <span class="toggle-track"></span>
                        <span class="toggle-label">${user.isActive ? 'Active' : 'Inactive'}</span>
                    </label>
                </td>
                <td>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${new Date(user.createdAt).toLocaleDateString()}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="action-btn view-user-btn" title="View Profile"><i class="fas fa-eye"></i></button>
                    </div>
                </td>
            `;

            // Wire up toggle switch status
            tr.querySelector('.toggle-user-status-btn input').addEventListener('change', async (e) => {
                const isActive = e.target.checked;
                const label = e.target.closest('.toggle-user-status-btn');
                const labelSpan = label.querySelector('.toggle-label');
                labelSpan.innerText = isActive ? 'Active' : 'Inactive';
                
                try {
                    const res = await fetch(`${API_BASE_URL}/admin/users/${user._id}/status`, {
                        method: 'PATCH',
                        headers: { 
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (res.ok) {
                        loadUsers(); // Refresh stats
                    } else {
                        e.target.checked = !isActive;
                        labelSpan.innerText = !isActive ? 'Active' : 'Inactive';
                        const r = await res.json();
                        alert(r.message || 'Failed to update user status.');
                    }
                } catch (err) {
                    e.target.checked = !isActive;
                    labelSpan.innerText = !isActive ? 'Active' : 'Inactive';
                    alert('Server error. Failed to update status.');
                }
            });

            // Wire up view details modal click
            tr.querySelector('.view-user-btn').addEventListener('click', () => showUserDetails(user));

            tbody.appendChild(tr);
        });
        
        // Update pagination UI
        const meta = data.meta || {};
        const total = meta.totalResults || 0;
        const page = meta.page || 1;
        const totalPages = meta.totalPages || 1;
        
        document.getElementById('user-pagination-info').innerText = `Page ${page} of ${totalPages} (Total: ${total} users)`;
        
        const prevBtn = document.getElementById('user-prev-btn');
        const nextBtn = document.getElementById('user-next-btn');
        
        if (prevBtn && nextBtn) {
            prevBtn.disabled = !meta.hasPrevPage;
            prevBtn.style.opacity = meta.hasPrevPage ? '1' : '0.5';
            prevBtn.style.cursor = meta.hasPrevPage ? 'pointer' : 'not-allowed';
            
            nextBtn.disabled = !meta.hasNextPage;
            nextBtn.style.opacity = meta.hasNextPage ? '1' : '0.5';
            nextBtn.style.cursor = meta.hasNextPage ? 'pointer' : 'not-allowed';
        }
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No users found matching filters.</td></tr>';
        const pageInfo = document.getElementById('user-pagination-info');
        if (pageInfo) pageInfo.innerText = 'Showing 0 users';
        const prevBtn = document.getElementById('user-prev-btn');
        const nextBtn = document.getElementById('user-next-btn');
        if (prevBtn && nextBtn) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.5';
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.5';
        }
    }
}

// Show User details inside premium Leaf-Themed Modal
function showUserDetails(user) {
    const modal = document.getElementById('user-modal');
    if (!modal) return;
    
    // Set text values
    document.getElementById('user-modal-fullname').innerText = `${user.firstName} ${user.lastName}`;
    document.getElementById('user-modal-email').innerText = user.email;
    document.getElementById('user-modal-joined').innerText = new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    
    if (user.lastLogin) {
        document.getElementById('user-modal-lastlogin').innerText = new Date(user.lastLogin).toLocaleString();
    } else {
        document.getElementById('user-modal-lastlogin').innerText = 'Never';
    }
    
    // Avatar Initials vs Image
    const initialsDiv = document.getElementById('user-modal-avatar-initials');
    const avatarImg = document.getElementById('user-modal-avatar-img');
    if (user.avatar?.url) {
        avatarImg.src = formatImageUrl(user.avatar.url);
        avatarImg.style.display = 'block';
        initialsDiv.style.display = 'none';
    } else {
        initialsDiv.innerText = `${user.firstName ? user.firstName[0].toUpperCase() : 'T'}${user.lastName ? user.lastName[0].toUpperCase() : 'A'}`;
        initialsDiv.style.display = 'flex';
        avatarImg.style.display = 'none';
    }
    
    // Role selection
    const roleSelect = document.getElementById('user-modal-role');
    if (roleSelect) {
        roleSelect.value = user.role;
        // Bind unique role select listener
        roleSelect.onchange = async () => {
            const newRole = roleSelect.value;
            try {
                const res = await fetch(`${API_BASE_URL}/admin/users/${user._id}/role`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ role: newRole })
                });
                if (res.ok) {
                    alert('User role updated successfully!');
                    loadUsers();
                } else {
                    roleSelect.value = user.role;
                    const r = await res.json();
                    alert(r.message || 'Failed to update user role.');
                }
            } catch (err) {
                roleSelect.value = user.role;
                alert('Server error. Failed to update role.');
            }
        };
    }
    
    // Status Switcher
    const statusCheckbox = document.getElementById('user-modal-status-toggle');
    const statusLabel = document.getElementById('user-modal-status-label');
    if (statusCheckbox && statusLabel) {
        statusCheckbox.checked = user.isActive;
        statusLabel.innerText = user.isActive ? 'Active' : 'Inactive';
        
        statusCheckbox.onchange = async () => {
            const newActive = statusCheckbox.checked;
            statusLabel.innerText = newActive ? 'Active' : 'Inactive';
            try {
                const res = await fetch(`${API_BASE_URL}/admin/users/${user._id}/status`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (res.ok) {
                    loadUsers();
                } else {
                    statusCheckbox.checked = !newActive;
                    statusLabel.innerText = !newActive ? 'Active' : 'Inactive';
                    const r = await res.json();
                    alert(r.message || 'Failed to update user status.');
                }
            } catch (err) {
                statusCheckbox.checked = !newActive;
                statusLabel.innerText = !newActive ? 'Active' : 'Inactive';
                alert('Server error. Failed to update status.');
            }
        };
    }
    
    // Verification pills badging
    const emailBadge = document.getElementById('user-modal-badge-email');
    if (user.isEmailVerified) {
        emailBadge.className = 'badge active';
        emailBadge.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 6px;"></i> Email Verified';
    } else {
        emailBadge.className = 'badge inactive';
        emailBadge.innerHTML = '<i class="fas fa-times-circle" style="margin-right: 6px;"></i> Email Unverified';
    }
    
    const phoneBadge = document.getElementById('user-modal-badge-phone');
    if (user.isPhoneVerified) {
        phoneBadge.className = 'badge active';
        phoneBadge.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 6px;"></i> Phone Verified';
    } else {
        phoneBadge.className = 'badge inactive';
        phoneBadge.innerHTML = '<i class="fas fa-times-circle" style="margin-right: 6px;"></i> Phone Unverified';
    }
    
    // Wishlist size
    document.getElementById('user-modal-wishlist-count').innerText = user.wishlist?.length || 0;
    
    // Addresses list rendering
    const addrContainer = document.getElementById('user-modal-addresses-list');
    addrContainer.innerHTML = '';
    if (user.addresses && user.addresses.length > 0) {
        user.addresses.forEach(addr => {
            addrContainer.innerHTML += `
                <div class="address-card">
                    <div class="address-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span class="address-card-label" style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--gold); background: var(--gold-light); padding: 2px 6px; border-radius: 4px;">${addr.label || 'Home'}</span>
                        ${addr.isDefault ? `<span class="address-card-default" style="font-size: 0.65rem; font-weight: 600; color: var(--primary); background: var(--primary-light); padding: 2px 6px; border-radius: 4px;">Default</span>` : ''}
                    </div>
                    <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 4px; color: var(--text-main);">${addr.fullName}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">Phone: ${addr.phone}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.35;">
                        ${addr.addressLine1}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}<br>
                        ${addr.city}, ${addr.state} - ${addr.pincode}
                    </div>
                </div>
            `;
        });
    } else {
        addrContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 24px; font-size: 0.85rem; background: var(--background); border-radius: var(--radius-md); border: 1px dashed var(--border);">
                <i class="fas fa-map-marked-alt" style="margin-bottom: 8px; font-size: 1.25rem; color: var(--text-muted);"></i>
                <div>No saved shipping addresses found.</div>
            </div>
        `;
    }
    
    // Dynamic Registered History Timeline generator
    const timelineContainer = document.getElementById('user-modal-timeline');
    const timelineHTML = [];
    
    // Step 1: Account Created
    timelineHTML.push(`
        <div class="timeline-step active">
            <div class="timeline-content">
                <span class="timeline-title"><i class="fas fa-seedling text-success" style="margin-right: 6px;"></i> Account Created</span>
                <span class="timeline-time">${new Date(user.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
        </div>
    `);
    
    // Step 2: Email status
    if (user.isEmailVerified) {
        timelineHTML.push(`
            <div class="timeline-step active">
                <div class="timeline-content">
                    <span class="timeline-title"><i class="fas fa-envelope-open text-primary" style="margin-right: 6px;"></i> Email Verified</span>
                    <span class="timeline-time">Identity confirmed successfully</span>
                </div>
            </div>
        `);
    } else {
        timelineHTML.push(`
            <div class="timeline-step">
                <div class="timeline-content">
                    <span class="timeline-title"><i class="fas fa-envelope text-muted" style="margin-right: 6px;"></i> Email Verification Pending</span>
                    <span class="timeline-time">Awaiting user to click verification email</span>
                </div>
            </div>
        `);
    }
    
    // Step 3: Address setup status
    if (user.addresses && user.addresses.length > 0) {
        timelineHTML.push(`
            <div class="timeline-step active">
                <div class="timeline-content">
                    <span class="timeline-title"><i class="fas fa-map text-warning" style="margin-right: 6px;"></i> Address Book Setup Complete</span>
                    <span class="timeline-time">Saved ${user.addresses.length} delivery location(s)</span>
                </div>
            </div>
        `);
    }
    
    // Step 4: Last Active/Login status
    if (user.lastLogin) {
        timelineHTML.push(`
            <div class="timeline-step active">
                <div class="timeline-content">
                    <span class="timeline-title"><i class="fas fa-sign-in-alt text-primary" style="margin-right: 6px;"></i> Last Active Session</span>
                    <span class="timeline-time">${new Date(user.lastLogin).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
            </div>
        `);
    }
    
    timelineContainer.innerHTML = timelineHTML.join('');
    
    // Open Modal
    modal.classList.remove('hidden');
}

// Modal closing setup
const userModal = document.getElementById('user-modal');
const closeUserModal = document.getElementById('close-user-modal');
if (userModal && closeUserModal) {
    closeUserModal.onclick = () => userModal.classList.add('hidden');
    userModal.onclick = (e) => {
        if (e.target === userModal) userModal.classList.add('hidden');
    };
    // Bind Escape key press
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !userModal.classList.contains('hidden')) {
            userModal.classList.add('hidden');
        }
    });
}

// Load Products
async function loadProducts() {
    const data = await fetchApi('/admin/products');
    
    if (data && data.data && Array.isArray(data.data)) {
        productsData = data.data;
        
        // Compute and update stats
        const total = productsData.length;
        const lowStock = productsData.filter(p => p.stock < 15).length;
        const depleted = productsData.filter(p => p.stock === 0).length;
        
        const ratedProducts = productsData.filter(p => p.averageRating && p.averageRating > 0);
        const avgRating = ratedProducts.length > 0
            ? (ratedProducts.reduce((sum, p) => sum + p.averageRating, 0) / ratedProducts.length).toFixed(1)
            : '0.0';
            
        document.getElementById('prod-stat-total').innerText = total;
        document.getElementById('prod-stat-low').innerText = lowStock;
        document.getElementById('prod-stat-depleted').innerText = depleted;
        document.getElementById('prod-stat-rating').innerText = avgRating;
        
        // Load Category pills dynamically
        await renderCategoryPills();
        
        // Initial filter and render
        filterAndRenderProducts();
    }
}

// Render dynamic category selector bar
async function renderCategoryPills() {
    const catContainer = document.getElementById('category-filter-bar');
    if (!catContainer) return;
    
    let categories = [{ _id: 'all', name: 'All Formulations' }];
    try {
        const data = await fetchApi('/categories');
        if (data && data.data && Array.isArray(data.data)) {
            data.data.forEach(cat => {
                categories.push({ _id: cat._id, name: cat.name });
            });
        }
    } catch (err) {
        console.error("Failed to load backend categories, aggregating from products list as fallback.");
    }
    
    // Aggregation fallback: check if we only have 'All Formulations', then build from items list
    if (categories.length === 1 && productsData.length > 0) {
        const uniqueCats = new Map();
        productsData.forEach(p => {
            if (p.category) {
                const catId = typeof p.category === 'object' ? p.category._id : p.category;
                const catName = typeof p.category === 'object' ? p.category.name : p.category;
                if (catId && catName) uniqueCats.set(catId, catName);
            }
        });
        uniqueCats.forEach((name, id) => {
            categories.push({ _id: id, name: name });
        });
    }
    
    catContainer.innerHTML = '';
    categories.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = `category-pill ${activeCategory === cat._id ? 'active' : ''}`;
        pill.innerText = cat.name;
        pill.setAttribute('data-id', cat._id);
        
        pill.addEventListener('click', () => {
            activeCategory = cat._id;
            document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            filterAndRenderProducts();
        });
        
        catContainer.appendChild(pill);
    });
}

// Global filter controller
function filterAndRenderProducts() {
    let filtered = productsData;
    
    // Category Filter
    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => {
            const catId = typeof p.category === 'object' ? p.category._id : p.category;
            return catId === activeCategory;
        });
    }
    
    // Search Query Filter
    if (productSearchQuery) {
        const q = productSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(p => {
            const name = p.name ? p.name.toLowerCase() : '';
            const sku = p.sku ? p.sku.toLowerCase() : '';
            const desc = p.description ? p.description.toLowerCase() : '';
            return name.includes(q) || sku.includes(q) || desc.includes(q);
        });
    }
    
    renderGridShowroom(filtered);
    renderListTable(filtered);
}

// Render dynamic glassmorphic card deck showroom
function renderGridShowroom(products) {
    const gridView = document.getElementById('products-grid-view');
    if (!gridView) return;
    
    gridView.innerHTML = '';
    
    if (products.length === 0) {
        gridView.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: rgba(255,255,255,0.5); border-radius: var(--radius-lg); border: 1px solid var(--border); color: var(--text-muted);">
                <i class="fas fa-box-open" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 12px; opacity: 0.5;"></i>
                <div style="font-weight: 600; font-family:'Outfit'; font-size:1.1rem; color: var(--text-main);">No Formulations Found</div>
                <div style="font-size: 0.85rem; margin-top: 4px;">Try selecting another category or refining your search term.</div>
            </div>
        `;
        return;
    }
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'ayush-product-card';
        
        // Stock Status classification
        let stockClass = 'in-stock';
        let stockLabel = 'In Stock';
        if (product.stock === 0) {
            stockClass = 'depleted';
            stockLabel = 'Depleted';
        } else if (product.stock < 15) {
            stockClass = 'low-stock';
            stockLabel = 'Low Stock';
        }
        
        // Stock capacity tracker calculation (max capacity is 1000)
        const capPct = Math.min((product.stock / 1000) * 100, 100);
        
        // Star ratings rendering
        const ratingVal = product.averageRating || 0;
        const ratingCount = product.ratingCount || 0;
        const roundedRating = Math.round(ratingVal);
        const ratingStars = ratingVal > 0 
            ? `<div class="stars-gold">${'<i class="fas fa-star"></i>'.repeat(roundedRating)}${'<i class="far fa-star"></i>'.repeat(5 - roundedRating)}</div>
               <span class="rating-text">${ratingVal}</span>
               <span class="rating-count">(${ratingCount})</span>`
            : `<span style="color: var(--text-muted);">No reviews</span>`;
            
        // Category Label
        const catName = product.category && typeof product.category === 'object' 
            ? product.category.name 
            : (product.category || 'Ayurveda');
            
        const imageUrl = product.images && product.images[0] ? formatImageUrl(product.images[0].url) : 'https://via.placeholder.com/320?text=Triven+Ayurveda';
        
        card.innerHTML = `
            <div class="card-image-wrapper">
                <span class="card-category-badge">${catName}</span>
                <span class="card-stock-badge ${stockClass}">
                    <span class="stock-health-gauge ${stockClass}"></span> ${stockLabel}
                </span>
                <img src="${imageUrl}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/320?text=Triven+Ayurveda'">
                <div class="card-action-overlay">
                    <button class="floating-action-btn edit edit-card-btn" title="Edit Formulation"><i class="fas fa-edit"></i></button>
                    <button class="floating-action-btn delete delete-card-btn" title="Delete Formulation"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            
            <div class="card-details">
                <div class="card-title-row">
                    <h3 class="card-title">${product.name}</h3>
                </div>
                <div class="card-sku">SKU: ${product.sku || 'N/A'}</div>
                <div class="card-description">${product.description || 'Premium authentic Ayurvedic formulation prepared with traditional methods...'}</div>
                
                <div class="card-rating-row">
                    ${ratingStars}
                </div>
                
                <div class="card-stock-capacity-container">
                    <div class="stock-capacity-label-row">
                        <span>Current Stock</span>
                        <span>${product.stock} / 1000 Units</span>
                    </div>
                    <div class="stock-capacity-track">
                        <div class="stock-capacity-bar ${stockClass}" style="width: ${capPct}%"></div>
                    </div>
                </div>
                
                <div class="card-footer">
                    <div class="card-price">₹${product.price}</div>
                    <div>
                        <label class="toggle-switch toggle-card-status" data-id="${product._id}" title="Toggle Availability Status">
                            <input type="checkbox" ${product.isActive ? 'checked' : ''}>
                            <span class="toggle-track"></span>
                            <span class="toggle-label" style="font-size:0.75rem; font-weight:600;">${product.isActive ? 'Active' : 'Draft'}</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
        
        // Hook Card Interactions
        card.querySelector('.edit-card-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openProductModal(product);
        });
        
        card.querySelector('.delete-card-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            triggerProductDeletion(product._id, product.name);
        });
        
        card.querySelector('.toggle-card-status input').addEventListener('change', async (e) => {
            const isActive = e.target.checked;
            const container = e.target.closest('.toggle-card-status');
            const labelSpan = container.querySelector('.toggle-label');
            labelSpan.innerText = isActive ? 'Active' : 'Draft';
            
            const fd = new FormData();
            fd.append('isActive', String(isActive));
            try {
                const res = await fetch(`${API_BASE_URL}/products/${product._id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd
                });
                if (res.ok) {
                    product.isActive = isActive;
                    // Refresh metrics and tables
                    loadProducts();
                    loadDashboardData();
                } else {
                    e.target.checked = !isActive;
                    labelSpan.innerText = !isActive ? 'Active' : 'Draft';
                    const r = await res.json();
                    alert(r.message || 'Failed to update status.');
                }
            } catch (err) {
                e.target.checked = !isActive;
                labelSpan.innerText = !isActive ? 'Active' : 'Draft';
                alert('Server error. Failed to update status.');
            }
        });
        
        gridView.appendChild(card);
    });
}

// Render classic detailed list table
function renderListTable(products) {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    <i class="fas fa-box-open" style="font-size: 1.8rem; margin-bottom: 8px; opacity: 0.5;"></i>
                    <div style="font-weight: 500;">No Formulations Found</div>
                </td>
            </tr>
        `;
        return;
    }
    
    products.forEach(product => {
        const tr = document.createElement('tr');
        const ratingDisplay = product.averageRating && product.averageRating > 0 
            ? `<span style="color:#f59e0b; font-size:0.85rem;" title="${product.averageRating}/5 (${product.ratingCount || 0} reviews)">${'<i class="fas fa-star"></i>'.repeat(Math.round(product.averageRating))}${'<i class="far fa-star"></i>'.repeat(5 - Math.round(product.averageRating))} ${product.averageRating}</span>`
            : '<span style="color:var(--text-muted); font-size:0.85rem;">No rating</span>';
            
        tr.innerHTML = `
            <td><img src="${product.images && product.images[0] ? formatImageUrl(product.images[0].url) : 'https://via.placeholder.com/48'}" class="img-thumb" onerror="this.src='https://via.placeholder.com/48'"></td>
            <td>
                <div style="font-weight: 600; color: var(--text-main); font-family: 'Outfit';">${product.name}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted)">SKU: ${product.sku || 'N/A'}</div>
            </td>
            <td style="font-weight: 600; color: var(--primary);">₹${product.price}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight: 600;">${product.stock}</span>
                    <span style="width:6px; height:6px; border-radius:50%; display:inline-block; background:${product.stock === 0 ? '#e53e3e' : product.stock < 15 ? '#dd6b20' : '#38a169'}"></span>
                </div>
            </td>
            <td>${ratingDisplay}</td>
            <td>
                <label class="toggle-switch toggle-status-btn" data-id="${product._id}" title="Toggle Availability Status">
                    <input type="checkbox" ${product.isActive ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                    <span class="toggle-label">${product.isActive ? 'Active' : 'Draft'}</span>
                </label>
            </td>
            <td>
                <button class="action-btn edit-product-btn" title="Edit Product"><i class="fas fa-edit"></i></button>
                <button class="action-btn text-danger delete-product-btn" title="Delete Product"><i class="fas fa-trash"></i></button>
            </td>
        `;

        tr.querySelector('.edit-product-btn').addEventListener('click', () => openProductModal(product));
        tr.querySelector('.delete-product-btn').addEventListener('click', () => triggerProductDeletion(product._id, product.name));

        tr.querySelector('.toggle-status-btn input').addEventListener('change', async (e) => {
            const isActive = e.target.checked;
            const container = e.target.closest('.toggle-status-btn');
            const labelSpan = container.querySelector('.toggle-label');
            labelSpan.innerText = isActive ? 'Active' : 'Draft';
            
            const fd = new FormData();
            fd.append('isActive', String(isActive));
            try {
                const res = await fetch(`${API_BASE_URL}/products/${product._id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd
                });
                if (res.ok) {
                    product.isActive = isActive;
                    loadProducts();
                    loadDashboardData();
                } else {
                    e.target.checked = !isActive;
                    labelSpan.innerText = !isActive ? 'Active' : 'Draft';
                    const r = await res.json();
                    alert(r.message || 'Failed to update status.');
                }
            } catch (err) {
                e.target.checked = !isActive;
                labelSpan.innerText = !isActive ? 'Active' : 'Draft';
                alert('Server error. Failed to update status.');
            }
        });

        tbody.appendChild(tr);
    });
}

// Global Product Delete Trigger Handler
async function triggerProductDeletion(productId, productName) {
    if (!confirm(`Delete "${productName}"? This action is permanent and cannot be undone.`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/products/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadProducts();
            loadDashboardData();
        } else {
            const r = await res.json();
            alert(r.message || 'Failed to delete product.');
        }
    } catch (err) {
        alert('Server error. Failed to delete product.');
    }
}

// Load Orders
async function loadOrders() {
    const data = await fetchApi('/admin/orders');
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = '';
    
    if (data && data.data && Array.isArray(data.data)) {
        data.data.forEach(order => {
            const statusClass = order.status === 'delivered' ? 'delivered' : order.status === 'cancelled' ? 'cancelled' : 'pending';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong style="color: var(--primary)">#${order.orderNumber || order._id.substring(18)}</strong></td>
                <td>
                    <div style="font-weight: 500">${order.user ? order.user.firstName + ' ' + order.user.lastName : 'Guest'}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted)">${order.shippingAddress?.city || 'N/A'}, ${order.shippingAddress?.state || ''}</div>
                </td>
                <td>₹${order.totalAmount}</td>
                <td><span class="badge ${statusClass}">${order.status}</span></td>
                <td>${new Date(order.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="action-btn view-order-btn" title="View Details"><i class="fas fa-eye"></i></button>
                    <button class="action-btn" title="Update Status"><i class="fas fa-truck"></i></button>
                </td>
            `;
            
            const viewBtn = tr.querySelector('.view-order-btn');
            viewBtn.addEventListener('click', () => showOrderDetails(order));
            
            tbody.appendChild(tr);
        });
    }
}

// Order Modal Logic
const orderModal = document.getElementById('order-modal');
const closeOrderModal = document.getElementById('close-order-modal');

if (closeOrderModal && orderModal) {
    closeOrderModal.addEventListener('click', () => orderModal.classList.add('hidden'));
    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) orderModal.classList.add('hidden');
    });
}

function showOrderDetails(order) {
    document.getElementById('modal-order-number').innerText = `#${order.orderNumber || order._id.substring(18)}`;
    
    // Cancellation Reason Banner
    const cancelContainer = document.getElementById('modal-cancellation-reason-container');
    const cancelReasonSpan = document.getElementById('modal-cancellation-reason');
    if (order.status === 'cancelled') {
        const cancelHistory = order.statusHistory?.find(h => h.status === 'cancelled');
        cancelReasonSpan.innerText = cancelHistory?.note || 'No reason provided.';
        cancelContainer.style.display = 'block';
    } else {
        cancelContainer.style.display = 'none';
    }

    // Customer
    document.getElementById('modal-customer-name').innerText = order.user ? `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim() : 'Guest';
    document.getElementById('modal-customer-email').innerText = order.user?.email || 'N/A';
    document.getElementById('modal-customer-phone').innerText = order.user?.phone || 'N/A';

    // Shipping
    const shipName = order.shippingAddress?.fullName || order.user?.firstName || '';
    const shipPhone = order.shippingAddress?.phone || order.user?.phone || '';
    document.getElementById('modal-shipping-name-phone').innerText = order.shippingAddress ? `${shipName}${shipPhone ? ' - ' + shipPhone : ''}` : 'N/A';
    document.getElementById('modal-shipping-line1').innerText = order.shippingAddress?.addressLine1 || '';
    document.getElementById('modal-shipping-line2').innerText = order.shippingAddress?.addressLine2 || '';
    document.getElementById('modal-shipping-city-state').innerText = order.shippingAddress ? `${order.shippingAddress.city || ''}, ${order.shippingAddress.state || ''} - ${order.shippingAddress.pincode || ''}` : '';

    // Items
    const itemsBody = document.getElementById('modal-items-body');
    itemsBody.innerHTML = '';
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
            itemsBody.innerHTML += `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <img src="${item.thumbnail ? formatImageUrl(item.thumbnail) : 'https://via.placeholder.com/40'}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
                            <div style="font-weight: 500">${item.name}</div>
                        </div>
                    </td>
                    <td>${item.quantity}</td>
                    <td>₹${item.price}</td>
                    <td><strong>₹${item.totalPrice}</strong></td>
                </tr>
            `;
        });
    } else {
        itemsBody.innerHTML = '<tr><td colspan="4">No items found.</td></tr>';
    }

    // Totals
    const subtotal = order.subtotal || 0;
    const shipping = order.shippingCharge || 0;
    document.getElementById('modal-subtotal').innerText = `₹${subtotal}`;
    document.getElementById('modal-shipping-charge').innerText = `₹${shipping}`;
    document.getElementById('modal-total-amount').innerText = `₹${subtotal + shipping}`;

    orderModal.classList.remove('hidden');
}

// Product Modal Elements & Logic
const productModal = document.getElementById('product-modal');
const closeProductModal = document.getElementById('close-product-modal');
const addProductBtn = document.getElementById('add-product-btn');
const addProductBtnToolbar = document.getElementById('add-product-btn-toolbar');
const productForm = document.getElementById('product-form');
const productFormError = document.getElementById('product-form-error');
const prodCategorySelect = document.getElementById('prod-category');
const imagePreviewContainer = document.getElementById('image-preview-container');
const prodImagesInput = document.getElementById('prod-images');

let editingProductId = null;

async function openProductModal(product = null) {
    editingProductId = product ? product._id : null;
    
    // Set title and reset fields
    const modalTitle = document.getElementById('product-modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = product 
            ? `<i class="fas fa-edit text-primary"></i> <span>Edit Formulation</span>`
            : `<i class="fas fa-leaf text-primary"></i> <span>Add New Formulation</span>`;
    }
    
    productForm.reset();
    productFormError.innerText = '';
    selectedImages = [];
    imagePreviewContainer.innerHTML = '';

    prodCategorySelect.innerHTML = '<option value="">Loading categories...</option>';
    try {
        const data = await fetchApi('/categories');
        if (data && data.data && Array.isArray(data.data)) {
            prodCategorySelect.innerHTML = '<option value="">Select a category</option>';
            data.data.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat._id;
                opt.innerText = cat.name;
                prodCategorySelect.appendChild(opt);
            });
        } else {
            prodCategorySelect.innerHTML = '<option value="">Failed to load categories</option>';
        }
    } catch (err) {
        prodCategorySelect.innerHTML = '<option value="">Failed to load categories</option>';
    }

    if (product) {
        document.getElementById('prod-name').value = product.name || '';
        document.getElementById('prod-desc').value = product.description || '';
        document.getElementById('prod-price').value = product.price || '';
        document.getElementById('prod-stock').value = product.stock || 0;
        document.getElementById('prod-sku').value = product.sku || '';
        document.getElementById('prod-rating').value = product.averageRating || 0;
        document.getElementById('prod-review-count').value = product.ratingCount || 0;
        document.getElementById('prod-featured').checked = product.isFeatured || false;
        
        if (product.category) {
            const catId = typeof product.category === 'object' ? product.category._id : product.category;
            prodCategorySelect.value = catId;
        }
        
        // Render existing images at the bottom of the container
        if (product.images && product.images.length > 0) {
            const label = document.createElement('div');
            label.className = 'existing-images-header';
            label.style.gridColumn = '1 / -1';
            label.style.fontSize = '0.78rem';
            label.style.fontWeight = '600';
            label.style.color = 'var(--text-muted)';
            label.style.marginTop = '8px';
            label.style.marginBottom = '2px';
            label.innerText = 'Current Formulation Images:';
            imagePreviewContainer.appendChild(label);
            
            product.images.forEach(img => {
                const pCard = document.createElement('div');
                pCard.className = 'image-preview-card';
                pCard.style.border = '1px solid rgba(212, 175, 55, 0.2)';
                pCard.innerHTML = `<img src="${formatImageUrl(img.url)}" onerror="this.src='https://via.placeholder.com/60'">`;
                imagePreviewContainer.appendChild(pCard);
            });
        }
    }

    productModal.classList.remove('hidden');
}

// Render current newly selected images
function renderSelectedImagesPreviews() {
    // Keep existing images headers, clear new previews
    const newPreviews = imagePreviewContainer.querySelectorAll('.new-preview-card');
    newPreviews.forEach(el => el.remove());
    
    selectedImages.forEach((file, index) => {
        const pCard = document.createElement('div');
        pCard.className = 'image-preview-card new-preview-card';
        
        const fileUrl = URL.createObjectURL(file);
        pCard.innerHTML = `
            <img src="${fileUrl}">
            <button type="button" class="image-preview-remove" data-index="${index}" title="Remove image">&times;</button>
        `;
        
        pCard.querySelector('.image-preview-remove').addEventListener('click', (e) => {
            e.preventDefault();
            selectedImages.splice(index, 1);
            renderSelectedImagesPreviews();
        });
        
        // Insert before any existing images label if present, or just append
        const existingLabel = imagePreviewContainer.querySelector('.existing-images-header');
        if (existingLabel) {
            imagePreviewContainer.insertBefore(pCard, existingLabel);
        } else {
            imagePreviewContainer.appendChild(pCard);
        }
    });
}

// Bind listeners
if (productModal && closeProductModal && productForm) {
    const triggerModal = () => openProductModal();
    
    if (addProductBtn) addProductBtn.addEventListener('click', triggerModal);
    if (addProductBtnToolbar) addProductBtnToolbar.addEventListener('click', triggerModal);

    closeProductModal.addEventListener('click', () => productModal.classList.add('hidden'));
    productModal.addEventListener('click', (e) => {
        if (e.target === productModal) productModal.classList.add('hidden');
    });
    
    // Handle image file selection
    if (prodImagesInput) {
        prodImagesInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                if (selectedImages.length < 10) {
                    selectedImages.push(file);
                }
            });
            renderSelectedImagesPreviews();
            // Clear input so same file can be selected again
            prodImagesInput.value = '';
        });
    }

    // Submit handler
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        productFormError.innerText = '';

        const category = document.getElementById('prod-category').value;
        if (!category) {
            productFormError.innerText = 'Please select a category.';
            return;
        }

        const formData = new FormData();
        formData.append('name', document.getElementById('prod-name').value);
        formData.append('description', document.getElementById('prod-desc').value);
        formData.append('price', document.getElementById('prod-price').value);
        formData.append('stock', document.getElementById('prod-stock').value);
        formData.append('category', category);
        const sku = document.getElementById('prod-sku').value;
        if (sku) formData.append('sku', sku);
        formData.append('averageRating', document.getElementById('prod-rating').value);
        formData.append('ratingCount', document.getElementById('prod-review-count').value);
        formData.append('isFeatured', document.getElementById('prod-featured').checked);
        
        // Append all selected images from arrays instead of raw input files
        selectedImages.forEach(file => {
            formData.append('images', file);
        });

        const saveButton = productForm.querySelector('button[type="submit"]');
        saveButton.innerText = 'Saving...';
        saveButton.disabled = true;

        try {
            const url = editingProductId ? `${API_BASE_URL}/products/${editingProductId}` : `${API_BASE_URL}/products`;
            const method = editingProductId ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await res.json();
            if (res.ok) {
                productModal.classList.add('hidden');
                alert(editingProductId ? 'Herbal formulation updated successfully!' : 'Herbal formulation saved successfully!');
                loadProducts();
                loadDashboardData();
            } else {
                productFormError.innerText = result.message || 'Failed to save formulation.';
            }
        } catch (err) {
            productFormError.innerText = 'Server error. Failed to save formulation.';
        } finally {
            saveButton.innerText = 'Save Formulation';
            saveButton.disabled = false;
        }
    });
}

// Bind products section search, filters and view toggles
const productSearchInput = document.getElementById('product-search');
if (productSearchInput) {
    let searchTimeout;
    productSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            productSearchQuery = e.target.value;
            filterAndRenderProducts();
        }, 200);
    });
}

// Bind view switching buttons
const viewToggleButtons = document.querySelectorAll('.view-toggle-btn');
const productsContainer = document.getElementById('products-container');

if (viewToggleButtons.length > 0 && productsContainer) {
    viewToggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            viewToggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const selectedView = btn.getAttribute('data-view');
            activeView = selectedView;
            
            if (selectedView === 'grid') {
                productsContainer.className = 'view-grid';
            } else {
                productsContainer.className = 'view-list';
            }
        });
    });
}

// Bind Category pill horizontal scroll nav arrows
const catNavPrev = document.getElementById('cat-nav-prev');
const catNavNext = document.getElementById('cat-nav-next');
const catFilterBar = document.getElementById('category-filter-bar');

if (catNavPrev && catNavNext && catFilterBar) {
    catNavPrev.addEventListener('click', () => {
        catFilterBar.scrollBy({ left: -200, behavior: 'smooth' });
    });
    catNavNext.addEventListener('click', () => {
        catFilterBar.scrollBy({ left: 200, behavior: 'smooth' });
    });
}

// User section input listeners
const userSearchInput = document.getElementById('user-search');
const userRoleFilter = document.getElementById('user-role-filter');
const userPrevBtn = document.getElementById('user-prev-btn');
const userNextBtn = document.getElementById('user-next-btn');

if (userSearchInput && userRoleFilter && userPrevBtn && userNextBtn) {
    let searchTimeout;
    userSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            userSearchVal = e.target.value;
            userCurrentPage = 1;
            loadUsers();
        }, 300);
    });

    userRoleFilter.addEventListener('change', (e) => {
        userRoleVal = e.target.value;
        userCurrentPage = 1;
        loadUsers();
    });

    userPrevBtn.addEventListener('click', () => {
        if (userCurrentPage > 1) {
            userCurrentPage--;
            loadUsers();
        }
    });

    userNextBtn.addEventListener('click', () => {
        userCurrentPage++;
        loadUsers();
    });
}

// Mobile Sidebar Responsive Controls
const mobileToggle = document.getElementById('mobile-toggle');
const mobileOverlay = document.getElementById('mobile-overlay');
const sidebar = document.querySelector('.sidebar');

function toggleSidebar() {
    if (sidebar && mobileOverlay) {
        sidebar.classList.toggle('open');
        mobileOverlay.classList.toggle('active');
    }
}

if (mobileToggle && mobileOverlay) {
    mobileToggle.addEventListener('click', toggleSidebar);
    mobileOverlay.addEventListener('click', toggleSidebar);
}

// Start app
init();
