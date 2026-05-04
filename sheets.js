const { google } = require("googleapis");
const questions = require("./questions");

const SHEET_NAME = process.env.SHEET_NAME || "Подписчики - ответы";
const REPEAT_COOLDOWN_DAYS = Number(process.env.REPEAT_COOLDOWN_DAYS || 21);

const headers = [
  "Дата старта",
  "Дата завершения",
  "Статус",
  "Источник / канал",
  "Пользовательские данные",
  "Telegram ID",
  "Username",
  "Имя",
  "Фамилия",
  "Ссылка на пользователя",
  ...questions.map((q) => q.key),
  "Номер телефона бонусной карты Pick me",
  "Все ответы JSON"
];

function columnToLetter(columnNumber) {
  let temp = columnNumber;
  let letter = "";
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

const LAST_COLUMN = columnToLetter(headers.length);

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key || !process.env.GOOGLE_SHEET_ID) {
    throw new Error("Google Sheets env vars are missing");
  }

  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function nowIso() {
  return new Date().toISOString();
}

function escapeFormulaText(value) {
  return String(value || "").replace(/"/g, '""');
}

function userLinkFormula(user) {
  const label = user.username ? `@${user.username}` : `${user.first_name || "Пользователь"} (${user.id})`;
  return `=HYPERLINK("tg://user?id=${user.id}"; "${escapeFormulaText(label)}")`;
}

function userDataText(user) {
  return [
    `id: ${user.id}`,
    `username: ${user.username ? `@${user.username}` : "нет"}`,
    `имя: ${user.first_name || ""}`,
    `фамилия: ${user.last_name || ""}`,
    `язык: ${user.language_code || ""}`
  ].join("\n");
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(date, now = new Date()) {
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

async function getSheetIdByTitle(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = meta.data.sheets.find((s) => s.properties.title === title);
  return found ? found.properties.sheetId : null;
}

async function ensureSheet() {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  let sheetId = await getSheetIdByTitle(sheets, spreadsheetId, SHEET_NAME);

  if (sheetId === null) {
    const result = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
      }
    });
    sheetId = result.data.replies[0].addSheet.properties.sheetId;
  }

  const headerRange = `${SHEET_NAME}!1:1`;
  const headerResult = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
  const existingHeaders = headerResult.data.values?.[0] || [];

  if (existingHeaders.length === 0 || existingHeaders.join("|") !== headers.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:${LAST_COLUMN}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] }
    });
  }

  return { sheets, spreadsheetId };
}

async function getRows(sheets, spreadsheetId) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:${LAST_COLUMN}`
  });
  return result.data.values || [];
}

async function findLatestUserAttempt(sheets, spreadsheetId, userId) {
  const rows = await getRows(sheets, spreadsheetId);
  const telegramIdColumnIndex = headers.indexOf("Telegram ID");
  const startColumnIndex = headers.indexOf("Дата старта");
  const completedColumnIndex = headers.indexOf("Дата завершения");
  const statusColumnIndex = headers.indexOf("Статус");

  let latest = null;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (String(row[telegramIdColumnIndex]) !== String(userId)) continue;

    const completedAt = parseDate(row[completedColumnIndex]);
    const startedAt = parseDate(row[startColumnIndex]);
    const relevantDate = completedAt || startedAt;
    if (!relevantDate) continue;

    if (!latest || relevantDate > latest.relevantDate) {
      latest = {
        rowNumber: i + 1,
        row,
        startedAt,
        completedAt,
        relevantDate,
        status: row[statusColumnIndex] || ""
      };
    }
  }

  return latest;
}

async function checkRepeatAllowed(userId) {
  const { sheets, spreadsheetId } = await ensureSheet();
  const latest = await findLatestUserAttempt(sheets, spreadsheetId, userId);

  if (!latest) {
    return { allowed: true };
  }

  const elapsedDays = daysBetween(latest.relevantDate);
  if (elapsedDays < REPEAT_COOLDOWN_DAYS) {
    return {
      allowed: false,
      elapsedDays,
      daysLeft: REPEAT_COOLDOWN_DAYS - elapsedDays,
      lastDate: latest.relevantDate.toISOString(),
      status: latest.status
    };
  }

  return { allowed: true, elapsedDays };
}

function buildRow({ user, source, status, startedAt, completedAt, answers, phone }) {
  const answerValues = questions.map((q) => answers?.[q.key] || "");
  return [
    startedAt || nowIso(),
    completedAt || "",
    status,
    source || "не указан",
    userDataText(user),
    String(user.id),
    user.username ? `@${user.username}` : "",
    user.first_name || "",
    user.last_name || "",
    userLinkFormula(user),
    ...answerValues,
    phone || "",
    JSON.stringify({ source, answers: answers || {}, phone: phone || "" }, null, 2)
  ];
}

async function appendStarted({ user, source, answers = {}, currentStatus = "Начал опрос", phone = "" }) {
  const { sheets, spreadsheetId } = await ensureSheet();
  const row = buildRow({
    user,
    source,
    status: currentStatus,
    startedAt: nowIso(),
    completedAt: "",
    answers,
    phone
  });

  const result = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] }
  });

  const updatedRange = result.data.updates?.updatedRange || "";
  const match = updatedRange.match(/!(?:[A-Z]+)(\d+):/);
  return match ? Number(match[1]) : null;
}

async function updateProgress({ rowNumber, user, source, answers, currentStatus, phone = "", completed = false }) {
  const { sheets, spreadsheetId } = await ensureSheet();
  let targetRow = rowNumber;

  if (!targetRow) {
    const latest = await findLatestUserAttempt(sheets, spreadsheetId, user.id);
    targetRow = latest?.rowNumber || await appendStarted({ user, source, answers, currentStatus, phone });
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A${targetRow}:A${targetRow}`
  });
  const startedAt = existing.data.values?.[0]?.[0] || nowIso();

  const row = buildRow({
    user,
    source,
    status: completed ? "Завершил опрос" : currentStatus,
    startedAt,
    completedAt: completed ? nowIso() : "",
    answers,
    phone
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${targetRow}:${LAST_COLUMN}${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });

  return targetRow;
}

module.exports = {
  ensureSheet,
  appendStarted,
  updateProgress,
  checkRepeatAllowed,
  SHEET_NAME,
  REPEAT_COOLDOWN_DAYS
};
