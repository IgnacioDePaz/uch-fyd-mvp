// Datos de ejemplo. Más adelante los reemplazamos por la respuesta de la API.
const products = [
  { id: 1, name: "Artículo de ejemplo 1", description: "Descripción del artículo.", price: 15000, stock: 8 },
  { id: 2, name: "Artículo de ejemplo 2", description: "Otro artículo de prueba.", price: 22000, stock: 3 },
  { id: 3, name: "Artículo sin stock", description: "Sirve para probar el estado agotado.", price: 9000, stock: 0 }
];

const catalog = document.querySelector("#catalog");
const search = document.querySelector("#search");
const message = document.querySelector("#message");

function renderProducts(items) {
  catalog.innerHTML = items.map(product => `
    <article class="card">
      <h2>${product.name}</h2>
      <p>${product.description}</p>
      <p class="price">Precio: ${product.price.toLocaleString("es-AR")}</p>
      <p class="stock">
        ${product.stock > 0 ? `Stock disponible: ${product.stock}` : "Sin stock"}
      </p>
      <button data-product-id="${product.id}" ${product.stock === 0 ? "disabled" : ""}>
        ${product.stock > 0 ? "Comprar" : "Agotado"}
      </button>
    </article>
  `).join("");
}

search.addEventListener("input", () => {
  const query = search.value.toLowerCase().trim();
  const filtered = products.filter(product =>
    product.name.toLowerCase().includes(query)
  );
  renderProducts(filtered);
});

catalog.addEventListener("click", event => {
  const button = event.target.closest("button[data-product-id]");
  if (!button) return;

  message.textContent =
    "La pantalla funciona con datos de ejemplo; falta conectar la compra a la API.";
});

renderProducts(products);