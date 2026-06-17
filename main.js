let map = null;
let clusterer = null;

const placemarksByKey = new Map();
const itemsByKey = new Map();

const yandexKeyInput = document.getElementById("yandexKey");
const statusFilterInput = document.getElementById("statusFilter");
const customStatusFilterInput = document.getElementById("customStatusFilter");
const markFilterInput = document.getElementById("markFilter");
const jsonInput = document.getElementById("jsonInput");
const loadBtn = document.getElementById("loadBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const clearJsonBtn = document.getElementById("clearJsonBtn");
const clearMarksBtn = document.getElementById("clearMarksBtn");
const exportMemoryBtn = document.getElementById("exportMemoryBtn");
const importMemoryBtn = document.getElementById("importMemoryBtn");
const importMemoryInput = document.getElementById("importMemoryInput");
const statusBox = document.getElementById("status");

const GEOCODE_CACHE_KEY = "inventory_f2c_yandex_geocode_cache_github_pages_v1";
const LAST_JSON_KEY = "inventory_f2c_last_json_v1";
const LAST_YANDEX_KEY = "inventory_f2c_last_yandex_key_v1";
const LAST_MARK_FILTER_KEY = "inventory_f2c_last_mark_filter_v1";
const INVENTORY_MARKS_KEY = "inventory_f2c_user_marks_v1";
const INVENTORY_COMMENTS_KEY = "inventory_f2c_user_comments_v1";

window.addEventListener("DOMContentLoaded", () => {
  jsonInput.value = localStorage.getItem(LAST_JSON_KEY) || "";
  yandexKeyInput.value = localStorage.getItem(LAST_YANDEX_KEY) || "";

  const savedMarkFilter = localStorage.getItem(LAST_MARK_FILTER_KEY);

  if (savedMarkFilter !== null) {
    markFilterInput.value = savedMarkFilter;
  }
});

loadBtn.addEventListener("click", loadInventoryMap);

clearCacheBtn.addEventListener("click", () => {
  localStorage.removeItem(GEOCODE_CACHE_KEY);
  setStatus("Кэш координат очищен.");
});

clearJsonBtn.addEventListener("click", () => {
  jsonInput.value = "";
  localStorage.removeItem(LAST_JSON_KEY);
  setStatus("JSON очищен.");
});

clearMarksBtn.addEventListener("click", () => {
  const confirmed = confirm("Точно сбросить все твои цветные пометки и скрытые адреса? Комментарии останутся.");

  if (!confirmed) {
    return;
  }

  localStorage.removeItem(INVENTORY_MARKS_KEY);
  setStatus("Все мои цветные пометки сброшены. Комментарии не удалялись.");

  refreshAllVisibleMarkers();

  if (jsonInput.value.trim()) {
    updateStatusAfterQuickChange("Пометки сброшены.");
  }
});

markFilterInput.addEventListener("change", () => {
  localStorage.setItem(LAST_MARK_FILTER_KEY, markFilterInput.value);

  if (jsonInput.value.trim()) {
    loadInventoryMap();
  }
});

exportMemoryBtn.addEventListener("click", exportMemoryToJson);

importMemoryBtn.addEventListener("click", () => {
  importMemoryInput.click();
});

importMemoryInput.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  importMemoryFromJsonFile(file);
  importMemoryInput.value = "";
});

function setStatus(text) {
  statusBox.textContent = text;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJsString(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function makeSafeDomId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function loadJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function saveJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadCache() {
  return loadJsonStorage(GEOCODE_CACHE_KEY);
}

function saveCache(cache) {
  saveJsonStorage(GEOCODE_CACHE_KEY, cache);
}

function loadMarks() {
  return loadJsonStorage(INVENTORY_MARKS_KEY);
}

function saveMarks(marks) {
  saveJsonStorage(INVENTORY_MARKS_KEY, marks);
}

function loadComments() {
  return loadJsonStorage(INVENTORY_COMMENTS_KEY);
}

function saveComments(comments) {
  saveJsonStorage(INVENTORY_COMMENTS_KEY, comments);
}

function getInventoryKey(item) {
  if (item.id) {
    return String(item.id);
  }

  if (item.inventoryNumber) {
    return `number:${item.inventoryNumber}`;
  }

  return `address:${item.address}`;
}

function getInventoryMark(item) {
  const marks = loadMarks();
  const key = getInventoryKey(item);

  return marks[key] || "";
}

function getInventoryComment(item) {
  const comments = loadComments();
  const key = getInventoryKey(item);

  return comments[key] || "";
}

function getMarkName(mark) {
  const names = {
    green: "Зелёная",
    darkGreen: "Тёмно-зелёная",
    yellow: "Жёлтая",
    orange: "Оранжевая",
    red: "Красная",
    blue: "Синяя",
    darkBlue: "Тёмно-синяя",
    violet: "Фиолетовая",
    pink: "Розовая",
    brown: "Коричневая",
    gray: "Серая",
    black: "Чёрная",
    hidden: "Скрыта"
  };

  return names[mark] || "Без пометки";
}

function getMarkPreset(mark) {
  const presets = {
    green: "islands#greenDotIcon",
    darkGreen: "islands#darkGreenDotIcon",
    yellow: "islands#yellowDotIcon",
    orange: "islands#orangeDotIcon",
    red: "islands#redDotIcon",
    blue: "islands#blueDotIcon",
    darkBlue: "islands#darkBlueDotIcon",
    violet: "islands#violetDotIcon",
    pink: "islands#pinkDotIcon",
    brown: "islands#brownDotIcon",
    gray: "islands#grayDotIcon",
    black: "islands#blackDotIcon",
    hidden: "islands#blackDotIcon"
  };

  return presets[mark] || "";
}

function filterInventoriesByMark(inventories, markFilter) {
  if (markFilter === "") {
    return inventories;
  }

  if (markFilter === "active") {
    return inventories.filter(item => getInventoryMark(item) !== "hidden");
  }

  if (markFilter === "unmarked") {
    return inventories.filter(item => !getInventoryMark(item));
  }

  return inventories.filter(item => getInventoryMark(item) === markFilter);
}

function makeMarkStats(inventories) {
  const stats = {
    unmarked: 0,
    green: 0,
    darkGreen: 0,
    yellow: 0,
    orange: 0,
    red: 0,
    blue: 0,
    darkBlue: 0,
    violet: 0,
    pink: 0,
    brown: 0,
    gray: 0,
    black: 0,
    hidden: 0
  };

  for (const item of inventories) {
    const mark = getInventoryMark(item);

    if (mark && stats[mark] !== undefined) {
      stats[mark] += 1;
    } else {
      stats.unmarked += 1;
    }
  }

  return [
    `без пометки: ${stats.unmarked}`,
    `зелёные: ${stats.green}`,
    `тёмно-зелёные: ${stats.darkGreen}`,
    `жёлтые: ${stats.yellow}`,
    `оранжевые: ${stats.orange}`,
    `красные: ${stats.red}`,
    `синие: ${stats.blue}`,
    `тёмно-синие: ${stats.darkBlue}`,
    `фиолетовые: ${stats.violet}`,
    `розовые: ${stats.pink}`,
    `коричневые: ${stats.brown}`,
    `серые: ${stats.gray}`,
    `чёрные: ${stats.black}`,
    `скрытые: ${stats.hidden}`
  ].join("\n");
}

window.setInventoryMark = function setInventoryMark(key, mark) {
  const item = itemsByKey.get(key);
  const marks = loadMarks();

  marks[key] = mark;
  saveMarks(marks);

  updateSingleMarkerAfterUserDataChange(key);

  if (item) {
    setStatus(`Пометка сохранена: ${getMarkName(mark)}\n${item.address}`);
  } else {
    setStatus(`Пометка сохранена: ${getMarkName(mark)}`);
  }
};

window.resetInventoryMark = function resetInventoryMark(key) {
  const item = itemsByKey.get(key);
  const marks = loadMarks();

  delete marks[key];
  saveMarks(marks);

  updateSingleMarkerAfterUserDataChange(key);

  if (item) {
    setStatus(`Пометка сброшена.\n${item.address}`);
  } else {
    setStatus("Пометка сброшена.");
  }
};

window.saveInventoryComment = function saveInventoryComment(key) {
  const comments = loadComments();
  const commentInput = document.getElementById(`comment_${makeSafeDomId(key)}`);

  if (!commentInput) {
    setStatus("Не нашёл поле комментария в открытой карточке.");
    return;
  }

  const value = commentInput.value.trim();

  if (value) {
    comments[key] = value;
  } else {
    delete comments[key];
  }

  saveComments(comments);
  updateSingleMarkerAfterUserDataChange(key);

  setStatus("Комментарий сохранён.");
};

window.deleteInventoryComment = function deleteInventoryComment(key) {
  const comments = loadComments();
  const commentInput = document.getElementById(`comment_${makeSafeDomId(key)}`);

  delete comments[key];
  saveComments(comments);

  if (commentInput) {
    commentInput.value = "";
  }

  updateSingleMarkerAfterUserDataChange(key);

  setStatus("Комментарий удалён.");
};

function getSelectedStatus() {
  const customStatus = customStatusFilterInput.value.trim();

  if (customStatus) {
    return customStatus;
  }

  return statusFilterInput.value.trim();
}

async function loadYandexMaps(apiKey) {
  if (window.ymaps) {
    return new Promise(resolve => window.ymaps.ready(resolve));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;

    script.onload = () => {
      window.ymaps.ready(resolve);
    };

    script.onerror = () => {
      reject(
        new Error(
          "Не удалось загрузить Яндекс.Карты. Проверь API-ключ и ограничения по домену GitHub Pages."
        )
      );
    };

    document.head.appendChild(script);
  });
}

function parseJsonFromTextarea() {
  const raw = jsonInput.value.trim();

  if (!raw) {
    throw new Error("Вставь JSON-ответ из DevTools запроса /api/inventories.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("JSON не парсится. Проверь, что вставлен именно Response, а не Headers/Preview текстом.");
  }
}

function findArrayWithAddresses(value) {
  if (Array.isArray(value)) {
    const hasAddresses = value.some(item => {
      return item && typeof item === "object" && typeof item.address === "string";
    });

    if (hasAddresses) {
      return value;
    }
  }

  if (value && typeof value === "object") {
    const directKeys = [
      "inventories",
      "data",
      "items",
      "rows",
      "result",
      "results",
      "list"
    ];

    for (const key of directKeys) {
      if (Array.isArray(value[key])) {
        const found = findArrayWithAddresses(value[key]);

        if (found) {
          return found;
        }
      }
    }

    for (const key of Object.keys(value)) {
      const found = findArrayWithAddresses(value[key]);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractInventories(apiData) {
  const rows = findArrayWithAddresses(apiData);

  if (!rows) {
    throw new Error("В JSON не найден массив объектов с полем address.");
  }

  return rows
    .filter(item => item && typeof item === "object")
    .map(item => ({
      id: item.id ?? "",
      inventoryNumber: item.inventoryNumber ?? "",
      name: item.name ?? "",
      address: item.address ?? "",
      organizationName: item.organizationName ?? "",
      administratorName: item.administratorName ?? "",
      assigneeName: item.assigneeName ?? "",
      secondAssigneeName: item.secondAssigneeName ?? "",
      curatorName: item.curatorName ?? "",
      opergroupName: item.opergroupName ?? "",
      plannedWorkDate: item.plannedWorkDate ?? "",
      completedWorkDate: item.completedWorkDate ?? "",
      status: item.status ?? "",
      equipmentTotal: item.equipmentTotal ?? "",
      equipmentAccepted: item.equipmentAccepted ?? "",
      equipmentRejected: item.equipmentRejected ?? "",
      equipmentProcessed: item.equipmentProcessed ?? "",
      equipmentPendingReview: item.equipmentPendingReview ?? "",
      requiresLadder: item.requiresLadder ?? false,
      facadePhotoUrl: item.facadePhotoUrl ?? "",
      lat: item.lat ?? item.latitude ?? item.geoLat ?? item.coords?.lat ?? null,
      lon: item.lon ?? item.lng ?? item.longitude ?? item.geoLon ?? item.coords?.lon ?? item.coords?.lng ?? null,
      raw: item
    }))
    .filter(item => item.address);
}

function filterInventoriesByStatus(inventories, selectedStatus) {
  if (!selectedStatus) {
    return inventories;
  }

  return inventories.filter(item => item.status === selectedStatus);
}

function cleanAddressText(address) {
  return String(address || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();
}

function removeAdministrativeParts(address) {
  let value = cleanAddressText(address);

  value = value.replace(/^[^,]*административный округ,\s*/i, "");
  value = value.replace(/муниципальный округ [^,]+,\s*/gi, "");
  value = value.replace(/город Москва/gi, "Москва");
  value = value.replace(/г\.?\s*Москва/gi, "Москва");
  value = value.replace(/\s+/g, " ");
  value = value.replace(/\s+,/g, ",");
  value = value.replace(/,\s*,/g, ",");
  value = value.trim();

  if (!/Москва/i.test(value)) {
    value = `Москва, ${value}`;
  }

  return value;
}

function extractAddressParts(address) {
  const cleaned = removeAdministrativeParts(address);
  const chunks = cleaned
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  let street = "";
  let house = "";
  let corpus = "";
  let building = "";

  const streetWords = [
    "улица",
    "проспект",
    "бульвар",
    "переулок",
    "проезд",
    "шоссе",
    "набережная",
    "площадь",
    "аллея",
    "тупик",
    "линия"
  ];

  for (const chunk of chunks) {
    const lower = chunk.toLowerCase();

    if (streetWords.some(word => lower.includes(word))) {
      street = chunk;
    }

    const houseMatch = chunk.match(/дом\s*([0-9]+[0-9А-Яа-яA-Za-z/-]*)/i);
    if (houseMatch) {
      house = houseMatch[1];
    }

    const corpusMatch = chunk.match(/корпус\s*([0-9]+[0-9А-Яа-яA-Za-z/-]*)/i);
    if (corpusMatch) {
      corpus = corpusMatch[1];
    }

    const buildingMatch = chunk.match(/строение\s*([0-9]+[0-9А-Яа-яA-Za-z/-]*)/i);
    if (buildingMatch) {
      building = buildingMatch[1];
    }
  }

  if (!street) {
    const possibleStreet = chunks.find(chunk => {
      const lower = chunk.toLowerCase();

      return (
        !lower.includes("москва") &&
        !lower.startsWith("дом ") &&
        !lower.startsWith("корпус ") &&
        !lower.startsWith("строение ")
      );
    });

    street = possibleStreet || "";
  }

  let houseText = house;

  if (corpus) {
    houseText += ` корпус ${corpus}`;
  }

  if (building) {
    houseText += ` строение ${building}`;
  }

  return {
    original: cleanAddressText(address),
    cleaned,
    street,
    house,
    corpus,
    building,
    houseText
  };
}

function buildYandexGeocodeQueries(address) {
  const parts = extractAddressParts(address);
  const queries = [];

  function add(query) {
    const cleanQuery = String(query || "")
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",")
      .trim();

    if (cleanQuery && !queries.includes(cleanQuery)) {
      queries.push(cleanQuery);
    }
  }

  if (parts.street && parts.house) {
    add(`Москва, ${parts.street}, дом ${parts.house}`);

    if (parts.corpus) {
      add(`Москва, ${parts.street}, дом ${parts.house}, корпус ${parts.corpus}`);
      add(`Москва, ${parts.street}, ${parts.house}к${parts.corpus}`);
      add(`Москва, ${parts.street}, ${parts.house} к ${parts.corpus}`);
    }

    if (parts.building) {
      add(`Москва, ${parts.street}, дом ${parts.house}, строение ${parts.building}`);
      add(`Москва, ${parts.street}, ${parts.house}с${parts.building}`);
      add(`Москва, ${parts.street}, ${parts.house} стр ${parts.building}`);
    }
  }

  add(parts.cleaned);
  add(parts.original);

  return queries;
}

async function geocodeAddress(address, cache) {
  if (cache[address]) {
    return cache[address];
  }

  const queries = buildYandexGeocodeQueries(address);
  const tried = [];

  for (const query of queries) {
    tried.push(query);

    try {
      const result = await window.ymaps.geocode(query, {
        results: 1
      });

      const firstGeoObject = result.geoObjects.get(0);

      if (!firstGeoObject) {
        await sleep(250);
        continue;
      }

      const coords = firstGeoObject.geometry.getCoordinates();

      if (
        Array.isArray(coords) &&
        coords.length === 2 &&
        Number.isFinite(Number(coords[0])) &&
        Number.isFinite(Number(coords[1]))
      ) {
        cache[address] = coords;
        saveCache(cache);

        await sleep(300);
        return coords;
      }
    } catch (error) {
      await sleep(700);

      console.error("YANDEX GEOCODER ERROR:", {
        query,
        error
      });

      const message =
        error?.message ||
        error?.name ||
        String(error);

      tried.push(`ОШИБКА на "${query}": ${message}`);

      continue;
    }
  }

  throw new Error(`Адрес не найден Яндекс-геокодером. Пробовал: ${tried.join(" | ")}`);
}

function initMap() {
  if (map) {
    map.destroy();
  }

  placemarksByKey.clear();

  map = new window.ymaps.Map("map", {
    center: [55.751244, 37.618423],
    zoom: 10,
    controls: [
      "zoomControl",
      "fullscreenControl",
      "typeSelector",
      "searchControl",
      "routeButtonControl"
    ]
  });

  clusterer = new window.ymaps.Clusterer({
    preset: "islands#blueClusterIcons",
    groupByCoordinates: false,
    clusterDisableClickZoom: false,
    clusterOpenBalloonOnClick: true
  });

  map.geoObjects.add(clusterer);
}

function getStatusName(status) {
  const names = {
    opergroup_survey: "Опергруппа",
    primary_survey: "Первичное обследование",
    primary_approval: "Первичное согласование",
    act_signing: "Подписание акта",
    documents_transferred: "Документы переданы",
    document_preparation: "Подготовка документов",
    object_setup: "Настройка объекта",
    paused: "Пауза"
  };

  return names[status] || status || "Без статуса";
}

function getPlacemarkPreset(item) {
  const userMark = getInventoryMark(item);
  const markPreset = getMarkPreset(userMark);

  if (markPreset) {
    return markPreset;
  }

  if (item.status === "opergroup_survey") {
    return "islands#redDotIcon";
  }

  if (item.requiresLadder) {
    return "islands#orangeDotIcon";
  }

  if (item.status === "primary_survey") {
    return "islands#blueDotIcon";
  }

  if (item.status === "documents_transferred") {
    return "islands#greenDotIcon";
  }

  if (item.status === "paused") {
    return "islands#grayDotIcon";
  }

  return "islands#violetDotIcon";
}

function getItemTitle(item) {
  return item.inventoryNumber
    ? `№ ${item.inventoryNumber}`
    : item.name || item.organizationName || item.address;
}

function makeBalloonContent(item) {
  const yandexRouteUrl = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(item.address)}&rtt=auto`;
  const inventoryUrl = item.id
    ? `https://inventory.f2c.ru/cabinet/inventories/${encodeURIComponent(item.id)}`
    : "";

  const key = getInventoryKey(item);
  const safeKey = escapeJsString(key);
  const commentDomId = `comment_${makeSafeDomId(key)}`;
  const currentMark = getInventoryMark(item);
  const currentComment = getInventoryComment(item);

  const photoBlock = item.facadePhotoUrl
    ? `<p><a href="${escapeHtml(item.facadePhotoUrl)}" target="_blank">Фото фасада</a></p>`
    : "";

  const inventoryLinkBlock = inventoryUrl
    ? `<p><a href="${escapeHtml(inventoryUrl)}" target="_blank">Открыть в inventory</a></p>`
    : "";

  return `
    <div class="balloon">
      <h3>${escapeHtml(getItemTitle(item))}</h3>

      ${inventoryLinkBlock}

      <p><b>Моя пометка:</b> ${escapeHtml(getMarkName(currentMark))}</p>

      <div class="balloon-mark-buttons">
        <button class="mark-green" type="button" onclick="setInventoryMark('${safeKey}', 'green')">Зелёный</button>
        <button class="mark-darkGreen" type="button" onclick="setInventoryMark('${safeKey}', 'darkGreen')">Тёмно-зелёный</button>
        <button class="mark-yellow" type="button" onclick="setInventoryMark('${safeKey}', 'yellow')">Жёлтый</button>
        <button class="mark-orange" type="button" onclick="setInventoryMark('${safeKey}', 'orange')">Оранжевый</button>
        <button class="mark-red" type="button" onclick="setInventoryMark('${safeKey}', 'red')">Красный</button>
        <button class="mark-blue" type="button" onclick="setInventoryMark('${safeKey}', 'blue')">Синий</button>
        <button class="mark-darkBlue" type="button" onclick="setInventoryMark('${safeKey}', 'darkBlue')">Тёмно-синий</button>
        <button class="mark-violet" type="button" onclick="setInventoryMark('${safeKey}', 'violet')">Фиолетовый</button>
        <button class="mark-pink" type="button" onclick="setInventoryMark('${safeKey}', 'pink')">Розовый</button>
        <button class="mark-brown" type="button" onclick="setInventoryMark('${safeKey}', 'brown')">Коричневый</button>
        <button class="mark-gray" type="button" onclick="setInventoryMark('${safeKey}', 'gray')">Серый</button>
        <button class="mark-black" type="button" onclick="setInventoryMark('${safeKey}', 'black')">Чёрный</button>
        <button class="mark-hidden" type="button" onclick="setInventoryMark('${safeKey}', 'hidden')">Скрыть</button>
        <button class="mark-reset" type="button" onclick="resetInventoryMark('${safeKey}')">Сбросить</button>
      </div>

      <p><b>Мой комментарий:</b></p>
      <textarea
        id="${escapeHtml(commentDomId)}"
        class="balloon-comment"
        rows="4"
        placeholder="Например: созвониться, проверить доступ, проблемный объект..."
      >${escapeHtml(currentComment)}</textarea>

      <div class="balloon-comment-buttons">
        <button type="button" onclick="saveInventoryComment('${safeKey}')">Сохранить комментарий</button>
        <button type="button" onclick="deleteInventoryComment('${safeKey}')">Удалить</button>
      </div>

      <p><b>Статус:</b> ${escapeHtml(getStatusName(item.status))}</p>
      <p><b>Адрес:</b><br>${escapeHtml(item.address)}</p>
      <p><b>Организация:</b><br>${escapeHtml(item.organizationName)}</p>
      <p><b>Исполнитель:</b><br>${escapeHtml(item.assigneeName)}</p>
      <p><b>Второй исполнитель:</b><br>${escapeHtml(item.secondAssigneeName)}</p>
      <p><b>Опергруппа:</b><br>${escapeHtml(item.opergroupName)}</p>
      <p><b>Администратор:</b><br>${escapeHtml(item.administratorName)}</p>
      <p><b>Куратор:</b><br>${escapeHtml(item.curatorName)}</p>
      <p><b>Плановая дата:</b> ${escapeHtml(item.plannedWorkDate)}</p>
      <p><b>Оборудование всего:</b> ${escapeHtml(item.equipmentTotal)}</p>
      <p><b>Принято:</b> ${escapeHtml(item.equipmentAccepted)}</p>
      <p><b>Отклонено:</b> ${escapeHtml(item.equipmentRejected)}</p>
      <p><b>На проверке:</b> ${escapeHtml(item.equipmentPendingReview)}</p>
      <p><b>Лестница:</b> ${item.requiresLadder ? "нужна" : "не нужна"}</p>
      ${photoBlock}
      <p><a href="${yandexRouteUrl}" target="_blank">Построить маршрут в Яндекс.Картах</a></p>
    </div>
  `;
}

function makeStatusStats(inventories) {
  const stats = {};

  for (const item of inventories) {
    const key = item.status || "empty";
    stats[key] = (stats[key] || 0) + 1;
  }

  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${status}: ${count}`)
    .join("\n");
}

function isItemAllowedByCurrentMarkFilter(item) {
  const selectedMarkFilter = markFilterInput.value;

  return filterInventoriesByMark([item], selectedMarkFilter).length > 0;
}

function updateSingleMarkerAfterUserDataChange(key) {
  const item = itemsByKey.get(key);
  const placemark = placemarksByKey.get(key);

  if (!item || !placemark || !clusterer) {
    return;
  }

  if (!isItemAllowedByCurrentMarkFilter(item)) {
    clusterer.remove(placemark);
    placemarksByKey.delete(key);
    return;
  }

  placemark.options.set("preset", getPlacemarkPreset(item));
  placemark.properties.set("hintContent", `${getItemTitle(item)} — ${getStatusName(item.status)} — ${getMarkName(getInventoryMark(item))}`);
  placemark.properties.set("balloonContent", makeBalloonContent(item));
  placemark.properties.set("clusterCaption", getItemTitle(item));
}

function refreshAllVisibleMarkers() {
  for (const [key] of placemarksByKey) {
    updateSingleMarkerAfterUserDataChange(key);
  }
}

function updateStatusAfterQuickChange(prefix) {
  const allItems = [...itemsByKey.values()];
  const selectedStatus = getSelectedStatus();
  const selectedMarkFilter = markFilterInput.value;
  const statusFilteredInventories = filterInventoriesByStatus(allItems, selectedStatus);
  const filteredInventories = filterInventoriesByMark(statusFilteredInventories, selectedMarkFilter);

  setStatus(
    `${prefix}\n\n` +
    `Всего адресов в памяти: ${allItems.length}\n` +
    `Фильтр status: ${selectedStatus || "Все статусы"}\n` +
    `После status-фильтра: ${statusFilteredInventories.length}\n` +
    `Фильтр пометок: ${selectedMarkFilter || "Все, включая скрытые"}\n` +
    `После фильтра пометок: ${filteredInventories.length}\n\n` +
    `Мои пометки после status-фильтра:\n${makeMarkStats(statusFilteredInventories)}`
  );
}

function exportMemoryToJson() {
  const backup = {
    app: "inventory-map",
    version: 1,
    exportedAt: new Date().toISOString(),
    warning: "Файл может содержать приватные адреса и личные комментарии. Не публикуй его в GitHub.",
    data: {
      marks: loadMarks(),
      comments: loadComments(),
      geocodeCache: loadCache(),
      lastMarkFilter: localStorage.getItem(LAST_MARK_FILTER_KEY) || markFilterInput.value || "active"
    }
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], {
    type: "application/json;charset=utf-8"
  });

  const date = new Date();
  const fileName =
    `inventory-map-memory-${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}.json`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  setStatus("Память выгружена в JSON. Храни файл у себя, он может содержать адреса и комментарии.");
}

function importMemoryFromJsonFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const data = parsed.data || parsed;

      const confirmed = confirm(
        "Загрузить память из JSON?\n\n" +
        "Текущие цвета, комментарии и кэш координат будут заменены данными из файла."
      );

      if (!confirmed) {
        setStatus("Импорт отменён.");
        return;
      }

      if (data.marks && typeof data.marks === "object") {
        saveMarks(data.marks);
      } else {
        localStorage.removeItem(INVENTORY_MARKS_KEY);
      }

      if (data.comments && typeof data.comments === "object") {
        saveComments(data.comments);
      } else {
        localStorage.removeItem(INVENTORY_COMMENTS_KEY);
      }

      if (data.geocodeCache && typeof data.geocodeCache === "object") {
        saveCache(data.geocodeCache);
      }

      if (typeof data.lastMarkFilter === "string") {
        markFilterInput.value = data.lastMarkFilter;
        localStorage.setItem(LAST_MARK_FILTER_KEY, data.lastMarkFilter);
      }

      setStatus("Память импортирована из JSON.");

      if (jsonInput.value.trim()) {
        loadInventoryMap();
      }
    } catch (error) {
      setStatus("Ошибка импорта JSON:\n" + error.message);
    }
  };

  reader.onerror = () => {
    setStatus("Не удалось прочитать файл.");
  };

  reader.readAsText(file, "utf-8");
}

async function loadInventoryMap() {
  try {
    const yandexKey = yandexKeyInput.value.trim();
    const selectedStatus = getSelectedStatus();
    const selectedMarkFilter = markFilterInput.value;

    if (!yandexKey) {
      setStatus("Вставь API-ключ Яндекс.Карт.");
      return;
    }

    localStorage.setItem(LAST_YANDEX_KEY, yandexKey);
    localStorage.setItem(LAST_JSON_KEY, jsonInput.value.trim());
    localStorage.setItem(LAST_MARK_FILTER_KEY, selectedMarkFilter);

    setStatus("Парсю JSON...");
    const apiData = parseJsonFromTextarea();

    setStatus("Загружаю Яндекс.Карты...");
    await loadYandexMaps(yandexKey);

    const allInventories = extractInventories(apiData);

    itemsByKey.clear();

    for (const item of allInventories) {
      itemsByKey.set(getInventoryKey(item), item);
    }

    const statusFilteredInventories = filterInventoriesByStatus(allInventories, selectedStatus);
    const filteredInventories = filterInventoriesByMark(statusFilteredInventories, selectedMarkFilter);

    if (!filteredInventories.length) {
      setStatus(
        `Инвентаризации с такими фильтрами не найдены.\n\n` +
        `Выбранный status: ${selectedStatus || "Все статусы"}\n` +
        `Фильтр пометок: ${selectedMarkFilter || "Все, включая скрытые"}\n\n` +
        `Всего адресов в JSON: ${allInventories.length}\n` +
        `После status-фильтра: ${statusFilteredInventories.length}\n\n` +
        `Статусы в JSON:\n${makeStatusStats(allInventories)}\n\n` +
        `Мои пометки после status-фильтра:\n${makeMarkStats(statusFilteredInventories)}`
      );
      return;
    }

    initMap();

    const cache = loadCache();
    const placemarks = [];
    const failed = [];

    setStatus(
      `Всего адресов в JSON: ${allInventories.length}\n` +
      `Фильтр status: ${selectedStatus || "Все статусы"}\n` +
      `После status-фильтра: ${statusFilteredInventories.length}\n` +
      `Фильтр пометок: ${selectedMarkFilter || "Все, включая скрытые"}\n` +
      `После фильтра пометок: ${filteredInventories.length}\n\n` +
      `Статусы в JSON:\n${makeStatusStats(allInventories)}\n\n` +
      `Мои пометки после status-фильтра:\n${makeMarkStats(statusFilteredInventories)}\n\n` +
      `Начинаю геокодинг через Яндекс...`
    );

    for (let i = 0; i < filteredInventories.length; i++) {
      const item = filteredInventories[i];

      try {
        let coords = null;

        if (item.lat && item.lon) {
          coords = [Number(item.lat), Number(item.lon)];
        } else {
          coords = await geocodeAddress(item.address, cache);
        }

        const key = getInventoryKey(item);
        const placemark = new window.ymaps.Placemark(
          coords,
          {
            hintContent: `${getItemTitle(item)} — ${getStatusName(item.status)} — ${getMarkName(getInventoryMark(item))}`,
            balloonContent: makeBalloonContent(item),
            clusterCaption: getItemTitle(item)
          },
          {
            preset: getPlacemarkPreset(item)
          }
        );

        placemarksByKey.set(key, placemark);
        placemarks.push(placemark);
      } catch (error) {
        failed.push({
          address: item.address,
          reason: error.message
        });
      }

      if ((i + 1) % 3 === 0 || i + 1 === filteredInventories.length) {
        setStatus(
          `Всего адресов в JSON: ${allInventories.length}\n` +
          `Фильтр status: ${selectedStatus || "Все статусы"}\n` +
          `После status-фильтра: ${statusFilteredInventories.length}\n` +
          `Фильтр пометок: ${selectedMarkFilter || "Все, включая скрытые"}\n` +
          `После фильтра пометок: ${filteredInventories.length}\n` +
          `Обработано: ${i + 1}/${filteredInventories.length}\n` +
          `Метки готовы: ${placemarks.length}\n` +
          `Ошибки геокодинга: ${failed.length}`
        );
      }
    }

    clusterer.add(placemarks);

    if (placemarks.length > 0) {
      map.setBounds(clusterer.getBounds(), {
        checkZoomRange: true,
        zoomMargin: 40
      });
    }

    let finalText =
      `Готово.\n` +
      `Всего адресов в JSON: ${allInventories.length}\n` +
      `Фильтр status: ${selectedStatus || "Все статусы"}\n` +
      `После status-фильтра: ${statusFilteredInventories.length}\n` +
      `Фильтр пометок: ${selectedMarkFilter || "Все, включая скрытые"}\n` +
      `После фильтра пометок: ${filteredInventories.length}\n` +
      `Добавлено меток: ${placemarks.length}\n` +
      `Не удалось геокодировать: ${failed.length}\n\n` +
      `Статусы в JSON:\n${makeStatusStats(allInventories)}\n\n` +
      `Мои пометки после status-фильтра:\n${makeMarkStats(statusFilteredInventories)}`;

    if (failed.length) {
      finalText += "\n\nПроблемные адреса:\n";
      finalText += failed
        .slice(0, 80)
        .map(item => `- ${item.address} — ${item.reason}`)
        .join("\n");

      if (failed.length > 80) {
        finalText += `\n...и ещё ${failed.length - 80}`;
      }
    }

    setStatus(finalText);
  } catch (error) {
    setStatus("Ошибка:\n" + error.message);
  }
}