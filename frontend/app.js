const AUTH_URL = 'http://localhost:3000';
const CORE_URL = 'http://localhost:3001';

window.onload = () => {
    if (localStorage.getItem('jwt_token')) {
        showCatalog();
    }
};

function showAlert(message) {
    const alertBox = document.getElementById('alert-box');
    alertBox.textContent = message;
    alertBox.style.display = 'block';
    setTimeout(() => alertBox.style.display = 'none', 5000);
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${AUTH_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.token) {
            localStorage.setItem('jwt_token', data.token);
            showCatalog();
        } else {
            showAlert(data.message || 'Error al iniciar sesión. ¿La cuenta está aprobada?');
        }
    } catch (error) {
        showAlert('Error de conexión con el servicio de autenticación.');
    }
}

function logout() {
    localStorage.removeItem('jwt_token');
    document.getElementById('catalog-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
}

async function showCatalog() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('catalog-section').style.display = 'block';
    
    try {
        const response = await fetch(`${CORE_URL}/catalog/articles`);
        const articles = await response.json();
        
        const grid = document.getElementById('articles-grid');
        grid.innerHTML = '';
        
        articles.forEach(art => {
            grid.innerHTML += `
                <div class="article">
                    <h3>${art.nombre}</h3>
                    <p>Código: ${art.codigo}</p>
                    <p>Precio: $${art.precio}</p>
                    <p>Stock disponible: <b>${art.stock}</b></p>
                    <button onclick="comprar('${art.codigo}')" ${art.stock <= 0 ? 'disabled' : ''}>
                        ${art.stock > 0 ? 'Comprar 1' : 'Sin Stock'}
                    </button>
                </div>
            `;
        });
    } catch (error) {
        showAlert('Error al cargar el catálogo de productos.');
    }
}

async function comprar(codigoArticulo) {
    const token = localStorage.getItem('jwt_token');
    
    try {
        const response = await fetch(`${CORE_URL}/orders`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ cliente: 'Usuario Web', codigoArticulo: codigoArticulo, cantidad: 1 })
        });

        if (response.ok) {
            alert('¡Compra realizada con éxito!');
            showCatalog();
        } else {
            const data = await response.json();
            showAlert('Error en la compra: ' + (data.message || 'Stock insuficiente.'));
            showCatalog();
        }
    } catch (error) {
        showAlert('Error de conexión al procesar el pedido.');
    }
}