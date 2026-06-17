use serde::{Deserialize, Serialize};

/// 信令消息（WebSocket JSON）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SignalingMessage {
    #[serde(rename = "offer")]
    Offer { target_id: uuid::Uuid, sdp: String },
    #[serde(rename = "answer")]
    Answer { target_id: uuid::Uuid, sdp: String },
    #[serde(rename = "ice_candidate")]
    IceCandidate {
        target_id: uuid::Uuid,
        candidate: String,
    },
}

/// DataChannel 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PeerMessage {
    #[serde(rename = "file_header")]
    FileHeader {
        file_id: uuid::Uuid,
        name: String,
        size: u64,
        mime_type: String,
        chunk_size: u32,
        chunk_count: u32,
        checksum: String,
        #[serde(default)]
        relative_path: Option<String>,
    },
    #[serde(rename = "ack")]
    Ack {
        file_id: uuid::Uuid,
        chunk_index: u32,
    },
    #[serde(rename = "nack")]
    Nack {
        file_id: uuid::Uuid,
        chunk_index: u32,
        reason: String,
    },
    #[serde(rename = "complete")]
    Complete {
        file_id: uuid::Uuid,
        checksum: String,
    },
    #[serde(rename = "complete_ack")]
    CompleteAck { file_id: uuid::Uuid },
    #[serde(rename = "batch_complete")]
    BatchComplete { transfer_id: uuid::Uuid },
    #[serde(rename = "error")]
    Error {
        file_id: uuid::Uuid,
        code: String,
        message: String,
    },
    #[serde(rename = "chunk_request")]
    ChunkRequest {
        transfer_id: uuid::Uuid,
        file_id: uuid::Uuid,
        missing_chunks: Vec<u32>,
    },
}

/// 分片二进制头部
pub const CHUNK_HEADER_SIZE: usize = 24;

pub struct Chunk {
    pub file_id: uuid::Uuid,
    pub index: u32,
    pub data: bytes::Bytes,
}

pub fn serialize_chunk(chunk: &Chunk) -> Vec<u8> {
    let mut buf = Vec::with_capacity(CHUNK_HEADER_SIZE + chunk.data.len());
    buf.extend_from_slice(chunk.file_id.as_bytes());
    buf.extend_from_slice(&chunk.index.to_be_bytes());
    buf.extend_from_slice(&(chunk.data.len() as u32).to_be_bytes());
    buf.extend_from_slice(&chunk.data);
    buf
}

pub fn try_deserialize_chunk(data: &[u8]) -> Result<Option<Chunk>, uuid::Error> {
    if data.len() < CHUNK_HEADER_SIZE {
        return Ok(None);
    }
    let file_id = uuid::Uuid::from_slice(&data[..16])?;
    let index = u32::from_be_bytes(data[16..20].try_into().unwrap());
    let payload_len = u32::from_be_bytes(data[20..24].try_into().unwrap()) as usize;

    if data.len() < CHUNK_HEADER_SIZE + payload_len {
        return Ok(None);
    }

    Ok(Some(Chunk {
        file_id,
        index,
        data: bytes::Bytes::copy_from_slice(&data[24..24 + payload_len]),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let file_id = uuid::Uuid::new_v4();
        let chunk = Chunk {
            file_id,
            index: 42,
            data: bytes::Bytes::from(&b"hello world"[..]),
        };

        let wire = serialize_chunk(&chunk);
        let parsed = try_deserialize_chunk(&wire).unwrap().unwrap();

        assert_eq!(parsed.file_id, file_id);
        assert_eq!(parsed.index, 42);
        assert_eq!(parsed.data.as_ref(), b"hello world");
    }

    #[test]
    fn test_serialize_empty_payload() {
        let chunk = Chunk {
            file_id: uuid::Uuid::nil(),
            index: 0,
            data: bytes::Bytes::new(),
        };

        let wire = serialize_chunk(&chunk);
        assert_eq!(wire.len(), CHUNK_HEADER_SIZE);
        let parsed = try_deserialize_chunk(&wire).unwrap().unwrap();
        assert!(parsed.data.is_empty());
    }

    #[test]
    fn test_deserialize_insufficient_data() {
        let data = vec![0u8; 10];
        let result = try_deserialize_chunk(&data).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_chunk_header_size() {
        assert_eq!(CHUNK_HEADER_SIZE, 24);
    }

    #[test]
    fn test_message_serde() {
        let msg = PeerMessage::FileHeader {
            file_id: uuid::Uuid::new_v4(),
            name: "test.pdf".into(),
            size: 1024,
            mime_type: "application/pdf".into(),
            chunk_size: 65536,
            chunk_count: 1,
            checksum: "abc123".into(),
            relative_path: None,
        };

        let json = serde_json::to_string(&msg).unwrap();
        let parsed: PeerMessage = serde_json::from_str(&json).unwrap();

        match parsed {
            PeerMessage::FileHeader { name, size, .. } => {
                assert_eq!(name, "test.pdf");
                assert_eq!(size, 1024);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_ack_message() {
        let msg = PeerMessage::Ack {
            file_id: uuid::Uuid::new_v4(),
            chunk_index: 7,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"ack\""));
    }
}
