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
      player.sendMessage(
        "[동백꽃] 15초 동안 서버 응답이 없습니다. 연결 주소·네트워크·앱 오류를 확인하세요.",
      );
    }
  }, 15);
  try {
    App.httpPostJson(
      CONFIG.apiUrl,
      { "X-Zep-Secret": CONFIG.bridgeSecret },
      { sessionId: CONFIG.sessionId, name: name, playerId: pid, route: route },
      function (res) {
        if (pending[pid] !== attempt) return;
        delete pending[pid];
        try {
          const result = JSON.parse(res);
          if (!result.ok || !result.url) {
            player.showAlert(
              result.error ||
                "서버가 연결을 허용하지 않았습니다. 수업 상태와 학생 명단을 확인하세요.",
            );
            return;
          }
          if (CONFIG.useEmbed) {
            player.showEmbed(result.url, "middle", 1000, 760, true);
            player.showConfirm(
              "임베드에서 연결되지 않으면 새 창으로 열까요?",
              function (ok) {
                if (ok) openScreen(player, route);
              },
            );
          } else player.openWebLink(result.url, false);
        } catch (error) {
          player.showAlert(
            "서버 응답 처리 또는 웹 창 열기에 실패했습니다. ZEP의 팝업 허용과 앱 오류를 확인하세요.",
          );
        }
      },
    );
  } catch (error) {
    delete pending[pid];
    player.showAlert(
      "ZEP 서버 통신을 시작하지 못했습니다. 관리자 채팅창의 빨간 오류를 확인하세요.",
    );
  }
}

const bindingCapture = {};
let bindingBusy = false;

function bindingScope() {
  return String(App.spaceHashID) + ":" + String(App.mapHashID);
}
function bindingPoint(layerID, x, y) {
  return String(layerID) + ":" + String(x) + ":" + String(y);
}
function knownTag(tag) {
  return Object.prototype.hasOwnProperty.call(CONFIG.keys, tag);
}
function readBindings(player, callback) {
  try {
    App.getStorage(function () {
      try {
        const data = App.storage ? JSON.parse(App.storage) : {};
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("Invalid storage");
        callback(data);
      } catch (error) {
        player.showAlert(
          "ZEP 오브젝트 연결 설정을 읽지 못했습니다. 기존 설정은 지우지 않았습니다.",
        );
        bindingBusy = false;
      }
    });
  } catch (error) {
    bindingBusy = false;
    player.showAlert(
      "ZEP 앱 저장소에 접근하지 못했습니다. 관리자 채팅창의 오류를 확인하세요.",
    );
  }
}
function showUnbound(player, layerID, x, y, value) {
  if (!CONFIG.diagnostics) return;
  if (CONFIG.diagnostics) {
    player.sendMessage(
      "[동백꽃 진단] F키 이벤트 수신: 전달된 key=" +
        (value || "(비어 있음)") +
        ", 레이어=" +
        layerID +
        ", 좌표=" +
        x +
        "," +
        y,
    );
  }
  player.showAlert(
    "아직 연결되지 않은 오브젝트입니다. 관리자가 !연결 check_progress 등의 명령으로 이 오브젝트를 등록해 주세요.",
  );
}

App.onSay.Add(function (player, message) {
  const parts = String(message || "")
    .trim()
    .split(/\s+/);
  const command = parts[0];
  if (["!연결", "!연결취소", "!연결해제", "!연결목록"].indexOf(command) < 0)
    return;
  if (!(player.role >= 3000)) {
    player.sendMessage(
      "[동백꽃] 오브젝트 연결은 ZEP 스페이스 소유자·관리자만 설정할 수 있습니다.",
    );
    return;
  }
  const pid = String(player.id);
  if (command === "!연결취소") {
    delete bindingCapture[pid];
    player.sendMessage("[동백꽃] 연결 설정을 취소했습니다.");
    return;
  }
  if (command === "!연결목록") {
    readBindings(player, function (data) {
      const records =
        data.dongbaekObjectBindings &&
        data.dongbaekObjectBindings[bindingScope()];
      const names = records ? Object.keys(records) : [];
      player.sendMessage(
        "[동백꽃] 이 맵의 연결: " +
          (names.length
            ? names
                .map(function (p) {
                  return p + " → " + records[p];
                })
                .join(" / ")
            : "없음"),
      );
    });
    return;
  }
  const remove = command === "!연결해제";
  const tag = parts[1] || "";
  if (!remove && !knownTag(tag)) {
    player.sendMessage(
      "[동백꽃] 예: !연결 check_progress / 사용 가능한 이름: " +
        Object.keys(CONFIG.keys).join(", "),
    );
    return;
  }
  const capture = { tag: tag, remove: remove };
  bindingCapture[pid] = capture;
  player.sendMessage(
    "[동백꽃] 연결 설정 대기: 원하는 오브젝트 가까이에서 F키를 한 번 누르세요. 60초 동안 유효합니다.",
  );
  App.runLater(function () {
    if (bindingCapture[pid] === capture) {
      delete bindingCapture[pid];
      player.sendMessage(
        "[동백꽃] 연결 설정 대기 시간이 끝났습니다. 명령을 다시 입력하세요.",
      );
    }
  }, 60);
});

App.onTriggerObject.Add(function (player, layerID, x, y, key) {
  const value = key == null ? "" : String(key).trim();
  const pid = String(player.id);
  const capture = bindingCapture[pid];
  if (capture) {
    if (!(player.role >= 3000)) {
      delete bindingCapture[pid];
      return;
    }
    if (bindingBusy) {
      player.sendMessage(
        "[동백꽃] 다른 연결을 저장 중입니다. 잠시 후 F키를 다시 누르세요.",
      );
      return;
    }
    bindingBusy = true;
    readBindings(player, function (data) {
      if (bindingCapture[pid] !== capture) {
        bindingBusy = false;
        return;
      }
      const scope = bindingScope();
      const point = bindingPoint(layerID, x, y);
      data.dongbaekObjectBindings = data.dongbaekObjectBindings || {};
      data.dongbaekObjectBindings[scope] =
        data.dongbaekObjectBindings[scope] || {};
      if (capture.remove) delete data.dongbaekObjectBindings[scope][point];
      else data.dongbaekObjectBindings[scope][point] = capture.tag;
      App.setStorage(JSON.stringify(data));
      delete bindingCapture[pid];
      bindingBusy = false;
      player.sendMessage(
        "[동백꽃] " +
          (capture.remove ? "연결 해제" : "연결 등록: " + capture.tag) +
          " 완료. " +
          point +
          " / 다시 F키를 누르면 연결된 화면을 엽니다.",
      );
    });
    return;
  }
  readBindings(player, function (data) {
    const records =
      data.dongbaekObjectBindings &&
      data.dongbaekObjectBindings[bindingScope()];
    const bound = records && records[bindingPoint(layerID, x, y)];
    const tag = bound && knownTag(bound) ? bound : value;
    if (knownTag(tag)) openScreen(player, CONFIG.keys[tag]);
    else showUnbound(player, layerID, x, y, value);
  });
});

if (CONFIG.diagnostics) {
  App.onStart.Add(function () {
    App.sayToAll(
      "[동백꽃 연결 v1.4] 앱이 실행됐습니다. Q키로 서버 연결을 시험할 수 있습니다.",
    );
  });
  App.onJoinPlayer.Add(function (player) {
    player.sendMessage(
      "[동백꽃 연결 v1.4] 앱 실행 확인. Q키: 내 탐구 현황 연결 시험",
    );
  });
  App.addOnKeyDown(81, function (player) {
    player.sendMessage(
      "[동백꽃 진단] Q키 이벤트 수신. 서버 연결을 시작합니다.",
    );
    openScreen(player, "progress");
  });
}
