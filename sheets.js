const { google } = require("googleapis");
const questions = require("./questions");

const SHEET_NAME = process.env.SHEET_NAME || "Подписчики - ответы";

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
  // tg://user?id=... is the most reliable quick jump when Telegram client is installed.
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

  if (existingHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] }
    });
  }

  return { sheets, spreadsheetId };
}

async function findRowByUserId(sheets, spreadsheetId, userId) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:Z`
  });

  const rows = result.data.values || [];
  const telegramIdColumnIndex = headers.indexOf("Telegram ID");

  for (let i = 1; i < rows.length; i += 1) {
    if (String(rows[i][telegramIdColumnIndex]) === String(userId)) {
      return i + 1;
    }
  }

  return null;
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

async function upsertStarted({ user, source, answers = {}, currentStatus = "Начал опрос", phone = "" }) {
  const { sheets, spreadsheetId } = await ensureSheet();
  const rowNumber = await findRowByUserId(sheets, spreadsheetId, user.id);

  const row = buildRow({
    user,
    source,
    status: currentStatus,
    startedAt: nowIso(),
    completedAt: "",
    answers,
    phone
  });

  if (rowNumber) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A${rowNumber}:Z${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] }
    });
    return rowNumber;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] }
  });

  return null;
}

async function updateProgress({ user, source, answers, currentStatus, phone = "", completed = false }) {
  const { sheets, spreadsheetId } = await ensureSheet();
  let rowNumber = await findRowByUserId(sheets, spreadsheetId, user.id);

  if (!rowNumber) {
    await upsertStarted({ user, source, answers, currentStatus, phone });
    rowNumber = await findRowByUserId(sheets, spreadsheetId, user.id);
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A${rowNumber}:A${rowNumber}`
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
    range: `${SHEET_NAME}!A${rowNumber}:Z${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

module.exports = {
  ensureSheet,
  upsertStarted,
  updateProgress,
  SHEET_NAME
};
