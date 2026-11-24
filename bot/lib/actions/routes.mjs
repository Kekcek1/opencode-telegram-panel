import { openSessions, pickSession, renderSessionList, takePcSession } from "./sessions.mjs";
import { deleteSession } from "./report.mjs";
import {
  assignPickedGroup,
  askDeleteGroup,
  backToGroup,
  clearSessionGroup,
  deleteGroupConfirmed,
  openGroup,
  openGroupPicker,
  openGroups,
  startGroup,
  startGroupForSession,
  startRenameGroup,
} from "./groups.mjs";
import {
  askDeleteSession,
  backToSessions,
  deleteSessionConfirmed,
  openSessionDetail,
  pickDetail,
  startSessionRename,
} from "./session-detail.mjs";

export async function sessionRoute(ctx, chatId, head, tail, index, editId) {
  switch (head) {
    case "sessions": await openSessions(ctx, chatId, 0, editId); return true;
    case "slist": await openSessions(ctx, chatId, Number(tail) || 0, editId); return true;
    case "si": await pickSession(ctx, chatId, index, editId); return true;
    case "sdet": await openSessionDetail(ctx, chatId, index, editId); return true;
    case "sdp": await pickDetail(ctx, chatId, editId); return true;
    case "sdg": await openGroupPicker(ctx, chatId, editId); return true;
    case "sdr": await startSessionRename(ctx, chatId, editId); return true;
    case "sdd": await askDeleteSession(ctx, chatId, editId); return true;
    case "sback": await backToSessions(ctx, chatId, editId); return true;
    case "sdel": await deleteSessionConfirmed(ctx, chatId, editId); return true;
    case "groups": await openGroups(ctx, chatId, editId); return true;
    case "grp": await openGroup(ctx, chatId, tail === "none" ? "none" : index, editId); return true;
    case "gpg": await renderSessionList(ctx, chatId, Number(tail) || 0, editId); return true;
    case "gnew": await startGroup(ctx, chatId, editId); return true;
    case "sgp": await assignPickedGroup(ctx, chatId, index, editId); return true;
    case "sgnone": await clearSessionGroup(ctx, chatId, editId); return true;
    case "sgnew": await startGroupForSession(ctx, chatId, editId); return true;
    case "gren": await startRenameGroup(ctx, chatId, editId); return true;
    case "gdelask": await askDeleteGroup(ctx, chatId, editId); return true;
    case "gdel": await deleteGroupConfirmed(ctx, chatId, editId); return true;
    case "gback": await backToGroup(ctx, chatId, editId); return true;
    case "sess":
      if (tail === "pc") await takePcSession(ctx, chatId, editId);
      else if (tail === "del") await deleteSession(ctx, chatId, editId);
      else return false;
      return true;
    default: return false;
  }
}
