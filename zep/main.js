// Install this same Normal App on each of the five maps. Configure before upload.
// Keep the bridge key in the private script source; never put it in a widget or URL.
const CONFIG = {
  apiUrl: "https://YOUR_PROJECT.web.app/api/zep/launch",
  sessionId: "COPY_CLASSROOM_ID",
  bridgeSecret: "SET_PRIVATE_SECRET_AT_LEAST_32_CHARACTERS",
  useEmbed: false, // New tab is the default. Cross-site cookies may block iframe authentication.
  keys: {
    submit_potato: "potato",
    submit_branch: "branch",
    submit_flower: "flower",
    submit_rooster: "rooster",
    open_group: "group",
    check_progress: "progress",
  },
};
const pending = {};
App.onTriggerObject.Add(function (player, layerID, x, y, key) {
  const route = CONFIG.keys[key];
  if (!route) return;
  const name = (player.name || "").trim();
  if (!name) {
    player.showAlert("ZEP 닉네임을 본명으로 설정한 뒤 다시 시도하세요.");
    return;
  }
  const pid = String(player.id);
  const now = Date.now();
  if (pending[pid] && now - pending[pid] < 15000) {
    player.showCenterLabel("화면을 연결하고 있습니다. 잠시 기다려 주세요.");
    return;
  }
  pending[pid] = now;
  player.showCenterLabel("탐구 기록을 안전하게 연결하고 있습니다.");
  App.httpPostJson(
    CONFIG.apiUrl,
    { "X-Zep-Secret": CONFIG.bridgeSecret },
    { sessionId: CONFIG.sessionId, name: name, playerId: pid, route: route },
    function (res) {
      delete pending[pid];
      try {
        const result = JSON.parse(res);
        if (!result.ok || !result.url) {
          player.showAlert(
            result.error || "연결에 실패했습니다. 교사에게 알려 주세요.",
          );
          return;
        }
        if (CONFIG.useEmbed) {
          // Official signature: showEmbed(url, align, width, height, hasBackdrop)
          player.showEmbed(result.url, "middle", 1000, 760, true);
          player.showConfirm(
            "입력 화면이 보이지 않거나 연결 오류가 나면 새 창으로 열까요?",
            function (ok) {
              if (ok) openFresh(player, route); // Obtain a fresh single-use token for the new tab.
            },
          );
        } else player.openWebLink(result.url, false);
      } catch (e) {
        player.showAlert(
          "서버 응답을 읽지 못했습니다. F키로 다시 열어 주세요.",
        );
      }
    },
  );
});
function openFresh(player, route) {
  App.httpPostJson(
    CONFIG.apiUrl,
    { "X-Zep-Secret": CONFIG.bridgeSecret },
    {
      sessionId: CONFIG.sessionId,
      name: (player.name || "").trim(),
      playerId: String(player.id),
      route: route,
    },
    function (res) {
      try {
        const r = JSON.parse(res);
        if (r.ok && r.url) player.openWebLink(r.url, false);
        else player.showAlert(r.error || "연결 실패");
      } catch (e) {
        player.showAlert("연결에 실패했습니다. 다시 시도하세요.");
      }
    },
  );
}
