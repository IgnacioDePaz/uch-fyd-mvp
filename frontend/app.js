// Controla el registro, el inicio de sesión, el panel de aprobación y las compras.
window.onload = () => {
    const token = localStorage.getItem('jwt_token');
    const role = localStorage.getItem('user_role');
    if (token) {
        role === 'administrador' ? showAdminPanel() : showCatalog();
    }
};

function showAlert(message) {
    const alertBox = document.getElementById('alert-box');
    alertBox.textContent = message;
    alertBox.classList.remove('success');
    alertBox.style.display = 'block';
    setTimeout(() => alertBox.style.display = 'none', 5000);
}

function showSuccess(message) {
    const alertBox = document.getElementById('alert-box');
    alertBox.textContent = message;
    alertBox.classList.add('success');
    alertBox.style.display = 'block';
    setTimeout(() => alertBox.style.display = 'none', 5000);
}

function showRegister() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'block';
}

function showLogin() {
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
}

function showUserHome(user) {
    localStorage.setItem('user_role', user.rol);
    if (user.rol === 'administrador') {
        showAdminPanel();
    } else {
        showCatalog();
    }
}

async function registerUser(event) {
    event.preventDefault();
    const nombre = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
        const response = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password })
        });
        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || data.message || 'No se pudo crear la cuenta.');
            return;
        }

        document.getElementById('email').value = email;
        document.getElementById('register-password').value = '';
        showLogin();
        showSuccess('Cuenta creada. Debe ser aprobada por un administrador antes de iniciar sesión.');
    } catch (error) {
        showAlert('Error de conexión al crear la cuenta.');
    }
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok && data.token && data.user) {
            localStorage.setItem('jwt_token', data.token);
            showUserHome(data.user);
        } else {
            showAlert(data.error || data.message || 'Error al iniciar sesión.');
        }
    } catch (error) {
        showAlert('Error de conexión con el servicio de autenticación.');
    }
}

function logout() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_role');
    document.getElementById('catalog-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
}

async function showCatalog() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('catalog-section').style.display = 'block';

    try {
        const response = await fetch('/catalog/articles');
        const data = await response.json();
        if (!response.ok) {
            showAlert(data.error || 'Error al cargar el catálogo de productos.');
            return;
        }

        const grid = document.getElementById('articles-grid');
        grid.innerHTML = '';

        data.articles.forEach(art => {
            grid.innerHTML += `
                <div class="article">
                    <h3>${art.nombre}</h3>
                    <p>Código: ${art.codigo}</p>
                    <p>Precio: $${art.precioUnitario}</p>
                    <p>Stock disponible: <b>${art.stockDisponible}</b></p>
                    <button onclick="comprar('${art.codigo}')" ${art.stockDisponible <= 0 ? 'disabled' : ''}>
                        ${art.stockDisponible > 0 ? 'Comprar 1' : 'Sin Stock'}
                    </button>
                </div>
            `;
        });
    } catch (error) {
        showAlert('Error al cargar el catálogo de productos.');
    }
}

async function showAdminPanel() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('catalog-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'block';
    await loadPendingUsers();
}

async function loadPendingUsers() {
    const grid = document.getElementById('pending-users');
    const emptyMessage = document.getElementById('no-pending-users');
    grid.replaceChildren();
    emptyMessage.style.display = 'none';

    try {
        const response = await fetch('/admin/users/pending', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` }
        });
        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'No se pudieron cargar las cuentas pendientes.');
            return;
        }

        if (data.users.length === 0) {
            emptyMessage.style.display = 'block';
            return;
        }

        data.users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'article';

            const name = document.createElement('h3');
            name.textContent = user.nombre;
            const email = document.createElement('p');
            email.textContent = user.email;
            const approveButton = document.createElement('button');
            approveButton.textContent = 'Aprobar usuario';
            approveButton.addEventListener('click', () => approveUser(user.id));

            card.append(name, email, approveButton);
            grid.append(card);
        });
    } catch (error) {
        showAlert('Error de conexión al cargar las cuentas pendientes.');
    }
}

async function approveUser(userId) {
    try {
        const response = await fetch(`/admin/users/${encodeURIComponent(userId)}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` }
        });
        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'No se pudo aprobar el usuario.');
            return;
        }

        showSuccess(`Cuenta de ${data.email} aprobada.`);
        await loadPendingUsers();
    } catch (error) {
        showAlert('Error de conexión al aprobar el usuario.');
    }
}

async function comprar(codigoArticulo) {
    const token = localStorage.getItem('jwt_token');

    try {
        const response = await fetch('/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ cliente: 'Usuario Web', codigoArticulo, cantidad: 1 })
        });

        if (response.ok) {
            alert('¡Compra realizada con éxito!');
            showCatalog();
        } else {
            const data = await response.json();
            showAlert('Error en la compra: ' + (data.error || data.message || 'Stock insuficiente.'));
            showCatalog();
        }
    } catch (error) {
        showAlert('Error de conexión al procesar el pedido.');
    }
}
