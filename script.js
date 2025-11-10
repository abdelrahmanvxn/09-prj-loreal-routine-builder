// Detect Arabic text for RTL support
function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}
// ======= POPULATE CATEGORY DROPDOWN =======
async function populateCategoryDropdown() {
  const products = await loadProducts();
  const categories = Array.from(new Set(products.map((p) => p.category)))
    .filter(Boolean)
    .sort();
  categoryFilter.innerHTML =
    '<option value="">Select Category</option>' +
    categories
      .map(
        (cat) =>
          `<option value="${cat}">${
            cat.charAt(0).toUpperCase() + cat.slice(1)
          }</option>`
      )
      .join("");
}

window.addEventListener("DOMContentLoaded", async () => {
  await populateCategoryDropdown();
  // ...existing code for restoring selected products...
  // (rest of this event listener remains unchanged)
});
// ===========================
// L'Oréal Routine Builder Chatbot
// ===========================

// Replace with your actual Cloudflare Worker endpoint URL
const CLOUDFLARE_WORKER_URL = "https://wanderbot-worker.boudyaziz3.workers.dev";

// ======= DOM ELEMENTS =======
const generateRoutineBtn = document.getElementById("generateRoutine");
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");

// ======= STATE =======
let selectedProducts = [];
// ======= LOCAL STORAGE KEYS =======
const SELECTED_PRODUCTS_KEY = "selectedProducts";

// ======= SHARED HELPER FUNCTION =======
// Shared function for rendering markdown (headers, bold, italics, lists, links, line breaks)
function renderMarkdown(md) {
  if (!md) return "";
  let html = md;

  // Headers (## and ### only)
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");

  // Bold **text** or __text__
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>");

  // Italic *text* or _text_ (not inside bold)
  html = html
    .replace(/\*(?!\*)([^*]+)\*/g, "<em>$1</em>")
    .replace(/_(?!_)([^_]+)_/g, "<em>$1</em>");

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links [text](url)
  html = html.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank">$1</a>'
  );

  // Unordered lists (block-level, avoid extra spacing)
  html = html.replace(/(?:^|\n)((?:[\*\-] .*(?:\n|$))+)/g, function (match) {
    const items = match
      .trim()
      .split(/\n/)
      .map((line) => line.replace(/^[\*\-] /, "").trim())
      .filter(Boolean);
    if (items.length > 0 && items[0] !== match.trim()) {
      return "<ul>" + items.map((i) => `<li>${i}</li>`).join("") + "</ul>";
    }
    return match;
  });

  // Ordered lists — only match blocks that start with 1. for correct numbering
  html = html.replace(/(^|\n)(1\.\s.+(?:\n\d+\.\s.+)*)/g, (_, pre, block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((line) => {
        const match = line.match(/^(\d+)\.\s+(.+)/);
        if (!match) return "";
        const [, num, text] = match;
        return `<li value="${num}">${text.trim()}</li>`;
      })
      .filter(Boolean)
      .join("");
    return `${pre}<ol class="markdown-ol">${items}</ol>`;
  });

  // Line breaks (but not after block elements)
  html = html.replace(/([^>])\n/g, "$1<br>");

  // Remove <br> right after </ul>, </ol>, </h2>, </h3>
  html = html.replace(/(<\/(ul|ol|h2|h3)>)(<br>)+/g, "$1");

  return html;
}

// ======= MEMORY FOR AI CONTEXT & CHAT HISTORY =======
let lastAIResponse = null;
let chatHistory = [];

function renderChatHistory() {
  chatWindow.innerHTML = chatHistory
    .map((msg) => {
      const rtl = isArabic(msg.content) ? "rtl-text" : "";
      if (msg.role === "user") {
        return `<div class="chat-bubble user-bubble ${rtl}">${renderMarkdown(
          msg.content
        )}</div>`;
      } else if (msg.role === "assistant") {
        return `<div class="chat-bubble ai-bubble ${rtl}">${renderMarkdown(
          msg.content
        )}</div>`;
      } else {
        return `<div class="chat-bubble system-bubble ${rtl}">${renderMarkdown(
          msg.content
        )}</div>`;
      }
    })
    .join("");
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
// ======= LOAD PRODUCTS =======
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

// ======= DISPLAY PRODUCTS =======
// ======= DISPLAY PRODUCTS =======
function displayProducts(products) {
  productsContainer.innerHTML = products.length
    ? products
        .map((product, idx) => {
          const isSelected = selectedProducts.some(
            (p) => p.name === product.name
          );
          // Modal markup for description
          const modal = `
            <div class="product-modal" tabindex="-1">
              <div class="product-modal-title">${product.name}</div>
              <div class="product-modal-desc">${product.description}</div>
            </div>
          `;
          return `
            <div class="product-card${
              isSelected ? " selected" : ""
            }" data-product-index="${idx}" tabindex="0" style="position:relative;">
              <img src="${product.image}" alt="${product.name}">
              <div class="product-info">
                <h3>${product.name}</h3>
                <p>${product.brand}</p>
              </div>
              ${modal}
            </div>
          `;
        })
        .join("")
    : `<div class="placeholder-message">No products found.</div>`;

  // Add click handler for selection
  const productCards = document.querySelectorAll(".product-card");
  productCards.forEach((card, idx) => {
    card.addEventListener("click", () => {
      handleProductSelect(products[idx]);
      card.classList.toggle("selected");
    });
    // Accessibility: show modal on focus, hide on blur
    card.addEventListener("focus", () => {
      const modal = card.querySelector(".product-modal");
      if (modal) modal.style.opacity = "1";
    });
    card.addEventListener("blur", () => {
      const modal = card.querySelector(".product-modal");
      if (modal) modal.style.opacity = "";
    });
  });
}

// ======= FILTER PRODUCTS (CATEGORY + SEARCH) =======
let allProductsCache = null;
async function filterAndDisplayProducts() {
  if (!allProductsCache) allProductsCache = await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.trim().toLowerCase();
  // Only show products if a category is selected or search is not empty
  if (!selectedCategory && !searchTerm) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or search to view products
      </div>
    `;
    return;
  }
  let filtered = allProductsCache;
  if (selectedCategory) {
    filtered = filtered.filter(
      (product) => product.category === selectedCategory
    );
  }
  // If search is empty, only show products if a category is selected
  if (!searchTerm) {
    displayProducts(filtered);
    return;
  }
  // If search is not empty, filter by search term (within selected category if set)
  filtered = filtered.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm) ||
      (product.brand && product.brand.toLowerCase().includes(searchTerm)) ||
      (product.description &&
        product.description.toLowerCase().includes(searchTerm))
  );
  displayProducts(filtered);
}

// ======= HANDLE PRODUCT SELECTION =======
function handleProductSelect(product) {
  const exists = selectedProducts.some((p) => p.name === product.name);
  if (exists) {
    // Remove if already selected
    selectedProducts = selectedProducts.filter((p) => p.name !== product.name);
  } else {
    selectedProducts.push(product);
  }
  // Save to localStorage
  localStorage.setItem(SELECTED_PRODUCTS_KEY, JSON.stringify(selectedProducts));
  updateSelectedProductsList();
}

// ======= UPDATE SELECTED PRODUCTS =======
function updateSelectedProductsList() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = "<p>No products selected yet.</p>";
    return;
  }

  // Add a clear-all button
  let html = `<button id="clearAllSelected" class="clear-all-btn">Clear All</button>`;
  html += selectedProducts
    .map(
      (product, idx) => `
        <div class="selected-product-item" style="min-width:120px;max-width:160px;word-break:break-word;white-space:normal;">
          <img src="${product.image}" alt="${product.name}">
          <span style="font-size:1em;line-height:1.2;word-break:break-word;white-space:normal;">${product.name}</span>
          <button class="remove-selected-btn" data-index="${idx}" title="Remove">&times;</button>
        </div>
      `
    )
    .join("");
  selectedProductsList.innerHTML = html;

  // Add event listeners for remove buttons
  const removeBtns = selectedProductsList.querySelectorAll(
    ".remove-selected-btn"
  );
  removeBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(btn.getAttribute("data-index"));
      selectedProducts.splice(idx, 1);
      localStorage.setItem(
        SELECTED_PRODUCTS_KEY,
        JSON.stringify(selectedProducts)
      );
      updateSelectedProductsList();
      // Also update product cards selection state
      const selectedCategory = categoryFilter.value;
      if (selectedCategory) {
        loadProducts().then((allProducts) => {
          const filteredProducts = allProducts.filter(
            (product) => product.category === selectedCategory
          );
          displayProducts(filteredProducts);
        });
      }
    });
  });

  // Add event listener for clear-all button
  const clearAllBtn = selectedProductsList.querySelector("#clearAllSelected");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      selectedProducts = [];
      localStorage.removeItem(SELECTED_PRODUCTS_KEY);
      updateSelectedProductsList();
      // Also update product cards selection state
      const selectedCategory = categoryFilter.value;
      if (selectedCategory) {
        loadProducts().then((allProducts) => {
          const filteredProducts = allProducts.filter(
            (product) => product.category === selectedCategory
          );
          displayProducts(filteredProducts);
        });
      }
    });
  }
  // ======= CSS for remove and clear-all buttons (add to style.css if not present) =======
  // .remove-selected-btn { margin-left: 8px; background: #f44336; color: #fff; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 1.1em; }
  // .remove-selected-btn:hover { background: #d32f2f; }
  // .clear-all-btn { margin-bottom: 10px; background: #888; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 0.95em; float: right; }
  // .clear-all-btn:hover { background: #555; }
}

// ======= LOAD SELECTED PRODUCTS FROM LOCALSTORAGE ON PAGE LOAD =======
window.addEventListener("DOMContentLoaded", async () => {
  // Try to load selected products from localStorage
  const stored = localStorage.getItem(SELECTED_PRODUCTS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // We need to reload the full product info from products.json to get images, etc.
        const allProducts = await loadProducts();
        // Match by name and brand to restore full product objects
        selectedProducts = parsed
          .map((sp) => {
            return (
              allProducts.find(
                (p) => p.name === sp.name && p.brand === sp.brand
              ) || sp
            );
          })
          .filter(Boolean);
        updateSelectedProductsList();
        // If a category is already selected, re-render product cards with selection
        const selectedCategory = categoryFilter.value;
        if (selectedCategory) {
          const filteredProducts = allProducts.filter(
            (product) => product.category === selectedCategory
          );
          displayProducts(filteredProducts);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
});

// ======= CATEGORY FILTER =======
// ======= CATEGORY FILTER =======
categoryFilter.addEventListener("change", filterAndDisplayProducts);

// ======= PRODUCT SEARCH FILTER =======
productSearch.addEventListener("input", filterAndDisplayProducts);

// ======= GENERATE ROUTINE =======
generateRoutineBtn.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    chatHistory.push({
      role: "system",
      content: "Please select at least one product to generate a routine.",
    });
    renderChatHistory();
    return;
  }

  chatHistory.push({
    role: "system",
    content: "Generating your routine... ✨",
  });
  renderChatHistory();

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant for L'Oréal and its brands (including CeraVe, Vichy, La Roche-Posay, Garnier, Kiehl's, Lancôme, Maybelline, Urban Decay, Yves Saint Laurent, Redken, Kérastase, SkinCeuticals, and others). Only answer questions about beauty products and routines from these brands. Do not answer unrelated questions.",
      },
      {
        role: "user",
        content: `Here are my selected products: ${selectedProducts
          .map((p) => `${p.name} (${p.brand})`)
          .join(", ")}. Please build a routine using these.`,
      },
    ];

    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();
    // Remove the last system message ("Generating your routine... ✨")
    chatHistory = chatHistory.filter(
      (msg, i, arr) => !(msg.role === "system" && i === arr.length - 1)
    );
    if (data?.choices?.[0]?.message?.content) {
      const markdown = data.choices[0].message.content;
      chatHistory.push({ role: "assistant", content: markdown });
      lastAIResponse = markdown;
    } else {
      chatHistory.push({
        role: "system",
        content: "Sorry, I couldn't generate a routine. Please try again.",
      });
      lastAIResponse = null;
    }
    renderChatHistory();
  } catch (err) {
    chatWindow.innerHTML = `<div class='placeholder-message'>Error: ${
      err.message || err
    }</div>`;
  }
});

// ======= CHAT FORM =======
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userInput = document.getElementById("userInput").value.trim();
  if (!userInput) return;

  // Add user message to chat history and render
  chatHistory.push({ role: "user", content: userInput });
  renderChatHistory();
  // Add loading message
  chatHistory.push({ role: "system", content: "Thinking... 💬" });
  renderChatHistory();

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant for L'Oréal and its brands (including CeraVe, Vichy, La Roche-Posay, Garnier, Kiehl's, Lancôme, Maybelline, Urban Decay, Yves Saint Laurent, Redken, Kérastase, SkinCeuticals, and others). Only answer questions about L'Oréal beauty products and routines.",
      },
    ];
    if (lastAIResponse) {
      messages.push({ role: "assistant", content: lastAIResponse });
    }
    messages.push({ role: "user", content: userInput });

    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();
    // Remove the last system message ("Thinking... 💬")
    chatHistory = chatHistory.filter(
      (msg, i, arr) =>
        !(
          msg.role === "system" &&
          msg.content.includes("Thinking") &&
          i === arr.length - 1
        )
    );
    if (data?.choices?.[0]?.message?.content) {
      const markdown = data.choices[0].message.content;
      chatHistory.push({ role: "assistant", content: markdown });
      lastAIResponse = markdown;
    } else {
      chatHistory.push({
        role: "system",
        content: "Sorry, I couldn't get a response. Please try again.",
      });
      lastAIResponse = null;
    }
    renderChatHistory();
  } catch (err) {
    chatHistory = chatHistory.filter(
      (msg, i, arr) =>
        !(
          msg.role === "system" &&
          msg.content.includes("Thinking") &&
          i === arr.length - 1
        )
    );
    chatHistory.push({
      role: "system",
      content: "Error: " + (err.message || err),
    });
    lastAIResponse = null;
    renderChatHistory();
  }

  chatForm.reset();
});

// ======= INITIAL STATE =======

// ======= INITIAL STATE =======
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category or search to view products
  </div>
`;
