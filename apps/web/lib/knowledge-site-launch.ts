"use client";

import {
  readSessionToken,
  readSessionUser,
  writeSessionTokenToWindow,
  writeSessionUserToWindow,
} from "./session";

export const KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE =
  "浏览器拦截了新标签页，请允许当前站点打开知识空间。";

export function openKnowledgeSiteInNewTab(route: string): boolean {
  const popupWindow = window.open("", "_blank");
  if (!popupWindow) {
    return false;
  }

  const token = readSessionToken();
  const user = readSessionUser();

  if (token) {
    writeSessionTokenToWindow(popupWindow, token);
  }
  if (user) {
    writeSessionUserToWindow(popupWindow, user);
  }

  popupWindow.location.replace(route);
  popupWindow.focus();
  return true;
}
