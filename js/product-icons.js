// ============================================================
// PRODUCT ICONS — auto emoji per product, matched from the
// product name/category. Supports English + Roman Urdu keywords
// since product names in this shop are a mix of both.
// First matching entry wins, so put more specific keywords
// (e.g. "pajero") above generic ones (e.g. "car").
// ============================================================

const PRODUCT_EMOJI_MAP = [
  // ---- Vehicles (specific models first) ----
  { emoji: "🚙", keywords: ["pajero", "prado", "fortuner", "revo", "land cruiser", "landcruiser", "suv", "jeep"] },
  { emoji: "🚗", keywords: ["car", "gari", "gaari", "gaadi"] },
  { emoji: "🚚", keywords: ["truck", "trolley", "trala", "container"] },
  { emoji: "🚌", keywords: ["bus", "coaster"] },
  { emoji: "🏍️", keywords: ["bike", "motorcycle", "motor cycle", "byke"] },
  { emoji: "🚲", keywords: ["cycle", "bicycle"] },
  { emoji: "🚂", keywords: ["train", "rail gari", "railgari"] },
  { emoji: "✈️", keywords: ["plane", "jahaz", "airplane", "aeroplane"] },
  { emoji: "🚁", keywords: ["helicopter", "chopper", "drone"] },
  { emoji: "⛵", keywords: ["boat", "kashti", "ship"] },
  { emoji: "🚀", keywords: ["rocket"] },
  { emoji: "🚜", keywords: ["tractor"] },
  { emoji: "🏎️", keywords: ["race car", "racing car", "sports car"] },

  // ---- Animals ----
  { emoji: "🐪", keywords: ["camel", "oont", "unt", "ount"] },
  { emoji: "🐎", keywords: ["horse", "ghoda", "ghora"] },
  { emoji: "🐘", keywords: ["elephant", "hathi"] },
  { emoji: "🦁", keywords: ["lion", "sher"] },
  { emoji: "🐯", keywords: ["tiger", "chita"] },
  { emoji: "🐶", keywords: ["dog", "kutta", "puppy"] },
  { emoji: "🐱", keywords: ["cat", "billi", "kitten"] },
  { emoji: "🐰", keywords: ["rabbit", "khargosh", "bunny"] },
  { emoji: "🐔", keywords: ["chicken", "murgi", "hen"] },
  { emoji: "🦆", keywords: ["duck", "batakh"] },
  { emoji: "🐄", keywords: ["cow", "gaye", "gai"] },
  { emoji: "🐑", keywords: ["sheep", "bakri", "goat"] },
  { emoji: "🦖", keywords: ["dinosaur", "dino"] },

  // ---- Toys ----
  { emoji: "🤖", keywords: ["robot"] },
  { emoji: "🧸", keywords: ["teddy", "bear", "bhalu"] },
  { emoji: "🪆", keywords: ["doll", "gurya", "putli"] },
  { emoji: "⚽", keywords: ["football", "soccer ball", "ball", "gaind"] },
  { emoji: "🏀", keywords: ["basketball"] },
  { emoji: "🏏", keywords: ["cricket", "bat"] },
  { emoji: "🧱", keywords: ["block", "lego", "blocks"] },
  { emoji: "🧩", keywords: ["puzzle"] },
  { emoji: "🪁", keywords: ["kite", "patang"] },
  { emoji: "🎈", keywords: ["balloon", "gubara"] },
  { emoji: "🎸", keywords: ["guitar"] },
  { emoji: "🥁", keywords: ["drum", "dhol"] },
  { emoji: "🎺", keywords: ["trumpet", "bugle"] },
  { emoji: "🔫", keywords: ["gun toy", "toy gun", "pistol toy"] },
  { emoji: "🗡️", keywords: ["sword", "talwar"] },
  { emoji: "🎮", keywords: ["video game", "controller", "gamepad"] },
  { emoji: "🛞", keywords: ["remote control", "rc car", "remote gari"] },
  { emoji: "🪀", keywords: ["yoyo", "yo-yo"] },
  { emoji: "🎨", keywords: ["colour", "color", "paint set", "crayon"] },

  // ---- Cosmetics ----
  { emoji: "💄", keywords: ["lipstick", "lip stick", "lip gloss", "lip"] },
  { emoji: "💅", keywords: ["nail polish", "nail paint", "nail"] },
  { emoji: "🧼", keywords: ["soap", "sabun"] },
  { emoji: "🧴", keywords: ["perfume", "itr", "attar", "lotion", "cream", "shampoo", "oil", "tail"] },
  { emoji: "🪞", keywords: ["mirror", "aaina"] },
  { emoji: "👁️", keywords: ["kajal", "surma", "eyeliner", "mascara"] },
  { emoji: "💇", keywords: ["hair", "comb", "kanga"] },
  { emoji: "🌸", keywords: ["face powder", "compact powder", "powder"] },
];

/** Match a product's name/category text to the best emoji. */
function getProductEmoji(p) {
  const text = ((p.name || "") + " " + (p.category || "")).toLowerCase();
  for (const entry of PRODUCT_EMOJI_MAP) {
    if (entry.keywords.some((k) => text.includes(k))) return entry.emoji;
  }
  return p.category === "Cosmetics" ? "💄" : "🧸";
}

window.getProductEmoji = getProductEmoji;
