let map = null;
let clusterer = null;

const yandexKeyInput = document.getElementById("yandexKey");
const statusFilterInput = document.getElementById("statusFilter");
const customStatusFilterInput = document.getElementById("customStatusFilter");
const jsonInput = document.getElementById("jsonInput");
const loadBtn = document.getElementById("loadBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const clearJsonBtn = document.getElementById("clearJsonBtn");
const statusBox = document.getElementById("status");

const GEOCODE_CACHE_KEY = "inventory_f2c_yandex_geocode_cache_github_pages_v1";
const LAST_JSON_KEY = "inventory_f2c_last_json_v1";
const LAST_YANDEX_KEY = "inventory_f2c_last_yandex_key_v1";

window.addEventListener("DOMContentLoaded", () => {
  jsonInput.value = localStorage.getItem(LAST_JSON_KEY) || "";
  yandexKeyInput.value = localStorage.getItem(LAST_YANDEX_KEY) || "";
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

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cache) {
  localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

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

function makeBalloonContent(item) {
  const yandexRouteUrl = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(item.address)}&rtt=auto`;

  const photoBlock = item.facadePhotoUrl
    ? `<p><a href="${escapeHtml(item.facadePhotoUrl)}" target="_blank">Фото фасада</a></p>`
    : "";

  return `
    <div class="balloon">
      <h3>${escapeHtml(item.inventoryNumber ? `№ ${item.inventoryNumber}` : item.name)}</h3>
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

async function loadInventoryMap() {
  try {
    const yandexKey = yandexKeyInput.value.trim();
    const selectedStatus = getSelectedStatus();

    if (!yandexKey) {
      setStatus("Вставь API-ключ Яндекс.Карт.");
      return;
    }

    localStorage.setItem(LAST_YANDEX_KEY, yandexKey);
    localStorage.setItem(LAST_JSON_KEY, jsonInput.value.trim());

    setStatus("Парсю JSON...");
    const apiData = parseJsonFromTextarea();

    setStatus("Загружаю Яндекс.Карты...");
    await loadYandexMaps(yandexKey);

    const allInventories = extractInventories(apiData);
    const filteredInventories = filterInventoriesByStatus(allInventories, selectedStatus);

    if (!filteredInventories.length) {
      setStatus(
        `Инвентаризации с таким статусом не найдены.\n\n` +
        `Выбранный статус: ${selectedStatus || "Все статусы"}\n\n` +
        `Всего адресов в JSON: ${allInventories.length}\n\n` +
        `Статусы в JSON:\n${makeStatusStats(allInventories)}`
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
      `После фильтра: ${filteredInventories.length}\n\n` +
      `Статусы в JSON:\n${makeStatusStats(allInventories)}\n\n` +
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

        const title = item.inventoryNumber
          ? `№ ${item.inventoryNumber}`
          : item.name || item.organizationName || item.address;

        const placemark = new window.ymaps.Placemark(
          coords,
          {
            hintContent: `${title} — ${getStatusName(item.status)}`,
            balloonContent: makeBalloonContent(item),
            clusterCaption: title
          },
          {
            preset: getPlacemarkPreset(item)
          }
        );

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
          `После фильтра: ${filteredInventories.length}\n` +
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
      `После фильтра: ${filteredInventories.length}\n` +
      `Добавлено меток: ${placemarks.length}\n` +
      `Не удалось геокодировать: ${failed.length}\n\n` +
      `Статусы в JSON:\n${makeStatusStats(allInventories)}`;

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