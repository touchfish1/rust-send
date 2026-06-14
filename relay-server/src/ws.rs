use axum::extract::ws::Message;
use futures_util::StreamExt;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct RegisterInfo {
    pub device_id: uuid::Uuid,
    pub name: String,
    #[allow(dead_code)]
    pub device_type: String,
}

#[derive(Debug, Deserialize)]
struct RegisterMessage {
    #[serde(rename = "type")]
    msg_type: String,
    device_id: uuid::Uuid,
    device_name: String,
    device_type: String,
}

/// 等待客户端发送 register 消息
/// 超时 30 秒，超时或非法消息则返回 None
pub async fn wait_register(
    receiver: &mut (impl StreamExt<Item = Result<Message, axum::Error>> + Unpin),
) -> Option<RegisterInfo> {
    let timeout_duration = std::time::Duration::from_secs(30);

    loop {
        let msg = tokio::time::timeout(timeout_duration, receiver.next()).await;

        match msg {
            Ok(Some(Ok(Message::Text(text)))) => {
                let parsed: Result<RegisterMessage, _> = serde_json::from_str(&text);
                if let Ok(reg) = parsed {
                    if reg.msg_type == "register" {
                        return Some(RegisterInfo {
                            device_id: reg.device_id,
                            name: reg.device_name,
                            device_type: reg.device_type,
                        });
                    }
                }
                // 非 register 消息，继续等待
            }
            Ok(Some(Ok(Message::Close(_)))) | Ok(None) => return None,
            Ok(Some(Err(_))) => return None,
            Err(_) => {
                // 超时
                return None;
            }
            _ => {}
        }
    }
}
