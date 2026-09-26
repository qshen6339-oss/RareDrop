import { ref } from "vue";
import zh from "./locales/zh-CN.json";

const storageKey = "raredrop-language";
function initialLocale() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "zh" || saved === "en") return saved;
  } catch {}
  return typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language)
    ? "zh"
    : "en";
}
export const locale = ref(initialLocale());
export const intlLocale = () => (locale.value === "zh" ? "zh-CN" : "en-GB");
export function updateDocumentLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale.value === "zh" ? "zh-CN" : "en";
  document.title =
    locale.value === "zh"
      ? "RareDrop · 稀有掉落"
      : "RareDrop · Collect something rare";
}
export function setLocale(value) {
  if (value !== "zh" && value !== "en") return;
  locale.value = value;
  try {
    localStorage.setItem(storageKey, value);
  } catch {}
  updateDocumentLanguage();
}
export function t(key, values = {}) {
  const text = locale.value === "zh" ? (zh[key] ?? key) : key;
  return String(text).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : match,
  );
}
export const categoryName = (name) => t(name || "Uncategorized");

const fields = {
  first_name: "名",
  last_name: "姓",
  "First name": "名",
  "Last name": "姓",
  email: "邮箱",
  password: "密码",
  name: "藏品名称",
  description: "藏品详情",
  starting_bid: "起拍价",
  end_date: "结束时间",
  amount: "出价金额",
  question_text: "问题",
  answer_text: "回答",
  category_ids: "收藏分类",
  photo: "照片",
};
// Keep server messages unchanged in state so an already-visible error also switches language.
export function messageText(message) {
  if (!message || locale.value === "en") return message;
  if (zh[message]) return zh[message];
  const bid = /^Your bid must be higher than ([\d.]+)\.$/.exec(message);
  if (bid) return `你的出价必须高于 ¥${bid[1]}。`;
  const validation = /^"([^"]+)" (.+)$/.exec(message);
  if (validation) {
    const field = fields[validation[1].split(/[.\[]/)[0]] || "该字段";
    const rule = validation[2];
    if (/required|not allowed to be empty/.test(rule))
      return `请填写${field}。`;
    if (/valid email/.test(rule)) return "请输入有效的邮箱地址。";
    if (/required pattern/.test(rule) && field === "密码")
      return "密码需包含大写字母、小写字母、数字和符号。";
    let match = /length must be less than or equal to (\d+)/.exec(rule);
    if (match) return `${field}最多为 ${match[1]} 个字符。`;
    match = /length must be at least (\d+)/.exec(rule);
    if (match) return `${field}至少需要 ${match[1]} 个字符。`;
    if (/integer/.test(rule)) return `${field}必须为整数。`;
    if (/number/.test(rule)) return `${field}必须为数字。`;
    if (/greater/.test(rule) && field === "结束时间")
      return "结束时间必须晚于当前时间。";
    match = /greater than or equal to (\d+)/.exec(rule);
    if (match) return `${field}不能小于 ${match[1]}。`;
    if (/not allowed/.test(rule))
      return "提交中包含不支持的字段，请检查后重试。";
    return `请检查${field}的格式或取值后重试。`;
  }
  return message;
}
