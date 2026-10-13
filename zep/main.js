// Install this same Normal App on each of the five maps. Configure before upload.
// Keep the bridge key in the private script source; never put it in a widget or URL.
const CONFIG = {
  apiUrl: "https://YOUR_PROJECT.web.app/api/zep/launch",
  sessionId: "COPY_CLASSROOM_ID",
  bridgeSecret: "SET_PRIVATE_SECRET_AT_LEAST_32_CHARACTERS",
  diagnostics: false,
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

function openScreen(player, route) {
  const name = (player.name || "").trim();
  if (!name) {
    player.showAlert("ZEP 닉네임을 학생 명단에 등록한 이름으로 설정하세요.");
    return;
  }
  const pid = String(player.id);
  if (pending[pid]) {
    player.showCenterLabel("연결 중입니다. 잠시 기다려 주세요.");
    return;
  }
  const attempt = {};
  pending[pid] = attempt;
  player.showCenterLabel("동백꽃: 탐구 기록을 연결하고 있습니다.");
  App.runLater(function () {
    if (pending[pid] === attempt) {
      delete pending[pid];
      player.sendMessage("[동백꽃] 15초 동안 서버 응답이 없습니다. 연결 주소·네트워크·앱 오류를 확인하세요.");
    }
  }, 15);
  try {
    App.httpPostJson(CONFIG.apiUrl, { "X-Zep-Secret": CONFIG.bridgeSecret },
      { sessionId: CONFIG.sessionId, name: name, playerId: pid, route: route },
      function (res) {
        if (pending[pid] !== attempt) return;
        delete pending[pid];
        try {
          const result = JSON.parse(res);
          if (!result.ok || !result.url) {
            player.showAlert(result.error || "서버가 연결을 허용하지 않았습니다. 수업 상태와 학생 명단을 확인하세요.");
            return;
          }
          if (CONFIG.useEmbed) {
            player.showEmbed(result.url, "middle", 1000, 760, true);
            player.showConfirm("임베드에서 연결되지 않으면 새 창으로 열까요?", function (ok) {
              if (ok) openScreen(player, route);
            });
          } else player.openWebLink(result.url, false);
        } catch (error) {
          player.showAlert("서버 응답 처리 또는 웹 창 열기에 실패했습니다. ZEP의 팝업 허용과 앱 오류를 확인하세요.");
        }
      });
  } catch (error) {
    delete pending[pid];
    player.showAlert("ZEP 서버 통신을 시작하지 못했습니다. 관리자 채팅창의 빨간 오류를 확인하세요.");
  }
}

App.onTriggerObject.Add(function (player, layerID, x, y, key) {
  const value = key == null ? "" : String(key).trim();
  const route = CONFIG.keys[value];
  if (!route) {
    if (CONFIG.diagnostics) {
      player.sendMessage("[동백꽃 진단] F키 이벤트 수신: 전달된 key=" + (value || "(비어 있음)") + ", 레이어=" + layerID + ", 좌표=" + x + "," + y);
      player.showCenterLabel("F키는 감지됐지만 화면 식별값이 일치하지 않습니다. 채팅창을 확인하세요.");
    }
    return;
  }
  openScreen(player, route);
});

if (CONFIG.diagnostics) {
  App.onStart.Add(function () {
    App.sayToAll("[동백꽃 연결 v1.1] 앱이 실행됐습니다. Q키로 서버 연결을 시험할 수 있습니다.");
  });
  App.onJoinPlayer.Add(function (player) {
    player.sendMessage("[동백꽃 연결 v1.1] 앱 실행 확인. Q키: 내 탐구 현황 연결 시험");
  });
  App.addOnKeyDown(81, function (player) {
    player.sendMessage("[동백꽃 진단] Q키 이벤트 수신. 서버 연결을 시작합니다.");
    openScreen(player, "progress");
  });
}
